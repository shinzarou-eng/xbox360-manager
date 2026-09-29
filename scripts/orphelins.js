// Liste les cles de dictionnaire qui ne servent plus (orphan audit, identique
// a test/i18n.test.js mais qui imprime la liste).
const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const { DICT_ES, DICT_PT, DICT_FR_ES, DICT_FR_PT } = require('../public/i18n.js');
const app = lire('public/app.js');
function evaluer(s) {
  try { return new Function('return "' + s.replace(/"/g, '\\"') + '";')(); }
  catch (e) { return s; }
}
const re = /\bT\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3\s*(?:,|\))/g;
const en = new Set();
for (const f of ['public/app.js', 'server.js', 'lib/xbox1-local.js']) {
  for (const m of lire(f).matchAll(re)) if (m[4]) en.add(evaluer(m[4].replace(/\\'/g, "'")));
}
const viv = new Set(en);
const frs = /const FR_EN_STATIQUE=(\{[\s\S]*?\});/.exec(app);
if (frs) for (const k of Object.keys(eval('(' + frs[1] + ')'))) viv.add('STATIQUE:' + k);
const mortes = [...Object.keys(DICT_ES), ...Object.keys(DICT_PT)]
  .filter(k => !viv.has(k) && !viv.has('STATIQUE:' + k) && !DICT_FR_ES[k] && !DICT_FR_PT[k]);
console.log([...new Set(mortes)].join('\n'));
