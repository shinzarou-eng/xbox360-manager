// Tests de lib/doctor.js — le diagnostic d'environnement.
// C'est la premiere chose que voit un nouvel utilisateur : un faux negatif
// ("7-Zip absent" alors qu'il est installe) envoie sur une fausse piste.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runDoctor, checkDossier, checkTitres, checkOutil, which, OUTILS, MIN_NODE } = require('../lib/doctor');

const ROOT = path.join(__dirname, '..');

let tmp;
test.before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-')); });
test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

// `which` n'utilise PATHEXT que sous Windows : ailleurs il cherche le nom exact.
// Les memes tests doivent verifier la meme INTENTION des deux cotes, pas etre
// ecrits pour une seule plateforme — c'est ce qui faisait echouer le CI Ubuntu
// pendant que tout passait sous Windows.
const WIN = process.platform === 'win32';
const NOM_BIN = WIN ? 'monoutil.exe' : 'monoutil';
// L'environnement se construit DANS le test : calcule au chargement du module, il
// lisait `tmp` avant que le hook `test.before` ne l'ait defini — soit
// `PATH: undefined`, donc aucun dossier a fouiller et un faux echec.
const envBin = () => (WIN ? { PATH: tmp, PATHEXT: '.EXE;.CMD' } : { PATH: tmp });

test('which : trouve un binaire present dans PATH', () => {
  fs.writeFileSync(path.join(tmp, NOM_BIN), '');
  const trouve = which('monoutil', envBin());
  assert.ok(trouve, NOM_BIN + ' devrait etre trouve');
  assert.strictEqual(path.basename(trouve).toLowerCase(), NOM_BIN.toLowerCase());
});

test('which : accepte un nom deja suffixe sans le re-suffixer', () => {
  const bin = path.join(tmp, 'autre.exe');
  fs.writeFileSync(bin, '');
  const env = { PATH: tmp, PATHEXT: '.EXE' };
  assert.ok(which('autre.exe', env), 'autre.exe doit etre trouve tel quel');
});

test('which : null quand rien ne correspond', () => {
  const env = { PATH: tmp, PATHEXT: '.EXE' };
  assert.strictEqual(which('ce_binaire_nexiste_pas_du_tout', env), null);
});

test('which : ignore les entrees PATH vides', () => {
  // Des `;;` creent des entrees vides : sans le `filter(Boolean)`, on cherche
  // dans le dossier courant, ce qui est un vecteur de detournement.
  // Le separateur de PATH depend de la plateforme : ';' sous Windows, ':' sous
  // Linux. Le coder en dur faisait chercher dans un dossier nomme « ;;…;; ».
  const sep = path.delimiter;
  const env = { PATH: sep + sep + tmp + sep + sep, PATHEXT: '.EXE' };
  const nom = WIN ? 'ok.exe' : 'ok';
  fs.writeFileSync(path.join(tmp, nom), '');
  assert.ok(which('ok', env));
});

// Le piege verifie en pratique : 7-Zip du Microsoft Store est un alias de 0 octet
// (reparse point) sur lequel statSync leve EACCES, pas ENOENT. Un existsSync seul
// le declare absent alors que spawn() l'execute tres bien.
// Ce comportement est PROPRE a Windows : le 7-Zip du Microsoft Store est un
// alias de 0 octet sur lequel statSync leve EACCES. Sous Linux, EACCES veut dire
// « pas executable », ce qui n'a rien a voir — y appliquer la meme regle
// declarerait present un fichier qu'on ne peut pas lancer.
test('which : un chemin inaccessible (EACCES) compte comme PRESENT', { skip: !WIN ? 'Windows uniquement (alias Microsoft Store)' : false }, () => {
  const faux = path.join(tmp, 'acces.exe');
  fs.writeFileSync(faux, '');
  const vraiStat = fs.statSync;
  fs.statSync = p => {
    if (p.toLowerCase().endsWith('acces.exe')) { const e = new Error('EACCES'); e.code = 'EACCES'; throw e; }
    return vraiStat.call(fs, p);
  };
  try {
    assert.ok(which('acces', { PATH: tmp, PATHEXT: '.EXE' }),
      'EACCES doit etre traite comme present (alias Microsoft Store)');
  } finally { fs.statSync = vraiStat; }
});

test('checkDossier : dossier inscriptible -> ok', () => {
  const r = checkDossier('test', tmp);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.nom, 'test');
});

