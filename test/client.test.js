// Tests de public/index.html — l'UI est un seul fichier avec un <script> inline.
//
// Garde-fou principal : le script DOIT parser. Ce n'est pas theorique : un
// `const escH` declare deux fois dans la meme portee a rendu le <script> entier
// invalide, donc TOUTE l'interface inerte (aucun handler ne s'executait), sans
// aucune erreur visible cote serveur — le fichier etait servi avec un 200.
// Un `node --check` sur server.js ne voit rien : seul ce test l'attrape.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'public', 'index.html');
const APP = path.join(__dirname, '..', 'public', 'app.js');
const html = fs.readFileSync(HTML, 'utf8');
const inline = fs.readFileSync(APP, 'utf8');

test('index.html charge bien ses deux ressources externes', () => {
  // l'interface est servie depuis trois fichiers : si le lien ou le script
  // disparait, la page s'affiche SANS style ou SANS logique, sans erreur visible
  assert.match(html, /<link[^>]+href="\/style\.css"/, 'la feuille de style doit etre referencee');
  assert.match(html, /<script[^>]+src="\/app\.js"/, 'le script doit etre reference');
  assert.strictEqual((html.match(/<script(?![^>]*src=)/g) || []).length, 0,
    'plus aucun script inline : tout doit vivre dans app.js');
});

test('app.js PARSE (sinon toute l UI est morte)', () => {
  // new Function compile le source : une redeclaration `const`/`let`, une
  // accolade manquante ou une chaine non terminee levent ici.
  assert.doesNotThrow(() => new Function(inline),
    'app.js ne compile pas : TOUS les boutons et onglets de la page seraient inertes');
});

test('les trois echappeurs sont declares exactement une fois', () => {
  for (const nom of ['escH', 'escA', 'jsA']) {
    const n = (inline.match(new RegExp('const\\s+' + nom + '\\s*=', 'g')) || []).length;
    assert.strictEqual(n, 1, nom + ' doit etre declare exactement une fois (trouve ' + n + ')');
  }
});

test('l ancien esc() dangereux a disparu', () => {
  // esc() n'echappait que l'apostrophe : dans un attribut "..." un guillemet
  // fermait l'attribut et permettait d'injecter un handler.
  assert.strictEqual((inline.match(/function\s+esc\s*\(/g) || []).length, 0,
    'function esc() ne doit plus exister : utiliser escA/jsA');
  assert.strictEqual((inline.match(/[^a-zA-Z0-9_$]esc\(/g) || []).length, 0,
    'aucun appel residuel a esc() ne doit subsister');
});

test('aucun litteral JS brut dans un attribut de handler', () => {
  // Motif dangereux : onclick="f('${uneDonneeDistante}')" — une apostrophe dans
  // la donnee casse le handler (bouton mort SANS message, cf. "Assassin's Creed").
  // La forme correcte est onclick="f(${jsA(x)})".
  const mauvais = inline.match(/on\w+="[^"]*'\$\{(?!jsA|T\(|escA)[^}]*\}'\$\{/g) || [];
  assert.deepStrictEqual(mauvais, [],
    'attribut de handler avec litteral JS non echappe (utiliser jsA) : ' + mauvais.join(' | '));
});

test('les donnees distantes injectees en innerHTML passent par escH', () => {
  // Ces champs viennent d'archive.org / XboxUnity : du contenu controlable par
  // un tiers, qui s'executerait dans une page ayant acces a l'API locale.
  const champs = ['it.title', 'f.name', 'i.detail', 'i.tid', 'c.name'];
  for (const c of champs) {
    const brut = new RegExp('\\$\\{' + c.replace('.', '\\.') + '\\}', 'g');
    assert.strictEqual((inline.match(brut) || []).length, 0,
      c + ' est injecte brut dans un template : envelopper avec escH()');
  }
});
