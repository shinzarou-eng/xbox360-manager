// Format .asset d'Aurora : la mise en page vient du modele binaire 010 Editor du
// depot officiel XboxUnity (AuroraAssetEditor). Les nombres sont ceux du modele,
// pas des notres — c'est tout l'enjeu, puisque Aurora lit ces decalages sans
// verifier quoi que ce soit.
const test = require('node:test');
const assert = require('node:assert');
const A = require('../lib/aurora-asset');

test('la mise en page est celle du modele officiel', () => {
  // en-tete 12 · table 8 + 25 x 64 · donnees au bloc suivant
  assert.strictEqual(A.ENTETE, 12);
  assert.strictEqual(A.ENTRÉES, 25);
  assert.strictEqual(A.TAILLE_ENTREE, 64, 'une entree = decalage(4) + taille(4) + info(4) + texture(52)');
  assert.strictEqual(A.TABLE, 1608);
  assert.strictEqual(A.BLOC, 2048);
  assert.strictEqual(Math.ceil((12 + 1608) / 2048) * 2048, 2048, 'la table tient dans le premier bloc');
});

test('les 25 entrees sont dans l ordre qu Aurora attend', () => {
  // Aurora ne cherche pas la jaquette : il lit l'entree 2. Changer cet ordre
  // afficherait un fond d'ecran en guise de jaquette.
  assert.deepStrictEqual(A.TYPES.slice(0, 5), ['ICONE', 'BANNIERE', 'JAQUETTE', 'SLOT', 'FOND']);
  assert.strictEqual(A.TYPES[5], 'CAPTURE_1');
  assert.strictEqual(A.TYPES[24], 'CAPTURE_20');
  assert.strictEqual(A.TYPES.length, 25);
});

test('un fichier trop court est refuse, pas devine', () => {
  assert.match(A.lireAsset(Buffer.alloc(10)).error, /trop court/);
  assert.match(A.lireAsset(Buffer.alloc(3000)).error, /magic/i);
});

test('aller-retour : ce qu on ecrit se relit a l identique', () => {
  // L'aller-retour ne prouve pas que le format est juste — seul un fichier REEL
  // le prouvera — mais il prouve que les decalages, les tailles et le
  // remplissage sont coherents entre eux, et que rien ne se chevauche.
  const pixel = (n, v) => Buffer.alloc(n * 4, v);
  const images = [];
  images[0] = { data: pixel(64 * 64, 0x11), largeur: 64, hauteur: 64, format: 0x13 };
  images[2] = { data: pixel(200 * 300, 0x22), largeur: 200, hauteur: 300, format: 0x13 };
  images[4] = { data: pixel(1280 * 720, 0x33), largeur: 1280, hauteur: 720, format: 0x0c };
  const buf = A.ecrireAsset(images);
  const lu = A.lireAsset(buf);
  assert.ok(!lu.error, lu.error);
  assert.deepStrictEqual(lu.tronque, [], 'aucune entree ne doit tomber hors du fichier');
  assert.strictEqual(lu.presentes.length, 3);
  // les dimensions reviennent entieres depuis les champs de 13 bits
  assert.strictEqual(lu.entrees[2].largeur, 200);
  assert.strictEqual(lu.entrees[2].hauteur, 300);
  assert.strictEqual(lu.entrees[4].largeur, 1280, '1280 tient sur 13 bits');
  assert.strictEqual(lu.entrees[4].hauteur, 720);
  assert.strictEqual(lu.entrees[4].format, 'R5G6B5');
  assert.strictEqual(lu.entrees[2].format, 'A8R8G8B8');
  // les donnees commencent au premier bloc, et ne se chevauchent pas
  const d = lu.entrees.filter(e => e.presente).sort((a, b) => a.offset - b.offset);
  assert.ok(d[0].offset >= 2048, 'les donnees suivent la table et son remplissage');
  for (let i = 1; i < d.length; i++) {
    assert.ok(d[i].offset >= d[i - 1].offset + d[i - 1].size, 'les images ne se chevauchent pas');
  }
  assert.strictEqual(lu.dataSize, buf.length, 'la taille declaree couvre tout le fichier');
});

test('une entree declaree mais absente est SIGNALEE', () => {
  // Un fichier tronque produirait sinon des images silencieusement vides.
  const buf = A.ecrireAsset([{ data: Buffer.alloc(64, 1), largeur: 4, hauteur: 4, format: 0x13 }]);
  const coupe = buf.subarray(0, buf.length - 32);
  const lu = A.lireAsset(coupe);
  assert.deepStrictEqual(lu.tronque, ['ICONE']);
  assert.strictEqual(lu.presentes.length, 0);
});
