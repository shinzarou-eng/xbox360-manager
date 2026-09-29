// Le document peut MENTIR, et rien ne l'en empeche.
//
// Trois chiffres de AGENTS.md se sont reveles faux, tous du meme genre : un
// compte recopie a la main dans une phrase, que personne ne remesure.
//   - « 195 tests » alors qu'il y en avait 392 ;
//   - « 15 valeurs distinctes » de padding, recopie d'un OUTIL FAUTIF (son motif
//     avalait la regle suivante quand le `padding:` terminait un bloc) ;
//   - « 568 endroits » ou le code appelle T(), alors qu'il y en a 665.
//
// Une phrase ne se compile pas : elle ne casse rien quand elle devient fausse.
// Ce fichier rend verifiables ceux des chiffres qui se mesurent depuis les
// sources. C'est le seul point ou un document peut etre tenu en verite.
//
// CE QUI N'EST PAS COUVERT ICI, ET POURQUOI : le nombre de tests (« 392 ») ne
// peut pas se verifier depuis un test — un test ne sait pas combien de tests
// existent. Il se relit dans la sortie de `npm test` (`ℹ tests 392`). On le dit
// plutot que de laisser croire que tout le document est surveille.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { paddingsLitteraux } = require('../lib/audit-css');

const RACINE = path.join(__dirname, '..');
// AGENTS.md est un document de travail interne, absent du depot public : sur un
// clone public ces gardes sautent au lieu de casser la suite.
const agentsPath = path.join(RACINE, 'AGENTS.md');
if (!fs.existsSync(agentsPath)) {
  test('doc : AGENTS.md absent du clone — gardes desactives', () => {});
  return;
}
const doc = fs.readFileSync(agentsPath, 'utf8');
const css = fs.readFileSync(path.join(RACINE, 'public/style.css'), 'utf8');

// Le chiffre annonce dans le document, avec le libelle qui le suit. Le `\s+`
// traverse les retours a la ligne : les phrases du document sont repliees a 80
// colonnes, et un motif qui exige un espace unique casserait au premier
// remaniement du texte — pour une raison qui n'a rien a voir avec le chiffre.
function annonce(motif) {
  const m = motif.exec(doc);
  assert.ok(m, 'AGENTS.md ne dit plus ce chiffre : ' + motif);
  return Number(m[1]);
}

test('doc : le nombre de valeurs de padding annonce est le vrai', () => {
  // Le compte vient de `lib/audit-css.js` : c'est LE meme que celui du
  // garde-fou de style, et il retire les commentaires. Deux motifs ecrits
  // separement avaient deja divergé une fois ; il n'y en a plus qu'un.
  const valeurs = paddingsLitteraux(css);
  const dit = annonce(/\*\*\d+ paddings littéraux à\s+(\d+) valeurs distinctes\*\*/);
  assert.strictEqual(dit, valeurs.size,
    'AGENTS.md annonce ' + dit + ' valeurs de padding, il y en a ' + valeurs.size
    + ' : ' + [...valeurs.keys()].sort().join(' | '));
});

test('doc : le nombre de sites d appel de T() annonce est le vrai', () => {
  // Un appel T() dont le premier argument est une chaine : c'est le sens de
  // « endroit ou le code ecrit T(...) ». Le motif est volontairement plus large
  // que celui de l'extracteur de vocabulaire, qui exige DEUX litteraux
  // adjacents et rate les premiers arguments concatenes.
  const RE = /(^|[^A-Za-z0-9_$.])T\(\s*['"`]/g;
  let mesure = 0;
  for (const f of ['public/app.js', 'server.js']) {
    mesure += [...fs.readFileSync(path.join(RACINE, f), 'utf8').matchAll(RE)].length;
  }
  const dit = annonce(/\*\*(\d+) sites d'appel\*\*/);
  assert.strictEqual(dit, mesure,
    'AGENTS.md annonce ' + dit + ' sites d\'appel de T(), il y en a ' + mesure);
});

test('doc : le nombre de chaines anglaises distinctes annonce est le vrai', () => {
  const RE = /\bT\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3\s*(?:,|\))/g;
  const en = new Set();
  for (const f of ['public/app.js', 'server.js']) {
    for (const m of fs.readFileSync(path.join(RACINE, f), 'utf8').matchAll(RE)) {
      if (m[4]) en.add(m[4].replace(/\\'/g, "'"));
    }
  }
  const dit = annonce(/\*\*(\d+) chaînes anglaises distinctes\*\*/);
  assert.strictEqual(dit, en.size,
    'AGENTS.md annonce ' + dit + ' chaines anglaises distinctes, il y en a ' + en.size);
});

test('doc : le cout annonce pour deux langues est le double du compte', () => {
  // « c'est 1330 modifications a la main » : le document tire ce nombre des 665
  // appels. Ecrire l'un sans l'autre donnerait un cout qui ne suit plus.
  const appels = annonce(/\*\*(\d+) sites d'appel\*\*/);
  const cout = annonce(/c'est (\d+) modifications à/);
  assert.strictEqual(cout, appels * 2,
    'le cout annonce (' + cout + ') n\'est plus le double des appels (' + appels + ')');
});
