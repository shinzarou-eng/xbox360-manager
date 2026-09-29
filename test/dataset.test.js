// Tests de lib/dataset.js — construction, fusion et serialisation du dataset
// MediaID -> Title Update. Aucun acces reseau : c'est tout l'interet d'avoir
// separe la transformation (ici) de la collecte (scripts/build-tu-dataset.js).
const test = require('node:test');
const assert = require('node:assert');

const { entry, merge, toCsv, fromCsv, stats, emptyDataset } = require('../lib/dataset');

const doc = () => ({
  MediaIDS: [
    { MediaID: '6D88AE4F', Updates: [
      { TitleUpdateID: 'aaa-1', Version: 1, Size: '512' },
      { TitleUpdateID: 'aaa-5', Version: 5, Size: '2048' }
    ] },
    { MediaID: 'CAA468A3', Updates: [{ TitleUpdateID: 'bbb-5', Version: 5, Size: '4096' }] }
  ]
});

test('entry : construit une entree normalisee', () => {
  const e = entry('415607d3', 'Call of Duty 4', doc());
  assert.strictEqual(e.tid, '415607D3', 'le TitleID est normalise en majuscules');
  assert.strictEqual(e.name, 'Call of Duty 4');
  assert.strictEqual(e.mediaIds.length, 2);
});

test('entry : convertit les tailles en octets (XboxUnity publie des Ko)', () => {
  const e = entry('415607D3', 'x', doc());
  const u = e.mediaIds[0].updates.find(x => x.tuid === 'aaa-5');
  assert.strictEqual(u.size, 2048 * 1024);
});

test('entry : un jeu sans TU ne produit PAS d entree', () => {
  // inutile de gonfler le dataset avec des jeux qui ne publient rien
  assert.strictEqual(entry('415607D3', 'x', { MediaIDS: [] }), null);
  assert.strictEqual(entry('415607D3', 'x', {}), null);
  assert.strictEqual(entry('415607D3', 'x', null), null);
});

test('entry : TitleID invalide -> null', () => {
  for (const mauvais of ['', null, undefined, 'ZZZZZZZZ', '123', '415607D3FF']) {
    assert.strictEqual(entry(mauvais, 'x', doc()), null, 'doit refuser : ' + mauvais);
  }
});

test('merge : remplace l entree d un meme TitleID (reprise sans doublon)', () => {
  const a = merge(emptyDataset(), [entry('415607D3', 'v1', doc())]);
  const b = merge(a, [entry('415607D3', 'v2', doc())]);
  assert.strictEqual(b.titles.length, 1, 'une reprise ne doit pas dupliquer le TitleID');
  assert.strictEqual(b.titles[0].name, 'v2', 'la collecte la plus recente gagne');
});

test('merge : conserve les TitleID non concernes', () => {
  let d = merge(emptyDataset(), [entry('415607D3', 'a', doc())]);
  d = merge(d, [entry('4D5307D3', 'b', doc())]);
  assert.strictEqual(d.titles.length, 2);
  assert.deepStrictEqual(d.titles.map(t => t.tid), ['415607D3', '4D5307D3'], 'tri par TitleID');
});

test('merge : ignore les entrees nulles sans casser le reste', () => {
  const d = merge(emptyDataset(), [null, undefined, { tid: null }, entry('415607D3', 'ok', doc())]);
  assert.strictEqual(d.titles.length, 1);
});

test('merge : entree ou dataset absent -> dataset vide valide', () => {
  assert.deepStrictEqual(merge(null, []).titles, []);
  assert.deepStrictEqual(merge(undefined, null).titles, []);
});

test('toCsv : une ligne par mise a jour, en-tete comprise', () => {
  const csv = toCsv(merge(emptyDataset(), [entry('415607D3', 'Jeu', doc())]));
  const lignes = csv.trim().split('\n');
  assert.strictEqual(lignes[0], 'titleid,name,mediaid,tuid,version,size');
  assert.strictEqual(lignes.length, 4, '3 mises a jour + l en-tete');
});

