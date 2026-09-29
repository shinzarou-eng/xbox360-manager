// LES JEUX XBOX 1 VUS DEPUIS CE PC.
//
// Le diagnostic Xbox 1 ne lisait que la console, par FTP : un disque local plein
// de jeux Xbox 1 restait invisible, et la bibliotheque n'en affichait aucun. Ce
// module-ci lit les disques du PC.
//
// LA REGLE DE RECONNAISSANCE N'EST PAS REECRITE ICI. C'est `estUnJeuXbox1` de
// `lib/xbox1.js` — celle du diagnostic de la console. Deux regles ecrites a deux
// endroits divergeraient : l'une accepterait la casse, l'autre non, et l'on
// afficherait des jeux 360 comme des jeux Xbox 1 sans que rien ne le signale.
//
// Le banc FABRIQUE ses arborescences (aucun jeu Xbox 1 n'est atteignable sur cette
// machine : `E:` n'est pas monte, et `default.xbe` n'existe ni sur `D:` ni sur
// `H:`). Ce fichier prouve donc la regle et la lecture, pas le cas reel.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const L = require('../lib/xbox1-local');
const X = require('../lib/xbox1');

// Une arborescence fabriquee, decrite par la liste de ses FICHIERS : les dossiers
// intermediaires se creent tout seuls.
function banc(fichiers) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'x360-x1-'));
  for (const f of fichiers) {
    const p = path.join(racine, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'x');
  }
  return { racine, fin: () => fs.rmSync(racine, { recursive: true, force: true }) };
}

// Le dossier de jeux du banc, sous sa forme « racine ».
const jeuxDe = (b, sous) => path.join(b.racine, sous || 'Games');

test('xbox1 local : un dossier avec default.xbe est un jeu, un default.xex NON', () => {
  // Le piege de tout ce chantier : les deux sont des dossiers avec un
  // « default.* » dedans. Les confondre afficherait des jeux Xbox 360 dans la
  // liste Xbox 1 — et, pire, rangerait un jeu 360 dans le pipeline Xbox 1.
  const b = banc([
    'Games/Halo/default.xbe',
    'Games/Halo/Media/asset.bin',
    'Games/Forza/default.xex',
    'Games/lisezmoi.txt',
  ]);
  try {
    const jeux = L.jeuxXbox1([jeuxDe(b)], { taille: () => 42 });
    assert.deepStrictEqual(jeux.map(j => j.name), ['Halo']);
    const h = jeux[0];
    // La forme attendue par la bibliotheque : le MEME vocabulaire que le
    // catalogue (`format` porte le type, et c'est lui que la pastille affiche).
    assert.strictEqual(h.format, 'Xbox1');
    // PAS de TitleID : un jeu Xbox 1 n'en a pas. C'est ce qui le tient a l'ecart
    // de tout ce qui se conduit par le TitleID (DLC, mises a jour, jaquettes,
    // et surtout la conversion ISO->GOD, qui ne doit jamais le concerner).
    assert.strictEqual(h.tid, '-');
    assert.strictEqual(h.path, path.join(jeuxDe(b), 'Halo'));
    assert.strictEqual(h.size, 42);
  } finally { b.fin(); }
});

test('xbox1 local : la casse non plus ne fait pas la difference', () => {
  const b = banc(['Games/Conker/DEFAULT.XBE', 'Games/Panzer/default.XBE']);
  try {
    assert.deepStrictEqual(L.jeuxXbox1([jeuxDe(b)]).map(j => j.name).sort(), ['Conker', 'Panzer']);
  } finally { b.fin(); }
});

test('xbox1 local : un fichier a la racine n est pas un jeu, un DOSSIER l est', () => {
  // La racine de jeux elle-meme n'est pas un jeu : seuls ses sous-dossiers le
  // sont. Sinon un `default.xbe` pose dans `Games\` ferait de « Games » un jeu.
  const b = banc(['Games/default.xbe', 'Games/Halo/default.xbe']);
  try {
    assert.deepStrictEqual(L.jeuxXbox1([jeuxDe(b)]).map(j => j.name), ['Halo']);
  } finally { b.fin(); }
});

