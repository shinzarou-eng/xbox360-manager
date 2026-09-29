// Ou poser les scripts Aurora.
//
// Le depot officiel donne des chemins RELATIFS a une installation d'Aurora
// (« Game:\User\Scripts\Utility\ »), mais « Game: » est un alias de peripherique,
// pas un chemin de fichier : sur une console c'est /Game, sur une autre
// /Usb0/Aurora. Ces tests verifient qu'on CHERCHE l'installation au lieu de la
// supposer — et qu'on refuse quand on ne la trouve pas, parce qu'ecrire dans un
// dossier qu'Aurora ne lit pas donne un script qui ne se charge jamais.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../lib/aurora-scripts');

// Un client FTP en memoire : un arbre de dossiers, rien de plus. Les chemins sont
// absolus et en « / », comme ce que rend Ftp.liste sur une vraie console.
function fauxFtp(arbre) {
  return {
    dossier: '',
    async liste(chemin) {
      const c = String(chemin || '').replace(/\/+$/, '') || '/';
      const cles = Object.keys(arbre);
      if (!cles.includes(c === '' ? '/' : c)) throw new Error('550 ' + c);
      return arbre[c === '' ? '/' : c];
    }
  };
}
const D = n => ({ name: n, dir: true, path: '' });
// Construit un arbre a partir d'une liste de chemins.
function arbreDe(chemins) {
  const a = {};
  const ajouter = p => { if (!a[p]) a[p] = []; };
  ajouter('/');
  for (const p of chemins) {
    const seg = p.split('/').filter(Boolean);
    let cur = '';
    for (let i = 0; i < seg.length; i++) {
      const parent = cur || '/';
      cur = cur + '/' + seg[i];
      ajouter(cur);
      const nom = seg[i];
      if (!a[parent].some(e => e.name === nom)) {
        const estDossier = i < seg.length - 1 || p.endsWith('/');
        a[parent].push({ name: nom, dir: estDossier, path: cur });
      }
    }
  }
  return a;
}

test('les quatre categories viennent du depot officiel', () => {
  // AuroraRepo/Repos.ini : ce sont SES chemins, pas les notres.
  const rel = Object.fromEntries(A.CATEGORIES.map(c => [c.id, c.rel]));
  assert.strictEqual(rel.utility, 'User\\Scripts\\Utility');
  assert.strictEqual(rel.filters, 'User\\Scripts\\Content\\Filters');
  assert.strictEqual(rel.sorts, 'User\\Scripts\\Content\\Sorts');
  assert.strictEqual(rel.subtitles, 'User\\Scripts\\Content\\Subtitles');
  // Un filtre et un tri obligent Aurora a redemarrer ; un utilitaire non.
  assert.strictEqual(A.parId('filters').reload, true);
  assert.strictEqual(A.parId('utility').reload, false);
  assert.strictEqual(A.parId('utility').refresh, true);
});

test('segments : le chemin relatif se decoupe pour un disque comme pour le FTP', () => {
  assert.deepStrictEqual(A.segments('User\\Scripts\\Utility'), ['User', 'Scripts', 'Utility']);
  assert.deepStrictEqual(A.segments('User/Scripts/Content/Filters'), ['User', 'Scripts', 'Content', 'Filters']);
});

test('console : Aurora est trouve et ses quatre dossiers sont rapportes', () => {
  const ftp = fauxFtp(arbreDe([
    '/Game/', '/Game/Aurora.xex', '/Game/User/', '/Game/User/Scripts/',
    '/Game/User/Scripts/Utility/', '/Game/User/Scripts/Utility/a.lua',
    '/Game/User/Scripts/Content/', '/Game/User/Scripts/Content/Filters/', '/Game/User/Scripts/Content/Filters/b.lua'
  ]));
  return A.trouverConsole(ftp).then(r => {
    assert.strictEqual(r.trouve, true);
    assert.strictEqual(r.choisi.dossier, '/Game');
    assert.strictEqual(r.choisi.categories.utility.chemin, '/Game/User/Scripts/Utility');
    assert.strictEqual(r.choisi.categories.utility.entrees, 1);
    assert.strictEqual(r.choisi.categories.filters.entrees, 1);
    // Un dossier de categorie ABSENT est rapporte comme tel, pas invente.
    assert.strictEqual(r.choisi.categories.sorts.entrees, null);
  });
});