test('toCsv : echappe virgules et guillemets dans les noms de jeux', () => {
  const csv = toCsv(merge(emptyDataset(), [entry('415607D3', 'Tom Clancy\'s "Rainbow Six", vol.2', doc())]));
  assert.ok(csv.includes('"Tom Clancy\'s ""Rainbow Six"", vol.2"'), 'le nom doit etre echappe :\n' + csv);
});

test('fromCsv : aller-retour fidele (toCsv -> fromCsv)', () => {
  const source = merge(emptyDataset(), [
    entry('415607D3', 'Jeu, avec virgule', doc()),
    entry('4D5307D3', 'Autre "jeu"', doc())
  ]);
  const retour = fromCsv(toCsv(source));
  assert.strictEqual(retour.titles.length, source.titles.length);
  for (const e of source.titles) {
    const r = retour.titles.find(x => x.tid === e.tid);
    assert.ok(r, 'TitleID perdu : ' + e.tid);
    assert.strictEqual(r.name, e.name, 'nom altere par le CSV');
    assert.deepStrictEqual(
      r.mediaIds.map(g => g.media).sort(),
      e.mediaIds.map(g => g.media).sort(),
      'MediaID perdus pour ' + e.tid
    );
  }
});

test('fromCsv : les tailles et versions survivent au round-trip', () => {
  const source = merge(emptyDataset(), [entry('415607D3', 'Jeu', doc())]);
  const retour = fromCsv(toCsv(source));
  const a = source.titles[0].mediaIds[0].updates;
  const b = retour.titles[0].mediaIds.find(g => g.media === source.titles[0].mediaIds[0].media).updates;
  assert.deepStrictEqual(b, a);
});

test('fromCsv : en-tete absent ou mauvais -> dataset vide, sans lever', () => {
  for (const mauvais of ['', 'pas un csv', 'a,b,c\n1,2,3', null, undefined]) {
    assert.deepStrictEqual(fromCsv(mauvais).titles, []);
  }
});

test('fromCsv : ignore les lignes invalides sans perdre les valides', () => {
  const csv = 'titleid,name,mediaid,tuid,version,size\n' +
    'PASUNHEX,x,6D88AE4F,t1,1,10\n' +
    '415607D3,bon,6D88AE4F,t2,2,20\n' +
    '415607D3,sansmedia,,t3,3,30\n';
  const d = fromCsv(csv);
  assert.strictEqual(d.titles.length, 1);
  assert.strictEqual(d.titles[0].mediaIds[0].updates.length, 1);
});

test('fromCsv : regroupes et tries par version decroissante', () => {
  const csv = 'titleid,name,mediaid,tuid,version,size\n' +
    '415607D3,Jeu,6D88AE4F,a1,1,10\n' +
    '415607D3,Jeu,6D88AE4F,a5,5,50\n' +
    '415607D3,Jeu,6D88AE4F,a3,3,30\n';
  const d = fromCsv(csv);
  assert.deepStrictEqual(d.titles[0].mediaIds[0].updates.map(u => u.version), [5, 3, 1]);
});

test('stats : compte titres, MediaID et mises a jour', () => {
  const d = merge(emptyDataset(), [entry('415607D3', 'a', doc()), entry('4D5307D3', 'b', doc())]);
  const s = stats(d);
  assert.strictEqual(s.titles, 2);
  assert.strictEqual(s.mediaIds, 4);
  assert.strictEqual(s.updates, 6);
});

test('stats : coherence — un dataset non vide a forcement des mises a jour', () => {
  const d = merge(emptyDataset(), [entry('415607D3', 'a', doc())]);
  const s = stats(d);
  assert.ok(s.titles > 0 && s.mediaIds > 0 && s.updates > 0,
    'titres/medias/updates doivent etre coherents entre eux');
});

test('stats : dataset vide -> zeros', () => {
  assert.deepStrictEqual(stats(emptyDataset()), { titles: 0, mediaIds: 0, updates: 0 });
  assert.deepStrictEqual(stats(null), { titles: 0, mediaIds: 0, updates: 0 });
});
