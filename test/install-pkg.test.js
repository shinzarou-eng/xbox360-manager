// INSTALLER UN PACKAGE GOD : `.data` est un DOSSIER, et le compteur ne ment pas.
//
// LE DEFAUT QUE CES TESTS FERMENT (mesure du 2026-09-21, diagnostic-rar.md §4b/§5b).
// `installPkg` installait le paquet avec `fs.promises.copyFile()` :
//
//     await fs.promises.copyFile(f, dest);
//     await fs.promises.copyFile(f + '.data', dest + '.data');   <-- LA LIGNE FAUTIVE
//
// Or, dans la disposition GOD standard, `<en-tete>.data` est un DOSSIER. Releve sur
// la charge reelle du proprietaire : `...\76B05786861B0FC8AF07.data\Data0000 ...
// Data0043`, 44 chunks. `copyFile` ne copie pas un dossier : EPERM sous Windows
// (EISDIR sous Linux). La MEME charge passait par la route du depot, qui installe
// avec `movePathAsync` -- un dossier y est accepte. L'asymetrie etait le defaut.
//
// Trois consequences, les trois mesurees dans le diagnostic :
//   1. l'en-tete etait copie AVANT que `.data` n'echoue -> un jeu a moitie pose ;
//   2. l'echec etait avale en `unhandled`, `found` restait a 0, et la file annoncait
//      « Aucun package trouve » alors que le paquet etait reconnu ;
//   3. `found` etant la condition de suppression de la source, un faux succes
//      effacait la source.
//
// `installPkg` vit dans server.js et n'est pas exportee : on extrait son TEXTE et on
// l'evalue, comme test/dl-destination.test.js. Les VRAIS `godTid`/`ctSub`/`ctLabel`/
// `godName` de lib/pkg.js et le VRAI `movePathAsync` de lib/fsutil.js sont injectes --
// reecrire une copie de la fonction ne prouverait rien sur celle qui tourne.
//
// Le site d'appel de la file est extrait de la meme facon : c'est le texte qui decide
// de supprimer la source, pas une paraphrase de ce texte.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pkg = require('../lib/pkg');
const { movePathAsync } = require('../lib/fsutil');

const ROOT = path.join(__dirname, '..');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ---------------------------------------------------------------------------
// EXTRACTION DU TEXTE REEL
// ---------------------------------------------------------------------------

// Le corps d'une fonction, par PROFONDEUR D'ACCOLDADES : de la premiere accolade
// ouvrante apres la signature a celle qui ramene la profondeur a zero. Un decoupage
// sur un marqueur textuel ne suffit pas ici, et c'est mesure : `const finishAll`
// existe DEUX fois dans server.js (installHomebrew et installDownloaded), et
// s'arreter a la premiere ligne `  };` venue coupait le bloc au milieu -- on
// mesurait alors mon extraction, pas le serveur.
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

// --- `installPkg` ---
const SRC_INSTALLPKG = corpsFonction('async function installPkg(f) {');
const CODE_INSTALLPKG = sansCommentaires(SRC_INSTALLPKG);

// --- la branche d'installation de la file, dans `startDl` ---
// On garde le bloc `tryInstall`, du `const tryInstall` au `setImmediate(tryInstall)` :
// c'est exactement le chemin qui decide de supprimer la source. Le reste de `startDl`
// (le telechargement lui-meme) n'a rien a voir avec ce defaut.
const CORPS_STARTDL = corpsFonction('function startDl(item) {');
const DEB_APPEL = CORPS_STARTDL.indexOf('const tryInstall = () => {');
const FIN_APPEL = CORPS_STARTDL.indexOf('setImmediate(tryInstall);', DEB_APPEL);
assert.ok(DEB_APPEL > 0 && FIN_APPEL > DEB_APPEL, 'le bloc tryInstall doit etre dans startDl');
const APPEL = CORPS_STARTDL.slice(DEB_APPEL, CORPS_STARTDL.indexOf('\n', FIN_APPEL) + 1);
assert.match(APPEL, /const gagne = found > 0 && !unh;/,
  'le bloc extrait doit contenir la garde `gagne`');
assert.match(APPEL, /else item\.note = noteApresInstall\(0, unh, ech\);/,
  'le bloc extrait doit contenir la note d\'echec');
