// Tests de lib/diaporama.js — quels jeux entrent dans le diaporama, et comment
// la liste des jaquettes se met en cache.
//
// Le cas qui compte : un jeu SANS jaquette doit etre EXCLU, pas affiche avec un
// point d'interrogation. Un diaporama de points d'interrogation n'est pas un
// diaporama. Et le cache doit se perimer, sinon une jaquette telechargee pendant
// que l'application tourne n'apparaitrait jamais.
const test = require('node:test');
const assert = require('node:assert');

const D = require('../lib/diaporama');

const jeux = [
  { name: 'Halo 3', tid: '4D5307E6', size: 100 },
  { name: 'Sans jaquette', tid: 'AAAA1111', size: 200 },
  { name: 'Tid absent', tid: '-', size: 300 },
  { name: 'Rien du tout', tid: null, size: 400 }
];

test('diaporama : seuls les jeux AVEC jaquette sont retenus', () => {
  const r = D.avecJaquette(jeux, new Set(['4D5307E6']));
  assert.deepStrictEqual(r, [{ tid: '4D5307E6', name: 'Halo 3', size: 100 }]);
});

test('diaporama : la casse du TitleID ne compte pas', () => {
  // Les jaquettes sont rangees en majuscules sur le disque, mais un TitleID venu
  // d'ailleurs peut arriver en minuscules. Comparer a la lettre le raterait.
  const r = D.avecJaquette([{ name: 'X', tid: '4d5307e6', size: 1 }], new Set(['4D5307E6']));
  assert.strictEqual(r.length, 1);
  // ET LE TID RENDU EST LA FORME CANONIQUE, pas celle de l'entree. Sans cette
  // assertion, une mutation qui comparerait en insensible a la casse mais rendrait
  // le tid tel qu'il est arrive passait : la longueur restait 1, et le diaporama
  // affichait « 4d5307e6 » — un identifiant que l'utilisateur ne peut comparer ni
  // avec Aurora ni avec XboxUnity, et un nom de fichier qui n'existe peut-etre pas
  // sur un disque sensible a la casse.
  assert.strictEqual(r[0].tid, '4D5307E6', 'le tid doit sortir en majuscules');
});

test('diaporama : un tid absent ou "-" ne passe jamais', () => {
  const r = D.avecJaquette(jeux, new Set(['-', 'AAAA1111', '4D5307E6']));
  assert.deepStrictEqual(r.map(g => g.tid), ['4D5307E6', 'AAAA1111'],
    'un tid "-" ne doit pas entrer, meme si une jaquette porte ce nom');
});

test('diaporama : le format de sortie ne porte que tid, name et size', () => {
  const r = D.avecJaquette([{ name: 'Halo 3', tid: '4D5307E6', size: 100, path: 'H:\\x', packs: 3 }],
    new Set(['4D5307E6']));
  assert.deepStrictEqual(Object.keys(r[0]).sort(), ['name', 'size', 'tid']);
});

test('diaporama : la liste des jaquettes se lit une fois, puis se garde', () => {
  const io = {
    lus: 0,
    readdirSync() { this.lus++; return ['4D5307E6.jpg', 'AAAA1111_custom.jpg', 'notes.txt', 'DDEEDDEE_sm.jpg']; },
    statSync() { return { mtimeMs: 1000 }; }
  };
  const un = D.listeJaquettes(io, 'covers');
  // `_custom` compte (c'est une jaquette choisie par l'utilisateur), `_sm` NON
  // (c'est la vignette, pas la jaquette), et `notes.txt` non plus.
  assert.deepStrictEqual([...un.tids].sort(), ['4D5307E6', 'AAAA1111']);
  assert.strictEqual(io.lus, 1);
  const deux = D.listeJaquettes(io, 'covers', un);
  assert.strictEqual(deux, un, 'la meme cle doit rendre le meme objet, sans relire');
  assert.strictEqual(io.lus, 1, 'le dossier a ete relu alors qu il n avait pas bouge');
});

test('diaporama : le cache se perime quand une jaquette arrive', () => {
  let t = 1000;
  const io = {
    lus: 0,
    readdirSync() { this.lus++; return ['4D5307E6.jpg']; },
    statSync() { return { mtimeMs: t }; }
  };
  const un = D.listeJaquettes(io, 'covers');
  assert.strictEqual(un.tids.size, 1);
  t = 2000;                     // une jaquette vient d'etre telechargee
  const deux = D.listeJaquettes(io, 'covers', un);
  assert.notStrictEqual(deux, un, 'un dossier qui a change doit etre relu');
  assert.strictEqual(io.lus, 2);
});

test('diaporama : un dossier absent ou illisible ne fait pas lever', () => {
  const io = {
    readdirSync() { throw new Error('ENOENT'); },
    statSync() { throw new Error('ENOENT'); }
  };
  const r = D.listeJaquettes(io, 'covers');
  assert.ok(r && r.tids instanceof Set && r.tids.size === 0,
    'sans dossier covers, on rend un ensemble vide et l application continue');
  assert.deepStrictEqual(D.avecJaquette(jeux, r.tids), []);
});