test('xbox1 local : une racine absente ne leve pas et ne rend rien', () => {
  // `E:` n'est pas monte sur cette machine, et c'est le cas NORMAL quand un
  // disque est debranche. Un throw ici viderait toute la bibliotheque.
  assert.deepStrictEqual(L.jeuxXbox1([path.join(os.tmpdir(), 'x360-absent-' + process.pid)]), []);
  assert.deepStrictEqual(L.jeuxXbox1(null), []);
  assert.deepStrictEqual(L.jeuxXbox1([]), []);
});

test('xbox1 local : le meme dossier vu par deux racines n est compte qu UNE fois', () => {
  // `H:\Games` est a la fois le dossier configure ET une racine detectee a chaud :
  // sans dedoublement, un jeu compterait deux fois (le depot a deja paye ce piege
  // — 19 jeux affiches 38).
  const b = banc(['Games/Halo/default.xbe']);
  try {
    const deux = [jeuxDe(b), jeuxDe(b)];
    assert.strictEqual(L.jeuxXbox1(deux).length, 1);
    // Et la casse du chemin ne doit pas non plus fabriquer un doublon.
    assert.strictEqual(L.jeuxXbox1([jeuxDe(b), jeuxDe(b).toUpperCase()]).length, 1);
  } finally { b.fin(); }
});

test('xbox1 local : les dossiers « Xbox1 » et « Jeux Xbox 1 » sont aussi regardes', () => {
  // Memes noms que le diagnostic de la console (voir lib/xbox1.js) : les jeux
  // Xbox 1 y sont ranges a part. Les oublier rendrait invisibles les jeux d'un
  // utilisateur qui a suivi ce rangement.
  const b = banc([
    'Games/Halo/default.xbe',
    'Games/Xbox1/Conker/default.xbe',
    'Games/Jeux Xbox 1/Panzer/default.xbe',
  ]);
  try {
    assert.deepStrictEqual(L.racinesJeux(jeuxDe(b)).map(p => path.basename(p)),
      ['Games', 'Xbox1', 'Jeux Xbox 1']);
    assert.deepStrictEqual(L.jeuxXbox1(L.racinesJeux(jeuxDe(b))).map(j => j.name).sort(),
      ['Conker', 'Halo', 'Panzer']);
    // Ces deux noms viennent du domaine, pas d'une liste recopiee ici.
    assert.deepStrictEqual(X.DOSSIERS_JEUX, ['Xbox1', 'Jeux Xbox 1']);
  } finally { b.fin(); }
});

test('xbox1 local : deux jeux du meme nom sur deux disques restent deux jeux', () => {
  // Le dedoublement porte sur le CHEMIN, jamais sur le nom : deux disques
  // peuvent porter chacun leur copie, et les fondre en une seule entree ferait
  // disparaitre un jeu de l'ecran.
  const b = banc(['A/Halo/default.xbe', 'B/Halo/default.xbe']);
  try {
    const jeux = L.jeuxXbox1([path.join(b.racine, 'A'), path.join(b.racine, 'B')]);
    assert.strictEqual(jeux.length, 2);
    assert.deepStrictEqual(jeux.map(j => j.path).sort(),
      [path.join(b.racine, 'A', 'Halo'), path.join(b.racine, 'B', 'Halo')].sort());
  } finally { b.fin(); }
});

test('xbox1 local : le scan de la bibliotheque REUTILISE ce module', () => {
  // Un garde-fou de source, et il est volontaire : la regle « un jeu Xbox 1 est
  // un dossier avec default.xbe » ne doit exister qu'une fois. Si le scan se
  // remettait a tester `default.xbe` lui-meme (une expression reguliere de plus),
  // les deux regles divergeraient au premier cas limite — c'est exactement ce que
  // ce chantier evite.
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /Xbox1Local\.jeuxXbox1\(/, 'le scan doit appeler le module, pas reecrire la regle');
  // L'expression reguliere de la regle, elle, vit dans lib/xbox1.js. Le motif
  // cherche le POINT ECHAPPE : la prose du commentaire qui explique la regle
  // (« un dossier avec default.xbe dedans ») ne le porte pas, donc elle ne
  // declenche pas ce garde-fou — c'est le piege que ce depot a deja paye trois
  // fois avec des garde-fous qui lisaient du texte brut.
  assert.ok(!/default\\\.xbe/i.test(src), 'server.js ne doit pas reecrire la regle de detection');
});

