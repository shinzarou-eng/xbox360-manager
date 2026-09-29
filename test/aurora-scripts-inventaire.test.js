// Tests de l'inventaire des scripts, lu sur le disque.
//
// `/api/ascripts` ne rendait que le CATALOGUE du depot XboxUnity : 38 scripts a
// telecharger, et rien sur ce qui etait deja en place. L'utilisateur voyait le
// magasin, jamais son propre placard — alors qu'une installation Aurora branchee
// sur le PC contient tout : E:\Aurora\User\Scripts\{Utility,Content\*}.
//
// LES CHEMINS SE CONSTRUISENT AVEC `path.join`. Les ecrire en dur avec des
// antislashs faisait passer ces tests sous Windows et echouer les trois sous
// Linux : `CATEGORIES[].rel` s'ecrit `User\Scripts\Utility`, et un `path.join`
// sans `segments()` garde ces antislashs litteralement. C'est le CI Ubuntu qui
// l'a montre — le module faisait deja correctement trente lignes plus haut.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const A = require('../lib/aurora-scripts');

// Un disque simule : un dossier par chemin.
const disque = (arbre) => (p) => (p in arbre ? arbre[p] : null);
const D = (...noms) => noms.map(name => ({ name, dir: true, taille: 0 }));
const F = (...noms) => noms.map(name => ({ name, dir: false, taille: 100 }));

const RACINE = 'E:' + path.sep + 'Aurora';
const U = path.join(RACINE, 'User', 'Scripts', 'Utility');
const CF = path.join(RACINE, 'User', 'Scripts', 'Content', 'Filters');
const CS = path.join(RACINE, 'User', 'Scripts', 'Content', 'Sorts');
const CSUB = path.join(RACINE, 'User', 'Scripts', 'Content', 'Subtitles');
const AURORA = { dossier: RACINE, categories: {} };

test('scripts : un dossier de scripts se lit sur le disque', () => {
  const lire = disque({
    [U]: D('DBCleaner', 'ConsoleInfo'),
    [CF]: F('HideBackups.lua'),
    [CS]: F('Genre.lua'),
    [CSUB]: F('DeviceCode.lua')
  });
  const l = A.listerInstalles([AURORA], lire);
  // 2 utilitaires + 1 filtre + 1 tri + 1 sous-titre.
  assert.strictEqual(l.length, 5);
  const parNom = Object.fromEntries(l.map(x => [x.nom, x]));
  assert.strictEqual(parNom.DBCleaner.cat, 'utility');
  assert.strictEqual(parNom.DBCleaner.estDossier, true);
  assert.strictEqual(parNom['HideBackups.lua'].cat, 'filters');
  assert.strictEqual(parNom['HideBackups.lua'].estDossier, false);
  assert.strictEqual(parNom['Genre.lua'].cat, 'sorts');
  assert.strictEqual(parNom['DeviceCode.lua'].cat, 'subtitles');
  assert.strictEqual(parNom.DBCleaner.chemin, path.join(U, 'DBCleaner'));
});

test('scripts : un fichier qui n est pas un script n est PAS compte', () => {
  // `readme.txt` et `icon.png` vivent dans les memes dossiers : les compter
  // ferait croire a des installations qui n'existent pas.
  const lire = disque({
    [U]: [...D('DBCleaner'), ...F('readme.txt', 'icon.png')],
    [CF]: F('HideBackups.lua'),
    [CS]: [],
    [CSUB]: []
  });
  const l = A.listerInstalles([AURORA], lire);
  assert.deepStrictEqual(l.map(x => x.nom), ['DBCleaner', 'HideBackups.lua']);
});

test('scripts : un dossier ABSENT ne se confond pas avec un dossier vide', () => {
  // `null` = absent (cette categorie n'existe pas), `[]` = vide mais present.
  // Les confondre ferait disparaitre la distinction entre « rien installe » et
  // « je n'ai pas pu regarder ».
  const lire = disque({ [U]: [], [CF]: null, [CS]: null, [CSUB]: null });
  assert.deepStrictEqual(A.listerInstalles([AURORA], lire), []);
});

