// PACK D'EXTENSION : le CONTENU ne va pas dans `Games`, et un TitleID qu'on ne
// peut pas nommer est REFUSE.
//
// LE DEFAUT QUE CES TESTS FERMENT (mesure du 2026-09-24, disque d'add-on
// « Borderlands 2 »).
//
// `doIsoToGod` posait TOUT ce que la conversion avait produit dans `cfg.games`,
// parce que la destination etait ecrite en dur :
//
//     const dest = path.join(pkgRoot('00007000'), tidDir);
//
// Or le TYPE vit dans le nom du sous-dossier produit par la conversion :
// `00007000` est le conteneur d'un JEU ; `00000002` (DLC), `000B0000` (mise a
// jour) et `00009000` (avatar) sont du CONTENU — et la console ne lit le contenu
// QUE dans `Content\0000000000000000\<TitleID>\<type>`. Du contenu pose dans
// `Games` n'est pas « mal range » : il est INVISIBLE. L'ecran, lui, annoncait une
// installation reussie, ce qui est pire qu'une erreur — c'est exactement ce que
// le proprietaire a vecu.
//
// CE QUE LA MESURE A ETABLI sur son disque (lecture seule) :
//   - `H:\Games\FFED2000` (7,46 Go) porte un paquet GOD `00007000` dont le
//     TitleID (FFED2000) n'est dans AUCUNE base de titres (« jeu non identifie ») ;
//   - sa charge transporte pourtant le CONTENU de Borderlands 2 : `5454087C`,
//     `00000002`, et les quatre noms de packs en UTF-16LE (« Captain Scarlett »,
//     « Mr. Torgue », « Sir Hammerlock », « Tiny Tina »).
//   C'est le disque d'add-on installe comme un jeu.
//
// `doIsoToGod` vit dans server.js et n'est pas exportee : on extrait son TEXTE et
// on l'evalue, comme test/install-pkg.test.js et test/dl-destination.test.js. Les
// VRAIS `isHex8`/`isGameSub`/`CT_LABELS` de lib/pkg.js, le VRAI `movePathAsync` de
// lib/fsutil.js et le VRAI `lib/galettes.js` sont injectes : reecrire une copie de
// ces fonctions ne prouverait rien sur celles qui tournent.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pkg = require('../lib/pkg');
const Galettes = require('../lib/galettes');
const { movePathAsync } = require('../lib/fsutil');

const ROOT = path.join(__dirname, '..');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ---------------------------------------------------------------------------
// EXTRACTION DU TEXTE REEL
// ---------------------------------------------------------------------------
// Le corps d'une fonction, par PROFONDEUR D'ACCOLDADES (meme helper que
// test/install-pkg.test.js) : un decoupage sur un marqueur textuel se trompe des
// qu'une accolade vit dans une chaine ou dans un commentaire.
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

const SRC_ISO = corpsFonction('async function doIsoToGod(f, contentDir, rapport, destRacine) {');
const SRC_FUS = corpsFonction('async function fusionnerGalettes(src, dest) {');
const CODE_ISO = sansCommentaires(SRC_ISO);

// ---------------------------------------------------------------------------
// FABRIQUE
// ---------------------------------------------------------------------------
let atelier;
test.before(() => { atelier = fs.mkdtempSync(path.join(os.tmpdir(), 'x360-pack-')); });
test.after(() => { try { fs.rmSync(atelier, { recursive: true, force: true }); } catch {} });

// Un en-tete de paquet synthetique aux offsets reels : 0x000 magic, 0x354 MediaID
// (la clef de galette, lue par lib/galettes.js), 0x360 TitleID, et — quand on le
// demande — le NOM du titre a 0x412 en UTF-16LE, comme le lit `godName`. Ce nom
// n'est pas decoratif : c'est lui qui distingue un jeu recent absent de la base
// (nomme par son paquet) du disque d'add-on mesure (nomme NULLE PART).
function entete(tid, mediaid, nom) {
  const b = Buffer.alloc(0x600, 0);
  b.write('LIVE', 0, 'ascii');
  Buffer.from(tid, 'hex').copy(b, 0x360);
  Buffer.from(mediaid, 'hex').copy(b, 0x354);
  if (nom) b.write(nom, 0x412, 'utf16le');
  return b;
}

