// Tests de lib/fsutil.js — regression : movePath doit utiliser renameSync
// (le bug historique : movePath s'appelait elle-meme -> recursion infinie ->
//  repli systematique sur copie+suppression, meme sur le meme disque)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const F = require('../lib/fsutil');
const { movePath } = F;

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fsutil-'));

test('fichier : rename rapide, source disparue, contenu intact', () => {
  const d = tmp();
  const src = path.join(d, 'a.bin');
  const dst = path.join(d, 'b.bin');
  fs.writeFileSync(src, Buffer.alloc(4096, 0x42));

  const t0 = process.hrtime.bigint();
  movePath(src, dst);
  const us = Number(process.hrtime.bigint() - t0) / 1000;

  assert.strictEqual(fs.existsSync(src), false, 'la source doit avoir disparu');
  assert.strictEqual(fs.existsSync(dst), true, 'la destination doit exister');
  assert.strictEqual(fs.readFileSync(dst)[0], 0x42, 'le contenu doit etre intact');
  assert.ok(us < 50_000, `deplacement trop lent (${us.toFixed(0)} us) : rename non utilise ?`);
  fs.rmSync(d, { recursive: true, force: true });
});

test('dossier : rename rapide et recursif', () => {
  const d = tmp();
  const src = path.join(d, 'src');
  const dst = path.join(d, 'dst');
  fs.mkdirSync(path.join(src, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(src, 'sub', 'f.txt'), 'hello');

  movePath(src, dst);

  assert.strictEqual(fs.existsSync(src), false, 'le dossier source doit avoir disparu');
  assert.strictEqual(fs.readFileSync(path.join(dst, 'sub', 'f.txt'), 'utf8'), 'hello');
  fs.rmSync(d, { recursive: true, force: true });
});

test('pas d\'appel a cpSync quand rename suffit (garde-fou anti-regression)', () => {
  const d = tmp();
  const src = path.join(d, 'x.bin');
  const dst = path.join(d, 'y.bin');
  fs.writeFileSync(src, 'data');

  const realRename = fs.renameSync;
  const realCp = fs.cpSync;
  const realCopy = fs.copyFileSync;
  let renamed = 0, copied = 0;
  fs.renameSync = (...a) => { renamed++; return realRename(...a); };
  fs.cpSync = (...a) => { copied++; return realCp(...a); };
  fs.copyFileSync = (...a) => { copied++; return realCopy(...a); };
  try {
    movePath(src, dst);
  } finally {
    fs.renameSync = realRename;
    fs.cpSync = realCp;
    fs.copyFileSync = realCopy;
  }

  assert.strictEqual(renamed, 1, 'renameSync doit etre appele exactement une fois');
  assert.strictEqual(copied, 0, 'aucune copie ne doit avoir lieu sur le meme disque');
  fs.rmSync(d, { recursive: true, force: true });
});

test('repli copie+suppression quand rename echoue (simule EXDEV)', () => {
  const d = tmp();
  const src = path.join(d, 'src.bin');
  const dst = path.join(d, 'sub', 'dst.bin');
  fs.mkdirSync(path.join(d, 'sub'), { recursive: true });
  fs.writeFileSync(src, 'cross-drive');

  const realRename = fs.renameSync;
  fs.renameSync = () => { const e = new Error('EXDEV'); e.code = 'EXDEV'; throw e; };
  try {
    movePath(src, dst);
  } finally {
    fs.renameSync = realRename;
  }

  assert.strictEqual(fs.existsSync(src), false, 'la source doit etre supprimee apres copie');
  assert.strictEqual(fs.readFileSync(dst, 'utf8'), 'cross-drive');
  fs.rmSync(d, { recursive: true, force: true });
});

test('source absente : erreur remontee, pas de copie silencieuse', () => {
  const d = tmp();
  assert.throws(() => movePath(path.join(d, 'inexistant'), path.join(d, 'dst')));
  fs.rmSync(d, { recursive: true, force: true });
});

test('movePathAsync : meme contrat que movePath, sans bloquer', async () => {
  // Le chemin lent de movePath (`cpSync`) BLOQUE la boucle d'evenements : copier
  // un jeu de 8 Go gele l'application entiere. Or c'est le trajet courant — le
  // depot est sur D: (NTFS) et la bibliotheque sur H: (FAT32), donc deux disques.
  //
  // On verifie les MEMES garanties : rename d'abord, copie seulement s'il echoue,
  // source supprimee uniquement apres une copie reussie.
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'mva-'));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'mvb-'));

  // 1. Un fichier, renomme dans le meme dossier : chemin rapide.
  const f1 = path.join(a, 'un.bin');
  fs.writeFileSync(f1, 'contenu');
  await F.movePathAsync(f1, path.join(a, 'deux.bin'));
  assert.ok(fs.existsSync(path.join(a, 'deux.bin')), 'le fichier doit avoir bouge');
  assert.ok(!fs.existsSync(f1), 'et la source ne plus etre la');

  // 2. Un dossier, vers un autre emplacement : on verifie le CONTENU, pas
  //    seulement l'existence.
  const d = path.join(a, 'jeu');
  fs.mkdirSync(path.join(d, 'sous'), { recursive: true });
  fs.writeFileSync(path.join(d, 'sous', 'f.txt'), 'abc');
  await F.movePathAsync(d, path.join(b, 'jeu'));
  assert.strictEqual(fs.readFileSync(path.join(b, 'jeu', 'sous', 'f.txt'), 'utf8'), 'abc');
  assert.ok(!fs.existsSync(d), 'la source doit avoir disparu');

  // 3. Source absente : on LEVE, on ne copie pas dans le vide.
  await assert.rejects(() => F.movePathAsync(path.join(a, 'inexistant'), path.join(b, 'x')),
    e => e.code === 'ENOENT', 'une source absente doit lever ENOENT');

  // 4. Renommer VERS un chemin dont le parent n'existe pas encore.
  const f2 = path.join(a, 'trois.bin');
  fs.writeFileSync(f2, 'x');
  await F.movePathAsync(f2, path.join(b, 'neuf', 'quatre.bin'));
  assert.ok(fs.existsSync(path.join(b, 'neuf', 'quatre.bin')), 'le parent doit etre cree');

  fs.rmSync(a, { recursive: true, force: true });
  fs.rmSync(b, { recursive: true, force: true });
});
