// Tests de lib/mediaid.js — extraction du MediaID depuis un XEX2.
// Le MediaID conditionne la validite d'une Title Update : s'il est faux, la TU
// installee est ignoree par la console et les DLC restent bloques. Ces tests
// verrouillent la lecture binaire et surtout le chevauchement de blocs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { xexMid, fileMediaId, godMediaId, CHUNK } = require('../lib/mediaid');

let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mid-')); });
test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

// Fabrique un en-tete XEX2 valide a l'offset xo.
// Structure : 'XEX2' a xo, u32 securityInfo a xo+0x10, u32 taille a xo+xsi,
// MediaID (u32) a xo+xsi+0x14C.
function xexBuf({ xo = 0, xsi = 0x18, sexLen = 0x1000, mid = 0x6D88AE4F, size = 0x400 } = {}) {
  const b = Buffer.alloc(Math.max(size, xo + xsi + 0x14C + 4), 0);
  b.write('XEX2', xo, 'ascii');
  b.writeUInt32BE(xsi, xo + 0x10);
  b.writeUInt32BE(sexLen, xo + xsi);
  b.writeUInt32BE(mid, xo + xsi + 0x14C);
  return b;
}

test('xexMid : lit le MediaID d\'un XEX2 valide', () => {
  assert.strictEqual(xexMid(xexBuf(), 0), '6D88AE4F');
});

test('xexMid : cas reel verifie contre XboxUnity (Rivals 603CD4F9)', () => {
  assert.strictEqual(xexMid(xexBuf({ mid: 0x603CD4F9 }), 0), '603CD4F9');
});

test('xexMid : MediaID a 0 -> null (pas de faux positif)', () => {
  assert.strictEqual(xexMid(xexBuf({ mid: 0 }), 0), null);
});

test('xexMid : securityInfo hors bornes -> null', () => {
  assert.strictEqual(xexMid(xexBuf({ xsi: 0 }), 0), null, 'xsi = 0 doit etre refuse');
  assert.strictEqual(xexMid(xexBuf({ xsi: 0x401 }), 0), null, 'xsi > 0x400 doit etre refuse');
  assert.strictEqual(xexMid(xexBuf({ xsi: 0x400 }), 0), '6D88AE4F', 'xsi = 0x400 reste valide');
});

test('xexMid : taille declaree absurde -> null', () => {
  assert.strictEqual(xexMid(xexBuf({ sexLen: 0x80001 }), 0), null);
  assert.strictEqual(xexMid(xexBuf({ sexLen: 0x80000 }), 0), '6D88AE4F', '0x80000 reste valide');
});

test('xexMid : buffer trop court -> null, sans lever', () => {
  assert.strictEqual(xexMid(Buffer.alloc(8), 0), null);
  assert.strictEqual(xexMid(Buffer.alloc(0), 0), null);
});

test('xexMid : respecte l\'offset xo (signature au milieu du buffer)', () => {
  const b = xexBuf({ xo: 0x1234, mid: 0x415607D3 });
  assert.strictEqual(xexMid(b, 0x1234), '415607D3');
  assert.strictEqual(xexMid(b, 0), null, 'a l\'offset 0 il n\'y a pas de XEX2');
});

test('xexMid : le MediaID est toujours formate sur 8 caracteres', () => {
  assert.strictEqual(xexMid(xexBuf({ mid: 0x0000ABCD }), 0), '0000ABCD');
});

test('fileMediaId : lit un vrai default.xex', () => {
  const f = path.join(dir, 'default.xex');
  fs.writeFileSync(f, xexBuf({ size: 0x20000 }));
  assert.strictEqual(fileMediaId(f), '6D88AE4F');
});

test('fileMediaId : mauvais magic -> null', () => {
  const f = path.join(dir, 'pas_un_xex.bin');
  const b = xexBuf({ size: 0x20000 });
  b.write('NOPE', 0, 'ascii');
  fs.writeFileSync(f, b);
  assert.strictEqual(fileMediaId(f), null);
});

