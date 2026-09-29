// Source ZapTeaM (ZTM) — lib/ztm.js et sources/zapteam.js.
//
// CE QUI EST VERIFIE ICI, ET POURQUOI CES CAS-LA. Le catalogue ZTM tient dans un
// index local (archive.org n'indexe pas les noms de fichiers : chercher
// `Dark.Souls.1.DLC.RF.X360-ZTM` en ligne rend numFound=0). Tout ce qui decide de
// ce que l'utilisateur voit se joue donc sur le NOM du fichier :
//   - jeu ou DLC (le token `DLC`, seul discriminant mesure) ;
//   - la region, prise a la place qui la precede, jamais devinee ;
//   - la recherche, par mots entiers.
// Les cas ci-dessous viennent des 3 239 noms REELS quand l'index est present
// (il est local, non versionne : `dlc_index/` est ignore par git). Sans lui, les
// tests unitaires restent, et les mesures sur le fichier s'abstiennent au lieu
// d'inventer — un test qui exigerait un fichier absent echouerait dans un clone.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const Z = require('../lib/ztm');
const { charger, valider, parId } = require('../lib/sources');

const SOURCES = path.join(__dirname, '..', 'sources');
// Lecture directe : `lireIndex()` passe par un cache memoire, inutile ici.
let INDEX = null;
try {
  const d = JSON.parse(fs.readFileSync(Z.FICHIER, 'utf8'));
  if (d && Array.isArray(d.items) && d.items.length) INDEX = d;
} catch {}
let CACHE_DLC = null;
try {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dlc_index', 'msx360gcdlc.json'), 'utf8'));
  if (Array.isArray(d) && d.length) CACHE_DLC = d;
} catch {}

// --- le discriminant jeu / DLC ---------------------------------------------

test('zapteam : le token DLC est le SEUL discriminant, et il se lit par token', () => {
  // `RF`, `X360` et `XBLA` sont dans les DEUX familles (mesure : 1547 RF au
  // total), donc ils ne discriminent rien. Les confondre rangerait
  // `Crysis.1.RF.X360-ZTM.rar` — un jeu — avec les DLC.
  assert.strictEqual(Z.typeDe('Crysis.1.RF.X360-ZTM.rar'), 'jeu');
  assert.strictEqual(Z.typeDe('Dark.Souls.1.DLC.RF.X360-ZTM.rar'), 'dlc');
  assert.strictEqual(Z.typeDe('Zuma.RF.XBLA-ZTM.rar'), 'jeu');
  assert.strictEqual(Z.typeDe('Hasbro.Family.Game.Night.DLC.RF.XBLA-ZTM.rar'), 'dlc');
  assert.strictEqual(Z.typeDe('Game.DLCs.RF.X360-ZTM.rar'), 'jeu',
    'un mot qui CONTIENT dlc ne doit pas basculer un jeu : on compare un token');
  assert.strictEqual(Z.typeDe('Game.dlc.RF.X360-ZTM.rar'), 'dlc', 'la casse ne compte pas');
});

test('zapteam : la region se lit a la place de la region, et jamais ailleurs', () => {
  assert.strictEqual(Z.regionDe('007.Blood.Stone.USA.X360-ZTM.rar'), 'USA');
  assert.strictEqual(Z.regionDe('Crysis.1.RF.X360-ZTM.rar'), 'RF');
  assert.strictEqual(Z.regionDe('Zuma.RF.XBLA-ZTM.rar'), 'RF');
  assert.strictEqual(Z.plateformeDe('Zuma.RF.XBLA-ZTM.rar'), 'XBLA');
  assert.strictEqual(Z.plateformeDe('Crysis.1.RF.X360-ZTM.rar'), 'X360');
  // QUATRE noms reels n'ont RIEN dans cette place : le token y est un numero ou
  // un mot trop long. Les annoncer comme des regions serait inventer.
  for (const n of ['Doom.1.XBLA-ZTM.rar', 'Zeno.Clash.2.XBLA-ZTM.rar',
    'War.World.Tactical.Combat.XBLA-ZTM.rar',
    'Walking.Dead.Michonne.Collection.XBLA-ZTM.rar']) {
    assert.strictEqual(Z.regionDe(n), '', 'region inventee pour ' + n);
  }
  assert.strictEqual(Z.plateformeDe('Un.Nom.Sans.Plateforme-ZTM.rar'), '');
});

