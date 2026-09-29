'use strict';
// Serveur FTP minimal, EN PROCESS, pour eprouver le client.
//
// Un client de protocole ne se teste pas contre un vrai serveur : on ne peut ni
// provoquer un refus, ni choisir le format de liste, ni verifier la sequence
// exacte des commandes. Ce serveur-ci sert de doublure : il enregistre tout ce
// qu'il recoit, et on peut lui demander de refuser EPSV, MLSD, ou d'envoyer une
// banniere sur PLUSIEURS lignes — le piege qui desynchronise un client naif.
const net = require('net');
const fs = require('fs');
const path = require('path');

class ServeurFtp {
  constructor(racine, opts = {}) {
    this.racine = racine;
    this.epsv = opts.epsv !== false;
    this.mlsd = opts.mlsd !== false;
    this.banniereMultiple = opts.banniereMultiple !== false;
    this.utilisateur = opts.user || 'xboxftp';
    this.motDePasse = opts.pass || 'xboxftp';
    this.commandes = [];
    this.courant = '/';
    this.srv = null;
    this.port = 0;
    this.passif = null;      // serveur d'ecoute du mode passif
    this.ouvert = false;
  }

  chemin(p) {
    const rel = String(p || '/').replace(/^\/+/, '').replace(/\.\.(\/|$)/g, '');
    return path.join(this.racine, rel);
  }

  demarrer(port) {
    return new Promise((res, rej) => {
      this.srv = net.createServer(s => this._session(s));
      this.srv.on('error', rej);
      // port 0 = port libre choisi par le systeme (les tests). Un port explicite
      // permet de faire tourner le meme serveur comme fausse console.
      this.srv.listen(port || 0, '127.0.0.1', () => { this.port = this.srv.address().port; res(this); });
    });
  }

  arreter() {
    return new Promise(res => {
      this._fermerPassif();
      if (!this.srv) return res();
      this.srv.close(() => res());
    });
  }

  _fermerPassif() {
    if (this.passif) { try { this.passif.close(); } catch {} this.passif = null; }
  }

