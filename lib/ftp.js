'use strict';
// Client FTP — zero dependance, ecrit sur `net`.
//
// Pourquoi a la main : le projet n'a aucune dependance, et un client FTP utile
// tient en quelques centaines de lignes. Surtout, la console impose ses
// bizarreries, qu'aucune bibliotheque generale ne gere :
//
//   - le serveur FTP d'Aurora / FSD / Dashlaunch est minimal : PASV parfois
//     annonce une IP inutilisable (NAT), EPSV n'existe pas toujours, MLSD non
//     plus, et les listes reviennent tantot en format Unix, tantot en format DOS ;
//   - une reponse peut tenir sur PLUSIEURS lignes (« 220-debut » ... « 220 fin ») :
//     ne lire qu'une ligne desynchronise tout ce qui suit ;
//   - les noms de fichiers contiennent des accents et des apostrophes — il faut
//     `OPTS UTF8 ON`, et ne jamais construire un chemin a la main.
//
// Le client ne fait aucune supposition : il essaie EPSV puis PASV, MLSD puis
// LIST, et rend toujours l'erreur BRUTE du serveur, qui est la seule information
// utile quand une console refuse une commande.
const net = require('net');
const fs = require('fs');

const TAILLE_BUFFER = 64 * 1024;

class Ftp {
  constructor(opts = {}) {
    this.hote = opts.host || '';
    this.port = Number(opts.port) || 21;
    this.timeout = Number(opts.timeout) || 20000;
    this.sock = null;
    this.data = null;
    this.buf = '';
    this.attente = [];
    this.trace = typeof opts.trace === 'function' ? opts.trace : null;
    this.systeme = '';
    this.utf8 = false;
    this.mlsd = false;
    // Dernier dossier REELLEMENT visite (relu avec PWD), et non celui qu'on a
    // demande : c'est la seule valeur que l'interface ait le droit d'afficher.
    this.dossier = '';
  }

  _log(sens, txt) { if (this.trace) this.trace(sens, txt); }

  // --- plomberie ------------------------------------------------------------
  // Une reponse est complete quand on rencontre une ligne « NNN » SUIVIE D'UN
  // ESPACE. Les lignes « NNN- » sont des suites : on continue de lire.
  _extraire() {
    let pos = 0;
    for (;;) {
      const fin = this.buf.indexOf('\r\n', pos);
      if (fin < 0) return null;
      const ligne = this.buf.slice(pos, fin);
      if (/^\d{3} /.test(ligne)) {
        const texte = this.buf.slice(0, fin);
        this.buf = this.buf.slice(fin + 2);
        return { code: Number(ligne.slice(0, 3)), texte };
      }
      pos = fin + 2;
    }
  }

  _pomper() {
    while (this.attente.length) {
      const r = this._extraire();
      if (!r) return;
      this._log('<', r.texte);
      const a = this.attente.shift();
      clearTimeout(a.minuteur);
      a.res(r);
    }
  }

  commande(txt, timeout) {
    return new Promise((res, rej) => {
      if (!this.sock) return rej(new Error('FTP : non connecte'));
      const a = { res, rej, minuteur: null };
      a.minuteur = setTimeout(() => {
        const i = this.attente.indexOf(a);
        if (i >= 0) this.attente.splice(i, 1);
        rej(new Error('FTP : delai depasse (' + (timeout || this.timeout) + ' ms) sur ' + String(txt).split(' ')[0]));
      }, timeout || this.timeout);
      // Une reponse complete en tampon ALORS QUE PERSONNE N'ATTEND est un reste
      // (226 tardif d'un transfert abandonne, salve multi-lignes coupee) : si on
      // la laisse, la prochaine commande la lira pour reponse et la session sera
      // decalee d'un cran jusqu'a la fin — « PASV » heritait du 502 d'« EPSV ».
      // On purge avant d'ecrire ; avec des correspondants en file, le tampon ne
      // peut contenir que leur reponse (FIFO), qu'on ne touche pas.
      if (!this.attente.length) {
        let o;
        while ((o = this._extraire())) this._log('<', '(orpheline) ' + o.texte);
      }
      this.attente.push(a);
      this._log('>', txt);
      try { this.sock.write(txt + '\r\n'); } catch (e) { clearTimeout(a.minuteur); rej(e); }
    });
  }