// ---------- La partition de compatibilite -----------------------------------
// Un jeu Xbox 1 pose sur un disque ne demarre PAS sans l'emulateur, qui vit dans
// une partition a part. La console ne dit rien : elle ne lance simplement pas le
// jeu. C'est ce silence qui rend ce diagnostic necessaire.

test('xbox1 local : la partition se trouve a la racine d un disque, quelle que soit sa casse', () => {
  // La console monte `HddX` ; un disque prepare a la main peut porter `hddx`.
  // Chercher le seul nom exact ferait conclure « pas de partition » sur un disque
  // qui en a une — et enverrait l'utilisateur chercher un correctif inutile.
  const b = banc(['HddX/Compatibility/f1.bin', 'HddX/Compatibility/f2.bin']);
  try {
    const p = L.partitionHddX([b.racine]);
    assert.strictEqual(p.trouvee, true);
    assert.strictEqual(p.nom, 'HddX');
    assert.strictEqual(p.chemin, path.join(b.racine, 'HddX'));
    // Ce que `Xbox1.diagnostic` attend : les FICHIERS du dossier Compatibility.
    assert.deepStrictEqual(p.fichiers.sort(), ['f1.bin', 'f2.bin']);
  } finally { b.fin(); }

  const c = banc(['hddx/Compatibility/f1.bin']);
  try {
    const p = L.partitionHddX([c.racine]);
    assert.strictEqual(p.trouvee, true, 'la casse ne doit pas compter');
    assert.strictEqual(p.nom, 'hddx', 'et on dit le nom TROUVE, pas celui qu on attendait');
  } finally { c.fin(); }
});

test('xbox1 local : une partition absente ou vide n est pas la meme chose', () => {
  // « Pas de partition » se repare avec l'outil de partition ; « partition vide »
  // se repare en y copiant un paquet. Les confondre ferait chercher le mauvais
  // remede a quelqu'un qui a deja la partition.
  const sans = banc(['Games/Halo/default.xbe']);
  try {
    const p = L.partitionHddX([sans.racine]);
    assert.strictEqual(p.trouvee, false);
    assert.deepStrictEqual(p.fichiers, []);
    // Aucun disque lisible, aucun disque du tout : on ne leve pas.
    assert.strictEqual(L.partitionHddX([path.join(os.tmpdir(), 'x360-absent-' + process.pid)]).trouvee, false);
    assert.strictEqual(L.partitionHddX(null).trouvee, false);
  } finally { sans.fin(); }

  const vide = banc(['HddX/Compatibility/.keep']);
  try {
    const p = L.partitionHddX([vide.racine]);
    assert.strictEqual(p.trouvee, true, 'la partition existe');
    assert.deepStrictEqual(p.fichiers, ['.keep'], 'mais son contenu est ce qu il est');
  } finally { vide.fin(); }
});

// ---------- La carte du docteur ---------------------------------------------
// Les deux moities qui s'ignoraient : ce que les disques portent, et ce que la
// console exige. `T` est une DOUBLURE qui marque le francais : un libelle ecrit en
// dur ressort identique dans les deux rendus, et c'est ce que le test refuse (le
// defaut le plus difficile a voir, deja rencontre sur la fiche du jeu).
const marque = (fr) => '\u00ab' + fr + '\u00bb';
const Tm = (fr) => marque(fr);

