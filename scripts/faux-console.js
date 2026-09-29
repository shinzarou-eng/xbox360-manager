#!/usr/bin/env node
'use strict';
// Fausse console Xbox — un serveur FTP local qui imite l'arborescence d'Aurora.
//
// Sert a eprouver l'onglet Console SANS console : on voit les deux panneaux, on
// envoie, on recupere, et on verifie que rien ne se perd. C'est le meme serveur
// que celui des tests (test/aide-ftp.js) : la fausse console et les tests ne
// peuvent donc pas diverger.
//
//   node scripts/faux-console.js [port] [dossier]
//   node scripts/faux-console.js 2121
//
// Puis, dans l'application : adresse 127.0.0.1, port 2121, xboxftp / xboxftp.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ServeurFtp } = require('../test/aide-ftp');

const PORT = Number(process.argv[2]) || 2121;
const RACINE = process.argv[3] || path.join(os.tmpdir(), 'x360-fausse-console');

// Une arborescence realiste : les dossiers ou Aurora range vraiment les choses.
function construire(base) {
  const tid = '4D5307E6';
  const ecrire = (rel, contenu) => {
    const f = path.join(base, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, contenu);
  };
  ecrire('Content/0000000000000000/' + tid + '/00000002/pack1.bin', Buffer.alloc(120 * 1024, 1));
  ecrire('Content/0000000000000000/' + tid + '/00000002/pack2.bin', Buffer.alloc(80 * 1024, 2));
  ecrire('Content/0000000000000000/' + tid + '/000B0000/tu5.data', Buffer.alloc(4 * 1024 * 1024, 3));
  ecrire('Content/0000000000000000/555308C2/00000002/freedom-cry.bin', Buffer.alloc(600 * 1024, 4));
  ecrire('Games/' + tid + '/00007000/Data0000', Buffer.alloc(64 * 1024, 5));
  ecrire('Aurora/aurora.ini', 'Skin=Default\r\nLanguage=French\r\n');
  ecrire('Aurora/Skins/Default/skin.xur', Buffer.alloc(2048, 6));
  ecrire('Launch.ini', 'default = Hdd:\\Aurora\\default.xex\r\n');
}

(async () => {
  if (!fs.existsSync(RACINE)) { fs.mkdirSync(RACINE, { recursive: true }); construire(RACINE); }
  const srv = new ServeurFtp(RACINE, { user: 'xboxftp', pass: 'xboxftp' });
  await srv.demarrer(PORT);
  console.log('Fausse console Xbox en ecoute sur 127.0.0.1:' + PORT);
  console.log('  utilisateur : xboxftp');
  console.log('  mot de passe: xboxftp');
  console.log('  racine      : ' + RACINE);
  console.log('  (Ctrl+C pour arreter)');
  process.on('SIGINT', async () => { await srv.arreter(); process.exit(0); });
})();