let n = 0;
// Un bac a sable : un faux ISO (jamais converti — la conversion est doublee), un
// dossier de travail, `Games`, et `Content\0000000000000000` comme chez le
// proprietaire. `types` est l'arborescence que la doublure d'iso2god ECRIT.
function bac(o) {
  const cas = path.join(atelier, 'cas' + (++n));
  const TMP = path.join(cas, 'tmp');
  const jeux = path.join(cas, 'Games');
  const content = path.join(cas, 'Content', '0000000000000000');
  fs.mkdirSync(TMP, { recursive: true });
  const iso = path.join(cas, 'disque.iso');
  fs.writeFileSync(iso, 'ISO');
  const messages = [];
  // Doublure d'iso2god : elle ecrit <ex>/<tid>/<type>/<paquet> (+ <paquet>.data).
  // Le VRAI iso2god n'est pas lance : ce qui se mesure ici est le ROUTAGE de ce
  // qu'il produit, pas la conversion elle-meme. La signature est celle de
  // runToolStream (le serveur lit la progression en continu) : la destination
  // est le DERNIER positionnel, apres `--num-threads N`.
  const runToolStream = async (bin, args, opts, surLigne) => {
    const ex = args[args.length - 1];
    for (const t of o.types) {
      const d = path.join(ex, o.tid, t);
      fs.mkdirSync(d, { recursive: true });
      const noms = (o.paquets && o.paquets[t]) || ['PAQUET1'];
      noms.forEach((nom, i) => {
        fs.writeFileSync(path.join(d, nom), entete(o.tid, String(i + 1).padStart(8, '0'), o.nomPaquet));
        fs.mkdirSync(path.join(d, nom + '.data'), { recursive: true });
      });
    }
    return '';
  };
  const tidName = Object.assign({}, o.tidName);
  const api = new Function('fs', 'path', 'cfg', 'TMP', 'ISO2GOD', 'runToolStream', 'raisonOutil', 'Galettes',
    'galettesEnConflit', 'isHex8', 'isGameSub', 'isGodFile', 'godName', 'CT_LABELS', 'pkgRoot',
    'rootName', 'tidName', 'slog', 'T', 'movePathAsync', 'scanDriveCached',
    'tmpConversion', 'ssdDestination', 'iso2godArgs', 'godThreads',
    SRC_FUS + '\n' + SRC_ISO + '\nreturn { doIsoToGod };')(
    fs, path, { games: jeux, content }, TMP, path.join(cas, 'iso2god.exe'), runToolStream, () => 'echec',
    Galettes, pkg.galettesEnConflit, pkg.isHex8, pkg.isGameSub, pkg.isGodFile, pkg.godName, pkg.CT_LABELS,
    sub => (pkg.GAME_SUBS.has(String(sub || '').toUpperCase()) ? jeux : content),
    sub => (pkg.GAME_SUBS.has(String(sub || '').toUpperCase()) ? 'Games' : 'Content'),
    tidName,
    m => messages.push(m), fr => fr,   // T(fr, en) rend le FRANCAIS : les messages sont mesurables
    movePathAsync, () => [],
    // Les doublures du bloc de reglages : temporaire dans le bac a sable,
    // destination non-SSD (un seul thread), arguments reels `--num-threads`.
    d => fs.mkdtempSync(path.join(TMP, 'g-')),
    (d, cb) => cb(false),
    (s, d, t) => ['--num-threads', String(t || 1), s, d],
    () => 1);
  return {
    cas, TMP, jeux, content, messages, tidName,
    appeler: rap => api.doIsoToGod(iso, content, rap)
  };
}

const JOURNAL = b => b.messages.join('\n');

