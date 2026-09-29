// Tests de lib/sources.js — le registre de sources.
// Le point critique n'est pas le chargement des sources valides, c'est le
// comportement face aux autres : une source cassee doit etre SIGNALEE et
// IGNOREE, jamais empecher le demarrage ni le chargement des sources saines.
// C'est ce qui permet d'accepter des contributions externes sans risque.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { charger, valider, metadonnees, parId, chercherTout } = require('../lib/sources');

let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'src-')); });
test.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

// ecrit une source dans le dossier de test
function ecrire(nom, contenu) { fs.writeFileSync(path.join(dir, nom), contenu); }
const SOURCE_VALIDE = `
module.exports = {
  id: 'sain', nom: 'Source saine', description: 'une source correcte', nature: 'utilisateur',
  search: (q, o, cb) => cb(null, [{ id: 'a', titre: 'trouve ' + q, taille: 10 }]),
  files: (id, cb) => cb(null, [{ nom: 'x', taille: 1, path: id }])
};`;

// --- validation du contrat -------------------------------------------------

test('valider : accepte une source conforme', () => {
  assert.deepStrictEqual(valider({ id: 'ok', nom: 'N', description: 'D', search() {} }), { ok: true });
});

test('valider : rejette chaque champ manquant avec une raison precise', () => {
  const cas = [
    [null, /objet/],
    [{}, /`id`/],
    [{ id: 'xx' }, /`nom`/],
    [{ id: 'xx', nom: 'n' }, /`description`/],
    [{ id: 'xx', nom: 'n', description: 'd' }, /`search`/]
  ];
  for (const [mod, motif] of cas) {
    const v = valider(mod, 'f.js');
    assert.strictEqual(v.ok, false, 'devrait etre rejete : ' + JSON.stringify(mod));
    assert.match(v.raison, motif, 'raison peu claire pour ' + JSON.stringify(mod));
  }
});

test('valider : `id` doit etre un slug utilisable', () => {
  // l'id sert d'identifiant dans l'API : espaces et majuscules sont exclus
  for (const mauvais of ['Majuscules', 'avec espace', 'a', '-commence-par-tiret', 'avec/slash', '']) {
    const v = valider({ id: mauvais, nom: 'n', description: 'd', search() {} }, 'f.js');
    assert.strictEqual(v.ok, false, 'id doit etre refuse : ' + JSON.stringify(mauvais));
  }
  for (const bon of ['ok', 'archive-org', 'a1', 'source-2']) {
    assert.strictEqual(valider({ id: bon, nom: 'n', description: 'd', search() {} }, 'f.js').ok, true,
      'id doit etre accepte : ' + bon);
  }
});

test('valider : `nature` contrainte, `files` optionnel mais type', () => {
  assert.strictEqual(valider({ id: 'aa', nom: 'n', description: 'd', search() {}, nature: 'libre' }, 'f').ok, true);
  assert.strictEqual(valider({ id: 'aa', nom: 'n', description: 'd', search() {}, nature: 'inventee' }, 'f').ok, false);
  assert.strictEqual(valider({ id: 'aa', nom: 'n', description: 'd', search() {}, files: 'pas une fonction' }, 'f').ok, false);
});

// --- chargement defensif ---------------------------------------------------

test('charger : charge une source valide et expose ses metadonnees', () => {
  ecrire('sain.js', SOURCE_VALIDE);
  const r = charger(dir);
  const s = r.sources.find(x => x.id === 'sain');
  assert.ok(s, 'la source valide doit etre chargee');
  assert.strictEqual(s.nom, 'Source saine');
  assert.strictEqual(s.peutListerFichiers, true);
  const meta = metadonnees(r.sources).find(m => m.id === 'sain');
  assert.deepStrictEqual(meta, {
    id: 'sain', nom: 'Source saine', description: 'une source correcte',
    nature: 'utilisateur', peutListerFichiers: true
  });
  assert.strictEqual(typeof JSON.stringify(meta), 'string', 'les metadonnees doivent etre serialisables');
});

test('charger : une source qui LEVE ne casse pas le reste', () => {
  ecrire('explose.js', 'throw new Error("boum au chargement");');
  const r = charger(dir);
  assert.ok(r.sources.find(s => s.id === 'sain'), 'les sources saines doivent rester chargees');
  const rejet = r.rejets.find(x => x.fichier === 'explose.js');
  assert.ok(rejet, 'la source fautive doit etre signalee');
  assert.match(rejet.raison, /erreur de chargement/);
});

test('charger : une source hors contrat est rejetee avec sa raison', () => {
  ecrire('incomplete.js', 'module.exports = { id: "incomplete", nom: "N" };');
  const r = charger(dir);
  assert.ok(!r.sources.find(s => s.id === 'incomplete'), 'une source hors contrat ne doit pas etre chargee');
  assert.match(r.rejets.find(x => x.fichier === 'incomplete.js').raison, /`description`/);
});

