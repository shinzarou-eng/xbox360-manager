// Tests du lecteur de journal Aurora.
//
// Le guide conseille de telecharger Aurora.log et d'y chercher ERROR a la main.
// Ce qui compte ici : on trouve les erreurs quels que soient les formats de date,
// on REGROUPE les repetitions, et on transforme une ligne technique en piste.
const { test } = require('node:test');
const assert = require('node:assert');
const L = require('../lib/aurora-log');

test('journal : les formats de date varies sont tous reconnus', () => {
  // Le format depend de la version d'Aurora. En exiger un seul ferait RATER des
  // erreurs — le pire des comportements pour un lecteur de journal.
  const cas = [
    '[12/03/2026 14:22:31] ERROR: failed to load cover',
    '2026-03-12 14:22:31 ERROR could not open default.xex',
    '[ERROR] plugin failed',
    'ERROR: something broke',
    '12/03/2026 14:22:31 - CRITICAL - disk read fault'
  ];
  for (const c of cas) assert.ok(L.niveauDe(c), 'non reconnu : ' + c);
  assert.strictEqual(L.niveauDe('[12/03/2026 14:22:31] ERROR: x'), 'erreur');
  assert.strictEqual(L.niveauDe('CRITICAL x'), 'critique');
  assert.strictEqual(L.niveauDe('FATAL x'), 'critique');
  assert.strictEqual(L.niveauDe('WARNING x'), 'avertissement');
  assert.strictEqual(L.niveauDe('tout va bien'), null);
});

test('journal : les repetitions sont REGROUPEES, pas listees 400 fois', () => {
  // Un journal qui repete la meme erreur n'apprend rien de plus. Ce qui compte,
  // c'est le nombre de problemes DIFFERENTS.
  const texte = Array.from({ length: 400 }, (_, i) =>
    '[12/03/2026 14:' + String(i % 60).padStart(2, '0') + ':00] ERROR: cover download failed for 4D5307E6').join('\n')
    + '\n[12/03/2026 15:00:00] ERROR: plugin FTPd failed to start\n';
  const r = L.analyser(texte);
  assert.strictEqual(r.erreurs, 401);
  assert.strictEqual(r.motifs.length, 2, 'deux problemes differents, pas 401 lignes');
  assert.strictEqual(r.motifs[0].compte + r.motifs[1].compte, 401);
  // La premiere occurrence garde son numero de ligne : on doit pouvoir la retrouver.
  assert.ok(r.motifs.every(m => m.premiere > 0));
});

test('journal : une ligne technique devient une PISTE concrete', () => {
  // « ERROR: ... » ne dit rien a personne. Le guide donne les causes connues :
  // c'est ce qu'on rend.
  const r = L.analyser('[1/1/2026 10:00:00] ERROR: plugin FTPd could not load');
  assert.strictEqual(r.motifs[0].piste.quoi, 'plugin');
  assert.match(r.conseils[0].conseil, /un par un/, 'le guide dit de desactiver les plugins un par un');

  const c = L.analyser('[1/1/2026 10:00:00] ERROR: cannot write cache file');
  assert.match(c.conseils[0].conseil, /Data\/cache/, 'le guide nomme le dossier de cache');

  const s = L.analyser('[1/1/2026 10:00:00] CRITICAL: settings.db corrupted');
  assert.match(s.conseils[0].conseil, /settings\.db/);

  const a = L.analyser('[1/1/2026 10:00:00] ERROR: unity artwork fetch failed');
  assert.match(a.conseils[0].conseil, /reseau/, 'les jaquettes viennent d\'Unity, donc du reseau');
});

test('journal : les conseils ne se repetent pas', () => {
  // Cinq erreurs differentes du meme plugin ne donnent qu'UN conseil.
  const texte = [
    'ERROR: plugin A failed',
    'ERROR: plugin B crashed',
    'ERROR: plugin C timeout',
    'ERROR: plugin D refused'
  ].join('\n');
  const r = L.analyser(texte);
  assert.strictEqual(r.motifs.length, 4);
  assert.strictEqual(r.conseils.length, 1, 'un seul conseil « plugin »');
  assert.strictEqual(r.conseils[0].combien, 4);
});

test('journal : un journal propre le DIT', () => {
  // Rendre une liste vide laisserait croire que la lecture a echoue.
  assert.strictEqual(L.analyser('Aurora started\nloading sources\nready').verdict, 'propre');
  assert.strictEqual(L.analyser('ERROR: x').verdict, 'erreurs');
  assert.strictEqual(L.analyser('CRITICAL: x').verdict, 'critique');
  assert.strictEqual(L.analyser('WARNING: x').verdict, 'avertissements');
  // Un avertissement seul n'est pas une erreur : ne pas les confondre.
  const w = L.analyser('WARNING: slow read');
  assert.strictEqual(w.erreurs, 0);
  assert.strictEqual(w.avertissements, 1);
});

test('journal : le niveau le plus grave l emporte sur un motif', () => {
  const r = L.analyser('WARNING: cover failed\nCRITICAL: cover failed');
  assert.strictEqual(r.motifs.length, 1, 'meme message');
  assert.strictEqual(r.motifs[0].niveau, 'critique', 'un avertissement devenu critique doit se lire comme tel');
});

test('journal : un contenu vide ou absurde ne casse rien', () => {
  for (const t of ['', null, undefined, '\n\n\n', 'x'.repeat(10000)]) {
    const r = L.analyser(t);
    assert.ok(typeof r.total === 'number');
    assert.ok(Array.isArray(r.motifs));
  }
  assert.strictEqual(L.analyser('').verdict, 'propre');
});

test('journal : le nombre de lignes gardees est borne', () => {
  // Un journal peut faire plusieurs Mo : on ne renvoie pas tout.
  const texte = Array.from({ length: 5000 }, () => 'ERROR: boom').join('\n');
  const r = L.analyser(texte, 50);
  assert.strictEqual(r.lignes.length, 50);
  assert.strictEqual(r.erreurs, 5000, 'mais le COMPTE reste juste');
});