test('console : sans Aurora.xex, on REFUSE et on dit ce qu on a vu', () => {
  // C'est le cas d'une console ou Aurora est ailleurs, ou pas installe : ecrire
  // dans Game:\User\Scripts y creerait un dossier que personne ne lit.
  const ftp = fauxFtp(arbreDe(['/Usb0/', '/Usb0/Games/', '/Game/', '/Game/Data/']));
  return A.trouverConsole(ftp).then(r => {
    assert.strictEqual(r.trouve, false);
    assert.match(r.raison, /Aurora\.xex/);
    assert.deepStrictEqual(r.racine.sort(), ['/Game', '/Usb0'], 'on rend ce qu on a vu, pour que l utilisateur juge');
  });
});

test('console : deux installations, une seule utilisable -> elle est choisie', () => {
  // Sur la console de l'utilisateur il y avait DEUX installations d'Aurora. Si
  // une seule contient deja des scripts, c'est elle — l'autre n'est pas une
  // destination, Aurora n'y lit rien.
  const ftp = fauxFtp(arbreDe([
    '/Usb0/', '/Usb0/Aurora/', '/Usb0/Aurora/Aurora.xex',
    '/Game/', '/Game/Aurora.xex', '/Game/User/', '/Game/User/Scripts/', '/Game/User/Scripts/Utility/', '/Game/User/Scripts/Utility/x.lua'
  ]));
  return A.trouverConsole(ftp).then(r => {
    assert.strictEqual(r.trouve, true);
    assert.strictEqual(r.installs.length, 2, 'les deux sont rapportees');
    assert.strictEqual(r.ambigu, false);
    assert.strictEqual(r.choisi.dossier, '/Game', 'celle qui a deja un User\\Scripts');
  });
});

test('console : deux installations UTILISABLES -> on ne choisit pas', () => {
  // C'est le cas reel : /Game et /Usb0/Aurora contiennent tous deux des scripts,
  // et rien ne dit laquelle la console demarre. Envoyer dans la mauvaise donne un
  // script qui ne se charge jamais, sans que rien ne le signale.
  const arbre = [
    '/Usb0/', '/Usb0/Aurora/', '/Usb0/Aurora/Aurora.xex',
    '/Usb0/Aurora/User/Scripts/Utility/', '/Usb0/Aurora/User/Scripts/Utility/a.lua',
    '/Game/', '/Game/Aurora.xex', '/Game/User/Scripts/Utility/', '/Game/User/Scripts/Utility/b.lua'
  ];
  return A.trouverConsole(fauxFtp(arbreDe(arbre))).then(r => {
    assert.strictEqual(r.trouve, true);
    assert.strictEqual(r.ambigu, true, 'on doit S ARRETER');
    assert.strictEqual(r.choisi, null, 'aucune destination n est choisie');
    assert.deepStrictEqual(r.candidats.sort(), ['/Game', '/Usb0/Aurora']);
    assert.match(r.raison, /2 installations/);
  }).then(() => {
    // ...et une racine DECLAREE leve l'ambiguite : l'utilisateur a tranche.
    return A.trouverConsole(fauxFtp(arbreDe(arbre)), '/Game');
  }).then(r => {
    assert.strictEqual(r.ambigu, false);
    assert.strictEqual(r.choisi.dossier, '/Game');
  });
});

test('console : une racine declaree est essayee en premier', () => {
  const ftp = fauxFtp(arbreDe(['/Perso/', '/Perso/Aurora.xex', '/Perso/User/Scripts/Utility/']));
  return A.trouverConsole(ftp, '/Perso').then(r => {
    assert.strictEqual(r.trouve, true);
    assert.strictEqual(r.choisi.dossier, '/Perso');
  });
});

test('local : le disque branche sur le PC est reconnu pareil', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-'));
  fs.writeFileSync(path.join(d, 'Aurora.xex'), '');
  fs.mkdirSync(path.join(d, 'User', 'Scripts', 'Utility'), { recursive: true });
  fs.writeFileSync(path.join(d, 'User', 'Scripts', 'Utility', 'a.lua'), '');
  const r = A.trouverLocal([d]);
  assert.strictEqual(r.trouve, true);
  assert.strictEqual(r.choisi.dossier, d);
  assert.strictEqual(r.choisi.categories.utility.entrees, 1);
  assert.strictEqual(r.choisi.categories.filters.entrees, null);
  fs.rmSync(d, { recursive: true, force: true });

  const vide = fs.mkdtempSync(path.join(os.tmpdir(), 'pasaurora-'));
  assert.strictEqual(A.trouverLocal([vide]).trouve, false);
  assert.strictEqual(A.trouverLocal([]).trouve, false);
  fs.rmSync(vide, { recursive: true, force: true });
});

