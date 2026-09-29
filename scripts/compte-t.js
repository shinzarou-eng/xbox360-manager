// Recompte exact des sites d'appel T() et des chaines anglaises distinctes,
// selon les DEUX motifs du test agents-doc.test.js (app.js + server.js).
const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const RE = /(^|[^A-Za-z0-9_$.])T\(\s*['"`]/g;
let sites = 0;
const parFichier = {};
for (const f of ['public/app.js', 'server.js']) {
  const n = [...fs.readFileSync(path.join(RACINE, f), 'utf8').matchAll(RE)].length;
  parFichier[f] = n; sites += n;
}
const RE2 = /\bT\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3\s*(?:,|\))/g;
const en = new Set();
for (const f of ['public/app.js', 'server.js']) {
  for (const m of fs.readFileSync(path.join(RACINE, f), 'utf8').matchAll(RE2)) {
    if (m[4]) en.add(m[4].replace(/\\'/g, "'"));
  }
}
console.log(JSON.stringify({ sites, parFichier, distinctes: en.size }));