  _session(s) {
    let buf = '';
    s.setEncoding('utf8');
    const dire = t => { try { s.write(t + '\r\n'); } catch {} };
    // Banniere sur deux lignes : la premiere en « 220- », la seconde en « 220 ».
    // Un client qui ne lit qu'une ligne se desynchronise ici.
    if (this.banniereMultiple) {
      dire('220-Bienvenue sur la console');
      dire('220 Le serveur FTP est pret');
    } else {
      dire('220 Le serveur FTP est pret');
    }

    s.on('data', async d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const ligne = buf.slice(0, i);
        buf = buf.slice(i + 2);
        this.commandes.push(ligne);
        await this._traiter(s, ligne, dire);
      }
    });
    s.on('error', () => {});
    s.on('close', () => this._fermerPassif());
  }

  // Le client ouvre le canal de donnees APRES « PASV » et AVANT la commande :
  // l'ecouteur doit donc etre pose des le PASV, et la connexion mise de cote.
  // Attacher l'ecouteur seulement a la commande perdait la connexion.
  _passif(dire, etendu) {
    this._fermerPassif();
    this.data = null;
    this.attenteData = null;
    this.passif = net.createServer();
    this.passif.on('connection', c => {
      if (this.attenteData) { const f = this.attenteData; this.attenteData = null; f(c); }
      else this.data = c;
      c.on('error', () => {});
    });
    this.passif.listen(0, '127.0.0.1', () => {
      const p = this.passif.address().port;
      if (etendu) return dire('229 Entering Extended Passive Mode (|||' + p + '|)');
      // IP volontairement INUTILISABLE : le client doit garder l'hote du canal
      // de controle, comme il le fait pour une console derriere un NAT.
      dire('227 Entering Passive Mode (10,0,0,99,' + Math.floor(p / 256) + ',' + (p % 256) + ')');
    });
  }

  _prendreData() {
    if (this.data) { const c = this.data; this.data = null; return Promise.resolve(c); }
    return new Promise(r => { this.attenteData = r; });
  }

  async _transfert(dire, mode, arg) {
    if (!this.passif) return dire('425 Utilisez PASV d abord');
    const donnees = await this._prendreData();
    if (mode === 'mlsd' || mode === 'list') {
      dire('150 Ouverture du canal de donnees');
      const dossier = this.chemin(arg || this.courant);
      let entrees = [];
      try { entrees = fs.readdirSync(dossier); } catch {}
      let corps = '';
      for (const e of entrees) {
        let st; try { st = fs.statSync(path.join(dossier, e)); } catch { continue; }
        if (mode === 'mlsd') {
          const d = st.mtime;
          const horo = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') +
            String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
          corps += 'type=' + (st.isDirectory() ? 'dir' : 'file') + ';size=' + (st.isDirectory() ? 0 : st.size) + ';modify=' + horo + '; ' + e + '\r\n';
        } else {
          const perm = st.isDirectory() ? 'drwxr-xr-x' : '-rw-r--r--';
          corps += perm + ' 1 xboxftp xboxftp ' + (st.isDirectory() ? 0 : st.size) + ' Jan 01 12:00 ' + e + '\r\n';
        }
      }
      donnees.end(corps);
      donnees.on('close', () => dire('226 Transfert termine'));
      this._fermerPassif();
      return;
    }
    if (mode === 'retr') {
      const f = this.chemin(arg);
      if (!fs.existsSync(f)) { donnees.destroy(); this._fermerPassif(); return dire('550 Fichier introuvable'); }
      dire('150 Ouverture du canal de donnees');
      fs.createReadStream(f).pipe(donnees);
      donnees.on('close', () => dire('226 Transfert termine'));
      this._fermerPassif();
      return;
    }
    if (mode === 'stor') {
      dire('150 Ouverture du canal de donnees');
      const f = this.chemin(arg);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const ws = fs.createWriteStream(f);
      donnees.pipe(ws);
      ws.on('close', () => { dire('226 Transfert termine'); this._fermerPassif(); });
      return;
    }
    donnees.destroy();
    dire('500 Mode inconnu');
  }

  async _traiter(s, ligne, dire) {
    const [cmd, ...reste] = ligne.split(' ');
    const arg = reste.join(' ');
    switch (cmd.toUpperCase()) {
      case 'USER':
        return dire(arg === this.utilisateur ? '331 Mot de passe requis' : '530 Utilisateur inconnu');
      case 'PASS':
        return dire(arg === this.motDePasse ? '230 Connecte' : '530 Mot de passe incorrect');
      case 'OPTS':
        return dire('200 OPT ok');
      case 'SYST':
        return dire('215 UNIX Type: L8');
      case 'FEAT':
        if (this.mlsd) { dire('211-Extensions'); dire(' MLSD'); return dire('211 Fin'); }
        return dire('211 Fin');
      case 'TYPE':
        return dire('200 Type ' + arg);
      case 'PWD':
        return dire('257 "' + this.courant + '" est le dossier courant');
      case 'CWD': {
        const p = arg.startsWith('/') ? arg : this.courant.replace(/\/$/, '') + '/' + arg;
        if (!fs.existsSync(this.chemin(p)) || !fs.statSync(this.chemin(p)).isDirectory()) return dire('550 Dossier introuvable');
        this.courant = p.startsWith('/') ? p : '/' + p;
        return dire('250 Dossier change');
      }
      case 'SIZE': {
        try { return dire('213 ' + fs.statSync(this.chemin(arg)).size); } catch { return dire('550 Introuvable'); }
      }
      case 'MKD':
        try { fs.mkdirSync(this.chemin(arg)); return dire('257 "' + arg + '" cree'); } catch { return dire('550 Echec'); }
      case 'DELE':
        try { fs.unlinkSync(this.chemin(arg)); return dire('250 Supprime'); } catch { return dire('550 Echec'); }
      case 'RMD':
        try { fs.rmdirSync(this.chemin(arg)); return dire('250 Supprime'); } catch { return dire('550 Echec'); }
      case 'RNFR':
        if (!fs.existsSync(this.chemin(arg))) return dire('550 Introuvable');
        this._renommer = arg;
        return dire('350 Pret');
      case 'RNTO':
        try { fs.renameSync(this.chemin(this._renommer), this.chemin(arg)); return dire('250 Renomme'); } catch { return dire('550 Echec'); }
      case 'EPSV':
        if (!this.epsv) return dire('500 EPSV non supporte');
        return this._passif(dire, true);
      case 'PASV':
        return this._passif(dire, false);
      case 'MLSD':
        if (!this.mlsd) return dire('500 MLSD non supporte');
        return this._transfert(dire, 'mlsd', arg);
      case 'LIST':
        return this._transfert(dire, 'list', arg);
      case 'RETR':
        return this._transfert(dire, 'retr', arg);
      case 'STOR':
        return this._transfert(dire, 'stor', arg);
      case 'QUIT':
        dire('221 Au revoir');
        return s.end();
      default:
        return dire('500 Commande inconnue');
    }
  }
}

module.exports = { ServeurFtp };