test('un utilitaire part en DOSSIER, jamais en archive', () => {
  // Aurora installe un utilitaire en l'EXTRRAYANT vers
  // `Game:\User\Scripts\Utility\<NomDuDossier>\` — c'est ce que fait
  // `HandleZipInstall` dans AuroraRepo/Main.lua. Envoyer le `.7z` lui-meme
  // laisserait une archive que personne n'ouvre : l'application aurait dit
  // « installé » et le script n'apparaitrait jamais sur la console.
  // C'est le bug qui a ete corrige, et ce test l'empeche de revenir.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const bloc = /u\.pathname === '\/api\/ascripts\/install'[\s\S]*?\n    \}\);/.exec(srv);
  assert.ok(bloc, 'la route d installation doit exister');
  const src = bloc[0];
  assert.match(src, /runTool\('7z'/, 'l archive doit etre EXTRAITE');
  assert.match(src, /aEnvoyer/, 'c est le dossier extrait qu on envoie');
  assert.match(src, /dossier: !!b\.archive/, 'le client doit savoir que c est un dossier');
  // La destination DISTANTE ne doit jamais porter l extension de l archive.
  // (Le chemin LOCAL, lui, la porte : c est le fichier telecharge.)
  // On isole l affectation de `distant` : une regex sur `joinFtp\([^)]*`
  // s arretait au premier `)` de `String(b.cat)` et ne voyait rien.
  const ligne = /distant\s*=\s*joinFtp\([^;]+;/.exec(src);
  assert.ok(ligne, 'la destination doit etre calculee');
  assert.ok(!/\.7z/.test(ligne[0]),
    'la destination distante ne doit pas etre le .7z lui-meme : ' + ligne[0].trim());
  assert.match(ligne[0], /joinFtp\(/, 'la destination se construit sur la racine de la categorie');
});

// --- LA DESTINATION REELLE --------------------------------------------------
// L'application TROUVAIT l'installation et ne s'en servait jamais pour ecrire :
// le seul endroit ou un script atterrissait etait <depot>/Aurora-Scripts/. Et
// l'ecran annoncait un chemin CONSTANT (« /Game/User/Scripts/Utility ») qui ne
// correspondait ni au disque ni a l'envoi reel.

const catDe = (dossier, n, id = 'utility') => ({
  dossier,
  categories: { [id]: { chemin: dossier.replace(/\\+$/, '') + (dossier.includes('/') ? '/User/Scripts/Utility' : '\\User\\Scripts\\Utility'), entrees: n } }
});

test('destination : le DISQUE d abord, la console en secours', () => {
  // 1. une installation sur le disque : c'est elle
  let d = A.destination({ disque: { installs: [catDe('E:\\Aurora', 7)] }, catId: 'utility' });
  assert.strictEqual(d.ou, 'disque');
  assert.match(d.chemin, /Aurora/);
  // le disque gagne MEME si la console repond : la cle EST le support de la console,
  // donc y ecrire EST installer — sans reseau, sans transfert partiel, console eteinte
  d = A.destination({
    disque: { installs: [catDe('E:\\Aurora', 7)] },
    console: { trouve: true, choisi: catDe('/Game', 3) }, catId: 'utility'
  });
  assert.strictEqual(d.ou, 'disque', 'le disque doit gagner sur la console');
  // 2. pas de disque, mais une console qui repond : la console
  d = A.destination({
    disque: { installs: [] },
    console: { trouve: true, choisi: catDe('/Game', 3) }, catId: 'utility'
  });
  assert.strictEqual(d.ou, 'console');
  assert.strictEqual(d.chemin, '/Game/User/Scripts/Utility');
});

test('destination : on REFUSE au lieu de planter quand rien n est decidable', () => {
  // `choisi` vaut null des que DEUX installations sont utilisables — contrat
  // verifie plus haut. Le site d'appel dereferencait `choisi.categories` et levait
  // un TypeError : l'installation echouait sans rien expliquer.
  const c = A.destination({
    disque: { installs: [] },
    console: { trouve: true, choisi: null, ambigu: true, candidats: ['/Game', '/Usb0/Aurora'] },
    catId: 'utility'
  });
  assert.strictEqual(c.ou, null);
  assert.match(c.raison, /Game|Usb0/, 'la raison doit nommer les candidats : ' + c.raison);
  // rien du tout : on refuse aussi, en disant pourquoi
  const vide = A.destination({ disque: { installs: [] }, console: { trouve: false, raison: 'aucune console connectee' }, catId: 'utility' });
  assert.strictEqual(vide.ou, null);
  assert.ok(vide.raison.length > 10, 'un refus doit dire pourquoi');
  // categorie inconnue : refuse, jamais une exception
  assert.strictEqual(A.destination({ disque: { installs: [] }, catId: 'zzz' }).ou, null);
  // et jamais d'exception, quelle que soit l'entree
  for (const mauvais of [undefined, {}, { disque: null }, { disque: { installs: [{}] }, catId: 'utility' }]) {
    assert.doesNotThrow(() => A.destination(mauvais), 'entree : ' + JSON.stringify(mauvais));
  }
});

test('local : une installation IMBRIQUEE sous un nom qui ne dit rien est trouvee', () => {
  // La disposition que decrit le commentaire du module : « Usb0/Aurora ». Le cote
  // CONSOLE descend dedans ; le cote DISQUE s'arretait au nom du niveau 1 — et
  // « Usb0 » ne dit rien. Les deux cotes doivent voir la MEME chose : sinon le
  // disque ne marque rien comme installe alors que la console le voit.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'imbrique-'));
  const inst = path.join(d, 'Usb0', 'Aurora');
  fs.mkdirSync(path.join(inst, 'User', 'Scripts', 'Utility'), { recursive: true });
  fs.writeFileSync(path.join(inst, 'Aurora.xex'), 'x');
  const r = A.trouverLocal([d]);
  assert.strictEqual(r.trouve, true, 'l installation imbriquee doit etre trouvee');
  assert.strictEqual(r.installs.length, 1);
  fs.rmSync(d, { recursive: true, force: true });
});

test('le catalogue n annonce plus une destination codee en dur', () => {
  // `/api/ascripts` portait `ftp: repo.ftp`, soit « /Game/User/Scripts/Utility »
  // pour TOUT LE MONDE. L'ecran affichait « Destination : /Game/... » alors que la
  // seule installation trouvee etait E:\Aurora et que l'envoi visait un troisieme
  // chemin, calcule. Un chemin CONSTANT n'est pas une destination.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(!/ftp:\s*repo\.ftp/.test(srv),
    'le catalogue ne doit pas transporter un chemin fixe comme destination');
});

test('installer un script ECRIT dans l installation trouvee, pas seulement dans le depot', () => {
  // L'application TROUVAIT l'installation (E:\Aurora, ses 7 utilitaires, ses 5
  // filtres) et ne s'en servait JAMAIS pour ecrire : le seul endroit ou un script
  // atterrissait etait <depot>/Aurora-Scripts/. Un script telecharge sans console
  // partait donc dans le depot, a deplacer a la main.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const i = srv.indexOf("u.pathname === '/api/ascripts/install'");
  assert.ok(i > 0, 'la route doit exister');
  // On decoupe jusqu'a la ROUTE SUIVANTE, pas sur un nombre de caracteres : une
  // fenetre fixe rate la fin du gestionnaire des qu'on ajoute du code devant, et
  // le garde-fou devient rouge pour une raison qui n'a rien a voir.
  const fin = srv.indexOf('if (u.pathname ===', i + 40);
  const src = srv.slice(i, fin > 0 ? fin : i + 12000);
  // la destination est DECIDEE par la fonction unique, pas recalculee a la main
  assert.match(src, /Ascripts\.destination\(/, 'la destination doit venir de destination()');
  // elle est ECRITE sur le disque quand il y a une installation locale
  assert.match(src, /dest\.ou === 'disque'/, 'le disque doit etre traite en premier');
  assert.match(src, /fs\.cpSync\(aEnvoyer, pose/, 'le script doit etre COPIE a l endroit trouve');
  assert.match(src, /path\.join\(dest\.chemin, nom\)/, 'la cible est le dossier de la categorie + le nom');
  // et on REFUSE en disant pourquoi quand rien n'est decidable, au lieu de planter
  assert.match(src, /refuse: true/, 'un refus doit etre explicite');
  assert.ok(!/dest\.choisi\.categories/.test(src),
    'ne JAMAIS dereferencer choisi : il vaut null quand deux installations sont utilisables');
});