// ---------------------------------------------------------------------------
// 1. LE CONTENU VA DANS `Content`, PAS DANS `Games`
// ---------------------------------------------------------------------------
test('un conteneur de CONTENU (00000002) ne part PAS dans Games', async () => {
  const b = bac({ tid: '5454087C', types: ['00000002'], tidName: { '5454087C': 'Borderlands 2' } });
  const ok = await b.appeler();
  assert.strictEqual(ok, true, 'un pack d extension dont le jeu est connu s installe');
  assert.ok(!fs.existsSync(path.join(b.jeux, '5454087C')),
    'le DLC ne doit RIEN poser dans Games : la console ne l y lit pas');
  assert.ok(fs.existsSync(path.join(b.content, '5454087C', '00000002', 'PAQUET1')),
    'il doit atterrir dans Content\\0000000000000000\\<TitleID>\\00000002');
  assert.ok(fs.existsSync(path.join(b.content, '5454087C', '00000002', 'PAQUET1.data')),
    'et son dossier de donnees avec lui');
});

// ---------------------------------------------------------------------------
// 2. UN TITLEID QU'ON NE PEUT PAS NOMMER : ON REFUSE, ON NE PLACE PAS
// ---------------------------------------------------------------------------
test('un pack d extension dont le JEU est introuvable est refuse, jamais place', async () => {
  // Le cas mesure : le TitleID de ce qu'on installe n'est dans aucune base de
  // titres. Deviner un TitleID « plausible » donnerait du contenu que la console
  // ignore EN SILENCE — exactement le defaut d'origine. On refuse, et on dit ce
  // qu'on a reconnu.
  const b = bac({ tid: 'FFED2000', types: ['00000002'] });
  const rap = {};
  const ok = await b.appeler(rap);
  assert.strictEqual(ok, false, 'sans le jeu, la fonction doit REFUSER');
  assert.ok(!fs.existsSync(path.join(b.jeux, 'FFED2000')), 'aucun placement dans Games');
  assert.ok(!fs.existsSync(path.join(b.content, 'FFED2000')), 'aucun placement dans Content');
  assert.match(String(rap.echec), /FFED2000/,
    'la raison doit nommer le TitleID qu on n a pas su resoudre');
  assert.match(String(rap.echec), /pack d extension/i,
    'et dire ce qu on a RECONNU : un pack d extension');
  assert.match(JOURNAL(b), /pack d extension/i, 'le journal doit le dire aussi');
});

// ---------------------------------------------------------------------------
// 3. NON-REGRESSION : UN PAQUET DE JEU VA TOUJOURS DANS `Games\<TID>\00007000`
// ---------------------------------------------------------------------------
test('un conteneur de JEU (00007000) va toujours dans Games\\<TID>\\00007000', async () => {
  const b = bac({ tid: '5454087C', types: ['00007000'], tidName: { '5454087C': 'Borderlands 2' } });
  assert.strictEqual(await b.appeler(), true);
  assert.ok(fs.existsSync(path.join(b.jeux, '5454087C', '00007000', 'PAQUET1')),
    'la disposition mesuree sur 33 paquets reels ne doit pas bouger');
  assert.ok(!fs.existsSync(b.content), 'et rien ne doit partir dans Content');
});

