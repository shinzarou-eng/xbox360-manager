// Pertinence des DLC — la regle qui decide ce qu'on propose quand on ouvre les
// DLC D'UN JEU.
//
// Deux erreurs reelles l'ont rendue necessaire, et elles etaient symetriques :
//   - « Alan Wake » ramenait « Alan Wakes American Nightmare » — un autre jeu ;
//   - « Fable II: Game of the Year Edition » ne ramenait RIEN, alors que ses DLC
//     sont dans les collections.
//
// Les cas ci-dessous ne sont pas inventes : ils viennent des 9162 fichiers
// reellement indexes. Quand le cache des collections est present, on rejoue les
// regles dessus — c'est ce qui distingue un test qui protege d'un test qui
// decore.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const P = require('../lib/pertinence-dlc');
const CACHE = path.join(__dirname, '..', 'dlc_index');

// Les noms reellement indexes, si le cache existe (il est local, non versionne).
let NOMS = null;
try {
  NOMS = [];
  for (const f of fs.readdirSync(CACHE)) {
    if (!f.endsWith('.json')) continue;
    try { for (const x of JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'))) NOMS.push(x.name); } catch {}
  }
  if (!NOMS.length) NOMS = null;
} catch { NOMS = null; }

const cherche = q => P.meilleurPalier(NOMS, q).noms;

test('un mot ne se trouve pas a l interieur d un autre', () => {
  // « wake » ne doit pas ramener « wakes » : c'est ce qui faisait apparaitre
  // Alan Wake's American Nightmare — un autre jeu — dans les DLC d'Alan Wake.
  assert.strictEqual(P.contientTous('Alan.Wakes.American.Nightmare.DLC.rar', ['alan', 'wake']), false);
  assert.strictEqual(P.contientTous('Alan.Wake.DLC.RF.X360-ZTM.rar', ['alan', 'wake']), true);
  assert.strictEqual(P.contientTous('Dragon.Age.Nachalo.rar', ['halo']), false);
});

test('un numero distingue les episodes', () => {
  assert.strictEqual(P.contientTous('Halo.4.DLC.rar', ['halo', '3']), false);
  assert.strictEqual(P.contientTous('Halo.3.DLC.rar', ['halo', '3']), true);
  assert.strictEqual(P.contientTous('Halo.Wars.DLC.rar', ['halo', '3']), false);
});

test('chiffres et chiffres romains sont le meme episode', () => {
  // Les collections ecrivent « Fable.2 », le jeu s'appelle « Fable II ».
  assert.deepStrictEqual(P.motsSignificatifs('Fable II: Game of the Year Edition'), ['fable', '2']);
  assert.strictEqual(P.contientTous('Fable.2.DLC.rar', ['fable', '2']), true);
  assert.strictEqual(P.contientTous('Fable.3.DLC.rar', ['fable', '2']), false);
  assert.strictEqual(P.contientTous('Fable II - Knothole Island.zip', ['fable', '2']), true);
});

test('les mots d edition ne comptent pas', () => {
  // « Game of the Year Edition » ne figure dans aucun nom de fichier : les exiger
  // rendait la recherche muette.
  assert.deepStrictEqual(P.motsSignificatifs('Fable II: Game of the Year Edition'), ['fable', '2']);
  assert.deepStrictEqual(P.motsSignificatifs('Midnight Club: Los Angeles: Complete Edition'), ['midnight', 'club', 'los', 'angeles']);
  assert.deepStrictEqual(P.motsSignificatifs('DLC Addon Pack'), []);
});

test('un prefixe de studio se relache, pas le reste', () => {
  // Passe 1 : tous les mots. Puis on retire un mot a la fois, en commencant par
  // la FIN (les descripteurs de version sont en fin de nom).
  const pal = P.paliers("Tom Clancy's Rainbow Six Vegas 2");
  assert.deepStrictEqual(pal[0], ['tom', 'clancy', 'rainbow', 'six', 'vegas', '2']);
  assert.deepStrictEqual(pal[1], ['tom', 'clancy', 'rainbow', 'six', 'vegas'], 'on retire le dernier mot');
  assert.deepStrictEqual(pal[2], ['tom', 'clancy', 'rainbow', 'six', '2']);
  assert.ok(pal.some(p => p.length === 5 && p[0] === 'clancy'), 'on finit par retirer le prefixe de studio');
  // « Halo 3 » trouve du premier coup : le palier strict suffit.
  const r = P.meilleurPalier(NOMS || [], 'Halo 3');
  if (NOMS) assert.deepStrictEqual(r.mots, ['halo', '3'], 'le palier strict doit suffire pour Halo 3');
});

test('le numero de disque ne fait pas partie du nom du jeu', () => {
  // REGRESSION CORRIGEE : « Assassin's Creed IV Disc 2 » ne rendait AUCUN DLC,
  // alors que « Assassin's Creed IV » en rendait. Le mot « disc » et son numero
  // etaient exiges, et aucun nom de pack ne les contient.
  assert.deepStrictEqual(P.motsSignificatifs("Assassin's Creed IV Disc 2"), ['assassin', 'creed', '4']);
  assert.deepStrictEqual(P.motsSignificatifs('Halo 3 Multiplayer (ODST Disc 2)'), ['halo', '3', 'multiplayer', 'odst']);
  assert.deepStrictEqual(P.motsSignificatifs('Fable II (Disc 1)'), ['fable', '2']);
  assert.deepStrictEqual(P.motsSignificatifs('Jeu CD1'), []);
  // le meme jeu avec et sans son numero de disque doit chercher pareil
  assert.deepStrictEqual(P.motsSignificatifs("Assassin's Creed IV"), P.motsSignificatifs("Assassin's Creed IV Disc 2"));
});

test('un TitleID ne se relache jamais', () => {
  // Ce n'est pas un nom : en essayer des fragments ne veut rien dire.
  assert.strictEqual(P.paliers('4D5307E6').length, 1);
  assert.strictEqual(P.contientTous('4D5307E6_00000002.rar', ['4d5307e6']), true);
});

test('un nom de fichier sans rapport ne compte aucun mot', () => {
  // Les bundles contiennent « Disc 1.rar » et des empreintes : aucun de ces noms
  // ne permet de savoir ce qu'on telecharge.
  assert.strictEqual(P.nbMots('Disc 1.rar', ['halo', '3']), 0);
  assert.strictEqual(P.nbMots('C22167221459861C74BD18B65940C9DB.iso', ['midnight', 'club']), 0);
  assert.strictEqual(P.nbMots('Midnight Club - Los Angeles (USA).iso', ['midnight', 'club', 'los', 'angeles']), 4);
});

test('recherche vide : rien plutot que tout', () => {
  assert.deepStrictEqual(P.paliers(''), []);
  assert.deepStrictEqual(P.paliers('the of and'), []);
  assert.deepStrictEqual(P.meilleurPalier(['n-importe-quoi.rar'], ''), { mots: [], noms: [] });
});

// --- les cas reels, rejoues sur les vraies collections -----------------------
test('collections reelles : chaque jeu ne ramene que ses DLC', { skip: NOMS ? false : 'cache dlc_index absent' }, () => {
  // Le nombre exact depend des collections du moment : on verifie la COMPOSITION,
  // pas un total fige.
  const cas = {
    'Halo 3': { doit: ['Halo.3.DLC', 'Halo 3 - Heroic Map Pack'], interdit: ['Halo.4.DLC', 'Halo.Wars.DLC', 'Halo.Reach.DLC', 'Halo.1.Combat'] },
    'Fable II: Game of the Year Edition': { doit: ['Fable.2.DLC', 'Fable II - Knothole Island'], interdit: ['Fable.1.Anniversary', 'Fable.3.DLC'] },
    'Alan Wake': { doit: ['Alan.Wake.DLC', 'Alan Wake - The Signal'], interdit: ['American.Nightmare'] },
    'Forza Motorsport 3': { doit: ['Forza.Motorsport.3.DLC'], interdit: ['Forza.Motorsport.2', 'Forza.Motorsport.4'] },
    // Le nom tel qu'il apparait dans la bibliotheque, suffixe de galette compris.
    "Assassin's Creed IV Disc 2": { doit: ['Assassin'], interdit: [] },
  };
  for (const [jeu, att] of Object.entries(cas)) {
    const r = cherche(jeu);
    assert.ok(r.length > 0, jeu + ' doit ramener quelque chose');
    for (const attendu of att.doit) {
      assert.ok(r.some(n => n.includes(attendu)), jeu + ' doit contenir « ' + attendu + ' » — obtenu : ' + r.slice(0, 4).join(', '));
    }
    for (const interdit of att.interdit) {
      assert.ok(!r.some(n => n.includes(interdit)), jeu + ' ne doit PAS contenir « ' + interdit + ' »');
    }
  }
});

test('collections reelles : la regle stricte ramene beaucoup moins de bruit', { skip: NOMS ? false : 'cache dlc_index absent' }, () => {
  // L'ancienne regle (sous-chaine sur tous les mots du nom complet) ramenait
  // 26 resultats pour « Halo 3 » et ZERO pour « Fable II: GOTY ».
  const halo = cherche('Halo 3').length;
  assert.ok(halo >= 4 && halo <= 12, 'Halo 3 doit ramener ses DLC, pas ceux de toute la serie (' + halo + ')');
  assert.ok(cherche('Fable II: Game of the Year Edition').length > 0,
    'un nom d edition ne doit pas rendre la recherche muette');
});

// --- les cas signales par l'utilisateur --------------------------------------
test('un nom « Autre Jeu - Pack » appartient a l AUTRE jeu', () => {
  // « Dante's Inferno - Isaac Clarke Dead Space Rig Costume » est un DLC de
  // Dante's Inferno, pas de Dead Space. Mesure sur 41 jeux : 9 noms retires,
  // 9 vrais hors-sujets, aucune perte.
  const noms = [
    "Dante's Inferno - Isaac Clarke Dead Space Rig Costume (World) (Addon).zip",
    'Dead Space 2 - Severed (World) (Addon).zip',
    "Rock Band - The Go-Go's - Our Lips Are Sealed (World) (Addon).zip",
    'Lips - 3 Doors Down - Here Without You (World) (Addon).zip',
    'Fallout New Vegas - Gun Runners Arsenal (World) (Addon).zip',
  ];
  const ds = require('../lib/pertinence-dlc').affiner('Dead Space', noms);
  assert.deepStrictEqual(ds, ['Dead Space 2 - Severed (World) (Addon).zip']);
  const lips = require('../lib/pertinence-dlc').affiner('Lips', noms);
  assert.ok(!lips.some(n => /Rock Band/.test(n)), 'une chanson Rock Band n est pas un DLC de Lips');
});

test('une recherche d UN mot doit OUVRIR le nom', () => {
  // « gun » ramenait Gal Gun, Top Gun, Rail Gun, Tail Gun, Radial Gun — tous
  // d'autres jeux. Le jeu cherche commence par son propre nom.
  const noms = ['Gal.Gun.DLC.JAP.X360-ZTM.rar', 'Top.Gun.Hard.Lock.DLC.RF.X360-ZTM.rar',
    'Radial Gun.rar', 'Rail Gun Charlie.rar', 'Gun - Le DLC.zip'];
  const r = require('../lib/pertinence-dlc').affiner('Gun', noms);
  assert.deepStrictEqual(r, ['Gun - Le DLC.zip'], 'seul un nom qui COMMENCE par Gun est retenu');
  // ...et un jeu d'un seul mot garde ses packs
  const lips = require('../lib/pertinence-dlc').affiner('Lips', ['Lips - Chanson A.zip', 'Lips - Chanson B.zip']);
  assert.strictEqual(lips.length, 2);
});

test('quand tout est affine a zero, on rend VIDE plutot que du bruit', { skip: NOMS ? false : 'cache dlc_index absent' }, () => {
  // « Gun » n'a aucun DLC dans les collections : la bonne reponse est zero, pas
  // quatorze packs d'autres jeux.
  assert.deepStrictEqual(cherche('Gun'), [], 'aucun DLC reel pour Gun -> liste vide');
  // et les jeux qui ONT des DLC les gardent tous
  for (const [jeu, mini] of [['Lips', 300], ['Halo', 20], ['Minecraft', 20], ['Dead Space', 10]]) {
    assert.ok(cherche(jeu).length >= mini, jeu + ' doit garder ses DLC (' + cherche(jeu).length + ')');
  }
});
