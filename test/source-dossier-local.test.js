// Tests de la source de reference (sources/dossier-local.js).
// C'est le modele que suivront les sources ecrites par des contributeurs : il
// doit donc etre exemplaire, et verifie — bornes de parcours comprises, car une
// source qui indexe la racine d'un disque ne doit pas figer l'application.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const source = require('../sources/dossier-local');

let base;
test.before(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'dirloc-'));
  fs.writeFileSync(path.join(base, 'Halo 3.iso'), Buffer.alloc(2048));
  fs.writeFileSync(path.join(base, 'readme.txt'), 'pas un jeu');
  fs.mkdirSync(path.join(base, 'sous'), { recursive: true });
  fs.writeFileSync(path.join(base, 'sous', 'Assassins Creed II.7z'), Buffer.alloc(1024));
});
test.after(() => { try { fs.rmSync(base, { recursive: true, force: true }); } catch {} });

const chercher = (q, opts) => new Promise(res => source.search(q, { folders: [base], ...(opts || {}) }, (e, r) => res(r || [])));

test('la source respecte le contrat (id, nom, description, nature)', () => {
  assert.ok(source.id && source.nom && source.description);
  assert.strictEqual(source.nature, 'utilisateur');
  assert.strictEqual(typeof source.search, 'function');
  assert.strictEqual(typeof source.files, 'function');
});

test('search : trouve un fichier correspondant', async () => {
  const r = await chercher('halo');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].titre, 'Halo 3.iso');
  assert.strictEqual(r[0].taille, 2048);
});

test('search : ne remonte QUE les extensions de jeu', async () => {
  // un .txt dans le meme dossier ne doit pas apparaitre
  const r = await chercher('readme');
  assert.deepStrictEqual(r, []);
});

test('search : descend dans les sous-dossiers', async () => {
  const r = await chercher('creed');
  assert.strictEqual(r.length, 1);
  assert.match(r[0].id, /sous/);
});

test('search : correspondance par MOT ENTIER, pas par sous-chaine', async () => {
  // « hal » ne doit pas trouver « Halo » : sinon toute recherche courte
  // remonterait la moitie du disque
  assert.deepStrictEqual(await chercher('hal'), []);
  assert.strictEqual((await chercher('halo')).length, 1);
});

test('search : requete vide ou trop courte -> aucun resultat', async () => {
  for (const q of ['', '  ', 'a', null, undefined]) {
    assert.deepStrictEqual(await chercher(q), [], 'requete : ' + JSON.stringify(q));
  }
});

test('search : dossier inexistant -> aucun resultat, sans lever', async () => {
  const r = await new Promise(res => source.search('halo', { folders: [path.join(base, 'nexistepas')] }, (e, x) => res(x)));
  assert.deepStrictEqual(r, []);
});

test('search : aucun dossier configure -> aucun resultat, sans erreur', async () => {
  // ce n'est pas un echec : l'utilisateur n\'a simplement rien declare
  const r = await new Promise(res => source.search('halo', { folders: [] }, (e, x) => res(x)));
  assert.deepStrictEqual(r, []);
});

test('search : respecte la limite de resultats demandee', async () => {
  const r = await chercher('a', { max: 1 });
  assert.ok(r.length <= 1);
});

test('parcourir : borne la profondeur de recursion', () => {
  // on construit un dossier plus profond que la limite : le parcours ne doit
  // pas le suivre indefiniment
  const profond = fs.mkdtempSync(path.join(os.tmpdir(), 'prof-'));
  let p = profond;
  for (let i = 0; i < 8; i++) { p = path.join(p, 'n' + i); fs.mkdirSync(p, { recursive: true }); }
  fs.writeFileSync(path.join(p, 'tres-profond.iso'), Buffer.alloc(10));
  const r = source._parcourir(profond, 2, 100);
  assert.strictEqual(r.length, 0, 'un fichier au-dela de la profondeur autorisee ne doit pas etre vu');
  fs.rmSync(profond, { recursive: true, force: true });
});

test('parcourir : borne le nombre de fichiers examines', () => {
  const beaucoup = fs.mkdtempSync(path.join(os.tmpdir(), 'bcp-'));
  for (let i = 0; i < 30; i++) fs.writeFileSync(path.join(beaucoup, 'f' + i + '.iso'), '');
  const r = source._parcourir(beaucoup, 2, 5);
  assert.strictEqual(r.length, 5, 'la limite de fichiers doit etre respectee');
  fs.rmSync(beaucoup, { recursive: true, force: true });
});

test('files : rend le chemin local, sans pretendre a une URL', async () => {
  const f = path.join(base, 'Halo 3.iso');
  const r = await new Promise(res => source.files(f, (e, x) => res(x)));
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].path, f);
  assert.strictEqual(r[0].url, undefined, 'un fichier local n\'a pas d\'URL de telechargement');
});

test('files : chemin inexistant -> erreur rendue, pas d\'exception', async () => {
  const e = await new Promise(res => source.files(path.join(base, 'nexistepas.iso'), err => res(err)));
  assert.ok(e instanceof Error);
});
