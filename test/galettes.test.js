// Fusion des galettes dans `Games\<TID>\`.
//
// Le defaut que ce module ferme a ete mesure : `doGodDir` faisait
// `fs.rmSync(dest)` avant de deplacer la source. Installer le disque 2 d'un jeu
// DETRUISAIT donc le disque 1, sans un mot — et l'utilisateur, qui avait les
// deux moities du jeu, se retrouvait avec une seule.
//
// Les cas sont joues sur de VRAIES arborescences temporaires (le module lit ses
// dossiers par `fs`), mais la clef de paquet est INJECTEE : c'est elle qui dit
// « meme disque » ou « autre galette », et on veut pouvoir la fixer sans
// fabriquer un en-tete GOD de 45 Ko.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const G = require('../lib/galettes');

// Un banc : deux dossiers temporaires, garnis par des listes de noms.
function banc(nomsSrc, nomsDest) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'x360-gal-'));
  const src = path.join(racine, 'src');
  const dest = nomsDest === null ? null : path.join(racine, 'dest');
  fs.mkdirSync(src, { recursive: true });
  if (dest) fs.mkdirSync(dest, { recursive: true });
  for (const n of nomsSrc) fs.mkdirSync(path.join(src, n));
  if (dest) for (const n of nomsDest) fs.mkdirSync(path.join(dest, n));
  return { racine, src, dest, fin: () => fs.rmSync(racine, { recursive: true, force: true }) };
}

// La clef d'un paquet = son nom, prive du suffixe `.data`. C'est la forme que
// `clefPaquet` prend quand l'en-tete est illisible — et ici, justement, les
// paquets sont des dossiers vides.
const clefNom = p => path.basename(p).replace(/\.data$/, '');

test('deux galettes differentes : celle qui est en place est CONSERVEE', () => {
  // `Games\<TID>\00007000` avant : le disque 1 (AAAA0001).
  // Ce qu iso2god vient de produire : le disque 2 (BBBB0002).
  const b = banc(['BBBB0002', 'BBBB0002.data'], ['AAAA0001', 'AAAA0001.data']);
  try {
    const r = G.fusionnerPaquets(b.src, b.dest, clefNom);
    assert.deepStrictEqual(r.garder, ['AAAA0001'], 'le disque 1 ne doit JAMAIS etre efface');
    assert.deepStrictEqual(r.remplacer, [], 'aucune galette deja en place ne porte ce MediaID');
    assert.deepStrictEqual(r.deja, [], 'le disque 2 n est pas encore la');
    // ET LE DOSSIER DE DONNEES SUIT SON PAQUET : il est conserve avec lui.
    assert.ok(fs.existsSync(path.join(b.dest, 'AAAA0001.data')));
  } finally { b.fin(); }
});

test('le MEME disque reinstallе : il est remplace, pas duplique', () => {
  const b = banc(['AAAA0001', 'AAAA0001.data'], ['AAAA0001', 'AAAA0001.data']);
  try {
    const r = G.fusionnerPaquets(b.src, b.dest, clefNom);
    assert.deepStrictEqual(r.remplacer, ['AAAA0001'], 'le meme disque se met a jour');
    assert.deepStrictEqual(r.garder, [], 'rien d autre n est en place');
    assert.deepStrictEqual(r.deja, ['AAAA0001'], 'le paquet est deja la : inutile de le redeplacer');
  } finally { b.fin(); }
});

test('deux galettes du meme jeu : LES DEUX sont la apres le passage', () => {
  // Le cas reel : le disque 1 est installe, on installe le disque 2.
  // `garder` porte le disque 1, la source porte le disque 2 : aucun des deux
  // n'est efface. C'est l'invariant que le `rmSync` d avant cassait.
  const b = banc(['BBBB0002', 'BBBB0002.data'], ['AAAA0001', 'AAAA0001.data']);
  try {
    const r = G.fusionnerPaquets(b.src, b.dest, clefNom);
    assert.deepStrictEqual([...r.garder, ...r.remplacer].sort(), ['AAAA0001']);
    assert.ok(!r.garder.includes('BBBB0002'), 'la galette qui arrive n est pas « a garder » : elle est deplacee');
  } finally { b.fin(); }
});