  // Commande dont on attend un code precis. Le message d'erreur reprend la
  // reponse du serveur : c'est ce qui permet de comprendre un refus.
  async attendre(codes, txt, timeout) {
    const r = await this.commande(txt, timeout);
    const ok = Array.isArray(codes) ? codes.includes(r.code) : r.code === codes;
    if (!ok) {
      const e = new Error('FTP ' + r.code + ' sur ' + String(txt).split(' ')[0] + ' : ' + r.texte.replace(/^\d{3}[- ]/, ''));
      e.code = r.code;
      e.reponse = r.texte;
      throw e;
    }
    return r;
  }

  // Attend la reponse suivante SANS rien envoyer.
  // La fin d'un transfert (« 226 ») arrive toute seule, apres la fermeture du
  // canal de donnees : ce n'est pas une reponse a une commande. Envoyer une
  // pseudo-commande pour l'attendre faisait repondre « 500 Commande inconnue » et
  // desalignait toute la session.
  reponse(codes, timeout) {
    return new Promise((res, rej) => {
      if (!this.sock) return rej(new Error('FTP : non connecte'));
      const a = { res, rej, minuteur: null };
      a.minuteur = setTimeout(() => {
        const i = this.attente.indexOf(a);
        if (i >= 0) this.attente.splice(i, 1);
        rej(new Error('FTP : delai depasse en attendant la fin du transfert'));
      }, timeout || this.timeout);
      this.attente.push(a);
      this._pomper();   // la reponse est peut-etre deja arrivee et en tampon
    }).then(r => {
      const ok = Array.isArray(codes) ? codes.includes(r.code) : r.code === codes;
      if (!ok) {
        const e = new Error('FTP ' + r.code + ' apres transfert : ' + r.texte.replace(/^\d{3}[- ]/, ''));
        e.code = r.code;
        throw e;
      }
      return r;
    });
  }

  // --- session --------------------------------------------------------------
  connecter() {
    return new Promise((res, rej) => {
      if (this.sock) return res(this);
      const s = net.createConnection({ host: this.hote, port: this.port });
      this.sock = s;
      s.setTimeout(this.timeout);
      let fini = false;
      const echec = e => {
        if (fini) return;
        fini = true;
        try { s.destroy(); } catch {}
        this.sock = null;
        rej(new Error('FTP : ' + (e || 'connexion impossible') + ' (' + this.hote + ':' + this.port + ')'));
      };
      s.on('error', e => echec(e.message));
      s.on('timeout', () => echec('delai depasse'));
      s.on('close', () => {
        // une fermeture au repos n'est pas une erreur ; en pleine commande, si.
        if (!fini && this.attente.length) {
          const a = this.attente.shift();
          clearTimeout(a.minuteur);
          a.rej(new Error('FTP : connexion fermee par ' + this.hote));
        }
        this.sock = null;
      });
      s.on('data', d => { this.buf += d.toString('utf8'); this._pomper(); });
      // le serveur parle en premier : « 220 »
      const minuteur = setTimeout(() => echec('aucune banniere recue'), this.timeout);
      this.attente.push({
        res: r => { clearTimeout(minuteur); fini = true; res(this); },
        rej: e => { clearTimeout(minuteur); echec(e.message || e); },
        minuteur
      });
    });
  }

  async ouvrir(user, pass) {
    await this.connecter();
    if (this.attente.length === 0 && !this._banniere) {
      // deja ouverte : rien a faire
    }
    if (user != null) {
      const r = await this.attendre([230, 331], 'USER ' + user);
      if (r.code === 331) await this.attendre([230, 202], 'PASS ' + (pass == null ? '' : pass));
    }
    // UTF-8 : facultatif, et beaucoup de serveurs Xbox repondent 5xx. On note.
    try { const f = await this.commande('OPTS UTF8 ON'); this.utf8 = f.code === 200; } catch {}
    try { const s = await this.commande('SYST'); this.systeme = (s.texte || '').replace(/^\d{3}[- ]/, ''); } catch {}
    try { const f = await this.commande('FEAT'); this.mlsd = /MLSD/i.test(f.texte || ''); } catch {}
    return this;
  }

  async fermer() {
    try { if (this.sock) await this.commande('QUIT', 3000); } catch {}
    try { if (this.data) this.data.destroy(); } catch {}
    try { if (this.sock) this.sock.destroy(); } catch {}
    this.data = null;
    this.sock = null;
    this.buf = '';
  }

