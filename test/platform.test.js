// Tests de lib/platform.js — abstraction de la couche systeme.
// Les fonctions de parsing sont pures et testees sur des entrees fabriquees :
// on ne depend donc pas de la machine qui execute les tests, et on peut verifier
// le comportement Linux depuis Windows (et inversement).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const plat = require('../lib/platform');

test('parseProcMounts : extrait les points de montage et leur type', () => {
  const m = plat.parseProcMounts([
    '/dev/sda1 / ext4 rw,relatime 0 0',
    '/dev/sdb1 /media/usb vfat rw,nosuid 0 0',
    '/dev/sdc1 /mnt/gros exfat rw 0 0'
  ].join('\n'));
  assert.strictEqual(m['/'], 'ext4');
  assert.strictEqual(m['/media/usb'], 'vfat');
  assert.strictEqual(m['/mnt/gros'], 'exfat');
});

test('parseProcMounts : ignore les pseudo-systemes', () => {
  // ils ne disent rien sur une capacite disque et pollueraient la detection
  const m = plat.parseProcMounts([
    'proc /proc proc rw 0 0',
    'tmpfs /run tmpfs rw 0 0',
    'sysfs /sys sysfs rw 0 0',
    'devtmpfs /dev devtmpfs rw 0 0',
    '/dev/sda1 / ext4 rw 0 0'
  ].join('\n'));
  assert.deepStrictEqual(Object.keys(m), ['/']);
});

test('parseProcMounts : restaure les espaces echappes en \\040', () => {
  const m = plat.parseProcMounts('/dev/sdb1 /media/mon\\040disque exfat rw 0 0');
  assert.strictEqual(m['/media/mon disque'], 'exfat');
});

test('parseProcMounts : entree vide ou malformee -> objet vide, sans lever', () => {
  for (const mauvais of ['', null, undefined, 'ligne incomplete', '\n\n']) {
    assert.deepStrictEqual(plat.parseProcMounts(mauvais), {});
  }
});

test('mountPointOf : choisit la correspondance la PLUS LONGUE', () => {
  // '/' ne doit pas gagner contre '/media/usb' pour un chemin sous /media/usb
  const table = { '/': 'ext4', '/media/usb': 'vfat' };
  assert.strictEqual(plat.mountPointOf('/media/usb/jeux', table), '/media/usb');
  assert.strictEqual(plat.mountPointOf('/home/moi', table), '/');
});

test('mountPointOf : ne confond pas un prefixe avec un dossier frere', () => {
  // '/media/usb2' ne doit PAS etre rattache a '/media/usb'
  const table = { '/': 'ext4', '/media/usb': 'vfat' };
  assert.strictEqual(plat.mountPointOf('/media/usb2/jeux', table), '/');
});

test('mountPointOf : point de montage racine explicite', () => {
  assert.strictEqual(plat.mountPointOf('/', { '/': 'ext4' }), '/');
});

test('mountPointOf : table vide -> racine', () => {
  assert.strictEqual(plat.mountPointOf('/nimporte/ou', {}), '/');
  assert.strictEqual(plat.mountPointOf('/nimporte/ou', null), '/');
});

test('limite4Go : FAT32 et equivalents Linux sont reconnus', () => {
  for (const t of ['FAT32', 'fat32', 'FAT', 'vfat', 'VFAT', 'msdos']) {
    assert.strictEqual(plat.limite4Go(t), true, t + ' doit etre reconnu comme limite a 4 Go');
  }
});

test('limite4Go : les systemes sans limite ne sont PAS signales', () => {
  // une fausse alerte ici redirigerait un telechargement de 20 Go pour rien
  for (const t of ['NTFS', 'exFAT', 'ext4', 'btrfs', 'XFS', 'ReFS', 'apfs', '']) {
    assert.strictEqual(plat.limite4Go(t), false, t + ' ne doit pas etre signale');
  }
  assert.strictEqual(plat.limite4Go(null), false);
  assert.strictEqual(plat.limite4Go(undefined), false);
});

test('rootKey : coherent avec la plateforme courante', () => {
  const k = plat.rootKey(plat.IS_WIN ? 'H:\\_A_TRIER' : '/media/usb/jeux');
  if (plat.IS_WIN) assert.strictEqual(k, 'H:');
  else assert.strictEqual(k, '/');
  assert.strictEqual(plat.rootKey(''), '');
  assert.strictEqual(plat.rootKey(null), '');
});

test('rootKey : insensible a la casse de la lettre de lecteur', () => {
  if (!plat.IS_WIN) return; // specifique a Windows
  assert.strictEqual(plat.rootKey('h:\\jeux'), 'H:');
});