test('zapteam : la recherche se fait par MOTS ENTIERS, et elle est bornee', () => {
  const entrees = [
    { name: 'Crysis.1.RF.X360-ZTM.rar', size: 1, url: 'u', col: 'XEX', colId: 'i' },
    { name: 'Crysis.2.EUR.X360-ZTM.rar', size: 1, url: 'u', col: 'XEX', colId: 'i' },
    { name: 'Crysis.3.DLC.RF.X360-ZTM.rar', size: 1, url: 'u', col: 'DLC', colId: 'i' },
    { name: 'Dark.Souls.2.USA.X360-ZTM.rar', size: 1, url: 'u', col: 'XEX', colId: 'i' }
  ];
  assert.deepStrictEqual(Z.filtrer(entrees, 'crysis 1').map(e => e.name), ['Crysis.1.RF.X360-ZTM.rar']);
  assert.deepStrictEqual(Z.filtrer(entrees, 'crysis 9'), [], 'un numero absent ne doit rien rendre');
  assert.strictEqual(Z.filtrer(entrees, 'cry').length, 0, 'un mot partiel ne doit rien rendre');
  assert.strictEqual(Z.filtrer(entrees, 'crysis').length, 3);
  assert.strictEqual(Z.filtrer(entrees, 'crysis', { type: 'dlc' }).length, 1);
  assert.strictEqual(Z.filtrer(entrees, 'crysis', { type: 'jeu' }).length, 2);
  assert.strictEqual(Z.filtrer(entrees, 'crysis', { max: 2 }).length, 2, 'le maximum doit borner');
  assert.deepStrictEqual(Z.filtrer(entrees, ''), [], 'une requete vide ne rend rien');
});

test('zapteam : l etat de l index est RECALCULE, jamais recopie', () => {
  const faux = {
    construit: '2022-10-30T00:00:00.000Z',
    // des compteurs stockes et FAUX : ils ne doivent pas etre crus
    fichiers: 999, jeux: 999, dlc: 999,
    itemsLus: [{ id: 'a' }, { id: 'b' }],
    items: [
      { name: 'Crysis.1.RF.X360-ZTM.rar', size: 100 },
      { name: 'Dark.Souls.1.DLC.RF.X360-ZTM.rar', size: 200 }
    ]
  };
  const e = Z.etat(faux);
  assert.strictEqual(e.fichiers, 2);
  assert.strictEqual(e.jeux, 1);
  assert.strictEqual(e.dlc, 1);
  assert.strictEqual(e.octets, 300);
  assert.strictEqual(e.items, 2);
  assert.strictEqual(e.construit, '2022-10-30T00:00:00.000Z', 'la date doit etre conservee telle quelle');
  assert.strictEqual(Z.etat(null), null);
  assert.strictEqual(Z.etat({}), null, 'un index informe ne rend pas un etat');
});

test('zapteam : une tache en echec ne fait pas tomber les autres', () => {
  const liste = ['a', 'b', 'c', 'd', 'e'];
  return new Promise(res => {
    Z._enParallele(liste, 2, (x, suite) => {
      setTimeout(() => suite(x === 'c' ? { erreur: 'boum' } : { ok: x }), 1);
    }, out => {
      assert.strictEqual(out.length, 5);
      assert.deepStrictEqual(out.map(o => o.ok || 'echec'), ['a', 'b', 'echec', 'd', 'e'],
        'l ordre doit etre celui de la liste, l echec isole');
      res();
    });
  });
});

// --- le contrat de source ---------------------------------------------------

test('zapteam : la source respecte le contrat de lib/sources.js', () => {
  const mod = require('../sources/zapteam.js');
  assert.deepStrictEqual(valider(mod, 'zapteam.js'), { ok: true });
  assert.strictEqual(mod.nature, 'tiers',
    'service externe : l utilisateur reste responsable (les fichiers sont distants et exigent son compte)');
  assert.strictEqual(Z.MOTIF_RELEASE.test('Dark.Souls.1.DLC.RF.X360-ZTM.rar'), true);
  assert.strictEqual(Z.MOTIF_RELEASE.test('X360.jpg'), false);
  const r = charger(SOURCES);
  assert.deepStrictEqual(r.rejets, [], 'aucune source du depot ne doit etre rejetee');
  const s = parId(r.sources, 'zapteam');
  assert.ok(s, 'la source zapteam doit etre chargee par le registre');
  assert.strictEqual(s.nature, 'tiers');
  assert.strictEqual(s.peutListerFichiers, true);
  assert.strictEqual(typeof s.etatIndex, 'function', 'l index local doit etre exposable');
});

test('zapteam : un identifiant de fichier non compose est refuse', () => {
  const mod = require('../sources/zapteam.js');
  return new Promise(res => {
    mod.files('sans-slash', (e, f) => {
      assert.ok(e, 'un identifiant sans <item>/<nom> doit etre refuse');
      assert.match(e.message, /<item>\/<nom/);
      assert.strictEqual(f, undefined);
      res();
    });
  });
});

// --- mesures sur l index REEL (absent d un clone : dlc_index/ est ignore) ----

