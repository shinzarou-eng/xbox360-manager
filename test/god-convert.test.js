// CONVERSION ISO -> GOD : les reglages mesures, testes sur leur bloc source.
//
// LE PIEGE MESURE QUE CES TESTS FERMENT (2026-09-26) : convertir DIRECTEMENT
// sur un disque de destination mecanique (H:, USB) est le pire des cas —
// l'ecriture interactive d'iso2god-rs y vaut 323 s (-j 1) et 223 s (-j 20)
// pour un ISO de 7,8 Go, la ou convertir sur SSD local puis copier
// sequentiellement vaut 72 s au total. La politique ne depend donc du MEDIA
// de destination que pour CHOISIR le temporaire : SSD -> sur place (le
// deplacement final est un renommage), HDD -> TMP rapide puis transfert.
// `-j` est au maximum dans les deux cas : 5 s contre 13 s sur NVMe, et les
// ecritures lourdes tombent toujours sur du rapide par construction.
//
// `doIsoToGod` vit dans server.js sans etre exportee : le bloc est extrait et
// evalue avec des doublures, comme le fait deja test/dl-destination.test.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const debut = srv.indexOf('// DEBUT reglages GOD');
const fin = srv.indexOf('// FIN reglages GOD');
assert.ok(debut > 0 && fin > debut, 'le bloc des reglages GOD doit etre trouvable dans server.js');
const bloc = srv.slice(debut, fin);

// Les doublures : TMP pointe dans un vrai dossier temporaire.
const TMP_REEL = fs.mkdtempSync(path.join(os.tmpdir(), 'god-tmp-'));
const fabrique = () => new Function('os', 'fs', 'path', 'TMP',
  bloc + '\nreturn { godThreads, iso2godArgs, progressionGod, tmpConversion, destRacineValide };'
)(os, fs, path, TMP_REEL);

// ---------------------------------------------------------------- godThreads

test('godThreads : les coeurs de la machine, plafonnes', () => {
  const { godThreads } = fabrique();
  const n = godThreads();
  assert.ok(n >= 1, 'au moins un thread');
  assert.ok(n <= os.cpus().length, 'jamais plus que les coeurs');
});

// -------------------------------------------------------------- iso2godArgs

test('iso2godArgs : -j en premier, source et destination a la fin', () => {
  const { iso2godArgs } = fabrique();
  const a = iso2godArgs('jeu.iso', 'C:\\\\sortie');
  assert.deepStrictEqual(a.slice(0, 2), ['--num-threads', String(a[1])]);
  assert.ok(Number(a[1]) >= 1, 'un nombre de threads entier');
  assert.deepStrictEqual(a.slice(-2), ['jeu.iso', 'C:\\\\sortie'], 'les positionnels ferment la ligne');
});

test('iso2godArgs : le nombre de threads est un parametre explicite', () => {
  const { iso2godArgs } = fabrique();
  assert.deepStrictEqual(iso2godArgs('a.iso', 'b', 1).slice(0, 2), ['--num-threads', '1']);
  assert.deepStrictEqual(iso2godArgs('a.iso', 'b', 8).slice(0, 2), ['--num-threads', '8']);
});

// --------------------------------------------------------- progressionGod

test('progressionGod : « writing part files: N/M » devient un couple', () => {
  const { progressionGod } = fabrique();
  assert.deepStrictEqual(progressionGod('writing part files: 12/39'), { fait: 12, total: 39 });
  assert.deepStrictEqual(progressionGod('writing part files:  0/39'), { fait: 0, total: 39 });
  assert.strictEqual(progressionGod('extracting ISO metadata'), null);
  assert.strictEqual(progressionGod('done'), null);
  assert.strictEqual(progressionGod(''), null);
});

// ------------------------------------------------------------ tmpConversion

test('tmpConversion : destination SSD -> temporaire sur place (renommage, pas copie)', () => {
  const { tmpConversion } = fabrique();
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'god-dest-'));
  const tmp = tmpConversion(dest, true);
  assert.strictEqual(path.dirname(tmp), dest, 'le temporaire doit etre DANS le dossier de destination');
  assert.ok(path.basename(tmp).startsWith('.godtmp-'), 'nom de temporaire discret');
});

test('tmpConversion : destination HDD -> temporaire rapide, copie sequentielle ensuite', () => {
  const { tmpConversion } = fabrique();
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'god-dest-'));
  const tmp = tmpConversion(dest, false);
  // Convertir sur un HDD coutait 323 s contre 5 s + copie a ~95 Mo/s : le
  // temporaire doit rester sur le disque rapide, PAS dans la destination.
  assert.strictEqual(path.dirname(tmp), TMP_REEL, 'le temporaire doit rester hors de la destination lente');
});

test('tmpConversion : destination impossible -> repli sur TMP', () => {
  const { tmpConversion } = fabrique();
  const impossible = IS_WIN_TEST() ? 'Z:\\\\lecteur-inexistant-zz\\jeux' : '/mnt/inexistant-zz/jeux';
  const tmp = tmpConversion(impossible, true);
  assert.strictEqual(path.dirname(tmp), TMP_REEL, 'le repli doit retomber sur TMP');
});

// -------------------------------------------------------- destRacineValide

test('destRacineValide : une racine de disque normalisee', () => {
  const { destRacineValide } = fabrique();
  const racine = path.parse(process.cwd()).root; // 'C:\\' ou '/' selon l'OS
  assert.strictEqual(destRacineValide(racine), racine, 'la racine du disque courant doit passer');
  if (IS_WIN_TEST()) {
    assert.strictEqual(destRacineValide('h:'), 'H:\\', 'lettre seule normalisee en racine');
    assert.strictEqual(destRacineValide('h:\\'), 'H:\\', 'casse normalisee');
  }
});

test('destRacineValide : refuse tout ce qui n est pas une racine de disque', () => {
  const { destRacineValide } = fabrique();
  for (const mauvais of [null, undefined, '', '..', '..\\..\\', 'C:\\Windows\\System32', 'Z:\\inexistant-zz\\', '/etc', 'x', 'C:\\_A_TRIER\\fichier.iso']) {
    assert.strictEqual(destRacineValide(mauvais), null, JSON.stringify(mauvais) + ' doit etre refuse');
  }
});

function IS_WIN_TEST() { return process.platform === 'win32'; }
