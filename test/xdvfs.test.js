// Tests de lib/xdvfs.js — lecteur du systeme de fichiers des disques Xbox 1.
// On construit des images XDVDFS synthetiques aux offsets reels (magic a
// base+0x10000, tables de repertoires en arbre AVL, certificat XBE) plutot que
// de dependre d'un vrai ISO de plusieurs Go.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const xdvfs = require('../lib/xdvfs');

let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xdvfs-')); });
test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

const TAILLE_NOM_PAD = n => (14 + n.length + 3) & ~3;

// un default.xbe minimal mais valide : XBEH, base a 0x104, certificat a 0x118,
// TitleID a cert+8, titre UTF-16LE a cert+0x0C, region a cert+0xA0.
function makeXbe({ tid = 0x45410077, titre = 'Jeu Test', region = 4 } = {}) {
  const b = Buffer.alloc(0x400, 0);
  b.write('XBEH', 0, 'latin1');
  const BASE = 0x10000, CERT = 0x184;
  b.writeUInt32LE(BASE, 0x104);
  b.writeUInt32LE(BASE + CERT, 0x118);
  b.writeUInt32LE(tid, CERT + 8);
  b.write(titre, CERT + 0x0C, 'utf16le');
  b.writeUInt32LE(region, CERT + 0xA0);
  return b;
}

// ecrit une entree de table a l'offset `off` de `table`.
function dirent(table, off, { gauche = 0, droite = 0, sect, taille, dir = false, nom }) {
  table.writeUInt16LE(gauche, off);
  table.writeUInt16LE(droite, off + 2);
  table.writeUInt32LE(sect, off + 4);
  table.writeUInt32LE(taille, off + 8);
  table[off + 12] = dir ? 0x10 : 0;
  table[off + 13] = nom.length;
  table.write(nom, off + 14, 'latin1');
  return off + TAILLE_NOM_PAD(nom); // index du prochain emplacement, EN OCTETS
}

/**
 * Construit une image : `base` octets de vide, magic, table racine a
 * secteur 0x30 (deux entrees : default.xbe + un dossier data/ qui contient
 * readme.txt), donnees aux secteurs 0x40 / 0x50 / 0x60.
 * `executable` choisit le nom de l'executable racine ('default.xbe' ou
 * 'default.xex' pour simuler un XSF Xbox 360).
 */
function makeIso(nom, { base = 0, executable = 'default.xbe', xbe = makeXbe() } = {}) {
  const taille = base + 0x40000; // le secteur de r.txt (0x60) doit etre DANS le fichier
  const img = Buffer.alloc(taille, 0);
  xdvfs.MAGIC.copy(img, base + 0x10000);
  const ROOT_SECT = 0x30;
  img.writeUInt32LE(ROOT_SECT, base + 0x10014);
  img.writeUInt32LE(2048, base + 0x10018);
  const root = img.subarray(base + ROOT_SECT * 2048, base + ROOT_SECT * 2048 + 2048);
  const offData = dirent(root, 0, { droite: 0, sect: 0x40, taille: xbe.length, nom: executable });
  // l'arbre : l'executable pointe a droite vers "data" (index en x4 octets)
  const idxData = dirent(root, offData, { sect: 0x50, taille: 2048, dir: true, nom: 'data' });
  root.writeUInt16LE(offData / 4, 2); // droite de l'entree 0 = index de 'data'
  void idxData;
  const data = img.subarray(base + 0x50 * 2048, base + 0x50 * 2048 + 2048);
  dirent(data, 0, { sect: 0x60, taille: 5, nom: 'r.txt' });
  xbe.copy(img, base + 0x40 * 2048);
  img.write('salut', base + 0x60 * 2048, 'latin1');
  const f = path.join(dir, nom);
  fs.writeFileSync(f, img);
  return f;
}

test('trouverBase : XSF a 0 et XGD1 a 0x18300000', () => {
  const f1 = makeIso('xsf.bin');
  const fd1 = fs.openSync(f1, 'r');
  assert.strictEqual(xdvfs.trouverBase(fd1, fs.fstatSync(fd1).size), 0);
  fs.closeSync(fd1);

  const f2 = makeIso('xgd1.bin', { base: 0x18300000 });
  const fd2 = fs.openSync(f2, 'r');
  assert.strictEqual(xdvfs.trouverBase(fd2, fs.fstatSync(fd2).size), 0x18300000);
  fs.closeSync(fd2);
});

test('lister : parcours AVL complet (fichier + dossier + contenu du dossier)', () => {
  const f = makeIso('liste.bin');
  const fd = fs.openSync(f, 'r');
  const entrees = xdvfs.lister(fd, 0);
  fs.closeSync(fd);
  const chemins = entrees.map(e => e.chemin).sort();
  assert.deepStrictEqual(chemins, ['data/', 'data/r.txt', 'default.xbe']);
});

test('infosXbe : TitleID, titre et region du certificat', () => {
  const infos = xdvfs.infosXbe(makeXbe({ tid: 0x45410077, titre: 'Harry Potter: GOF', region: 4 }));
  assert.strictEqual(infos.tid, '45410077');
  assert.strictEqual(infos.titre, 'Harry Potter: GOF');
  assert.strictEqual(infos.regionNom, 'PAL');
});

test('estXbox1 : XISO et dump XGD1 decales sont reconnus', () => {
  const xsf = makeIso('jeu-xiso.iso');
  const xgd = makeIso('jeu-redump.iso', { base: 0x18300000 });
  for (const f of [xsf, xgd]) {
    const x1 = xdvfs.estXbox1(f);
    assert.ok(x1, path.basename(f) + ' doit etre Xbox 1');
    assert.strictEqual(x1.tid, '45410077');
    assert.strictEqual(x1.regionNom, 'PAL');
  }
});

test('estXbox1 : un XSF avec default.xex n est PAS Xbox 1', () => {
  const f = makeIso('xsf-360.iso', { executable: 'default.xex', xbe: Buffer.alloc(0x400) });
  assert.strictEqual(xdvfs.estXbox1(f), null);
  const f2 = path.join(dir, 'pas-xbox.bin');
  fs.writeFileSync(f2, Buffer.alloc(0x20000));
  assert.strictEqual(xdvfs.estXbox1(f2), null);
});

test('extraire : restitue l arborescence et les contenus', async () => {
  const f = makeIso('jeu.iso');
  const dest = path.join(dir, 'out');
  const r = await xdvfs.extraire(f, dest);
  assert.strictEqual(r.fichiers, 2);
  assert.strictEqual(fs.readFileSync(path.join(dest, 'data', 'r.txt'), 'latin1'), 'salut');
  assert.strictEqual(fs.readFileSync(path.join(dest, 'default.xbe'), 'latin1').slice(0, 4), 'XBEH');
});
