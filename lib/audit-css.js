'use strict';
// MESURER UNE FEUILLE DE STYLE SANS LIRE SES COMMENTAIRES.
//
// POURQUOI CE MODULE EXISTE. Le garde-fou des paddings (`test/ui-quality.test.js`),
// le controle du chiffre annonce (`test/agents-doc.test.js`) et l'outil d'audit
// (`scripts/audit-style.js`) cherchaient tous les trois `padding:` dans le TEXTE
// de `style.css`. Un commentaire qui EXPLIQUE un defaut en citant la declaration
// fautive etait donc compte comme une declaration.
//
// C'est arrive : la note de l'en-tete dit « cette regle ajoutait `padding:8px` en
// haut et en bas ». Le compte est passe de 13 a 14 valeurs distinctes, et le test
// a accuse la FEUILLE alors que la feuille n'avait pas bouge. Le meme piege etait
// deja referme cote JavaScript par `sansCommentaires()` dans
// `test/ui-quality.test.js` — il se referme ici de la meme facon, et une bonne
// fois pour les trois lecteurs.
//
// Le retrait PRESERVE LA LONGUEUR **et les retours a la ligne** : un commentaire
// de dix lignes devient dix lignes d'espaces. Sans cela, le volume annonce par
// l'outil d'audit (« style.css : N lignes ») aurait fondu avec les commentaires,
// et un numero de ligne signale par un garde-fou aurait designe autre chose.

const COMMENTAIRE = /\/\*[\s\S]*?\*\//g;

function sansCommentaires(css) {
  return String(css).replace(COMMENTAIRE, m => m.replace(/[^\n]/g, ' '));
}

// Les valeurs LITTERALES de padding : celles la ou un jeton existe. On ecarte
// `var(--x)` — c'est justement ce qu'on veut voir — et le motif s'arrete a `;`
// COMME a `}` : un `padding:` place en derniere declaration d'un bloc se termine
// par `}`, pas par `;`, et un motif qui exige le point-virgule avale alors la
// regle suivante en fabriquant une valeur qui n'existe pas.
const PADDING = /(?<![-\w])padding:\s*([^;}]+)[;}]/g;

function paddingsLitteraux(css) {
  const m = new Map();
  for (const x of sansCommentaires(css).matchAll(PADDING)) {
    const v = x[1].trim();
    if (v && !v.includes('var(--')) m.set(v, (m.get(v) || 0) + 1);
  }
  return m;
}

module.exports = { sansCommentaires, paddingsLitteraux };
