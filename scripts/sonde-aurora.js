// Ou Aurora range-t-il VRAIMENT ses scripts sur la console ?
//
// Repos.ini du depot officiel dit « Game:\User\Scripts\Utility\ ». Encore faut-il
// que « Game: » soit /Game sur le serveur FTP, et que « User\Scripts » existe.
// On va voir, au lieu de le supposer.
//
//   node scripts/sonde-aurora.js            (lit la config et secrets.json)
//   node scripts/sonde-aurora.js 192.168.1.34 21
const fs = require('fs');
const { Ftp, joinFtp, messageLisible } = require('../lib/ftp');

const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const secrets = JSON.parse(fs.readFileSync('secrets.json', 'utf8'));
const hote = process.argv[2] || cfg.console.host;
const port = Number(process.argv[3]) || cfg.console.port || 21;
const user = cfg.console.user || 'xboxftp';

// Ce qu'on cherche : une installation d'Aurora, et son dossier de scripts.
const MARQUEURS = ['Aurora.xex', 'aurora.xex'];
const A_CHERCHER = ['User', 'Scripts', 'User/Scripts', 'User/Scripts/Utility', 'User/Scripts/Content',
  'Plugins', 'Data', 'Skins', 'Modules'];

(async () => {
  if (!hote) { console.error('Aucune console configuree.'); process.exit(2); }
  const c = new Ftp({ host: hote, port, timeout: 20000 });
  console.log('=== connexion a ' + hote + ':' + port + ' ===');
  try { await c.ouvrir(user, secrets.ftpPass); }
  catch (e) { console.error('  ' + messageLisible(e, hote, port)); process.exit(1); }
  console.log('  ' + c.systeme + ' | MLSD ' + c.mlsd);

  const racine = await c.liste('');
  console.log('\n=== racine ===');
  console.log('  ' + racine.map(e => e.name + (e.dir ? '/' : '')).join('  '));

  // On parcourt deux niveaux : les dossiers de premier niveau, puis leur contenu.
  const installs = [];
  for (const d of racine.filter(e => e.dir)) {
    let enfants = [];
    try { enfants = await c.liste(d.path); } catch (e) { console.log('  ' + d.name + ' : illisible (' + e.message + ')'); continue; }
    const noms = enfants.map(e => e.name);
    const aurora = noms.some(n => MARQUEURS.includes(n));
    console.log('\n=== ' + d.path + ' ===' + (aurora ? '   <-- Aurora.xex ICI' : ''));
    console.log('  ' + noms.slice(0, 20).map(n => n + (enfants.find(e => e.name === n).dir ? '/' : '')).join('  '));
    if (aurora) {
      const trouves = {};
      for (const rel of A_CHERCHER) {
        try { const l = await c.liste(joinFtp(d.path, rel)); trouves[rel] = l.length; } catch { trouves[rel] = null; }
      }
      installs.push({ dossier: d.path, trouves });
    }
  }

  console.log('\n=== ce que contient chaque installation d\'Aurora ===');
  if (!installs.length) console.log('  aucune : aucun dossier de premiere niveau ne contient Aurora.xex');
  for (const i of installs) {
    console.log('  ' + i.dossier);
    for (const [rel, n] of Object.entries(i.trouves)) {
      console.log('      ' + rel.padEnd(24) + (n === null ? 'ABSENT' : n + ' entree(s)'));
    }
  }

  // LA question : ou la decouverte de l'application place-t-elle les scripts ?
  console.log('\n=== decouverte de l\'application (lib/aurora-scripts.js) ===');
  const A = require('../lib/aurora-scripts');
  const dest = await A.trouverConsole(c, '');
  console.log('  trouve  : ' + dest.trouve + (dest.raison ? '  (' + dest.raison + ')' : ''));
  if (dest.trouve) {
    console.log('  choisi  : ' + dest.choisi.dossier + (dest.plusieurs ? '   (' + dest.installs.length + ' installations)' : ''));
    for (const [id, v] of Object.entries(dest.choisi.categories)) {
      console.log('      ' + id.padEnd(11) + v.chemin.padEnd(38) + (v.entrees === null ? 'ABSENT' : v.entrees + ' entree(s)'));
    }
  } else if (dest.racine) {
    console.log('  vu      : ' + dest.racine.join('  '));
  }

  await c.fermer();
})();
