// Tests de lib/pkg.js — lecture des en-tetes de packages Xbox 360.
// On fabrique des packages synthetiques aux offsets reels (0x344 / 0x360 / 0x412)
// plutot que de dependre d'un jeu installe sur le disque.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pkg = require('../lib/pkg');

let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-')); });
test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

// construit un faux package : magic a 0x000, content type a 0x344,
// TitleID a 0x360, nom UTF-16LE a 0x412.
// ATTENTION au format reel : a 0x344 et 0x360 ce sont des OCTETS BRUTS, pas de
// l'ASCII. Le TitleID '415607D3' est donc stocke 41 56 07 D3, et c'est
// l'encodage hex de ces octets qui redonne la chaine. Ecrire l'ASCII '415607D3'
// produirait '34313536' — d'ou l'usage de Buffer.from(x, 'hex') ici.
function makePkg(name, { magic = 'LIVE', tid = '415607D3', ct = '00007000', title = 'Test Game' } = {}) {
  const buf = Buffer.alloc(0x600, 0);
  buf.write(magic, 0, 'ascii');
  Buffer.from(ct, 'hex').copy(buf, 0x344);
  Buffer.from(tid, 'hex').copy(buf, 0x360);
  buf.write(title, 0x412, 'utf16le');
  const f = path.join(dir, name);
  fs.writeFileSync(f, buf);
  return f;
}

test('isGodFile : reconnait LIVE, CON et PIRS', () => {
  for (const m of ['LIVE', 'CON ', 'PIRS']) {
    const f = makePkg('m_' + m.trim() + '.bin', { magic: m });
    assert.strictEqual(pkg.isGodFile(f), true, m + ' doit etre reconnu');
  }
});

test('isGodFile : rejette un fichier quelconque et un fichier absent', () => {
  const junk = path.join(dir, 'junk.bin');
  fs.writeFileSync(junk, Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]));
  assert.strictEqual(pkg.isGodFile(junk), false);
  assert.strictEqual(pkg.isGodFile(path.join(dir, 'nexistepas.bin')), false);
});

test('godTid : lit le TitleID a 0x360', () => {
  const f = makePkg('tid.bin', { tid: '4D5307D3' });
  assert.strictEqual(pkg.godTid(f), '4D5307D3');
});

test('godName : lit le titre UTF-16LE a 0x412', () => {
  const f = makePkg('name.bin', { title: 'Halo 3' });
  assert.strictEqual(pkg.godName(f), 'Halo 3');
});

test('godName : accents et caracteres non-ASCII survivent', () => {
  const f = makePkg('acc.bin', { title: 'Pokémon Édition' });
  assert.strictEqual(pkg.godName(f), 'Pokémon Édition');
});

test('godName : titre vide -> null (pas chaine vide)', () => {
  const f = makePkg('empty.bin', { title: '' });
  assert.strictEqual(pkg.godName(f), null);
});

test('contentType / ctSub / ctLabel : chaque type va dans son sous-dossier', () => {
  const cas = [
    ['00000002', 'DLC'], ['000B0000', 'TU'], ['00000001', 'SAVE'],
    ['00007000', 'GOD'], ['00080000', 'XBLA'], ['000D0000', 'XBLA'], ['00009000', 'AVATAR'],
  ];
  for (const [ct, label] of cas) {
    const f = makePkg('ct_' + ct + '.bin', { ct });
    assert.strictEqual(pkg.contentType(f), ct);
    assert.strictEqual(pkg.ctSub(f), ct);
    assert.strictEqual(pkg.ctLabel(pkg.ctSub(f)), label, ct + ' -> ' + label);
  }
});

test('ctSub : fichier illisible -> GOD (00007000) par defaut', () => {
  assert.strictEqual(pkg.ctSub(path.join(dir, 'nexistepas.bin')), '00007000');
  const court = path.join(dir, 'trop_court.bin');
  fs.writeFileSync(court, Buffer.alloc(16, 0)); // ne va pas jusqu'a 0x344
  assert.strictEqual(pkg.ctSub(court), '00007000');
});

test('ctSub : tout package lisible donne un type hex8 (jamais de valeur non-hex)', () => {
  // contentType encode 4 octets bruts en hex : le resultat est donc TOUJOURS
  // 8 caracteres hexadecimaux. La branche "type invalide" de ctSub n'est
  // atteignable que par un fichier illisible, pas par un contenu bizarre.
  const f = makePkg('ct_ascii.bin', { ct: '00000000' });
  const sub = pkg.ctSub(f);
  assert.match(sub, /^[0-9A-F]{8}$/, 'ctSub doit toujours rendre un sous-dossier hex8 valide');
  assert.strictEqual(sub, '00000000');
  assert.strictEqual(pkg.ctLabel(sub), 'PKG', 'un type sans etiquette connue reste PKG');
});