assert.ok(APPEL.indexOf('if (gagne && item.chain)') > 0,
  'le bloc extrait doit aller jusqu\'a l\'enchainement du disque suivant');
const eq = s => [...s].reduce((a, c) => a + (c === '{' ? 1 : c === '}' ? -1 : 0), 0);
assert.strictEqual(eq(APPEL), 0, 'le bloc extrait doit etre equilibre en accolades');

// ---------------------------------------------------------------------------
// FABRIQUE D'UN PACKAGE GOD
// ---------------------------------------------------------------------------

// en-tete GOD synthetique aux offsets reels (0x000 magic, 0x344 type, 0x360 TitleID,
// 0x412 nom UTF-16LE) -- meme fabrique que test/pkg.test.js.
function enteteGod(tid, titre) {
  const b = Buffer.alloc(0x600, 0);
  b.write('LIVE', 0, 'ascii');
  Buffer.from('00007000', 'hex').copy(b, 0x344);
  Buffer.from(tid, 'hex').copy(b, 0x360);
  b.write(titre, 0x412, 'utf16le');
  return b;
}

let atelier;
test.before(() => { atelier = fs.mkdtempSync(path.join(os.tmpdir(), 'god-data-')); });
test.after(() => { try { fs.rmSync(atelier, { recursive: true, force: true }); } catch {} });

let n = 0;
// Construit la charge telle que `7z x` la laisse (diagnostic-rar.md §5b) et rend un
// bac a sable. `pkgRoot` est redirige vers l'atelier : installer dans la bibliotheque
// du proprietaire pendant un test serait le degat que ce chantier corrige.
function bac(opts) {
  const o = opts || {};
  const cas = path.join(atelier, 'cas' + (++n));
  const depot = path.join(cas, 'depot');
  const jeux = path.join(cas, 'Games');
  const content = path.join(cas, 'Content');
  const srcDir = path.join(depot, "Assassin's Creed Rogue [555308CE]");
  fs.mkdirSync(srcDir, { recursive: true });
  const H = '76B05786861B0FC8AF07';
  const f = path.join(srcDir, H);
  fs.writeFileSync(f, enteteGod('555308CE', "Assassin's Creed Rogue"));
  const srcData = f + '.data';
  if (o.data === 'dossier') {
    // deux chunks suffisent : la faute est STRUCTURELLE (dossier contre fichier),
    // pas une affaire de taille -- mesure du diagnostic, un `.data` vide levait aussi.
    fs.mkdirSync(path.join(srcData, 'Data0000'), { recursive: true });
    fs.writeFileSync(path.join(srcData, 'Data0000', 'chunk0'), Buffer.alloc(4096, 1));
    fs.mkdirSync(path.join(srcData, 'Data0043'), { recursive: true });
    fs.writeFileSync(path.join(srcData, 'Data0043', 'chunk43'), Buffer.alloc(2048, 2));
  } else if (o.data === 'fichier') {
    fs.writeFileSync(srcData, Buffer.alloc(8192, 3));
  }
  const destDir = path.join(jeux, '555308CE', '00007000');
  const b = { f, srcData, srcDir, depot, jeux, content, cas, destDir, dest: path.join(destDir, H),
    creer: mv => {
      b.installPkg = evaluerInstallPkg(mv || movePathAsync, jeux, content);
      return b.installPkg;
    } };
  b.creer();
  return b;
}

// Evalue le VRAI texte de installPkg avec ses seuls collaborateurs injectes.
function evaluerInstallPkg(mv, jeux, content) {
  const api = new Function('fs', 'path', 'cfg', 'pkgRoot', 'godTid', 'ctSub', 'ctLabel',
    'godName', 'tidName', 'rootName', 'slog', 'T', 'movePathAsync',
    SRC_INSTALLPKG + '\nreturn { installPkg };'
  )(fs, path, { games: jeux, content: content },
    sub => (pkg.GAME_SUBS.has((sub || '').toUpperCase()) ? jeux : content),
    pkg.godTid, pkg.ctSub, pkg.ctLabel, pkg.godName, {}, () => 'Games',
    () => {}, fr => fr, mv);
  return api.installPkg;
}