test('xbox1 local : sans partition, le docteur NOMME le jeu et donne le remede', () => {
  const jeux = [{ name: 'Halo', format: 'Xbox1' }, { name: 'Conker', format: 'Xbox1' }];
  const c = L.carteCompatibilite(Tm, { jeux, partition: { trouvee: false, fichiers: [] } });
  assert.ok(c, 'il y a de quoi alerter : deux jeux qui ne demarreront pas');
  assert.strictEqual(c.sev, 'err', 'un jeu qui ne demarre pas n est pas une information');
  // Le compte ET les noms : « 2 jeux » sans les noms ne dit pas lesquels ranger.
  assert.match(c.title, /2/);
  assert.ok(c.detail.includes('Halo') && c.detail.includes('Conker'), 'les jeux concernes : ' + c.detail);
  // LE REMEDE VIENT DU MODULE, pas d'une phrase reinventee ici.
  assert.ok(c.detail.includes(X.CORRECTIF.nom), 'le correctif doit etre nomme : ' + c.detail);
  assert.ok(c.detail.includes(X.CORRECTIF.fichier), 'et son fichier : ' + c.detail);
  assert.match(c.detail, /SUR LA CONSOLE/, 'et le point bloquant : il se lance sur la console');
  // Le nom de la partition vient du module : les recopier ferait deux sources.
  assert.ok(c.detail.includes(X.PARTITION), 'la partition est nommee : ' + c.detail);
  // Et chaque libelle passe par T() : rien n'est ecrit en dur. La doublure marque
  // le francais, donc un libelle ecrit en dur ressort SANS marque au milieu du
  // reste — c'est ce que la deuxieme assertion refuse. Le titre porte le compte
  // HORS de l'appel (le fragment francais commence par son espace, comme partout
  // dans ce depot : `n + T(' fichier(s) ...')`).
  assert.match(c.title, /^\d+\u00ab .*\u00bb$/, 'titre ecrit en dur : ' + c.title);
  assert.ok(!/\u00ab/.test(c.detail.replace(/\u00ab[^\u00bb]*\u00bb/g, '')), 'libelle hors T() : ' + c.detail);
});

test('xbox1 local : partition vide, le remede n est PAS l outil de partition', () => {
  // Envoyer chercher le correctif de partition a quelqu'un qui l'a deja lui ferait
  // perdre une soiree, et il ne comprendrait pas pourquoi rien ne change.
  const jeux = [{ name: 'Panzer Dragoon', format: 'Xbox1' }];
  const c = L.carteCompatibilite(Tm, { jeux, partition: { trouvee: true, fichiers: [] } });
  assert.ok(c, 'partition vide : les jeux ne demarreront pas non plus');
  assert.ok(!c.detail.includes(X.CORRECTIF.fichier), 'surtout PAS l outil de partition : ' + c.detail);
  assert.ok(c.detail.includes(X.PAQUETS[0].nom), 'on nomme le paquet a copier : ' + c.detail);
  assert.ok(c.detail.includes(String(X.FICHIERS_ATTENDUS)), 'et ce qu il faut y mettre : ' + c.detail);
});

test('xbox1 local : tout est en place, le docteur se TAIT', () => {
  // Un docteur qui parle quand tout va bien finit par etre ignore — et c'est
  // exactement quand il se taira a tort qu'on ne le lira pas.
  const jeux = [{ name: 'Halo', format: 'Xbox1' }];
  const complet = L.carteCompatibilite(Tm, {
    jeux, partition: { trouvee: true, fichiers: new Array(X.FICHIERS_ATTENDUS).fill('x') }
  });
  assert.strictEqual(complet, null, 'emulateur complet : rien a dire');
  // Et sans jeu Xbox 1, l'absence d'emulateur ne regarde personne.
  assert.strictEqual(L.carteCompatibilite(Tm, { jeux: [], partition: { trouvee: false, fichiers: [] } }), null);
  assert.strictEqual(L.carteCompatibilite(Tm, {}), null);
  assert.strictEqual(L.carteCompatibilite(Tm, null), null);
});

test('xbox1 local : l etat vient du MODULE, pas d une deuxieme regle', () => {
  // Le jour ou `lib/xbox1.js` change sa regle d'etat, la carte doit suivre. On
  // l'eprouve sur l'etat qui separe les deux remedes : partition presente et
  // installee = silence.
  const jeux = [{ name: 'Halo', format: 'Xbox1' }];
  for (const n of [1, 7, X.FICHIERS_ATTENDUS - 1]) {
    const c = L.carteCompatibilite(Tm, { jeux, partition: { trouvee: true, fichiers: new Array(n).fill('x') } });
    assert.strictEqual(c, null, 'emulateur present (' + n + ' fichiers) : la carte se tait');
  }
  // Une installation INCOMPLETE n'est pas un blocage : le module dit « un jeu peut
  // echouer », pas « les jeux ne demarrent pas ». On ne crie donc pas au loup.
  const d = X.diagnostic({ partitionExiste: true, fichiers: new Array(7).fill('x'), dossiersJeux: ['Halo'] });
  assert.strictEqual(d.emulateurInstalle, true, 'c est bien ce que dit le module');
});
