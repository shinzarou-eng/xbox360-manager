// L'executable d'un jeu n'est PAS « un .xex quelconque ».
//
// Un ISO extrait contient un dossier `$SystemUpdate` — la mise a jour du dashboard
// — avec ses propres .xex. Il trie AVANT `Default.xex` (`$` = 0x24 < `D` = 0x44),
// donc un parcours naif tombe dedans en premier.
//
// Constate sur un vrai jeu, et deux consequences en cascade :
//   1. le TitleID lu etait celui d'un fichier de mise a jour ;
//   2. le dossier etait pris pour un conteneur GOD a cause d'un package systeme
//      qu'il contient, et le jeu s'affichait sous le nom « ParityPack ».
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../lib/pkg');

// Un dossier simule : on injecte la liste des fichiers, aucun acces disque.
const avec = (...fichiers) => () => fichiers;
const SEP = require('path').sep;

test('xex : le SystemUpdate ne masque pas le jeu', () => {
  // L'ordre alphabetique place `$SystemUpdate` en premier : c'est exactement le
  // piege. On verifie que le bon fichier est choisi MALGRE cet ordre.
  const fichiers = [
    'H:\\Games\\DBX' + SEP + '$SystemUpdate' + SEP + 'AvatarEditor.xex',
    'H:\\Games\\DBX' + SEP + '$SystemUpdate' + SEP + 'BiometricSetup.xex',
    'H:\\Games\\DBX' + SEP + '$SystemUpdate' + SEP + 'dash.ExtraAVCodecs.xex',
    'H:\\Games\\DBX' + SEP + 'data.cpk',
    'H:\\Games\\DBX' + SEP + 'Default.xex'
  ];
  const x = P.trouverXexJeu('H:\\Games\\DBX', avec(...fichiers));
  assert.ok(x, 'un executable doit etre trouve');
  assert.match(x, /Default\.xex$/i, 'ce doit etre Default.xex, pas un fichier du SystemUpdate');
  assert.ok(!P.DOSSIER_MISE_A_JOUR.test(x), 'jamais sous $SystemUpdate');
});

test('xex : la casse ne compte pas', () => {
  for (const nom of ['Default.xex', 'default.xex', 'DEFAULT.XEX', 'Default.XeX']) {
    const x = P.trouverXexJeu('G', avec('G' + SEP + '$SystemUpdate' + SEP + 'a.xex', 'G' + SEP + nom));
    assert.match(x, new RegExp(nom.replace('.', '\\.') + '$', 'i'), nom + ' doit etre reconnu');
  }
});

test('xex : un jeu SANS default.xex reste trouvable', () => {
  // Repli : certaines dispositions exotiques n'ont pas de default.xex. On prend
  // alors un .xex, mais toujours hors du SystemUpdate.
  const x = P.trouverXexJeu('G', avec('G' + SEP + '$SystemUpdate' + SEP + 'a.xex', 'G' + SEP + 'MonJeu.xex'));
  assert.match(x, /MonJeu\.xex$/);

  // Et s'il n'y a QUE le SystemUpdate, on ne prend RIEN : rendre un fichier de
  // mise a jour ferait croire a un jeu.
  const rien = P.trouverXexJeu('G', avec('G' + SEP + '$SystemUpdate' + SEP + 'a.xex', 'G' + SEP + 'data.cpk'));
  assert.strictEqual(rien, null, 'aucun .xex de jeu : on ne rend rien');
});

test('xex : un dossier sans aucun .xex ne rend rien', () => {
  assert.strictEqual(P.trouverXexJeu('G', avec('G' + SEP + 'a.cpk', 'G' + SEP + 'b.bin')), null);
  assert.strictEqual(P.trouverXexJeu('G', avec()), null);
});

test('xex : le vrai jeu de l utilisateur est reconnu', () => {
  // Cas reel, releve sur la machine : c'est ce dossier precis qui a revele le
  // defaut, et qui s'affichait « ParityPack » avec le TitleID systeme FFFE07DF.
  const base = 'H:\\Games\\Dragon Ball Xenoverse (Europe)';
  const fichiers = [
    base + SEP + '$SystemUpdate' + SEP + 'AvatarEditor.xex',
    base + SEP + 'data.cpk', base + SEP + 'movie.cpk', base + SEP + 'nxeart',
    base + SEP + 'Default.xex'
  ];
  const x = P.trouverXexJeu(base, avec(...fichiers));
  assert.match(x, /Default\.xex$/i);
});