// ---------------------------------------------------------------------------
// 4. LES DEUX : CHACUN DE SON COTE, ET LE COMPTE RENDU LE DIT
// ---------------------------------------------------------------------------
test('jeu ET contenu dans le meme ISO : chacun de son cote, et on DIT ce qu on a compris', async () => {
  const b = bac({
    tid: '5454087C', types: ['00007000', '00000002'],
    paquets: { '00000002': ['DLC1', 'DLC2'] },
    tidName: { '5454087C': 'Borderlands 2' }
  });
  assert.strictEqual(await b.appeler(), true);
  assert.ok(fs.existsSync(path.join(b.jeux, '5454087C', '00007000', 'PAQUET1')), 'le jeu dans Games');
  assert.ok(fs.existsSync(path.join(b.content, '5454087C', '00000002', 'DLC1')), 'le DLC 1 dans Content');
  assert.ok(fs.existsSync(path.join(b.content, '5454087C', '00000002', 'DLC2')), 'le DLC 2 dans Content');
  // LE COMPTE RENDU EST UNE RECONNAISSANCE, pas une ligne de journal technique :
  // ce que c'etait, pour quel jeu, combien de paquets, et ou ils sont alles.
  const j = JOURNAL(b);
  assert.match(j, /pack d extension/i, 'le journal doit nommer ce que c est');
  assert.match(j, /Borderlands 2/, 'et le jeu, par son NOM');
  assert.match(j, /5454087C/, 'et son TitleID');
  // DEUX comptes, parce qu'il y a deux destinations : le paquet de jeu, puis les
  // deux DLC. Un total unique ne dirait pas ou est alle quoi.
  assert.ok(j.includes('1 paquet(s) -> ' + path.join(b.jeux, '5454087C')),
    'le compte du jeu et sa destination, dans le journal : ' + j);
  assert.ok(j.includes('2 paquet(s) -> ' + path.join(b.content, '5454087C')),
    'le compte du contenu et sa destination, dans le journal : ' + j);
});

// ---------------------------------------------------------------------------
// 5. LE GARDE-FOU DE STRUCTURE : LA DESTINATION N'EST PLUS SUPPOSEE
// ---------------------------------------------------------------------------
test('la destination n est plus ecrite en dur sur le type de JEU', () => {
  // C'est la ligne qui portait le defaut. La laisser revenir rendrait le contenu
  // invisible a nouveau, quelle que soit la forme du routage ecrite a cote.
  assert.ok(!/pkgRoot\('00007000'\)/.test(CODE_ISO),
    'la destination ne doit plus supposer 00007000 : elle suit le type produit');
});

// ---------------------------------------------------------------------------
// 6. UN JEU QUE RIEN NE NOMME : REFUS (le disque d'add-on, mesure)
// ---------------------------------------------------------------------------
test('un paquet de JEU que NI la base NI l en-tete ne nomment est refuse', async () => {
  // LE CAS MESURE, et c'est celui de H:\Games\FFED2000 : conteneur `00007000`,
  // TitleID `FFED2000` absent de la base de titres, en-tete SANS nom. `iso2god`
  // estampille TOUT disque en `00007000` (sa reference ne connait que
  // GamesOnDemand et XboxOriginal), donc la forme du paquet ne suffit pas a
  // reconnaitre un disque d'add-on : c'est le SILENCE TOTAL qui refuse.
  // Sans cela, l'ecran annonce une reussite au-dessus d'un disque que la console
  // affichera comme un jeu sans nom — exactement ce que le proprietaire a vecu.
  const b = bac({ tid: 'FFED2000', types: ['00007000'] });
  const rap = {};
  const ok = await b.appeler(rap);
  assert.strictEqual(ok, false, 'sans nom nulle part, la fonction doit REFUSER');
  assert.ok(!fs.existsSync(path.join(b.jeux, 'FFED2000')), 'aucun placement dans Games');
  assert.match(String(rap.echec), /FFED2000/, 'la raison doit nommer le TitleID qu on n a pas su identifier');
});

test('un jeu absent de la base mais NOMME par son paquet s installe (non-regression)', async () => {
  // La base `gamelist_xbox360.csv` est PARTIELLE : un titre recent peut y manquer.
  // Le refus ci-dessus ne doit donc pas emporter un vrai jeu — seul le silence
  // total (aucun nom nulle part) refuse.
  const b = bac({ tid: '4E4D07D1', types: ['00007000'], nomPaquet: 'Un Jeu Recent' });
  assert.strictEqual(await b.appeler(), true, 'un titre absent de la base doit continuer de s installer');
  assert.ok(fs.existsSync(path.join(b.jeux, '4E4D07D1', '00007000', 'PAQUET1')),
    'et atterrir dans Games\\<TID>\\00007000 comme avant');
});