test('fsTypesSync : rend un objet, sans lever, sur la plateforme courante', () => {
  const t = plat.fsTypesSync();
  assert.strictEqual(typeof t, 'object');
  assert.ok(t !== null);
  // sur Windows, une lettre de lecteur ; sur Linux, un point de montage
  for (const k of Object.keys(t)) {
    assert.ok(typeof t[k] === 'string' && t[k].length, 'type attendu pour ' + k);
  }
});

test('fsTypesAsync : appelle le callback avec un objet', async () => {
  const t = await new Promise(res => plat.fsTypesAsync(res));
  assert.strictEqual(typeof t, 'object');
});

test('openPath : ne leve pas sur un chemin inexistant (echec rendu au callback)', async () => {
  const e = await new Promise(res => plat.openPath(path.join(__dirname, 'nexistepas'), res));
  // soit le lanceur echoue (rendu), soit il n'existe pas sur cette machine :
  // dans les deux cas l'appel ne doit PAS lever et tuer le process
  assert.ok(e === null || e instanceof Error);
});


// ---------------------------------------------------------------------------
// Reconnaissance d'un support Xbox
// ---------------------------------------------------------------------------
// C'est ce qui permet de charger automatiquement les jeux d'un disque qu'on vient
// de brancher, sans rien configurer. La regle est testable sans brancher de disque.
const { classerRacine, MARQUEURS_XBOX } = require('../lib/platform');

function bacVolume(dossiers) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'x360-vol-'));
  for (const x of dossiers) fs.mkdirSync(path.join(d, x), { recursive: true });
  return d;
}

test('un disque Xbox est reconnu a ce qu il contient, pas a son nom', () => {
  // Une cle RGH typique : Aurora, Content, _A_TRIER, launch.ini, Games.
  const d = bacVolume(['Aurora', 'Content/0000000000000000', 'Games', '_A_TRIER']);
  fs.writeFileSync(path.join(d, 'launch.ini'), 'default = Hdd:\\Aurora\\default.xex\r\n');
  const v = classerRacine(d);
  assert.strictEqual(v.xbox, true);
  assert.ok(v.marqueurs.includes('Aurora') && v.marqueurs.includes('_A_TRIER'));
  // Les racines de scan : les sous-dossiers de jeux REELS, jamais la racine.
  assert.strictEqual(v.racines.length, 2);
  assert.ok(v.racines.some(r => r.endsWith(path.join('Content', '0000000000000000'))));
  fs.rmSync(d, { recursive: true, force: true });
});

test('un disque ordinaire n est PAS pris pour un disque Xbox', () => {
  // « Games » tout seul ne suffit pas : n'importe quel disque peut en avoir un.
  const banal = bacVolume(['Games', 'Documents', 'Photos']);
  assert.strictEqual(classerRacine(banal).xbox, false, 'un dossier Games seul ne doit pas suffire');
  fs.rmSync(banal, { recursive: true, force: true });

  const vide = bacVolume([]);
  const v = classerRacine(vide);
  assert.strictEqual(v.xbox, false);
  assert.deepStrictEqual(v.racines, [], 'aucun sous-dossier de jeux -> aucune racine a scanner');
  fs.rmSync(vide, { recursive: true, force: true });
});

test('aucune racine scannee deux fois', () => {
  // Scanner la racine du disque EN PLUS de Games/Content faisait apparaitre le
  // meme jeu deux fois, la seconde avec un TitleID approximatif.
  const d = bacVolume(['Games', 'Content/0000000000000000', 'Aurora']);
  const v = classerRacine(d);
  assert.strictEqual(new Set(v.racines).size, v.racines.length);
  assert.ok(!v.racines.includes(d), 'la racine du disque ne doit pas etre scannee');
  fs.rmSync(d, { recursive: true, force: true });
});

test('les marqueurs sont ceux d une console modifiee', () => {
  for (const m of ['Aurora', 'Content', '_A_TRIER']) {
    assert.ok(MARQUEURS_XBOX.includes(m), m + ' doit faire partie des marqueurs');
  }
});