  // La session est-elle encore debout ? `connecter` met `sock` a null a la
  // fermeture, donc sa presence suffit — `destroyed` couvre la coupure qui
  // n'aurait pas encore emis « close ». On n'envoie PAS de NOOP : c'est une
  // commande de plus sur un serveur qui n'en accepte qu'une a la fois.
  estVivante() {
    return !!(this.sock && !this.sock.destroyed);
  }

  // --- transfert ------------------------------------------------------------
  // EPSV d'abord (pas d'adresse a parser), puis PASV. Pour PASV on garde l'hote
  // du canal de CONTROLE : beaucoup de serveurs annoncent 10.0.0.x ou 0.0.0.0,
  // inutilisable depuis le PC.
  async _passif() {
    const e = await this.commande('EPSV');
    if (e.code === 229) {
      const m = /\(\|\|\|(\d+)\|\)/.exec(e.texte);
      if (m) return { host: this.hote, port: Number(m[1]) };
    }
    const p = await this.attendre(227, 'PASV');
    const m = /\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/.exec(p.texte);
    if (!m) throw new Error('FTP : reponse PASV illisible — ' + p.texte);
    return { host: this.hote, port: Number(m[5]) * 256 + Number(m[6]) };
  }

  _ouvrirData(cible) {
    return new Promise((res, rej) => {
      const d = net.createConnection({ host: cible.host, port: cible.port });
      this.data = d;
      let fini = false;
      const minuteur = setTimeout(() => { if (!fini) { fini = true; d.destroy(); rej(new Error('FTP : canal de donnees injoignable (' + cible.host + ':' + cible.port + ')')); } }, this.timeout);
      d.on('connect', () => { if (!fini) { fini = true; clearTimeout(minuteur); res(d); } });
      d.on('error', e => { if (!fini) { fini = true; clearTimeout(minuteur); rej(new Error('FTP : canal de donnees — ' + e.message)); } });
    });
  }

  _lireData(d) {
    return new Promise((res, rej) => {
      const morceaux = [];
      d.on('data', c => morceaux.push(c));
      d.on('end', () => res(Buffer.concat(morceaux)));
      d.on('error', e => rej(new Error('FTP : lecture des donnees — ' + e.message)));
    });
  }

  // Liste un dossier.
  //
  // ON SE DEPLACE D'ABORD, ON LISTE ENSUITE — sans argument. Beaucoup de serveurs
  // Xbox, dont FtpDll (celui d'Aurora), IGNORENT le chemin passe a LIST : ils
  // listent toujours le dossier COURANT. Envoyer « LIST /Game » ne ramenait donc
  // jamais Game — la liste restait celle de la racine pendant que l'interface, qui
  // faisait confiance au chemin demande, affichait « /Game/Game/Game ».
  //
  // On relit PWD apres coup : c'est le SEUL chemin qu'on ait le droit d'afficher.
  async liste(chemin) {
    let ou;
    if (chemin) { ou = await this.cwd(chemin); }
    else { try { ou = await this.pwd(); } catch { ou = this.dossier || ''; } }
    this.dossier = ou;

    const cible = await this._passif();
    const d = await this._ouvrirData(cible);
    const brut = this._lireData(d);
    const cmd = this.mlsd ? 'MLSD' : 'LIST';
    try {
      await this.attendre([125, 150], cmd);
    } catch (e) {
      d.destroy();
      // MLSD refuse : on retombe sur LIST, une fois.
      if (this.mlsd) {
        this.mlsd = false;
        try { return await this.liste(chemin); } catch {}
      }
      throw e;
    }
    const contenu = await brut;
    await this.reponse([226, 250]);
    this.data = null;
    return this._analyser(contenu.toString('utf8'), ou);
  }

