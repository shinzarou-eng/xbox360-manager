// Audit de coherence du style : quelles VALEURS sont utilisees, et combien de
// fois ? Une feuille incoherente ne se voit pas a la lecture — elle se voit en
// comptant : six rayons differents, cinq tailles de police hors echelle, quinze
// espacements inventes.
const fs = require('fs');
const { sansCommentaires, paddingsLitteraux } = require('../lib/audit-css');
// Les commentaires sont RETIRES avant toute mesure : une note qui explique un
// defaut en citant `padding:8px` etait comptee comme une declaration, et le
// compte annoncait une valeur de plus que la feuille n'en contient.
const css = sansCommentaires(fs.readFileSync('public/style.css', 'utf8'));
const js = fs.readFileSync('public/app.js', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');

function compte(texte, motif, groupe = 1) {
  const m = new Map();
  for (const x of texte.matchAll(motif)) {
    const v = (x[groupe] || '').trim();
    if (v) m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
}
const ligne = (titre, paires, max = 14) => {
  console.log('\n=== ' + titre + ' (' + paires.length + ' valeur(s) distincte(s)) ===');
  for (const [v, n] of paires.slice(0, max)) console.log('   ' + String(n).padStart(4) + ' x  ' + v);
  if (paires.length > max) console.log('   ... et ' + (paires.length - max) + ' autre(s)');
};

// 1. Les valeurs LITTERALES la ou un jeton existe.
//
// Les motifs s'arretent a `;` OU a `}`. Un `padding:` place en DERNIERE
// declaration d'un bloc se termine par `}`, pas par `;` : un motif qui exige le
// point-virgule avale alors la regle suivante et fabrique une valeur qui n'existe
// pas (`4px 10px} .conhead .btn svg{width:15px`). Le compte annoncait 15 valeurs
// distinctes dont TROIS n'en etaient pas ; le vrai compte est 14 — et c'est le
// PIEGE que ce meme depot documente par ailleurs.
const jetons = {
  'rayons': ['border-radius', /border-radius:\s*([^;}]+)/g],
  'espacements (padding)': ['padding', /(?<![-\w])padding:\s*([^;}]+)/g],
  'espacements (gap)': ['gap', /(?<![-\w])gap:\s*([^;}]+)/g],
  'tailles de police': ['font-size', /font-size:\s*([^;}]+)/g],
  'couleurs en dur (hex/rgb)': ['couleurs', /(?<!var\()\b(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g]
};
for (const [titre, [, motif]] of Object.entries(jetons)) {
  const toutes = compte(css, motif);
  // On ne signale que ce qui N'EST PAS un jeton : c'est la que l'incoherence vit.
  const hors = toutes.filter(([v]) => !v.includes('var(--'));
  ligne(titre + ' — hors jetons', hors);
}

// 2. Les styles EN LIGNE dans app.js : une feuille propre ne dit rien si le JS
//    redefinit tout a cote.
const enLigne = compte(js, /style="([^"]*)"/g);
console.log('\n=== styles en ligne dans app.js (' + enLigne.length + ' distincts) ===');
for (const [v, n] of enLigne.slice(0, 20)) console.log('   ' + String(n).padStart(4) + ' x  ' + v.slice(0, 110));
if (enLigne.length > 20) console.log('   ... et ' + (enLigne.length - 20) + ' autre(s)');

// 3. Les proprietes CSS les plus employees, pour voir ce qui merite un jeton.
console.log('\n=== proprietes les plus utilisees dans style.css ===');
const props = compte(css, /(?<![-\w])([a-z-]+):\s/g);
for (const [v, n] of props.slice(0, 18)) console.log('   ' + String(n).padStart(4) + ' x  ' + v);

console.log('\n=== volume ===');
// `split('\n').length` compte une ligne DE PLUS quand le fichier finit par un
// retour a la ligne : l'outil annoncait 1212 la ou l'editeur en voit 1211.
const nbLignes = t => t.replace(/\n$/, '').split('\n').length;
console.log('   style.css : ' + nbLignes(css) + ' lignes');
console.log('   app.js    : ' + nbLignes(js) + ' lignes, ' + enLigne.length + ' styles en ligne distincts');
console.log('   index.html: ' + compte(html, /style="([^"]*)"/g).length + ' styles en ligne distincts');
