// PROUVE le defaut : deux envois lances en meme temps sur la meme session FTP.
//
// Le client a une file de reponses FIFO PARTAGEE (`this.attente`) et stocke la
// connexion passive dans un champ d'instance : si deux transferts s'entrelacent,
// le second PASV ecrase la cible du premier, et les donnees partent au mauvais
// endroit. La console, elle, n'accepte de toute facon qu'un transfert a la fois.
//
//   node scripts/verif-transferts.js        (le serveur doit tourner sur 4360)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { ServeurFtp } = require('../test/aide-ftp');

const PORT_FAUSSE = 2131;
const API = 'http://127.0.0.1:4360';
const RACINE = path.join(os.tmpdir(), 'x360-transfert-fausse');
// Les fichiers de test vont dans le DEPOT : `cheminLocalAutorise` n'accepte que
// drop/games/content/homebrew/emulators, et c'est voulu (un XSS ne doit pas
// pouvoir ecrire n'importe ou via /api/ftp/upload).
let DEPOT = '';

const req = (m, c, corps) => new Promise((res, rej) => {
  const u = new URL(API + c);
  const r = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: m, headers: corps ? { 'Content-Type': 'application/json' } : {} },
    rs => { let d = ''; rs.on('data', x => d += x); rs.on('end', () => { try { res(JSON.parse(d)); } catch { res({ brut: d }); } }); });
  r.on('error', rej);
  if (corps) r.write(JSON.stringify(corps));
  r.end();
});
const dormir = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Deux dossiers de tailles differentes : si les flux se melangent, le contenu
  // ne correspondra plus a la taille annoncee.
  fs.mkdirSync(RACINE, { recursive: true });
  const cfg0 = await req('GET', '/api/config');
  DEPOT = path.join(cfg0.drop, '_essai_transfert');
  fs.rmSync(DEPOT, { recursive: true, force: true });
  const fausse = new ServeurFtp(RACINE, { user: 'xboxftp', pass: 'xboxftp' });
  await fausse.demarrer(PORT_FAUSSE);
  console.log('Fausse console sur ' + PORT_FAUSSE + '\n');

  const attendu = {};
  for (const [nom, n, octet] of [['A', 3, 0x41], ['B', 7, 0x42]]) {
    const d = path.join(DEPOT, nom);
    fs.mkdirSync(d, { recursive: true });
    for (let i = 0; i < n; i++) {
      const buf = Buffer.alloc(120 * 1024 + i * 1024, octet + i);
      fs.writeFileSync(path.join(d, 'f' + i + '.bin'), buf);
      attendu[nom + '/f' + i + '.bin'] = crypto.createHash('md5').update(buf).digest('hex');
    }
  }

  const cfgAvant = (await req('GET', '/api/config')).console || {};
  const restaurer = async () => {
    try { await req('POST', '/api/ftp/disconnect', {}); } catch {}
    try { await req('POST', '/api/config', { console: cfgAvant }); } catch {}
    try { await fausse.arreter(); } catch {}
    fs.rmSync(RACINE, { recursive: true, force: true });
    fs.rmSync(DEPOT, { recursive: true, force: true });
  };

  const cx = await req('POST', '/api/ftp/connect', { host: '127.0.0.1', port: PORT_FAUSSE, user: 'xboxftp', pass: 'xboxftp' });
  if (cx.error) { console.log('ECHEC connexion : ' + cx.error); await restaurer(); process.exit(1); }
  console.log('connecte : ' + cx.systeme + '\n');

  console.log('=== DEUX ENVOIS LANCES EN MEME TEMPS ===');
  const a = await req('POST', '/api/ftp/upload', { local: path.join(DEPOT, 'A'), remote: '/A' });
  const b = await req('POST', '/api/ftp/upload', { local: path.join(DEPOT, 'B'), remote: '/B' });
  console.log('  A : ' + (a.error || a.job.id) + '   B : ' + (b.error || b.job.id));

  for (let i = 0; i < 120; i++) {
    await dormir(400);
    const s = await req('GET', '/api/ftp');
    const ja = s.races.find(x => x.id === (a.job && a.job.id));
    const jb = s.races.find(x => x.id === (b.job && b.job.id));
    if (ja && jb && ja.etat !== 'actif' && jb.etat !== 'actif') break;
  }

  console.log('\n=== CE QUI EST ARRIVE SUR LA CONSOLE ===');
  let ko = 0, ok = 0;
  for (const [rel, md5] of Object.entries(attendu)) {
    const f = path.join(RACINE, rel);
    if (!fs.existsSync(f)) { console.log('  MANQUANT  ' + rel); ko++; continue; }
    const got = crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
    if (got === md5) ok++; else { console.log('  CORROMPU  ' + rel); ko++; }
  }
  console.log('  ' + ok + ' fichier(s) intacts, ' + ko + ' manquant(s) ou corrompu(s)');

  // Y a-t-il des fichiers au mauvais endroit ? Signe d'un PASV ecrase.
  const egare = [];
  for (const d of fs.readdirSync(RACINE)) {
    for (const f of fs.readdirSync(path.join(RACINE, d))) {
      if (attendu[d + '/' + f] === undefined) egare.push(d + '/' + f);
    }
  }
  if (egare.length) console.log('  EGARES (mauvais dossier) : ' + egare.join(', '));

  console.log('\n=== VERDICT : ' + (ko || egare.length ? 'DEFAILLANT' : 'OK') + ' ===');
  await restaurer();
  console.log('  (nettoye, config restauree)');
})();
