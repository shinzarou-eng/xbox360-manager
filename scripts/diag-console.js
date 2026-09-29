#!/usr/bin/env node
'use strict';
// Diagnostic de la liaison FTP avec la console.
//
// Montre l'ECHANGE BRUT, et essaie les identifiants usuels. C'est ce qui permet
// de savoir POURQUOI une connexion echoue au lieu de deviner :
//
//   node scripts/diag-console.js 192.168.1.34
//   node scripts/diag-console.js 192.168.1.34 21
//
// Le serveur FtpDll d'Aurora explique ses refus — « 530 Login failed: input =
// <md5 du mot de passe envoye>, pass = <md5 du mot de passe attendu> ». Ce script
// affiche cette reponse telle quelle : elle dit si le NOM est bon et si c'est le
// MOT DE PASSE qui a ete change. Le mot de passe attendu se lit ensuite dans
// Aurora, Parametres → Serveur FTP.
const { Ftp, messageLisible } = require('../lib/ftp');

const hote = process.argv[2];
const port = Number(process.argv[3]) || 21;
if (!hote) {
  console.error('Usage : node scripts/diag-console.js <adresse> [port]');
  console.error('   ex : node scripts/diag-console.js 192.168.1.34');
  process.exit(2);
}

const essais = [
  ['xboxftp', 'xboxftp'],
  ['xboxftp', ''],
  ['ftp', 'ftp'],
  ['xbox', 'xbox'],
  ['anonymous', 'anonymous'],
];

(async () => {
  for (const [u, p] of essais) {
    const c = new Ftp({ host: hote, port, timeout: 12000, trace: (s, t) => console.log('      ' + s + ' ' + t.replace(/\r?\n/g, ' | ')) });
    console.log('\n=== ' + u + ' / ' + (p || '(vide)') + ' ===');
    try {
      await c.ouvrir(u, p);
      console.log('  >>> ACCEPTE');
      try { console.log('  racine : ' + await c.pwd()); } catch {}
      try {
        const l = await c.liste('');
        console.log('  ' + l.length + ' entree(s) : ' + l.map(e => e.name + (e.dir ? '/' : '')).slice(0, 14).join('  '));
      } catch (e) { console.log('  listing : ' + e.message); }
      await c.fermer();
      console.log('\nCes identifiants fonctionnent : saisis-les dans l\'onglet Console.');
      process.exit(0);
    } catch (e) {
      console.log('  REFUSE : ' + messageLisible(e, hote, port).split('\n')[0]);
      try { await c.fermer(); } catch {}
    }
  }
  console.log('\nAucun identifiant usuel accepte.');
  console.log('Le mot de passe a donc ete change : il se lit dans Aurora,');
  console.log('Parametres → Serveur FTP (le serveur ci-dessus en a donne le MD5).');
})();