test('zapteam : les entrees de l index ont EXACTEMENT la forme du cache DLC', () => {
  if (!INDEX || !CACHE_DLC) return;   // index local absent (clone) : rien a mesurer
  const clefs = o => Object.keys(o).sort().join(',');
  assert.strictEqual(clefs(INDEX.items[0]), clefs(CACHE_DLC[0]),
    'une entree ZTM doit se lire avec le meme code qu une entree DLC : ' +
    clefs(INDEX.items[0]) + ' contre ' + clefs(CACHE_DLC[0]));
  assert.match(INDEX.construit, /^\d{4}-\d{2}-\d{2}T/, 'l index doit porter sa date de construction');
});

test('zapteam : sur l index reel, le token DLC separe les deux familles', () => {
  if (!INDEX) return;
  const parToken = INDEX.items.filter(x => /\.DLC\./i.test(x.name)).length;
  const parType = INDEX.items.filter(x => Z.estDlc(x.name)).length;
  assert.strictEqual(parToken, parType, 'token et classification doivent coincider');
  // Les 11 items « Game Collection » du deposant : mesure du 2026-09-20.
  assert.strictEqual(parType, 865, 'les DLC mesures : ' + parType);
  assert.strictEqual(Z.etat(INDEX).jeux, 2374, 'les jeux mesures : ' + Z.etat(INDEX).jeux);
  assert.strictEqual(INDEX.items.length, 3239);
  const parItem = {};
  for (const x of INDEX.items) parItem[x.colId] = (parItem[x.colId] || 0) + 1;
  assert.strictEqual(Object.keys(parItem).length, 11, '11 items, pas un de plus');
  assert.strictEqual(parItem.msx360gcdlc, 866, 'l item DLC porte 866 releases');
  // AUCUN nom de JEUX ne porte le token : c'est ce qui rend le discriminant sur.
  for (const x of INDEX.items) {
    if (x.col === 'DLC') continue;
    assert.strictEqual(Z.estDlc(x.name), false, 'jeu classe DLC : ' + x.name);
  }
});

test('zapteam : sur l index reel, 100 % .rar et aucun nom en .iso', () => {
  if (!INDEX) return;
  for (const x of INDEX.items) {
    assert.match(x.name, /-ZTM\.rar$/i, 'release hors convention : ' + x.name);
  }
  // ON REGARDE L EXTENSION, pas la sous-chaine : `Alien.Isolation` contient
  // « .iso » et n'est evidemment pas une image ISO.
  const iso = INDEX.items.filter(x => /\.iso$/i.test(x.name));
  assert.deepStrictEqual(iso.map(x => x.name), [], 'aucun nom ne doit finir par .iso');
  assert.strictEqual(INDEX.items.filter(x => /\.iso/i.test(x.name)).length, 2,
    'deux noms contiennent la sous-chaine .iso (Alien.Isolation) : c est un mot, pas une extension');
});

test('zapteam : un index corrompu est traite comme ABSENT (donc reconstruit)', () => {
  // Un index tronque ne doit pas lever au milieu d'une recherche : il doit mener
  // a une reconstruction. On ecrit pour de vrai, puis on restaure.
  let sauvegarde = null;
  try { sauvegarde = fs.readFileSync(Z.FICHIER, 'utf8'); } catch { return; }  // pas d'index : rien a eprouver
  try {
    fs.writeFileSync(Z.FICHIER, '{"items": [ tronque');
    assert.strictEqual(Z.lireIndex(), null, 'un index illisible doit etre rendu absent');
    fs.writeFileSync(Z.FICHIER, '{"autre": 1}');
    assert.strictEqual(Z.lireIndex(), null, 'un index informe doit etre rendu absent');
  } finally {
    fs.writeFileSync(Z.FICHIER, sauvegarde);
  }
  assert.ok(Z.lireIndex(), 'l index restaure doit se relire');
});

test('zapteam : sur l index reel, une recherche reelle rend les deux familles', () => {
  if (!INDEX) return;
  const r = Z.filtrer(INDEX.items, 'dark souls', { max: 10 });
  const types = r.map(x => Z.typeDe(x.name)).sort();
  assert.deepStrictEqual(types, ['dlc', 'dlc', 'jeu', 'jeu'],
    'jeux ET DLC pour la meme recherche : ' + JSON.stringify(r.map(x => x.name)));
  const jeu = r.find(x => Z.typeDe(x.name) === 'jeu');
  const dlc = r.find(x => Z.typeDe(x.name) === 'dlc');
  assert.strictEqual(jeu.name, 'Dark.Souls.1.USA.X360-ZTM.rar');
  assert.strictEqual(jeu.size, 3971601078);
  assert.strictEqual(dlc.name, 'Dark.Souls.1.DLC.RF.X360-ZTM.rar');
  assert.strictEqual(dlc.size, 355988711);
  assert.strictEqual(jeu.url, 'https://archive.org/download/mx360gcpt2-x360-ztm/Dark.Souls.1.USA.X360-ZTM.rar',
    'l URL de telechargement vient de l item, pas d un chemin fabrique');
});
