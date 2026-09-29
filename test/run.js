// Lanceur de tests : charge chaque fichier test/*.test.js DANS ce process.
//
// Pourquoi ne pas utiliser `node --test` directement : le runner de Node lance
// chaque fichier dans un process enfant avec stdio en pipe, ce que certains
// environnements restreints (sandbox Windows, CI verrouillee) refusent avec
// EPERM. Charger les fichiers en process donne le meme resultat et fonctionne
// partout.
//
// Usage : node test/run.js   (ou `npm test`)
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();

if (!files.length) {
  console.error('aucun fichier *.test.js trouve dans ' + dir);
  process.exit(1);
}

console.log('Tests : ' + files.join(', ') + '\n');
for (const f of files) require(path.join(dir, f));
