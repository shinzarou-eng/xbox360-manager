// Ramene les paddings litteraux de la feuille a TROIS tailles de controle.
//
// Il y en avait vingt-deux, la plupart employees une seule fois : 2px 9px,
// 2px 10px, 3px 10px, 4px 12px, 5px 12px, 6px 11px... Autant de facons d'ecrire
// « un petit bouton », et c'est precisement ce qui empeche une interface d'avoir
// l'air d'une seule application.
//
// Les trois tailles :
//   pastille   2px 8px    (etiquettes, puces)
//   petit      4px 10px   (boutons de ligne, barres d'outils)  -> .pad-s
//   normal     6px 14px   (bouton standard, deja celui de .btn)
const fs = require('fs');

const RAMPE = {
  '0 5px': '0 6px',
  '1px 8px': '2px 8px',
  '2px 6px': '2px 8px',
  '2px 9px': '2px 8px',
  '2px 11px': '2px 8px',
  '2px 8px': '2px 8px',
  '3px 10px': '4px 10px',
  '4px 8px': '4px 10px',
  '4px 10px': '4px 10px',
  '4px 12px': '4px 10px',
  '5px 10px': '4px 10px',
  '5px 12px': '4px 10px',
  '6px 10px': '6px 14px',
  '6px 11px': '6px 14px',
  '6px 12px': '6px 14px',
  '6px 9px': '4px 10px',
  '6px 14px': '6px 14px'
};

const f = 'public/style.css';
let css = fs.readFileSync(f, 'utf8');
const compte = new Map();
css = css.replace(/(?<![\-\w])padding:\s*([^;}]+)[;}]/g, (tout, v) => {
  const c = v.trim();
  if (c.includes('var(--')) return tout;
  const cible = RAMPE[c];
  if (!cible || cible === c) return tout;
  compte.set(c + '  ->  ' + cible, (compte.get(c + '  ->  ' + cible) || 0) + 1);
  return tout.replace(c, cible);
});
fs.writeFileSync(f, css);
console.log('Paddings ramenes :');
for (const [k, n] of [...compte].sort()) console.log('   ' + String(n).padStart(3) + ' x  ' + k);
console.log('\nRestants :');
const restants = new Map();
for (const x of css.matchAll(/(?<![-\w])padding:\s*([^;]+);/g)) {
  const v = x[1].trim();
  if (!v.includes('var(--')) restants.set(v, (restants.get(v) || 0) + 1);
}
for (const [v, n] of [...restants].sort()) console.log('   ' + String(n).padStart(3) + ' x  padding: ' + v + ';');