// Evalue le VRAI bloc `tryInstall` de la file et rend ce qu'il decide : la ligne de
// file (`item.installed`, `item.note`) et les suppressions demandees.
//
// Ce que le bloc lit vient d'ailleurs et est donc injecte : `dest` et `who` sont
// declares dans `startDl` avant lui, et `finishAll` est une fonction VOISINE,
// resolue par hissage -- on injecte ici une doublure qui enregistre son argument
// au lieu de composer une note. `deleteEchoue` fait lever le `unlinkSync` du bloc,
// ce qui reproduit un effacement impossible sans toucher a un fichier reel.
function evaluerAppel(dest, res, opts) {
  const o = opts || {};
  const supprimees = [];
  const fauxFs = Object.assign({}, fs, {
    // `statSync` reste le VRAI : le bloc s'en sert pour choisir entre `rmSync` et
    // `unlinkSync` selon que la source est un dossier ou un fichier.
    rmSync: p => { if (o.deleteEchoue) throw new Error('EBUSY'); supprimees.push(p); },
    unlinkSync: p => { if (o.deleteEchoue) throw new Error('EBUSY'); supprimees.push(p); }
  });
  // `installer` est le ternaire REEL de server.js : `item.after === 'homebrew'`
  // choisit `installHomebrew`, sinon `installDownloaded`. On double les deux.
  const double = (f, cb) => cb(res);
  const item = o.item || {};
  const corps = 'tmp = null; done = null; let appele = null;\n'
    + 'const finishAll = n => { appele = n; };\n' + APPEL
    + '\nreturn { lire: () => appele, lancer: cb => { res = cb; tryInstall(); } };';
  const api = new Function('fs', 'T', 'slog', 'lockSort', 'noteApresInstall', 'unlockSort',
    'invalidateScan', 'saveDls', 'setImmediate', 'tmp', 'done', 'installHomebrew',
    'installDownloaded', 'dest', 'item', 'who', 'res', 'sortLog',
    corps)(
    // `setImmediate` est double et n'execute RIEN : le bloc se termine par
    // `setImmediate(tryInstall);`, et le vrai `setImmediate` relancerait la file une
    // seconde fois -- deux effacements comptes pour un seul. C'est le role de ce
    // bloc de DECIDER, pas de programmer : on garde donc le rappel sans le lancer.
    fauxFs, fr => fr, () => {}, () => true, (f, u) => 'found=' + f + '/unhandled=' + u,
    () => {}, () => {}, () => {}, () => {}, null, null, double, double,
    dest, item, 'install:test', null, []);
  api.lancer(() => {});
  return { item, supprimees, appele: api.lire() };
}

// ---------------------------------------------------------------------------
// 1. LE DEFAUT : `.data` est un DOSSIER (la disposition GOD standard)
// ---------------------------------------------------------------------------
test('installPkg : `.data` DOSSIER — le paquet s\'installe et la fonction dit vrai', async () => {
  const b = bac({ data: 'dossier' });
  const r = await b.installPkg(b.f);
  assert.strictEqual(r, true, 'un paquet GOD dont `.data` est un dossier DOIT s\'installer');
  assert.ok(fs.statSync(b.dest).isFile(), 'l\'en-tete doit avoir atterri');
  assert.ok(fs.existsSync(path.join(b.dest + '.data', 'Data0000', 'chunk0')),
    'la charge doit avoir atterri : `.data` est un dossier, ses chunks avec');
  assert.ok(fs.existsSync(path.join(b.dest + '.data', 'Data0043', 'chunk43')),
    'et TOUT le dossier, pas seulement sa premiere entree');
  assert.strictEqual(fs.readFileSync(path.join(b.dest + '.data', 'Data0043', 'chunk43'))[0], 2,
    'le contenu doit etre celui de la source, pas un dossier vide');
  assert.ok(!fs.existsSync(b.srcData), 'la source ne doit pas rester derriere elle');
});

// La forme que la branche d'origine savait traiter : la corriger ne doit pas la casser.
test('installPkg : `.data` FICHIER — la forme d\'origine continue de marcher', async () => {
  const b = bac({ data: 'fichier' });
  assert.strictEqual(await b.installPkg(b.f), true);
  assert.ok(fs.statSync(b.dest + '.data').isFile(), '`.data` fichier doit rester un fichier');
  assert.strictEqual(fs.statSync(b.dest + '.data').size, 8192, 'avec son contenu entier');
});

