// OU VA UN FICHIER ? — le choix de destination, teste sur des cas fabriques.
//
// LE DEFAUT QUE CES TESTS FERMENT (2026-09-20) : un telechargement de 7,9 Go a
// rempli 4 Go du depot H:, en FAT32, sur un disque qui avait 730 Go libres, puis
// s'est arrete sur « Disque plein (ou limite FAT32 4 Go) ». La ligne annoncait
// pourtant « Redirige vers H:\_A_TRIER » — donc l'inverse de ce qui se passait.
//
// La cause : la sonde de types de systemes de fichiers n'avait RIEN rendu
// (`powershell Get-Volume` tue dans cet environnement, `catch` qui avalait la
// panne), et `limite4Go(undefined)` repond FAUX. Un type INCONNU etait donc lu
// comme « pas de limite » : la garde s'eteignait exactement quand elle servait.
//
// `pickDlDir` vit dans server.js et n'est pas exportee : on extrait son texte et
// on l'evalue avec des doublures, comme le fait deja test/pertinence.test.js. La
// VRAIE `limite4Go` et la VRAIE `rootKey` sont utilisees — c'est la fonction qui
// portait le piege, la remplacer par une copie ne prouverait rien.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const plat = require('../lib/platform');
const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const debut = srv.indexOf('const FAT32_MAX');
const fin = srv.indexOf('// depot principal + depots alternes');
assert.ok(debut > 0 && fin > debut, 'le bloc du choix de destination doit etre trouvable dans server.js');
const bloc = srv.slice(debut, fin);

// Doublures : `IS_WIN` force a vrai pour etre independant de la machine qui
// execute les tests (meme choix que parseProcMounts, teste depuis Windows).
function bac(opts) {
  const o = opts || {};
  const platform = Object.assign({}, plat, {
    IS_WIN: true,
    fsTypesSync: () => ({}),   // la sonde reelle ne doit pas tourner dans un test
    fsTypesAsync: () => {}
  });
  const api = new Function('cfg', 'platform', 'freeSpace', 'evenement', 'invalidateScan',
    bloc + '\nreturn { pickDlDir, poser(t) { fsTypes = t; } };'
  )(o.cfg || { drop: 'H:\\_A_TRIER' }, platform, o.freeSpace || (() => 500e9), () => {}, () => {});
  api.poser(o.types || {});
  return api.pickDlDir;
}

const GO = 1024 ** 3;

test('depot FAT32 connu, gros fichier, un disque NTFS : on redirige', () => {
  const pick = bac({ types: { 'H:': 'FAT32', 'D:': 'NTFS' }, freeSpace: () => 400e9 });
  const r = pick(7.9 * GO);
  assert.strictEqual(r.dir, 'D:\\_A_TRIER', 'le fichier doit partir sur le disque sans limite');
  assert.strictEqual(r.redirected, true);
  assert.strictEqual(r.toRoot, 'D:');
});

test('depot FAT32 connu, petit fichier : on garde le depot', () => {
  const pick = bac({ types: { 'H:': 'FAT32', 'D:': 'NTFS' } });
  const r = pick(2 * GO);
  assert.strictEqual(r.dir, 'H:\\_A_TRIER', '2 Go tiennent sur FAT32 : aucune raison de deplacer');
  assert.ok(!r.redirected);
});

test('depot NTFS connu : on garde le depot, meme pour 7,9 Go', () => {
  const pick = bac({ types: { 'H:': 'NTFS', 'D:': 'exFAT' } });
  const r = pick(7.9 * GO);
  assert.strictEqual(r.dir, 'H:\\_A_TRIER');
  assert.ok(!r.redirected, 'aucune redirection inutile quand le depot convient');
});

test('type INCONNU, gros fichier, un disque connu sans limite : on redirige', () => {
  // On ne SAIT pas si H: plafonne : un disque dont on sait qu'il ne plafonne pas
  // est un meilleur choix que le depot douteux.
  const pick = bac({ types: { 'D:': 'NTFS' }, freeSpace: () => 300e9 });
  const r = pick(7.9 * GO);
  assert.strictEqual(r.dir, 'D:\\_A_TRIER');
  assert.strictEqual(r.redirected, true);
});

test('LE CAS DU 2026-09-20 : type INCONNU et AUCUN disque verifie -> on REFUSE', () => {
  // C'est exactement l'etat du serveur ce jour-la : sonde muette, donc carte
  // vide. Avant, ce cas rendait le depot et ecrivait 4 Go pour rien.
  const pick = bac({ types: {} });
  const r = pick(7.9 * GO);
  assert.strictEqual(r.fat32block, true, 'un type inconnu ne doit JAMAIS autoriser le depot pour un gros fichier');
  assert.strictEqual(r.inconnu, true, 'et le refus doit dire que c est l INCERTITUDE, pas le disque, qui bloque');
});

test('type INCONNU, petit fichier : on garde le depot (pas de regression)', () => {
  // Le cas courant ne doit pas devenir un refus : un fichier de 2 Go tient sur
  // FAT32 comme sur NTFS, donc l'incertitude est sans consequence.
  const pick = bac({ types: {} });
  const r = pick(2 * GO);
  assert.strictEqual(r.dir, 'H:\\_A_TRIER');
  assert.ok(!r.fat32block);
});

test('une taille INCONNUE (0) est traitee comme un gros fichier', () => {
  // `content-length` absent : on ne peut pas promettre que ca tiendra.
  const pick = bac({ types: { 'H:': 'FAT32', 'D:': 'NTFS' } });
  assert.strictEqual(pick(0).dir, 'D:\\_A_TRIER');
  const pick2 = bac({ types: {} });
  assert.strictEqual(pick2(0).fat32block, true, 'taille inconnue + type inconnu = refus, pas depot');
});

test('entre plusieurs disques sans limite, le plus libre gagne', () => {
  const pick = bac({
    types: { 'H:': 'FAT32', 'C:': 'NTFS', 'D:': 'exFAT' },
    // `freeSpace` recoit la racine AVEC son separateur ('D:\\') : une doublure qui
    // compare a 'D:' ne matcherait jamais, et le test mesurerait le hasard de
    // l'ordre d'iteration. C'est arrive, et c'est le test qui avait tort.
    freeSpace: r => (String(r).startsWith('C') ? 300e9 : 700e9)
  });
  assert.strictEqual(pick(7.9 * GO).dir, 'D:\\_A_TRIER', 'exFAT avec 700 Go libres doit gagner');
});

test('un type vide n est pas un type connu', () => {
  // `fsTypes` peut porter une clef a valeur vide (sonde partielle) : c'est le
  // meme neant qu'une clef absente, et ca ne doit pas passer pour « sans limite ».
  const pick = bac({ types: { 'H:': '' } });
  assert.strictEqual(pick(7.9 * GO).fat32block, true);
});