  // Trois formats circulent : MLSD, Unix (ls -l) et DOS. Les consoles utilisent
  // l'un ou l'autre selon la version de leur serveur.
  _analyser(texte, chemin) {
    const out = [];
    for (const ligne of texte.split(/\r?\n/)) {
      if (!ligne.trim()) continue;
      let m;
      // MLSD : « type=file;size=1234;modify=20230101120000; nom »
      // ATTENTION : un groupe de capture REPETE ne garde que sa derniere
      // repetition. Avec `([a-z]+=[^;]*;)+`, seul « modify » etait conserve —
      // « type » et « size » disparaissaient, et TOUS les fichiers annoncaient
      // 0 octet. D'ou le groupe interne non capturant.
      if ((m = /^((?:[a-z]+=[^;]*;)+) ?(.*)$/i.exec(ligne))) {
        const champs = {};
        for (const p of m[1].split(';')) { const [k, v] = p.split('='); if (k) champs[k.toLowerCase()] = v; }
        const nom = m[2].trim();
        if (!nom || nom === '.' || nom === '..') continue;
        out.push({
          name: nom,
          dir: /^dir/i.test(champs.type || '') || /^cdir/i.test(champs.type || ''),
          size: Number(champs.size) || 0,
          date: champs.modify ? champs.modify.slice(0, 4) + '-' + champs.modify.slice(4, 6) + '-' + champs.modify.slice(6, 8) + ' ' + champs.modify.slice(8, 10) + ':' + champs.modify.slice(10, 12) : '',
          path: joinFtp(chemin, nom)
        });
        continue;
      }
      // DOS : « 01-01-23  12:00PM  <DIR>  nom » (le nom peut contenir des espaces)
      if ((m = /^(\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2}[AP]M)\s+(<DIR>|[\d,]+)\s+(.*)$/i.exec(ligne))) {
        const nom = m[4].trim();
        if (!nom || nom === '.' || nom === '..') continue;
        out.push({
          name: nom, dir: /<DIR>/i.test(m[3]), size: /<DIR>/i.test(m[3]) ? 0 : Number(m[3].replace(/[^\d]/g, '')) || 0,
          date: m[1] + ' ' + m[2], path: joinFtp(chemin, nom)
        });
        continue;
      }
      // Unix : « -rw-r--r-- 1 owner group 1234 Jan 01 12:00 nom »
      if ((m = /^([-dl])([rwxsStT-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\w{3}\s+\d+\s+[\d:]+)\s+(.*)$/.exec(ligne))) {
        const nom = m[5].trim().replace(/\s+->.*$/, '');   // « lien -> cible »
        if (!nom || nom === '.' || nom === '..') continue;
        out.push({ name: nom, dir: m[1] === 'd', size: Number(m[3]) || 0, date: m[4], path: joinFtp(chemin, nom) });
        continue;
      }
      // Certains serveurs Xbox ne renvoient QUE le nom, un par ligne.
      if (!/[=]/.test(ligne) && !/^\s/.test(ligne) && ligne.length < 512) {
        const nom = ligne.trim();
        if (nom === '.' || nom === '..') continue;
        out.push({ name: nom, dir: false, size: 0, date: '', path: joinFtp(chemin, nom), suppose: true });
      }
    }
    return out;
  }