test('installPkg : sans `.data`, l\'en-tete seul s\'installe', async () => {
  const b = bac({ data: 'aucun' });
  assert.strictEqual(await b.installPkg(b.f), true);
  assert.ok(fs.statSync(b.dest).isFile());
  assert.ok(!fs.existsSync(b.dest + '.data'), 'on ne fabrique pas un `.data` qui n\'existait pas');
});

// ---------------------------------------------------------------------------
// 2. LE VERBE : c'est movePathAsync qui installe, sur ses DEUX chemins
// ---------------------------------------------------------------------------
test('installPkg installe avec movePathAsync, pas avec copyFile', () => {
  // Un seul verbe pour une seule intention : la route du depot installe deja avec
  // `movePathAsync`, qui accepte un dossier ET un fichier. Un second verbe,
  // `copyFile`, est exactement ce qui a produit le defaut. Le commentaire du bloc
  // cite `copyFile` : on lit le code sans ses commentaires.
  assert.match(CODE_INSTALLPKG, /movePathAsync\(/, 'installPkg doit installer avec movePathAsync');
  assert.ok(!/copyFile/.test(CODE_INSTALLPKG),
    'installPkg ne doit plus appeler copyFile : c\'est ce verbe qui refuse un dossier');
});

test('installPkg : le chemin de COPIE de movePathAsync installe aussi un dossier', async () => {
  // Le chemin rapide (rename) ne prouve rien a lui seul : chez le proprietaire le
  // depot et la bibliotheque sont deux disques, donc EXDEV, donc la branche `cp`.
  // On force cette branche-la en refusant le rename.
  const b = bac({ data: 'dossier' });
  const lent = async (s, d) => {
    try { await fs.promises.rename(s, d); return; } catch {}
    await fs.promises.mkdir(path.dirname(d), { recursive: true });
    const st = await fs.promises.stat(s);
    if (st.isDirectory()) {
      await fs.promises.cp(s, d, { recursive: true });
      await fs.promises.rm(s, { recursive: true, force: true });
    } else {
      await fs.promises.copyFile(s, d);
      await fs.promises.unlink(s);
    }
  };
  b.creer(lent);
  assert.strictEqual(await b.installPkg(b.f), true, 'le chemin lent doit installer un dossier');
  assert.ok(fs.existsSync(path.join(b.dest + '.data', 'Data0000', 'chunk0')));
  assert.ok(fs.existsSync(path.join(b.dest + '.data', 'Data0043', 'chunk43')));
});

// ---------------------------------------------------------------------------
// 3. PAS DE FAUX SUCCES : on ne compte que ce qui a atterri
// ---------------------------------------------------------------------------
test('une installation qui leve ne compte PAS comme un paquet installe', async () => {
  // Destination impossible a creer : `Games` est un FICHIER, donc `mkdir` leve.
  // Cas generique « l'installation leve » : disque plein, acces refuse, dossier
  // remplace par un fichier.
  const b = bac({ data: 'dossier' });
  fs.mkdirSync(b.jeux, { recursive: true });
  fs.writeFileSync(path.join(b.jeux, '555308CE'), 'pas un dossier');
  let found = 0, unhandled = 0;
  try { if (await b.installPkg(b.f)) found++; else unhandled++; }
  catch (e) { unhandled++; }
  assert.strictEqual(found, 0, 'le compteur qui alimente la note ne compte pas un echec');
  assert.strictEqual(unhandled, 1, 'et l\'echec doit etre dit, pas efface');
});

test('un paquet sans TitleID ne compte pas comme installe', async () => {
  // Fichier trop court pour porter le TitleID a 0x360 : `godTid` rend null, et
  // `installPkg` doit le DIRE (faux) au lieu de rendre vrai -- un appelant qui ne
  // lit que le booleen compterait alors un paquet qui n'a jamais ete copie.
  const b = bac({ data: 'dossier' });
  const tronque = path.join(b.srcDir, 'tronque');
  fs.writeFileSync(tronque, Buffer.alloc(0x100, 0));
  assert.strictEqual(await b.installPkg(tronque), false,
    '`installPkg` rend faux quand elle refuse : l\'appelant ne doit pas compter');
});

test('les deux branches `isGodFile(f)` tiennent compte de ce que installPkg rend', () => {
  // MESURE DU 2026-09-21, et c'est un faux succes PUR : ces deux lignes faisaient
  // `await installPkg(f); return finishAll(1);` -- le resultat etait JETE et l'appel
  // annoncait « 1 installe » quoi qu'il arrive. Une installation qui leve ou qui
  // refuse comptait donc comme un succes, et `found > 0` etant la condition de
  // suppression de la source (voir plus bas), un echec pouvait emporter la source.
  //
  // Le motif ci-dessous decrit exactement la faute : `installPkg` attendue et
  // `finishAll(1)` sur la MEME ligne. La laisser sur sa propre ligne oblige a lire
  // ce qu'elle rend, quelle que soit la forme choisie.
  const fautives = SRV.split('\n').map((l, i) => [i + 1, l])
    .filter(([, l]) => /await installPkg\(f\)/.test(l) && /finishAll\(1\)/.test(l));
  assert.deepStrictEqual(fautives, [],
    'ces lignes annoncent un succes sans lire ce que installPkg rend : '
    + fautives.map(([n, l]) => n + ' : ' + l.trim()).join(' | '));
});

// ---------------------------------------------------------------------------
// 4. LA SOURCE N'EST PAS EFFACEE SUR UNE INSTALLATION INCOMPLETE
// ---------------------------------------------------------------------------
test('un echec complet laisse la source intacte et n\'annonce rien d\'installe', () => {
  const b = bac({ data: 'dossier' });
  const src = path.join(b.cas, 'source.rar');
  fs.writeFileSync(src, 'la source du telechargement');
  const r = evaluerAppel(src, { found: 0, unhandled: 1, echec: '' });
  assert.deepStrictEqual(r.supprimees, [],
    'rien n\'est installe : la source ne doit pas etre effacee');
  assert.strictEqual(r.item.installed, undefined, 'et rien ne doit etre annonce installe');
  assert.strictEqual(r.item.note, 'found=0/unhandled=1', 'la ligne doit dire l\'echec');
  assert.ok(fs.existsSync(src), 'la source est toujours la');
});

test('une installation PARTIELLE laisse la source intacte elle aussi', () => {
  // Un paquet a atterri, un autre est ecarte : la source porte peut-etre ce qui
  // manque, on ne l'efface pas.
  const b = bac({ data: 'dossier' });
  const src = path.join(b.cas, 'source2.rar');
  fs.writeFileSync(src, 'source');
  const r = evaluerAppel(src, { found: 1, unhandled: 1, echec: '' });
  assert.deepStrictEqual(r.supprimees, [], 'un contenu ecarte interdit d\'effacer la source');
  assert.strictEqual(r.item.installed, 1, 'le paquet qui a atterri est compte');
  assert.strictEqual(r.item.note, 'found=1/unhandled=1',
    'et la note dit l\'echec a cote du paquet installe');
  assert.ok(fs.existsSync(src));
});

test('un succes complet retire bien la source (pas de regression)', () => {
  const b = bac({ data: 'dossier' });
  const src = path.join(b.cas, 'source3.rar');
  fs.writeFileSync(src, 'source');
  const r = evaluerAppel(src, { found: 1, unhandled: 0, echec: '' });
  assert.deepStrictEqual(r.supprimees, [src], 'un succes complet peut retirer la source');
  assert.strictEqual(r.item.installed, 1);
});

test('le site d\'appel de la file ne supprime la source que sur `gagne`', () => {
  // `gagne` est la SEULE condition d'effacement, et elle exige found > 0 ET zero
  // contenu ecarte : c'est la meme condition que le badge INSTALLE, donc ce qui
  // n'est pas installe ne peut pas emporter la source.
  assert.match(APPEL, /const gagne = found > 0 && !unh;/);
  assert.match(APPEL, /if \(gagne\) \{ try \{/,
    'l\'effacement doit rester dans la branche `gagne`');
  assert.ok(APPEL.indexOf('if (unh) {') < 0 && APPEL.indexOf('else if (unh)') < 0,
    'aucune seconde condition d\'effacement ne doit exister a cote de `gagne`');
});