test('charger : identifiants dupliques -> le second est rejete', () => {
  // dossier dedie : l'ordre alphabetique decide lequel des deux est « le second »,
  // donc on ne presume pas du fichier fautif, seulement du resultat
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'src3-'));
  fs.writeFileSync(path.join(d3, 'un.js'), SOURCE_VALIDE.replace("'sain'", "'partage'"));
  fs.writeFileSync(path.join(d3, 'deux.js'), SOURCE_VALIDE.replace("'sain'", "'partage'"));
  const r = charger(d3);
  assert.strictEqual(r.sources.filter(s => s.id === 'partage').length, 1,
    'un identifiant ne doit apparaitre qu\'une fois');
  assert.strictEqual(r.rejets.length, 1, 'le doublon doit etre signale');
  assert.match(r.rejets[0].raison, /deja utilise/);
  fs.rmSync(d3, { recursive: true, force: true });
});

test('charger : dossier inexistant -> rejet signale, pas d\'exception', () => {
  const r = charger(path.join(dir, 'nexistepas'));
  assert.deepStrictEqual(r.sources, []);
  assert.ok(r.rejets.length && /illisible/.test(r.rejets[0].raison));
});

test('charger : tri par identifiant (sortie deterministe)', () => {
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'src2-'));
  fs.writeFileSync(path.join(d2, 'b.js'), SOURCE_VALIDE.replace("'sain'", "'zeta'").replace('Source saine', 'Z'));
  fs.writeFileSync(path.join(d2, 'a.js'), SOURCE_VALIDE.replace("'sain'", "'alpha'").replace('Source saine', 'A'));
  const r = charger(d2);
  assert.deepStrictEqual(r.sources.map(s => s.id), ['alpha', 'zeta']);
  fs.rmSync(d2, { recursive: true, force: true });
});

test('parId : retrouve une source, ou null', () => {
  const r = charger(dir);
  assert.ok(parId(r.sources, 'sain'));
  assert.strictEqual(parId(r.sources, 'nexistepas'), null);
});

// --- interrogation agregee -------------------------------------------------

test('chercherTout : agrege les resultats en etiquetant la source', () => {
  const sources = [
    { id: 'a', search: (q, o, cb) => cb(null, [{ id: '1', titre: 'A' }]) },
    { id: 'b', search: (q, o, cb) => cb(null, [{ id: '2', titre: 'B' }]) }
  ];
  return new Promise(res => chercherTout(sources, 'x', {}, (e, r) => {
    assert.strictEqual(e, null);
    assert.strictEqual(r.resultats.length, 2);
    assert.deepStrictEqual(r.resultats.map(x => x.source).sort(), ['a', 'b']);
    assert.deepStrictEqual(r.erreurs, []);
    res();
  }));
});

test('chercherTout : une source en echec n\'empeche pas les autres', () => {
  const sources = [
    { id: 'bonne', search: (q, o, cb) => cb(null, [{ id: '1', titre: 'ok' }]) },
    { id: 'cassee', search: (q, o, cb) => cb(new Error('reseau indisponible')) },
    { id: 'jette', search: () => { throw new Error('exception synchrone'); } }
  ];
  return new Promise(res => chercherTout(sources, 'x', {}, (e, r) => {
    assert.strictEqual(e, null, 'l\'agregation ne doit pas echouer globalement');
    assert.strictEqual(r.resultats.length, 1);
    assert.strictEqual(r.erreurs.length, 2);
    assert.deepStrictEqual(r.erreurs.map(x => x.source).sort(), ['cassee', 'jette']);
    res();
  }));
});

test('chercherTout : une source qui rappelle deux fois n\'est comptee qu\'une fois', () => {
  const sources = [{ id: 'bavarde', search: (q, o, cb) => { cb(null, [{ id: '1', titre: 'a' }]); cb(null, [{ id: '2', titre: 'b' }]); } }];
  return new Promise(res => chercherTout(sources, 'x', {}, (e, r) => {
    assert.strictEqual(r.resultats.length, 1, 'un double appel ne doit pas dupliquer les resultats');
    res();
  }));
});

test('chercherTout : une source muette est abandonnee au delai (pas de blocage)', () => {
  const sources = [{ id: 'muette', search: () => { /* ne rappelle jamais */ } }];
  return new Promise(res => chercherTout(sources, 'x', { timeout: 120 }, (e, r) => {
    assert.strictEqual(r.resultats.length, 0);
    assert.strictEqual(r.erreurs.length, 1);
    assert.match(r.erreurs[0].erreur, /delai depasse/);
    res();
  }));
});

test('chercherTout : aucune source -> reponse vide immediate', () => {
  return new Promise(res => chercherTout([], 'x', {}, (e, r) => {
    assert.deepStrictEqual(r, { resultats: [], erreurs: [] });
    res();
  }));
});