  async pwd() {
    const r = await this.attendre(257, 'PWD');
    const m = /"([^"]*)"/.exec(r.texte);
    return m ? m[1] : '';
  }

  async cwd(chemin) { await this.attendre(250, 'CWD ' + chemin); return this.pwd(); }
  async mkd(chemin) { return (await this.attendre([257, 250], 'MKD ' + chemin)).texte; }

  // Cree une arborescence, segment par segment.
  // Un envoi recursif doit creer les dossiers intermediaires, et la plupart des
  // serveurs refusent « MKD a/b/c » quand « a » n'existe pas. Un dossier qui
  // existe deja renvoie une erreur qu'on ignore : c'est le cas normal quand on
  // reprend un envoi interrompu.
  async mkdProfond(chemin) {
    const parts = String(chemin || '').split('/').filter(Boolean);
    let courant = '';
    for (const p of parts) {
      courant += '/' + p;
      try { await this.mkd(courant); } catch { /* existe deja, ou creation refusee : le STOR le dira */ }
    }
    return courant || '/';
  }

  // Somme de controle CRC32 du fichier distant, quand le serveur sait la donner.
  //
  // FtpDll la propose, et sa reponse est sur PLUSIEURS lignes :
  //   211-Calculating CRC32 hash, please wait...
  //    5AF2B45E
  //   211 END
  // Le code est 211, pas 250 : l'exiger autrement faisait echouer la lecture et
  // on perdait la verification. C'est ce qui permet de NE PAS se fier au seul
  // code 226 apres un envoi.
  async crc(chemin) {
    try {
      const r = await this.attendre([211, 250, 213, 200], 'XCRC ' + chemin);
      const m = /(?:^|[\s-])([0-9A-F]{8})(?:[\s-]|$)/im.exec(r.texte);
      return m ? m[1].toUpperCase() : null;
    } catch { return null; }
  }

  async supprimer(chemin) { await this.attendre(250, 'DELE ' + chemin); }
  async supprimerDossier(chemin) { await this.attendre(250, 'RMD ' + chemin); }
  async renommer(de, vers) {
    await this.attendre(350, 'RNFR ' + de);
    await this.attendre(250, 'RNTO ' + vers);
  }

  async taille(chemin) {
    try {
      const r = await this.attendre(213, 'SIZE ' + chemin);
      // On retire d'abord le CODE de reponse : « 213 307200 ». Sans cela, la
      // premiere suite de chiffres rencontree est le code, et la taille annoncee
      // valait 213 — la barre de progression etait donc fausse.
      const corps = r.texte.replace(/^\d{3}[- ]/, '');
      const m = /(\d+)/.exec(corps);
      return m ? Number(m[1]) : null;
    } catch { return null; }
  }

  async type(t) { await this.attendre(200, 'TYPE ' + t); }

  // Telecharge. `surProgres(recus, total)` est appele au fil de l'eau.
  async telecharger(cheminDistant, cheminLocal, surProgres) {
    await this.type('I');
    const total = await this.taille(cheminDistant);
    const cible = await this._passif();
    const d = await this._ouvrirData(cible);
    const flux = fs.createWriteStream(cheminLocal);
    let recus = 0;
    const promesse = new Promise((res, rej) => {
      d.on('data', c => { recus += c.length; flux.write(c); if (surProgres) surProgres(recus, total || recus); });
      d.on('end', () => flux.end(() => res()));
      d.on('error', e => rej(e));
      flux.on('error', e => rej(e));
    });
    await this.attendre([125, 150], 'RETR ' + cheminDistant);
    await promesse;
    await this.reponse([226, 250]);
    this.data = null;
    return { octets: recus, total };
  }

  // Envoie. `surProgres(envoyes, total)` au fil de l'eau.
  async envoyer(cheminLocal, cheminDistant, surProgres) {
    await this.type('I');
    const total = fs.statSync(cheminLocal).size;
    const cible = await this._passif();
    const d = await this._ouvrirData(cible);
    await this.attendre([125, 150], 'STOR ' + cheminDistant);
    await new Promise((res, rej) => {
      const flux = fs.createReadStream(cheminLocal, { highWaterMark: TAILLE_BUFFER });
      let envoyes = 0;
      flux.on('data', c => {
        envoyes += c.length;
        if (surProgres) surProgres(envoyes, total);
        if (!d.write(c)) flux.pause();
      });
      d.on('drain', () => flux.resume());
      flux.on('end', () => d.end());
      flux.on('error', e => rej(new Error('FTP : lecture locale — ' + e.message)));
      d.on('error', e => rej(new Error('FTP : envoi — ' + e.message)));
      d.on('close', () => res());
    });
    await this.reponse([226, 250]);
    this.data = null;
    return { octets: total, total };
  }

  // Lit seulement le DEBUT d'un fichier (en-tete XBE, mediaid) : RETR puis on
  // coupe le canal a `octets` et ABOR — pour un default.xbe de 10 Mo, payer
  // l'aller-retour de 8 Ko est toute la difference.
  async lireDebut(cheminDistant, octets) {
    await this.type('I');
    const cible = await this._passif();
    const d = await this._ouvrirData(cible);
    const morceaux = [];
    let recus = 0;
    await this.attendre([125, 150], 'RETR ' + cheminDistant);
    await new Promise((res, rej) => {
      d.on('data', c => { recus += c.length; morceaux.push(c); if (recus >= octets) { d.destroy(); res(); } });
      d.on('end', () => res());
      d.on('close', () => res());
      d.on('error', e => rej(e));
    });
    // PAS D'ABOR : le serveur annonce deja la coupure du RETR (426/226) de
    // lui-meme quand le canal data meurt. Envoyer ABOR lirait cette reponse
    // spontanee et laisserait la vraie reponse d'ABOR dans le tuyau — la
    // commande SUIVANTE la recevrait (desynchronisation mesuree : un « 257 »
    // de PWD lu comme reponse a CWD).
    try { await this.reponse([426, 226, 250, 550], 5000); } catch {}
    this.data = null;
    return Buffer.concat(morceaux).slice(0, octets);
  }

  // Lit un fichier texte entier (petits fichiers : ini, json, xml de la console).
  async lireTexte(chemin, max) {
    await this.type('I');
    const cible = await this._passif();
    const d = await this._ouvrirData(cible);
    const brut = this._lireData(d);
    await this.attendre([125, 150], 'RETR ' + chemin);
    const contenu = await brut;
    await this.reponse([226, 250]);
    this.data = null;
    const t = contenu.toString('utf8');
    return max && t.length > max ? t.slice(0, max) : t;
  }
}