test('les applications sont reconnues, et pas confondues avec les jeux', () => {
  // La console ne range pas Aurora, XeXMenu ou les emulateurs avec les jeux. Les
  // oublier les rendait invisibles : la cle de l'utilisateur contenait Homebrew
  // et Emulators, et l'application repondait « aucun homebrew ».
  const d = bacVolume(['Homebrew/XeXMenu', 'Emulators/RetroArch', 'ROMS/snes',
    'Games', 'Content/0000000000000000', 'Aurora']);
  const v = classerRacine(d);
  assert.ok(v.apps.some(x => x.endsWith('Homebrew')), 'Homebrew doit etre repere');
  assert.ok(v.apps.some(x => x.endsWith('Emulators')), 'Emulators doit etre repere');
  assert.ok(v.apps.some(x => x.endsWith('ROMS')), 'ROMS doit etre repere');
  // ...et un dossier d'applications n'est PAS une racine de jeux
  assert.ok(!v.racines.some(x => /Homebrew|Emulators|ROMS/.test(x)), 'les apps ne sont pas des racines de jeux');
  assert.strictEqual(v.racines.length, 2, 'deux racines de jeux : Games et Content');
  fs.rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// LE REPLI `fsutil` — la sonde qui doit survivre a la panne de PowerShell
// ---------------------------------------------------------------------------
// Le 2026-09-20, un telechargement de 7,9 Go s'est arrete a 4 Go dans le depot
// H:, qui est en FAT32, sur un disque ayant 730 Go libres. Cause : la sonde de
// types de systemes de fichiers n'avait RIEN rendu (`powershell Get-Volume` meurt
// en `EPERM` la ou les pipes nommes sont refuses, et le `catch` rendait un objet
// vide), et un type INCONNU etait lu comme « pas de limite de 4 Go ».
//
// Ces tests fixent les deux moities du probleme : l'analyse du repli (pure, donc
// testable partout) et l'invariant « une sonde muette n'est pas une reponse ».

test('parseFsutil : lit le type dans une sortie FRANCAISE de fsutil', () => {
  // Sortie reelle de `fsutil fsinfo volumeinfo H:` sur la machine de reference.
  // Le LIBELLE est traduit par Windows, la VALEUR ne l'est pas : on cherche donc
  // la valeur, sinon la detection dependrait de la langue du systeme.
  const sortie = [
    '',
    'Informations sur le volume H:\\',
    'Nom du volume : DEPOT',
    'Numero de serie du volume : 1a2b-3c4d',
    'Nom du systeme de fichiers : FAT32'
  ].join('\r\n');
  assert.strictEqual(plat.parseFsutil(sortie), 'FAT32');
  // et le chainage complet : c'est CE type qui declenche la garde des 4 Go
  assert.ok(plat.limite4Go(plat.parseFsutil(sortie)), 'FAT32 doit etre reconnu comme limite a 4 Go');
});

test('parseFsutil : lit aussi une sortie ANGLAISE, et distingue exFAT de FAT', () => {
  assert.strictEqual(plat.parseFsutil('File System Name : NTFS\r\n'), 'NTFS');
  // exFAT n'a PAS la limite de 4 Go : le confondre avec FAT ferait rediriger
  // inutilement, et l'inverse laisserait passer un fichier de 7 Go sur un disque
  // qui ne peut pas le porter.
  assert.strictEqual(plat.parseFsutil('File System Name : exFAT\r\n'), 'exFAT');
  assert.strictEqual(plat.limite4Go(plat.parseFsutil('File System Name : exFAT')), false);
  assert.strictEqual(plat.limite4Go(plat.parseFsutil('File System Name : NTFS')), false);
});

test('parseFsutil : ne devine pas quand la sortie ne dit rien', () => {
  for (const rien of ['', '   ', 'Nom du volume : DEPOT', null, undefined, 'Acces refuse']) {
    assert.strictEqual(plat.parseFsutil(rien), '', JSON.stringify(rien) + ' ne doit rien rendre');
  }
  // et surtout : ce « rien » ne doit JAMAIS passer pour « pas de limite »
  assert.strictEqual(plat.limite4Go(plat.parseFsutil('Acces refuse')), false);
});

test('la sonde ne peut pas etre muette sur une machine qui a des disques', () => {
  // L'INVARIANT QUI MANQUAIT : « je ne sais pas » et « aucun disque » etaient
  // indiscernables — un objet vide servait de reponse, et le serveur en concluait
  // que rien n'avait de limite. Sur une machine qui a au moins un disque, la
  // sonde doit rendre au moins un type.
  const aUnDisque = process.platform === 'win32' ? fs.existsSync('C:\\') : fs.existsSync('/');
  if (!aUnDisque) return; // machine sans disque : rien a exiger
  const t = plat.fsTypesSync();
  assert.ok(Object.keys(t).length > 0,
    'la sonde rend un objet vide alors que la machine a des disques : ' +
    JSON.stringify(t) + ' — c\'est ce silence qui a fait ecrire 4 Go dans un depot FAT32');
  assert.ok(Object.values(t).every(v => v && String(v).trim()), 'aucun type ne doit etre vide');
});
