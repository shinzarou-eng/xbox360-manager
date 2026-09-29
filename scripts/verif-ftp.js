#!/usr/bin/env node
'use strict';
// Verification de bout en bout de l'onglet Console, SANS console.
//
// Lance la fausse console (le meme double que les tests, pour qu'ils ne puissent
// pas diverger), puis exerce toute la chaine par l'API de l'application :
// connexion, navigation, envoi, recuperation, comparaison — et verifie que le
// garde-fou refuse bien un chemin local hors des dossiers de l'application.
//
//   node server.js            (dans un autre terminal)
//   node scripts/verif-ftp.js
//
// Rien n'est laisse derriere : fichiers de test supprimes, session fermee.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ServeurFtp } = require('../test/aide-ftp');

const API = 'http://127.0.0.1:4360';
const PORT_FAUSSE = 2129;
const RACINE_FAUSSE = path.join(os.tmpdir(), 'x360-verif-console');

function req(methode, chemin, corps) {
  return new Promise((res, rej) => {
    const d = corps ? JSON.stringify(corps) : null;
    const r = http.request(API + chemin, {
      method: methode,
      headers: d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}
    }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => { try { res(JSON.parse(b)); } catch { res({ brut: b }); } }); });
    r.on('error', rej);
    r.setTimeout(60000, () => r.destroy(new Error('timeout')));
    if (d) r.write(d);
    r.end();
  });
}
const dormir = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Une arborescence minimale, comme celle d'Aurora.
  for (const [rel, taille] of [
    ['Content/0000000000000000/4D5307E6/00000002/pack1.bin', 120 * 1024],
    ['Content/0000000000000000/555308C2/00000002/freedom.bin', 60 * 1024],
    ['Games/4D5307E6/00007000/Data0000', 64 * 1024],
    ['Aurora/aurora.ini', 64],
  ]) {
    const f = path.join(RACINE_FAUSSE, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.alloc(taille, 1));
  }
  const fausse = new ServeurFtp(RACINE_FAUSSE, { user: 'xboxftp', pass: 'xboxftp' });
  await fausse.demarrer(PORT_FAUSSE);
  console.log('Fausse console sur 127.0.0.1:' + PORT_FAUSSE + '\n');

  // SAUVEGARDE de l'adresse de console de l'utilisateur. /api/ftp/connect
  // l'enregistre dans config.json — c'est voulu, on ne la retape pas a chaque
  // fois — mais un script de verification ne doit pas laisser SON adresse de test
  // derriere lui : l'application pointait ensuite sur une fausse console eteinte
  // et repondait « connect ECONNREFUSED 127.0.0.1:2129 ». Meme regle que
  // test/e2e.ps1, qui restaure config.json dans un finally.
  const cfgAvant = (await req('GET', '/api/config')).console || {};
  const restaurer = async () => {
    try { await req('POST', '/api/ftp/disconnect', {}); } catch {}
    try { await req('POST', '/api/config', { console: cfgAvant }); } catch {}
    try { await fausse.arreter(); } catch {}
  };
  process.on('exit', () => { try { fs.rmSync(RACINE_FAUSSE, { recursive: true, force: true }); } catch {} });

  console.log('=== connexion ===');
  const cx = await req('POST', '/api/ftp/connect', { host: '127.0.0.1', port: PORT_FAUSSE, user: 'xboxftp', pass: 'xboxftp' });
  if (cx.error) { console.log('  ECHEC : ' + cx.error); await restaurer(); process.exit(1); }
  console.log('  racine ' + cx.racine + ' | systeme ' + cx.systeme + ' | mlsd ' + cx.mlsd);
  console.log('  /' + cx.entrees.map(e => e.name + (e.dir ? '/' : '')).join('  '));

  console.log('\n=== navigation ===');
  const l1 = await req('GET', '/api/ftp/list?path=' + encodeURIComponent('/Content/0000000000000000'));
  console.log('  /Content/0000000000000000 -> ' + l1.entrees.map(e => e.name + (e.dir ? '/' : '')).join('  '));
  const l2 = await req('GET', '/api/ftp/list?path=' + encodeURIComponent('/Content/0000000000000000/4D5307E6/00000002'));
  console.log('  .../4D5307E6/00000002 -> ' + l2.entrees.map(e => e.name + ' (' + e.size + ' o)').join('  '));

  console.log('\n=== envoi d un fichier vers la console ===');
  // Le fichier doit etre dans un dossier de l'application : /api/ftp/upload
  // refuse tout chemin exterieur (c'est le garde-fou, teste plus bas).
  const cfg = await req('GET', '/api/config');
  const source = path.join(cfg.drop, 'x360-envoi-test.bin');
  const contenu = Buffer.alloc(200 * 1024);
  for (let i = 0; i < contenu.length; i++) contenu[i] = (i * 7) % 256;
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, contenu);
  const up = await req('POST', '/api/ftp/upload', { local: source, remote: '/Aurora/x360-envoi-test.bin' });
  if (up.error) { console.log('  ECHEC : ' + up.error); process.exit(1); }
  console.log('  job ' + up.job.id + ' lance');
  for (let i = 0; i < 40; i++) {
    await dormir(250);
    const s = await req('GET', '/api/ftp');
    const j = s.races.find(x => x.id === up.job.id);
    if (j && j.etat !== 'actif') { console.log('  ' + j.etat + ' — ' + j.recus + '/' + j.total + ' octets' + (j.error ? ' : ' + j.error : '')); break; }
  }
  const surConsole = path.join(RACINE_FAUSSE, 'Aurora', 'x360-envoi-test.bin');
  const okUp = fs.existsSync(surConsole) && fs.readFileSync(surConsole).equals(contenu);
  console.log('  fichier arrive intact : ' + okUp);
  console.log('\n=== envoi RECURSIF d un dossier (un jeu GOD est un dossier) ===');
  // Un jeu installe n'est pas un fichier : c'est une arborescence. On verifie
  // que les sous-dossiers distants sont crees et que CHAQUE fichier arrive.
  const jeuLocal = path.join(cfg.drop, 'x360-jeu-test');
  const attendu = {
    'default.xex': Buffer.alloc(300 * 1024, 11),
    '00007000/Data0000': Buffer.alloc(200 * 1024, 22),
    '00007000/Data0001': Buffer.alloc(150 * 1024, 33),
    'nested/plus/profond.bin': Buffer.alloc(64 * 1024, 44),
  };
  for (const [rel, buf] of Object.entries(attendu)) {
    const f = path.join(jeuLocal, rel.replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
  }
  const up2 = await req('POST', '/api/ftp/upload', { local: jeuLocal, remote: '/Games/555307D4' });
  if (up2.error) { console.log('  ECHEC : ' + up2.error); await restaurer(); process.exit(1); }
  console.log('  job ' + up2.job.id + ' — ' + up2.job.fichiers + ' fichier(s), dossier: ' + up2.job.dossier);
  let vu = null;
  for (let i = 0; i < 120; i++) {
    await dormir(250);
    const s = await req('GET', '/api/ftp');
    const j = s.races.find(x => x.id === up2.job.id);
    if (j && j.etat !== 'actif') { vu = j; break; }
  }
  if (!vu || vu.etat !== 'fait') { console.log('  ECHEC : ' + (vu ? vu.etat + ' ' + vu.error : 'jamais termine')); }
  else console.log('  ' + vu.etat + ' — ' + vu.faits + '/' + vu.fichiers + ' fichiers, ' + vu.recus + ' octets');
  let tous = true;
  for (const [rel, buf] of Object.entries(attendu)) {
    const f = path.join(RACINE_FAUSSE, 'Games', '555307D4', rel.replace(/\//g, path.sep));
    const ok = fs.existsSync(f) && fs.readFileSync(f).equals(buf);
    if (!ok) { tous = false; console.log('    MANQUE OU DIFFERENT : ' + rel); }
  }
  console.log('  arborescence complete et conforme : ' + tous);
  fs.rmSync(jeuLocal, { recursive: true, force: true });

  console.log('\n=== recuperation depuis la console ===');
  const dest = path.join(cfg.drop, 'x360-recup-test.bin');
  const down = await req('POST', '/api/ftp/download', { remote: '/Content/0000000000000000/4D5307E6/00000002/pack1.bin', local: dest });
  if (down.error) { console.log('  ECHEC : ' + down.error); process.exit(1); }
  for (let i = 0; i < 40; i++) {
    await dormir(250);
    const s = await req('GET', '/api/ftp');
    const j = s.races.find(x => x.id === down.job.id);
    if (j && j.etat !== 'actif') { console.log('  ' + j.etat + ' — ' + j.recus + ' octets' + (j.error ? ' : ' + j.error : '')); break; }
  }
  console.log('  fichier rapatrie : ' + (fs.existsSync(dest) ? fs.statSync(dest).size + ' o' : 'ABSENT'));

  console.log('\n=== comparaison PC / console ===');
  const cmp = await req('GET', '/api/ftp/compare?path=' + encodeURIComponent('/Content/0000000000000000'));
  if (cmp.error) console.log('  ECHEC : ' + cmp.error);
  else console.log('  ' + cmp.surConsole + ' TitleID sur la console, ' + cmp.absents.length + ' jeux du PC absents');

  console.log('\n=== garde-fou : chemin local hors des dossiers de l application ===');
  const mechant = await req('POST', '/api/ftp/download', { remote: '/Launch.ini', local: 'C:\\Windows\\System32\\drivers\\etc\\hosts' });
  console.log('  ' + (mechant.error ? 'REFUSE : ' + mechant.error : 'ACCEPTE — PROBLEME'));

  fs.rmSync(source, { force: true });
  fs.rmSync(dest, { force: true });
  await restaurer();
  const apres = (await req('GET', '/api/config')).console || {};
  console.log('\n=== deconnecte, fausse console arretee, fichiers de test nettoyes ===');
  console.log('  adresse de console restauree : ' + JSON.stringify(apres));
})();
