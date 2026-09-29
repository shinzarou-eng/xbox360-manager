// Extrait le vocabulaire reel des appels T(fr, en) — et dit ce qui ne POURRA pas
// passer par un dictionnaire.
//
// Un dictionnaire indexe sur l'anglais evite d'editer 575 sites d'appel a la
// main. Mais il ne marche que sur les chaines CONSTANTES : une chaine avec une
// interpolation (`${...}`) ne peut pas servir de cle, et celles-la devront etre
// traduites sur place.
const fs = require('fs');

const fichiers = ['public/app.js', 'server.js'];
const paires = new Map();      // en -> fr
const dynamiques = [];
let total = 0;

// T( '...' , '...' ) ou T( "..." , "..." ) — le 3e et 4e argument sont optionnels.
const RE = /\bT\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3\s*(?:,\s*(['"])((?:\\.|(?!\5)[^\\])*)\5\s*)?(?:,\s*(['"])((?:\\.|(?!\7)[^\\])*)\7\s*)?\)/g;

for (const f of fichiers) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(RE)) {
    total++;
    const fr = m[2].replace(/\\'/g, "'"), en = m[4].replace(/\\'/g, "'");
    if (en) paires.set(en, fr);
  }
  // Ce qui commence par T( mais n'est pas reconnu : a regarder a la main.
  for (const m of src.matchAll(/\bT\(`/g)) dynamiques.push(f);
}

console.log('appels T(fr, en) reconnus : ' + total);
console.log('chaines anglaises distinctes : ' + paires.size);
console.log('appels a gabarit (T(`...`)) : ' + dynamiques.length);

// Ce qui ressemble a un appel sans second argument litteral.
let sansEn = 0;
for (const f of fichiers) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bT\(/g)) {
    const suite = src.slice(m.index, m.index + 240);
    if (!/^T\(\s*['"]/.test(suite)) continue;
    if (!/,\s*['"]/.test(suite.slice(0, 200))) sansEn++;
  }
}
console.log('appels T("...") SANS second argument litteral : ' + sansEn);

// Repartition par longueur : les phrases longues sont les messages a soigner.
const parTaille = [...paires.keys()].sort((a, b) => b.length - a.length);
console.log('\n--- les 25 chaines les PLUS LONGUES (messages) ---');
for (const s of parTaille.slice(0, 25)) console.log('   [' + String(s.length).padStart(3) + '] ' + s.slice(0, 96));

const courtes = [...paires.keys()].filter(s => s.length <= 18);
console.log('\n--- ' + courtes.length + ' chaines courtes (etiquettes, boutons) ---');
console.log('   ' + courtes.slice(0, 40).join(' · '));

fs.writeFileSync('i18n-vocabulaire.json', JSON.stringify(
  Object.fromEntries([...paires].sort((a, b) => a[0].localeCompare(b[0]))), null, 1), 'utf8');
console.log('\nEcrit : i18n-vocabulaire.json');
