// Regression constatee en vrai : chaque jeu extrait remontait avec le TitleID
// 82000000. « Title Id: » dans la sortie de `xextool -l` est suivi de 11+
// espaces — un espacement borne (`.{0,10}`) rate la valeur, et le repli
// « premier hex de 8 chiffres du texte » attrapait `Load Address`, qui vaut
// 0x82000000 sur TOUS les executables retail. Trois jeux differents portaient
// le meme faux identifiant : plus de DLC ni de TU associes, plus de nom propre.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const SRV = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// Corps d'une fonction par profondeur d'accolades (meme helper que
// pack-extension.test.js) : un decoupage textuel se trompe des qu'une accolade
// vit dans une chaine ou un commentaire.
function corpsFonction(sig) {
  const d = SRV.indexOf(sig);
  assert.ok(d > 0, 'la signature doit etre trouvable dans server.js : ' + sig);
  const ouv = SRV.indexOf('{', d + sig.length - 1);
  let prof = 0;
  for (let i = ouv; i < SRV.length; i++) {
    if (SRV[i] === '{') prof++;
    else if (SRV[i] === '}') { prof--; if (prof === 0) return SRV.slice(d, i + 1); }
  }
  throw new Error('accolade fermante introuvable pour ' + sig);
}

const SRC_TID = corpsFonction('function xexTidDepuisSortie(out) {');
eval(SRC_TID);

// La sortie REELLE de `xextool -l` sur le default.xex du Parrain (EA), dans
// l'ordre : la load address PRECEDE le Title Id, et le libelle est suivi de
// 11 espaces — les deux pieges ensemble.
const SORTIE_REELLE = [
  '  Load Address:       82000000',
  '  Entry Point:        82565A98',
  '  Checksum:           00000000',
  '  Filetime:           44EE35E5 - Fri Aug 25 01:27:33 2006',
  'Media Id ',
  '  B9 64 80 FF 3F FE 42 4E 30 B7 EC F3 36 2E 0F BC ',
  'Execution Id',
  '  Media Id:           362E0FBC',
  '  Title Id:           454107E9  (EA-2025)',
  '  Savegame Id:        00000000'
].join('\n');

test('xextool : le vrai Title Id est lu malgre les 11 espaces', () => {
  assert.strictEqual(xexTidDepuisSortie(SORTIE_REELLE), '454107E9');
});

test('xextool : jamais la load address — le repli hex est supprime', () => {
  // Une sortie SANS ligne « Title Id » ne doit rendre aucun identifiant :
  // mieux null (le nom retombe sur le dossier) qu'un hex pris au hasard.
  const sans = '  Load Address:       82000000\n  Media Id:           362E0FBC';
  assert.strictEqual(xexTidDepuisSortie(sans), null);
});

test('xextool : hex minuscule normalise, entree vide propre', () => {
  assert.strictEqual(xexTidDepuisSortie('Title Id:  4d5307fa'), '4D5307FA');
  assert.strictEqual(xexTidDepuisSortie(''), null);
  assert.strictEqual(xexTidDepuisSortie(null), null);
});