test('checkDossier : dossier non configure -> signale', () => {
  const r = checkDossier('depot', undefined);
  assert.strictEqual(r.ok, false);
  assert.match(r.detail, /non configure/);
  assert.ok(r.hint, 'un point non configure doit donner une piste');
});

test('checkDossier : disque absent distingue de dossier inexistant', () => {
  // un disque non branche n'est pas une erreur fatale, mais le message doit le dire
  const r = checkDossier('jeux', 'Q:\\Inexistant\\Games');
  assert.strictEqual(r.ok, false);
  assert.match(r.detail, /disque Q: absent|dossier inexistant/);
  assert.ok(r.hint);
});

test('checkTitres : la base de titres du projet est lue', () => {
  const r = checkTitres(ROOT);
  assert.strictEqual(r.ok, true, 'ISO2GOD/gamelist_xbox360.csv devrait etre present');
  assert.match(r.detail, /^\d+ titres$/);
});

test('checkTitres : racine sans CSV -> signale sans lever', () => {
  const r = checkTitres(tmp);
  assert.strictEqual(r.ok, false);
  assert.ok(r.hint);
});

test('runDoctor : forme du rapport et coherence des compteurs', () => {
  const cfg = { drop: tmp, games: tmp, content: tmp, homebrew: tmp, emulators: tmp };
  const r = runDoctor(cfg, ROOT);
  assert.ok(Array.isArray(r.checks) && r.checks.length > 0);
  assert.ok(['ok', 'degrade', 'inutilisable'].includes(r.resume));
  assert.strictEqual(typeof r.bloquants, 'number');
  for (const c of r.checks) {
    assert.ok(c.id && c.nom, 'chaque verification a un id et un nom');
    assert.ok(c.ok === true || c.ok === false || c.ok === null, 'ok doit valoir true, false ou null');
    if (c.ok === false) assert.ok(c.hint, 'une verification en echec doit proposer une piste : ' + c.id);
  }
  // Node est present dans ce contexte : jamais bloquant. Le reste (outils
  // externes absents, dossiers non configures) est LEGITIMEMENT variable selon
  // la machine — une archive fraichement extraite n'embarque pas 7z ni iso2god.
  // Le vrai invariant est donc « rien ne bloque », pas « tout est parfait ».
  assert.strictEqual(r.bloquants, 0, 'inattendu : Node devrait etre detecte');
  assert.notStrictEqual(r.resume, 'inutilisable');
  assert.strictEqual(r.checks.filter(c => c.id.startsWith('dir:') && !c.ok).length, 0,
    'les 5 dossiers passes existent : aucun ne doit etre signale');
});

test('runDoctor : une config complete et valide ne bloque pas', () => {
  const cfg = { drop: tmp, games: tmp, content: tmp, homebrew: tmp, emulators: tmp };
  const r = runDoctor(cfg, ROOT);
  const nodeCheck = r.checks.find(c => c.id === 'node');
  assert.strictEqual(nodeCheck.ok, Number(process.versions.node.split('.')[0]) >= MIN_NODE);
});

test('runDoctor : tous les dossiers configures absents ne bloquent PAS le demarrage', () => {
  // on doit pouvoir lancer l'app avant d'avoir branche le disque
  const cfg = { drop: 'Q:\\nope', games: 'Q:\\nope', content: 'Q:\\nope', homebrew: 'Q:\\nope', emulators: 'Q:\\nope' };
  const r = runDoctor(cfg, ROOT);
  assert.strictEqual(r.bloquants, 0, 'seul Node est bloquant : un dossier absent degrade, il n\'empeche pas de demarrer');
  assert.strictEqual(r.resume, 'degrade');
  assert.ok(r.degradants >= 5, 'les 5 dossiers absents doivent etre signales');
});

// --- conscience de la plateforme -------------------------------------------
// L'app tourne aujourd'hui sous Windows, mais elle doit pouvoir DEMARRER
// ailleurs. Sur Linux, iso2god.exe / exiso.exe / xextool.exe n'existent pas :
// les signaler comme « manquants » serait une fausse alerte, et ferait echouer
// le diagnostic pour un binaire impossible a installer.