// Jointure de chemin FTP : toujours en « / », jamais de « // ».
function joinFtp(base, nom) {
  const a = String(base || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const b = String(nom || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return a ? a + '/' + b : '/' + b;
}

// Traduit l'echec brut de la couche reseau en quelque chose d'ACTIONNABLE.
// « connect ECONNREFUSED 127.0.0.1:2129 » ne dit pas a l'utilisateur que le
// serveur FTP de sa console est simplement arrete, ni ou l'allumer. Le code
// d'origine est conserve dans le message : c'est la seule information qui
// permette de diagnostiquer un cas qu'on n'a pas prevu.
function messageLisible(err, hote, port) {
  const m = String((err && err.message) || err || '');
  const cible = hote ? hote + ':' + port : 'cette adresse';
  // La reponse BRUTE de la console est jointe des qu'elle apprend quelque chose.
  // FtpDll, par exemple, explique son refus : « Login failed: input = <md5>,
  // pass = <md5> » — de quoi comprendre que le nom d'utilisateur est le bon et
  // que c'est le mot de passe qui a ete change. Le remplacer par une phrase
  // generique faisait perdre le seul indice disponible.
  const brut = /FTP\s+\d{3}/.test(m) && !/ECONNREFUSED|EHOSTUNREACH|ENOTFOUND|ETIMEDOUT/i.test(m) ? '\nRéponse de la console : ' + m : '';
  const dit = conseil => conseil + brut;
  if (/ECONNREFUSED/i.test(m)) {
    return dit('Rien n\'écoute sur ' + cible + '. Vérifie que le serveur FTP de la console est activé'
      + ' (Aurora : Paramètres → Serveur FTP) et que l\'adresse est bien celle affichée par la console.');
  }
  if (/EHOSTUNREACH|ENETUNREACH/i.test(m)) {
    return dit('Console injoignable à ' + cible + '. Vérifie qu\'elle est allumée et sur le même réseau que ce PC.');
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) {
    return dit('Adresse introuvable : ' + hote + '. Vérifie l\'IP affichée par la console.');
  }
  if (/ETIMEDOUT|délai|delai|timeout/i.test(m)) {
    return dit('Aucune réponse de ' + cible + '. La console est peut-être allumée mais son serveur FTP arrêté,'
      + ' ou un pare-feu bloque le port ' + port + '.');
  }
  if (/ECONNRESET|connexion ferm[ée]e/i.test(m)) {
    return dit('La console a coupé la connexion. Trois causes, dans l\'ordre de fréquence :\n'
      + '1. Elle n\'accepte souvent qu\'UNE seule session FTP — ferme les autres clients (FileZilla, etc.).\n'
      + '2. Le Wi-Fi lâche sur les gros fichiers : le guide Aurora conseille un câble Ethernet.\n'
      + '3. Un envoi trop gros d\'un coup : envoie les paquets un par un plutôt qu\'un dossier entier.');
  }
  if (/\b530\b/.test(m)) {
    return dit('Mot de passe refusé (le nom d\'utilisateur, lui, est accepté). Ouvre les réglages FTP de la console'
      + ' pour lire le mot de passe — Aurora : Paramètres → Serveur FTP.\n'
      + 'Les DEUX couples par défaut de la scène sont xbox / xbox (plugin FTP d\'Aurora)'
      + ' et xboxftp / xboxftp (FtpDll) : essaie l\'autre avant de conclure à une panne.');
  }
  if (/\b332\b/.test(m)) {
    return dit('Nom d\'utilisateur refusé. Les deux valeurs par défaut de la scène sont xbox'
      + ' (plugin FTP d\'Aurora) et xboxftp (FtpDll) — le guide Aurora FR cite xbox / xbox.'
      + ' Essaie l\'autre, puis lis la valeur dans les réglages FTP de la console.');
  }
  return m;
}

module.exports = { Ftp, joinFtp, messageLisible };
