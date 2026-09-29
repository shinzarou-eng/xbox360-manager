// Tests du reconnaisseur de dossier.
//
// Le panneau DOSSIERS demandait de TAPER cinq chemins. Choisir un dossier de jeux
// demandait donc deja de savoir ou il etait — exactement ce que l'utilisateur
// venait chercher. Ce module rend le dossier CHOISISSABLE.
const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../lib/dossier-local');

const d = (...noms) => noms.map(name => ({ name, dir: true }));
const f = (...noms) => noms.map(name => ({ name, dir: false }));
const entrees = (...l) => l.flat();

test('dossier : une installation Aurora se reconnait a son executable', () => {
  const r = D.reconnaitre(entrees(d('User', 'Data', 'Plugins'), f('Aurora.xex')));
  assert.strictEqual(r.genre, 'aurora');
  assert.strictEqual(r.confiance, 100);
  assert.match(r.detail, /scripts/, 'on doit dire a quoi ca sert');
});


test('dossier : la racine d un disque Xbox demande PLUSIEURS marqueurs', () => {
  // Un seul marqueur ne suffit pas : un dossier nomme « Games » au hasard existe.
  assert.notStrictEqual(D.reconnaitre(entrees(d('Games'))).genre, 'disque-xbox');
  const r = D.reconnaitre(entrees(d('Games', 'Content', 'Homebrew'), f('launch.ini')));
  assert.strictEqual(r.genre, 'disque-xbox');
  assert.match(r.detail, /Games/);
  // Et plus il y a de marqueurs, plus on est sur.
  const pauvres = D.reconnaitre(entrees(d('Games', 'Content')));
  const riches = D.reconnaitre(entrees(d('Games', 'Content', 'Homebrew', 'Emulators')));
  assert.ok(riches.confiance > pauvres.confiance);
});

test('dossier : un dossier de jeux se reconnait a ses TitleID', () => {
  const r = D.reconnaitre(entrees(d('4D5307E6', '555308B8', 'C0DE9999', 'FFFE07DF')));
  assert.strictEqual(r.genre, 'jeux-tid');
  assert.match(r.detail, /4 dossiers/);
  // Deux TitleID ne font pas un dossier de jeux : ca peut etre un disque.
  assert.notStrictEqual(D.reconnaitre(entrees(d('4D5307E6', '555308B8'))).genre, 'jeux-tid');
});

test('dossier : un SEUL jeu est distingue d un DOSSIER de jeux', () => {
  // C'est la confusion la plus couteuse : choisir le dossier du jeu au lieu du
  // dossier des jeux donne une bibliotheque avec un seul titre.
  const r = D.reconnaitre(entrees(f('default.xex', 'Media'), d('Media')));
  assert.strictEqual(r.genre, 'jeu-extrait');
  assert.match(r.detail, /AU-DESSUS/, 'on doit dire OU aller');
});

test('dossier : le contenu de console se reconnait a 0000000000000000', () => {
  const r = D.reconnaitre(entrees(d('0000000000000000')));
  assert.strictEqual(r.genre, 'contenu');
  assert.match(r.detail, /DLC/);
});

test('dossier : un depot se reconnait a son NOM ou a ses archives', () => {
  // Le nom DU DOSSIER : c'est lui qui fait le depot.
  assert.strictEqual(D.reconnaitre([], { nom: '_A_TRIER' }).genre, 'depot');
  // Ou des archives dedans.
  const a = D.reconnaitre(entrees(f('Halo.iso', 'Fable.7z')), { nom: 'Telechargements' });
  assert.strictEqual(a.genre, 'depot');
  assert.match(a.detail, /2 fichier/);
});

test('dossier : un dossier vide le dit', () => {
  const r = D.reconnaitre([]);
  assert.strictEqual(r.genre, 'vide');
  assert.strictEqual(r.confiance, 100);
  assert.deepStrictEqual(r.indices, []);
});

test('dossier : un dossier inconnu reste CHOISISSABLE', () => {
  // On ne bloque pas : l'analyse dira ce qu'il y a. Refuser un dossier parce
  // qu'on ne l'a pas reconnu empecherait de configurer une disposition exotique.
  const r = D.reconnaitre(entrees(f('notes.txt', 'photo.jpg')));
  assert.strictEqual(r.genre, 'inconnu');
  assert.strictEqual(r.confiance, 0);
  assert.match(r.detail, /quand même le choisir/);
});

test('dossier : l ordre des priorites suit le risque de confusion', () => {
  // Aurora.xex l'emporte sur tout : un dossier Aurora contient aussi des
  // sous-dossiers qui ressemblent a autre chose.
  const r = D.reconnaitre(entrees(d('User', 'Data', 'Content', '_A_TRIER'), f('Aurora.xex', 'Halo.iso')));
  assert.strictEqual(r.genre, 'aurora');
});

test('dossier : le classement met en avant ce qui correspond a l usage', () => {
  const candidats = [
    { chemin: 'D:\\Games', rec: { genre: 'jeux-tid', confiance: 90 }, jeux: 17 },
    { chemin: 'D:\\_A_TRIER', rec: { genre: 'depot', confiance: 70 } },
    { chemin: 'D:\\Photos', rec: { genre: 'inconnu', confiance: 0 } }
  ];
  const jeux = D.classerPour('jeux', candidats);
  assert.strictEqual(jeux[0].chemin, 'D:\\Games');
  assert.strictEqual(jeux[jeux.length - 1].chemin, 'D:\\Photos');
  // Le nombre de jeux compte : il fait monter un candidat a genre egal.
  const plus = D.classerPour('jeux', [
    { chemin: 'A', rec: { genre: 'jeux-tid', confiance: 90 }, jeux: 1 },
    { chemin: 'B', rec: { genre: 'jeux-tid', confiance: 90 }, jeux: 20 }
  ]);
  assert.strictEqual(plus[0].chemin, 'B');
});

test('dossier : un disque qui CONTIENT un depot n est pas un depot', () => {
  // Le defaut le plus couteux trouve ici : `C:\` et `D:\` etaient reconnus comme
  // « Depot (fichiers a ranger) » parce qu'ils contiennent un dossier `_A_TRIER`.
  // Proposer le disque entier comme depot aurait fait analyser et ranger tout le
  // disque.
  const contenu = [{ name: '_A_TRIER', dir: true }, { name: 'Windows', dir: true }, { name: 'Games', dir: true }];
  const racine = D.reconnaitre(contenu, { nom: 'D:', racine: true });
  assert.notStrictEqual(racine.genre, 'depot', 'une racine de disque n est pas un depot');

  // Mais le dossier _A_TRIER lui-meme en EST un.
  const lui = D.reconnaitre([{ name: 'Halo.iso', dir: false }], { nom: '_A_TRIER' });
  assert.strictEqual(lui.genre, 'depot');
  assert.strictEqual(lui.confiance, 95, 'le nommer _A_TRIER est une signature forte');

  // Et un dossier ordinaire qui contient des archives aussi.
  const archives = D.reconnaitre([{ name: 'Halo.iso', dir: false }], { nom: 'Telechargements' });
  assert.strictEqual(archives.genre, 'depot');

  // Une racine de disque n'est pas non plus « un contenu » ni « des applications ».
  assert.notStrictEqual(D.reconnaitre([{ name: '0000000000000000', dir: true }], { racine: true }).genre, 'contenu');
  assert.notStrictEqual(D.reconnaitre([{ name: 'Homebrew', dir: true }], { racine: true }).genre, 'homebrew');
});