test('ctLabel : type inconnu -> PKG', () => {
  assert.strictEqual(pkg.ctLabel('DEADBEEF'), 'PKG');
  assert.strictEqual(pkg.ctLabel(null), 'PKG');
});

test('GAME_SUBS : GOD et XBLA sont des jeux, DLC/TU non', () => {
  assert.strictEqual(pkg.isGameSub('00007000'), true);
  assert.strictEqual(pkg.isGameSub('00080000'), true);
  assert.strictEqual(pkg.isGameSub('000D0000'), true);
  assert.strictEqual(pkg.isGameSub('00000002'), false, 'DLC ne doit PAS aller dans Games');
  assert.strictEqual(pkg.isGameSub('000B0000'), false, 'TU ne doit PAS aller dans Games');
  assert.strictEqual(pkg.isGameSub('00000001'), false, 'SAVE ne doit PAS aller dans Games');
});

test('isGameSub : insensible a la casse', () => {
  assert.strictEqual(pkg.isGameSub('00007000'.toLowerCase()), true);
});

test('magicKind : 7z, zip et rar sont des archives', () => {
  const sept7z = path.join(dir, 'a.7z');
  fs.writeFileSync(sept7z, Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C, 0x00, 0x04]));
  assert.strictEqual(pkg.magicKind(sept7z), 'archive');

  const zip = path.join(dir, 'a.zip');
  fs.writeFileSync(zip, Buffer.from([0x50, 0x4B, 0x03, 0x04, 0, 0, 0, 0]));
  assert.strictEqual(pkg.magicKind(zip), 'archive');

  const rar = path.join(dir, 'a.rar');
  fs.writeFileSync(rar, Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00, 0x00]));
  assert.strictEqual(pkg.magicKind(rar), 'archive');
});

test('magicKind : un vrai ISO n\'est pas une archive', () => {
  const iso = path.join(dir, 'vrai.iso');
  const b = Buffer.alloc(0x8000, 0);
  b.write('MICROSOFT', 0, 'ascii'); // signature XDVDFS
  fs.writeFileSync(iso, b);
  assert.strictEqual(pkg.magicKind(iso), null);
});

test('magicKind : le piege Vimm — un .iso qui est en realite un 7z', () => {
  // c'est le cas qui casse tout si on se fie a l'extension
  const piege = path.join(dir, 'trompeur.iso');
  fs.writeFileSync(piege, Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C, 0x00, 0x04]));
  assert.strictEqual(pkg.magicKind(piege), 'archive',
    'un .iso dont les octets sont du 7z DOIT etre vu comme une archive');
});

test('magicKind : fichier trop court ou absent -> null, sans lever', () => {
  const court = path.join(dir, 'court.bin');
  fs.writeFileSync(court, Buffer.from([0x37]));
  assert.strictEqual(pkg.magicKind(court), null);
  assert.strictEqual(pkg.magicKind(path.join(dir, 'nexistepas.bin')), null);
});

test('readAt : fichier trop court -> null (pas de lecture partielle)', () => {
  const petit = path.join(dir, 'petit.bin');
  fs.writeFileSync(petit, Buffer.alloc(100, 1));
  assert.strictEqual(pkg.readAt(petit, 4, 0) !== null, true);
  assert.strictEqual(pkg.readAt(petit, 4, 0x360), null, 'offset au-dela de la fin -> null');
});

test('aucune fuite de descripteur : les fichiers restent supprimables', () => {
  // sous Windows, supprimer un fichier dont un descripteur est encore ouvert
  // echoue (EBUSY/EPERM). C'est donc un detecteur de fuite fiable et portable ici.
  const fichiers = [];
  for (let i = 0; i < 40; i++) {
    const f = makePkg('leak' + i + '.bin', { title: 'Fuite ' + i });
    fichiers.push(f);
    pkg.isGodFile(f); pkg.godTid(f); pkg.godName(f); pkg.contentType(f); pkg.ctSub(f); pkg.magicKind(f);
  }
  for (const f of fichiers) {
    assert.doesNotThrow(() => fs.unlinkSync(f),
      'descripteur non ferme sur ' + path.basename(f) + ' (fuite dans readAt)');
  }
});

// ---------------------------------------------------------------------------
// EST-CE UN ISO XBOX ? — le test qui evite une conversion vouee a l'echec
// ---------------------------------------------------------------------------
// Mesure du 2026-09-20 : un ISO du jeu PC (« Dark Messiah of Might and Magic »,
// 7,11 Go, disque d'installation InstallShield) telecharge par erreur a fait
// travailler iso2god pour rien, puis est reste dans le depot avec un message qui
// ne disait pas pourquoi. On regarde desormais AVANT, pour 80 octets lus.