test('checkOutil : un outil Windows hors Windows est « sans objet », pas « manquant »', () => {
  const iso = OUTILS.find(o => o.id === 'iso2god');
  const r = checkOutil(iso, ROOT, false);
  assert.strictEqual(r.indisponible, true);
  assert.strictEqual(r.ok, null, 'ok doit valoir null : ni present, ni a corriger');
  assert.match(r.detail, /hors Windows/);
  assert.strictEqual(r.hint, null, 'aucune piste a donner pour un binaire inexistant');
});

test('checkOutil : ces outils ne comptent ni comme bloquants ni comme degradants', () => {
  const iso = OUTILS.find(o => o.id === 'iso2god');
  const r = checkOutil(iso, ROOT, false);
  assert.notStrictEqual(r.ok, false, 'ok === false le compterait comme un point a corriger');
});

test('checkOutil : sous Windows, un outil Windows est reellement cherche', () => {
  const iso = OUTILS.find(o => o.id === 'iso2god');
  const r = checkOutil(iso, ROOT, true);
  assert.strictEqual(r.indisponible, undefined);
  assert.strictEqual(typeof r.ok, 'boolean');
});

test('OUTILS : 7-Zip declare ses alias Unix', () => {
  // sous Linux le binaire s\'appelle souvent 7za ou 7zr, pas 7z
  const sept = OUTILS.find(o => o.id === '7z');
  assert.ok(Array.isArray(sept.alt) && sept.alt.includes('7za'),
    'sans alias, 7-Zip serait declare manquant sur la plupart des distributions');
});

test('OUTILS : chaque outil porte de quoi guider l utilisateur', () => {
  for (const o of OUTILS) {
    assert.ok(o.id && o.nom, 'identifiant et nom obligatoires');
    assert.ok(o.pourquoi, o.id + ' doit expliquer a quoi il sert');
    assert.ok(o.hint, o.id + ' doit proposer une piste quand il manque');
    assert.ok(Array.isArray(o.chemins) && o.chemins.length, o.id + ' doit lister des emplacements');
    assert.ok(o.requis === false, o.id + ' ne doit pas bloquer le demarrage : l\'app degrade');
  }
});

test('doctor : les dossiers absents sont regroupes par disque', () => {
  // Trois dossiers absents du MEME disque donnaient trois conseils identiques, et
  // repeter la meme phrase trois fois fait perdre le vrai message.
  const D = require('../lib/doctor');
  const r = D.dossiersAbsents({ games: 'H:\\Games', content: 'H:\\Content', drop: 'H:\\_A_TRIER' }, () => false);
  assert.strictEqual(r.length, 1, 'un seul disque -> un seul conseil');
  assert.strictEqual(r[0].volume, 'H:');
  assert.strictEqual(r[0].volumeAbsent, true);
  assert.deepStrictEqual(r[0].quoi, ['games', 'content', 'drop']);

  // Deux disques absents : deux conseils, pas trois.
  const r2 = D.dossiersAbsents({ games: 'H:\\Games', content: 'D:\\Content', drop: 'H:\\_A_TRIER' },
    p => p === 'D:\\');
  assert.strictEqual(r2.length, 2);
  const h = r2.find(x => x.volume === 'H:');
  const d = r2.find(x => x.volume === 'D:');
  assert.deepStrictEqual(h.quoi, ['games', 'drop']);
  assert.strictEqual(d.quoi.length, 1);
  assert.strictEqual(d.volumeAbsent, false, 'D: existe, seul le dossier manque');

  // Rien d'absent : rien a dire. Un conseil vide serait du bruit.
  assert.deepStrictEqual(D.dossiersAbsents({ games: 'H:\\Games' }, () => true), []);
  // Un dossier non configure n'est PAS « introuvable » : c'est un autre probleme.
  assert.deepStrictEqual(D.dossiersAbsents({ games: '' }, () => false), []);
  assert.deepStrictEqual(D.dossiersAbsents({}, () => false), []);
});

test('doctor : un disque debranche et un chemin disparu sont DISTINGUES', () => {
  // « Rebranche le disque » et « corrige le chemin » ne se reparent pas pareil.
  // Les confondre enverrait l'utilisateur verifier un cable debranche pour un
  // dossier simplement renomme.
  const D = require('../lib/doctor');
  const disque = D.dossiersAbsents({ games: 'H:\\Games' }, () => false)[0];
  assert.strictEqual(disque.volumeAbsent, true);
  const chemin = D.dossiersAbsents({ games: 'H:\\Games' }, p => p === 'H:\\')[0];
  assert.strictEqual(chemin.volumeAbsent, false);
});