test('rien en place : tout est deplace, rien n est garde ni remplace', () => {
  const b = banc(['AAAA0001', 'AAAA0001.data'], null);
  try {
    assert.deepStrictEqual(G.fusionnerPaquets(b.src, null, clefNom),
      { garder: [], remplacer: [], deja: [] });
  } finally { b.fin(); }
});

test('le dossier .data suit son paquet et n est pas compte comme une galette', () => {
  const b = banc(['AAAA0001', 'AAAA0001.data'], ['BBBB0002', 'BBBB0002.data']);
  try {
    const vus = [];
    G.fusionnerPaquets(b.src, b.dest, p => { vus.push(path.basename(p)); return clefNom(p); });
    assert.ok(!vus.some(n => /\.data$/.test(n)), 'aucun .data ne doit etre pris pour un paquet');
    // Deux paquets (un par cote) : pas quatre.
    assert.strictEqual(vus.length, 2, 'vu : ' + vus.join(', '));
  } finally { b.fin(); }
});

test('un MediaID illisible ne fabrique pas un doublon a chaque installation', () => {
  // Le repli est le NOM du fichier : un en-tete illisible (paquet tronque,
  // format inattendu) doit garder une clef STABLE. Sans cela, le meme paquet
  // serait pris pour « une autre galette » a chaque passage, et la bibliotheque
  // accumulerait des copies.
  const a = G.clefPaquet(path.join('H:', 'Games', '4D5307E6', '00007000', 'ZZZZ0001'));
  const b = G.clefPaquet(path.join('H:', 'Games', '4D5307E6', '00007000', 'ZZZZ0001'));
  assert.strictEqual(a, b);
  assert.match(a, /ZZZZ0001$/);
});

test('le nom du dossier n est PAS le MediaID — mesure sur 33 paquets reels', () => {
  // MESURE (2026-09-20, H:\Games) : le prefixe de 8 caracteres du nom `<hash>`
  // ne correspond au MediaID du champ que 19 fois sur 33. Exemple reel :
  //   paquet 938EE06415CDE2EF879F  ->  MediaID 5940C9DB (Midnight Club: LA)
  // Prendre le nom pour la clef aurait donc donne deux clefs differentes pour le
  // meme disque, c'est-a-dire un doublon a chaque installation. Le test fige la
  // reference pour que ce raccourci ne revienne pas « parce que ca a l'air de
  // marcher ».
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'x360-gal-'));
  try {
    const f = path.join(d, '938EE06415CDE2EF879F');
    fs.writeFileSync(f, Buffer.alloc(0x400));
    const fd = fs.openSync(f, 'r+');
    fs.writeSync(fd, Buffer.from([0x59, 0x40, 0xC9, 0xDB]), 0, 4, 0x354);
    fs.closeSync(fd);
    assert.strictEqual(G.mediaIdPaquet(f), '5940C9DB');
    assert.notStrictEqual(G.mediaIdPaquet(f), path.basename(f).slice(0, 8).toUpperCase(),
      'la clef ne doit pas etre deduite du nom');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('le MediaID se lit dans l en-tete du paquet (0x354)', () => {
  // MESURE sur les paquets GOD reels de la bibliotheque : l'en-tete `LIVE` porte
  // un u32 a 0x354. C'est cette lecture qui decide « meme disque » ou « autre
  // galette », donc elle est verifiee sur un fichier fabrique.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'x360-gal-'));
  try {
    const f = path.join(d, 'PKG');
    fs.writeFileSync(f, Buffer.alloc(0x400));
    const fd = fs.openSync(f, 'r+');
    fs.writeSync(fd, Buffer.from([0x6D, 0x88, 0xAE, 0x4F]), 0, 4, 0x354);
    fs.closeSync(fd);
    assert.strictEqual(G.mediaIdPaquet(f), '6D88AE4F');
    // Un fichier trop court ne doit pas lever : il rend null, et la clef tombe
    // sur le nom.
    fs.writeFileSync(path.join(d, 'COURT'), Buffer.alloc(4));
    assert.strictEqual(G.mediaIdPaquet(path.join(d, 'COURT')), null);
    assert.strictEqual(G.mediaIdPaquet(path.join(d, 'ABSENT')), null);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});