test('fileMediaId : fichier trop petit -> null', () => {
  const f = path.join(dir, 'minuscule.xex');
  fs.writeFileSync(f, xexBuf({ size: 0x100 })); // < 0x200
  assert.strictEqual(fileMediaId(f), null);
});

test('fileMediaId : fichier absent -> null, sans lever', () => {
  assert.strictEqual(fileMediaId(path.join(dir, 'nexistepas.xex')), null);
});

test('fileMediaId : aucun descripteur laisse ouvert', () => {
  const fichiers = [];
  for (let i = 0; i < 20; i++) {
    const f = path.join(dir, 'leak' + i + '.xex');
    fs.writeFileSync(f, xexBuf({ size: 0x20000 }));
    fichiers.push(f);
    fileMediaId(f);
  }
  for (const f of fichiers) {
    assert.doesNotThrow(() => fs.unlinkSync(f),
      'descripteur non ferme sur ' + path.basename(f));
  }
});

test('godMediaId : trouve le XEX2 embarque dans un .data', () => {
  const g = path.join(dir, 'god_simple');
  fs.mkdirSync(path.join(g, '00007000'), { recursive: true });
  fs.writeFileSync(path.join(g, '00007000', 'Data0000'), xexBuf({ xo: 0x100, size: 0x30000 }));
  assert.strictEqual(godMediaId(g), '6D88AE4F');
});

test('godMediaId : ignore les fichiers trop petits pour contenir un XEX', () => {
  const g = path.join(dir, 'god_petit');
  fs.mkdirSync(g, { recursive: true });
  // 20 Ko < seuil de 40 Ko : ne doit pas etre scanne
  fs.writeFileSync(path.join(g, 'petit.data'), xexBuf({ size: 20 * 1024 }));
  assert.strictEqual(godMediaId(g), null);
});

test('godMediaId : aucun XEX2 -> null', () => {
  const g = path.join(dir, 'god_vide');
  fs.mkdirSync(g, { recursive: true });
  fs.writeFileSync(path.join(g, 'Data0000'), Buffer.alloc(0x10000, 0xAA));
  assert.strictEqual(godMediaId(g), null);
});

test('godMediaId : dossier inexistant -> null', () => {
  assert.strictEqual(godMediaId(path.join(dir, 'nexistepas')), null);
});

test('godMediaId : XEX2 A CHEVAL sur la frontiere de bloc de 8 Mo', () => {
  // Le cas que le chevauchement de 8 octets existe pour couvrir : sans lui, le
  // premier bloc ne contient que 'XEX' et le second commence apres le '2', donc
  // la signature n'est jamais vue et le MediaID reste introuvable.
  const g = path.join(dir, 'god_frontiere');
  fs.mkdirSync(g, { recursive: true });
  const taille = CHUNK + 0x400;
  const b = Buffer.alloc(taille, 0);
  const xo = CHUNK - 3; // 'XEX' dans le bloc 1, '2' dans le bloc 2
  b.write('XEX2', xo, 'ascii');
  b.writeUInt32BE(0x18, xo + 0x10);
  b.writeUInt32BE(0x1000, xo + 0x18);
  b.writeUInt32BE(0xCAA468A3, xo + 0x18 + 0x14C);
  fs.writeFileSync(path.join(g, 'Data0000'), b);

  assert.strictEqual(godMediaId(g), 'CAA468A3',
    'la signature a cheval sur deux blocs doit etre trouvee (chevauchement de 8 octets)');
});

test('godMediaId : choisit le premier fichier qui contient un XEX2 valide', () => {
  const g = path.join(dir, 'god_ordre');
  fs.mkdirSync(g, { recursive: true });
  // fichier trie en premier mais sans XEX2 valide (MediaID a 0)
  fs.writeFileSync(path.join(g, 'A.data'), xexBuf({ xo: 0x40, mid: 0, size: 0x20000 }));
  fs.writeFileSync(path.join(g, 'B.data'), xexBuf({ xo: 0x40, mid: 0x603CD4F9, size: 0x20000 }));
  assert.strictEqual(godMediaId(g), '603CD4F9');
});