test('les offsets de la signature sont ceux de la REFERENCE (iso2god-rs)', () => {
  // iso2god-rs, `src/iso/iso_type.rs` : la signature se lit a
  // `0x20 * SECTOR_SIZE + root_offset`, avec SECTOR_SIZE = 0x800 (`src/iso/mod.rs`)
  // et root_offset = 0 (XSF), 0xfd90000 (XGD2), 0x18300000 (XGD1), 0x2080000 (XGD3).
  // Ces quatre nombres sont recopies de la reference : si quelqu'un les « ajuste »
  // a l'aveugle, ce test le dit.
  assert.deepStrictEqual(pkg.OFFSETS_XBOX, [0x10000, 0xFDA0000, 0x18310000, 0x2090000]);
  assert.strictEqual(pkg.SIGNATURE_XBOX, 'MICROSOFT*XBOX*MEDIA');
});

// Fabrique un ISO synthetique : un descripteur ISO9660 valide au secteur 0x20
// (comme un vrai disque) et la signature XDVDFS aux offsets demandes. Les trous
// sont ECRITS CREUX : un fichier de 265 Mo n'occupe qu'un cluster, donc le test
// reste instantane meme pour l'offset XGD2.
function isoFactice(nom, offsets, opts) {
  const o = opts || {};
  const f = path.join(dir, nom);
  const fd = fs.openSync(f, 'w');
  if (o.pvd !== false) {
    const pvd = Buffer.alloc(8);
    pvd.write('CD001', 1, 'ascii');
    fs.writeSync(fd, pvd, 0, 8, 0x8000);
  }
  const sig = Buffer.from(pkg.SIGNATURE_XBOX, 'latin1');
  for (const off of offsets) fs.writeSync(fd, sig, 0, sig.length, off);
  fs.closeSync(fd);
  return f;
}

test('un ISO Xbox est reconnu a CHACUN des quatre offsets', () => {
  for (const off of pkg.OFFSETS_XBOX) {
    const f = isoFactice('xbox-' + off.toString(16) + '.iso', [off]);
    assert.strictEqual(pkg.estIsoXbox(f), true,
      'la signature posee a ' + off.toString(16) + ' doit etre reconnue');
  }
});

test('un ISO qui n est PAS un jeu Xbox 360 est refuse', () => {
  // Le cas REEL : un ISO9660 valide (descripteur CD001 present) mais sans XDVDFS —
  // c'est exactement le disque PC qui a laisse 7,11 Go dans le depot.
  const f = isoFactice('disque-pc.iso', []);
  assert.strictEqual(pkg.estIsoXbox(f), false);
  // et un fichier qui n'a que la signature au MAUVAIS endroit reste refuse
  const g = isoFactice('decalle.iso', [0x10000 + 4]);
  assert.strictEqual(pkg.estIsoXbox(g), false, 'un offset voisin ne doit pas suffire');
});

test('un fichier absent, vide ou trop court ne fait pas lever', () => {
  assert.strictEqual(pkg.estIsoXbox(path.join(dir, 'absent.iso')), false);
  const petit = path.join(dir, 'petit.iso');
  fs.writeFileSync(petit, 'x');
  assert.strictEqual(pkg.estIsoXbox(petit), false);
  assert.strictEqual(pkg.estIsoXbox(''), false);
  assert.strictEqual(pkg.estIsoXbox(null), false);
});

test('server.js verifie l ISO AVANT de lancer la conversion', () => {
  // Un controle place APRES la conversion ne servirait a rien : le fichier aurait
  // deja fait travailler iso2god, et c'est exactement ce qu'on veut eviter. Ce
  // garde-fou epingle l'ORDRE dans la branche ISO de `installDownloaded` — la
  // fonction testee ci-dessus n'est utile que si quelqu'un l'appelle.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const i = srv.indexOf('ISO telecharge -> conversion GOD directe');
  assert.ok(i > 0, 'la branche ISO de installDownloaded doit rester trouvable dans server.js');
  const bloc = srv.slice(i, i + 1200);
  const controle = bloc.indexOf('estIsoXbox(');
  const conversion = bloc.indexOf('doIsoToGod(');
  assert.ok(controle > 0, 'la branche ISO doit verifier que le fichier est un jeu Xbox 360');
  assert.ok(conversion > 0, 'et elle doit toujours convertir');
  assert.ok(controle < conversion, 'le controle doit venir AVANT la conversion');
});