test('scripts : plusieurs installations d Aurora sont toutes lues', () => {
  const R2 = 'H:' + path.sep + 'Aurora';
  const lire = disque({
    [U]: D('DBCleaner'), [CF]: [], [CS]: [], [CSUB]: [],
    [path.join(R2, 'User', 'Scripts', 'Utility')]: D('TUDownloader'),
    [path.join(R2, 'User', 'Scripts', 'Content', 'Filters')]: [],
    [path.join(R2, 'User', 'Scripts', 'Content', 'Sorts')]: [],
    [path.join(R2, 'User', 'Scripts', 'Content', 'Subtitles')]: []
  });
  const l = A.listerInstalles([AURORA, { dossier: R2, categories: {} }], lire);
  assert.deepStrictEqual(l.map(x => x.nom).sort(), ['DBCleaner', 'TUDownloader']);
  // Et on sait DE QUELLE installation vient chacun : deux emplacements ne se
  // mettent a jour de la meme facon.
  assert.strictEqual(l.find(x => x.nom === 'DBCleaner').aurora, RACINE);
  assert.strictEqual(l.find(x => x.nom === 'TUDownloader').aurora, R2);
});

test('scripts : la categorie RELATIVE se resout sur les deux systemes', () => {
  // `CATEGORIES[].rel` s'ecrit avec des antislashs. Sans `segments()`, un
  // `path.join` sous Linux garde ces antislashs et fabrique un chemin qui
  // n'existe pas — c'est exactement ce que le CI Ubuntu a attrape.
  for (const cat of A.CATEGORIES) {
    assert.match(cat.rel, /\\/, cat.id + ' doit rester ecrit avec des antislashs (donnee du depot)');
    const attendu = path.join(RACINE, ...cat.rel.split(/[\\/]+/).filter(Boolean));
    const lire = disque({ [attendu]: D('un') });
    const l = A.listerInstalles([AURORA], lire);
    assert.strictEqual(l.length, 1, cat.id + ' doit etre lu a ' + attendu);
    assert.strictEqual(l[0].cat, cat.id);
  }
});

test('scripts : le catalogue marque ce qui est deja installe', () => {
  const items = [
    { id: 'DBCleaner', nom: 'DBCleaner', titre: 'Aurora Database Cleaner' },
    { id: 'HideBackups', nom: 'HideBackups', titre: 'Hide Backups' },
    { id: 'FreeMyDisk', nom: 'FreeMyDisk', titre: 'Free My Disk' }
  ];
  const installes = [
    { nom: 'DBCleaner', chemin: path.join(U, 'DBCleaner'), aurora: RACINE },
    // Sur le disque, un filtre porte son EXTENSION — le catalogue, non.
    { nom: 'HideBackups.lua', chemin: path.join(CF, 'HideBackups.lua'), aurora: RACINE }
  ];
  const m = A.marquerInstalles(items, installes);
  assert.strictEqual(m.find(x => x.id === 'DBCleaner').installe, true);
  assert.strictEqual(m.find(x => x.id === 'HideBackups').installe, true, 'l extension ne doit pas empecher la correspondance');
  assert.strictEqual(m.find(x => x.id === 'FreeMyDisk').installe, false);
  // Et on sait OU : le chemin exact, pas seulement « installe ».
  assert.match(m.find(x => x.id === 'HideBackups').installeChemin, /HideBackups\.lua$/);
  assert.strictEqual(m.find(x => x.id === 'FreeMyDisk').installeChemin, null);
});

test('scripts : la correspondance ignore la casse et la ponctuation', () => {
  const items = [{ id: 'TUDownloader', nom: 'TUDownloader', titre: 'TU Downloader' }];
  const installes = [{ nom: 'tu-downloader', chemin: 'x', aurora: RACINE }];
  assert.strictEqual(A.marquerInstalles(items, installes)[0].installe, true);
});

test('scripts : un catalogue sans inventaire reste intact', () => {
  // Pas de disque branche : aucun script marque, et AUCUNE erreur.
  const items = [{ id: 'A', nom: 'A' }, { id: 'B', nom: 'B' }];
  const m = A.marquerInstalles(items, []);
  assert.strictEqual(m.length, 2);
  assert.ok(m.every(x => x.installe === false && x.installeChemin === null));
  // Et les autres champs du catalogue sont preserves.
  assert.deepStrictEqual(m.map(x => x.id), ['A', 'B']);
  assert.deepStrictEqual(A.marquerInstalles([], null), []);
});
