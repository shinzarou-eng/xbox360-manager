// LE CHOIX D'UN INDICE. Le modele ne rend jamais une action : il rend un indice
// dans la liste que l'application a elle-meme produite. C'est la propriete qui
// empeche une injection par un nom de fichier de produire autre chose qu'une
// PROPOSITION affichee.
//
// Pourquoi ces bornes plutot qu'une confiance dans le modele : mesure du
// 2026-09-20, il a rendu "verifier" a une question purement informative alors
// que "aucun" etait dans les valeurs permises. L'abstention est donc le defaut
// de l'application, pas une decision du modele.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const D = '// ---------- Assistant : choix d indice (fonction PURE, testee) ----------';
const F = '// ---------- fin choix d indice ----------';
const d = src.indexOf(D), f = src.indexOf(F);
assert.ok(d > 0 && f > d, 'le bloc du valideur doit etre trouvable dans public/app.js');
const { iDeChoix } = new Function(src.slice(d, f) + '\nreturn { iDeChoix };')();

test('un indice valide designe exactement le conseil vise', () => {
  assert.strictEqual(iDeChoix('0', 3), 0);
  assert.strictEqual(iDeChoix('2', 3), 2);
  assert.strictEqual(iDeChoix(1, 3), 1);
});

test('"aucun" ne declenche AUCUNE action', () => {
  assert.strictEqual(iDeChoix('aucun', 3), null);
});

test('un indice hors bornes est refuse, pas ramene dans la plage', () => {
  assert.strictEqual(iDeChoix('3', 3), null, 'au-dela du dernier conseil');
  assert.strictEqual(iDeChoix('-1', 3), null);
  assert.strictEqual(iDeChoix('9999', 3), null);
});

test('une valeur non entiere est refusee', () => {
  assert.strictEqual(iDeChoix('1.5', 3), null);
  assert.strictEqual(iDeChoix('deuxieme', 3), null);
  assert.strictEqual(iDeChoix(null, 3), null);
  assert.strictEqual(iDeChoix(undefined, 3), null);
  assert.strictEqual(iDeChoix('1; rm -rf /', 3), null, 'rien qui ressemble a du code ne passe');
});

test('sans conseil, il n y a rien a choisir', () => {
  assert.strictEqual(iDeChoix('0', 0), null);
});
