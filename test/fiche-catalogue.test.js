// LA FICHE DU JEU — la colonne gauche de la surcouche de telechargement.
//
// Demande de l'utilisateur, mot pour mot : « dans catalogue cliquer sur un jeu
// ouvre donc la zone pour telecharger mais a gauche la jaquette du jeu avec
// explication et le style du jeu ». Le dessin retenu n'invente RIEN : la source
// du catalogue (XboxUnity) ne publie ni description ni genre, donc la fiche
// montre ce que l'application sait deja et dit noir sur blanc ce que la source
// ne publie pas.
//
// Deux choses se mesurent ici, et aucune ne se voit a l'oeil dans le code :
//
//  1. CHAQUE LIBELLE PASSE PAR `T()`. Un libelle ecrit en dur est juste en
//     francais et faux dans les trois autres langues, anglais compris : c'est le
//     defaut le plus difficile a voir, et `test/i18n.test.js` ne peut pas le
//     voir non plus — il verifie que les chaines DE `T()` sont traduites, pas
//     que la fiche en utilise. On rend donc la fiche DEUX fois, avec deux
//     doublures de `T()` : une qui rend l'anglais, une qui MARQUE le francais.
//     Un libelle qui traverse `T()` ressort marque ; un libelle ecrit en dur
//     ressort identique dans les deux rendus, et c'est ce que le test refuse.
//
//  2. « DANS TA BIBLIOTHEQUE » SE DECIDE PAR LE TITLEID, SUR TOUTE LA
//     BIBLIOTHEQUE. Comparer au tableau `games` du client ne couvrirait que le
//     disque selectionne : un jeu installe sur l'autre disque serait annonce
//     absent, et la phrase serait FAUSSE. La requete doit donc etre `/api/games`
//     SANS parametre `drive` — c'est `scanDriveCached()`, la bibliotheque
//     entiere, cachee cote serveur. Le banc mesure l'URL demandee, pas
//     l'intention.
//
// Le banc EVALUE le bloc extrait de `public/app.js` (meme methode que
// `test/dl-resultats.test.js`) : le DOM et le reseau sont des doublures, et
// c'est le test qui decide qui repond, et quand.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const inline = fs.readFileSync(path.join(RACINE, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(RACINE, 'public', 'style.css'), 'utf8');
const { DICT_ES, DICT_PT } = require('../public/i18n.js');

// Le bloc va de son en-tete de section jusqu'au bloc Pertinence, qui le suit :
// les reperes sont les memes que ceux du fichier, donc un deplacement du bloc
// fait echouer ce test au lieu de le rendre muet.
const dFiche = inline.indexOf('// ---------- Fiche du jeu');
const fFiche = inline.indexOf('// ---------- Pertinence');
assert.ok(dFiche > 0 && fFiche > dFiche,
  'le bloc de la fiche doit etre trouvable dans app.js (entre son en-tete et le bloc Pertinence)');
const bloc = inline.slice(dFiche, fFiche);
assert.ok(/function ficheLignes/.test(bloc) && /async function dlmFiche/.test(bloc),
  'le bloc extrait doit contenir la fiche et son rendu');

// LA FICHE DIT MAINTENANT COMBIEN DE GALETTES SONT INSTALLEES (« 1 disque sur 2
// installe »), donc elle appelle le bloc « Disques » — qui vit PLUS HAUT dans le
// fichier, parce que la liste des fichiers s'en sert aussi. On evalue les deux
// blocs ensemble : sans cela, `ficheLignes` levait un `ReferenceError` que le
// banc transformait en rejet de promesse, et cinq tests de ce fichier sont
// tombes pour une raison qui n'avait rien a voir avec ce qu'ils mesurent.
const dGal = inline.indexOf('// ---------- Disques');
const fGal = inline.indexOf('// ---------- Fin disques');
assert.ok(dGal > 0 && fGal > dGal,
  'le bloc « Disques » doit etre trouvable dans app.js (la fiche en depend)');
const blocGal = inline.slice(dGal, fGal);

// LE CHEMIN COMPLET, DU CLIC AU CONTENU DE LA FICHE. Tous les autres tests de ce
// fichier appellent `dlmFiche` / `ficheHtml` DIRECTEMENT : ils prouvent que la
// fiche sait afficher un item, jamais qu'elle en RECOIT un. Supprimer `,jsA(c)`
// de `public/app.js` (le troisieme argument d'`openDlModal`, pose par `catRow`)
// les laissait donc tous verts alors que la fiche perdait le Type, les TU, les
// jaquettes cataloguees et le dernier contenu — c'est-a-dire la moitie visible du
// travail. On evalue ici les TROIS fonctions du fichier (`catRow`, `openDlModal`,
// `dlmFiche`) dans le meme banc : aucune de leurs lignes n'est reecrite ici, et
// l'invariant verifie est « l'item du catalogue arrive jusqu'a la fiche ».
const dCat = inline.indexOf('function catRow(c){');
assert.ok(dCat > 0 && dCat < fFiche, 'catRow doit etre trouve avant le bloc de la fiche');
const blocCat = inline.slice(dCat, fFiche);
assert.ok(/function catRow/.test(blocCat) && /async function openDlModal/.test(blocCat),
  'le bloc extrait doit contenir le constructeur de ligne ET la porte de la surcouche');

// Le banc COMPLET : memes doublures que `banc()`, plus celles qu'appelle
// `openDlModal`. `escH`/`escA`/`jsA` sont ceux du fichier, recopies tels quels :
// c'est `escA` qui transforme les guillemets de `jsA` en `&quot;` DANS l'attribut
// `onclick` — un banc qui ne les encoderait pas lirait un HTML que le navigateur
// ne produit jamais.
function bancComplet() {
  const els = {};
  const el = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '' });
  const enVol = [];
  const escH = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const escA = s => escH(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const faux = {
    $: el,
    api: url => new Promise((res, rej) => { enVol.push({ url, res, rej }); }),
    T: (fr, en) => en,
    escH,
    escA,
    jsA: v => escA(JSON.stringify(v === undefined ? null : v)),
    fmt: b => b + ' o',
    copierTid: () => {},
    enTete: () => 'Libelle',
    ouvrirSurcouche: () => {},
    dlmSearch: () => {}
  };
  const fabrique = new Function(...Object.keys(faux), blocCat + '\n' + blocGal + `
    return { catRow, openDlModal, dlmFiche, ficheLignes, ficheHtml };`);
  return Object.assign(fabrique(...Object.values(faux)), { el, enVol });
}

// Le navigateur DECODE les entites d'un attribut avant de compiler son code.
const decodes = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// L'item tel que `catRow` le passe : `type`, `updates`, `covers` et `newest`
// viennent de la reponse `/api/unity` DEJA recue pour la ligne du catalogue.
const JEU = {
  tid: '4D5307E6', name: 'Halo 3', kind: 'GOD', type: '360',
  updates: 11, covers: 28, newest: '2026-02-12'
};

function banc() {
  const els = {};
  const el = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '' });
  const enVol = [];
  const copies = [];
  let mode = 'en';
  const faux = {
    $: el,
    // Aucune requete ne part toute seule : elle est MISE EN ATTENTE, et c'est le
    // test qui choisit la reponse, son moment, et son succes ou son echec.
    api: url => new Promise((res, rej) => { enVol.push({ url, res, rej }); }),
    T: (fr, en) => (mode === 'marque' ? '\u00ab' + fr + '\u00bb' : en),
    escH: s => String(s == null ? '' : s),
    escA: s => String(s == null ? '' : s),
    jsA: v => JSON.stringify(v === undefined ? null : v),
    fmt: b => b + ' o',
    copierTid: tid => { copies.push(tid); }
  };
  const fabrique = new Function(...Object.keys(faux), bloc + '\n' + blocGal + `
    return { ficheLignes, ficheHtml, ficheBiblio, disqueDe, dlmFiche, copierTidFiche };`);
  const out = fabrique(...Object.values(faux));
  return Object.assign(out, {
    el, enVol, copies,
    marque() { mode = 'marque'; },
    anglais() { mode = 'en'; },
    // Repond a la requete en vol d'indice i. Les indices bougent a chaque
    // reponse : on les lit sur `enVol`, jamais en memoire.
    repondre(i, donnees) {
      assert.ok(enVol[i], 'aucune requete en vol a l indice ' + i);
      const r = enVol.splice(i, 1)[0];
      r.res(donnees);
      return r.url;
    }
  });
}

const ligne = (lignes, k) => lignes.find(l => l.k === k);

test('fiche : chaque libelle passe par T(), et chaque chaine anglaise est traduite', () => {
  const b = banc();
  // 1. LE RENDU MARQUE. Tout ce qui traverse `T()` ressort entre guillemets
  //    francais ; ce qui ne les porte pas a ete ecrit en dur.
  b.marque();
  const marquees = b.ficheLignes(JEU, { etat: 'absent' });
  for (const l of marquees) {
    assert.match(l.k, /^\u00ab.*\u00bb$/, 'libelle ecrit en dur (il ne passe pas par T()) : ' + JSON.stringify(l.k));
  }
  assert.match(ligne(marquees, '\u00abGenre\u00bb').v, /^\u00ab.*\u00bb$/,
    'la phrase du genre passe par T() elle aussi');

  // 2. LE RENDU ANGLAIS : la liste attendue, dans l'ordre. Une ligne ajoutee
  //    sans son anglais fait donc echouer ce test, et pas seulement l'oeil.
  b.anglais();
  const en = b.ficheLignes(JEU, { etat: 'absent' });
  assert.deepStrictEqual(en.map(l => l.k),
    ['Type', 'TitleID', 'Title updates', 'Catalogued covers', 'Latest content', 'In your library', 'Genre'],
    'les libelles de la fiche ont change : mettre ce test a jour AVEC le dictionnaire');

  // 3. ET CHAQUE CHAINE ANGLAISE A SON ESPAGNOL ET SON PORTUGAIS. L'extracteur de
  //    `test/i18n.test.js` voit ces chaines-la ; ce test-ci dit POURQUOI elles
  //    sont la, et refuse une fiche dont un libelle n'aurait jamais ete vu par
  //    l'i18n avant d'arriver jusqu'ici.
  const textes = [
    ...en.map(l => l.k),
    ligne(en, 'Genre').v,
    b.ficheLignes(JEU, { etat: 'panne' }).find(l => l.k === 'In your library').v
  ];
  for (const t of textes) {
    assert.ok(DICT_ES[t], 'sans espagnol : ' + JSON.stringify(t));
    assert.ok(DICT_PT[t], 'sans portugais : ' + JSON.stringify(t));
  }
});

test('fiche : les lignes viennent de l item du catalogue, sans requete de plus', () => {
  const b = banc();
  const l = b.ficheLignes(JEU, { etat: 'absent' });
  assert.strictEqual(ligne(l, 'Type').v, 'Xbox 360', 'TitleType « 360 » se lit Xbox 360');
  assert.strictEqual(ligne(l, 'TitleID').v, '4D5307E6');
  assert.strictEqual(ligne(l, 'Title updates').v, '11', 'les TU viennent de l item, pas d un appel TU');
  assert.strictEqual(ligne(l, 'Catalogued covers').v, '28');
  assert.strictEqual(ligne(l, 'Latest content').v, '2026-02-12');

  // LES DEUX AUTRES STYLES QUE LA SOURCE PUBLIE. `TitleType` vaut « XBLA » ou
  // « Xbox1 » sur de vrais titres (mesure sur TitleList.php) : ce sont les seules
  // valeurs de « style » qu'on ait le droit d'ecrire.
  assert.strictEqual(ligne(b.ficheLignes({ ...JEU, type: 'XBLA' }, null), 'Type').v, 'XBLA');
  assert.strictEqual(ligne(b.ficheLignes({ ...JEU, type: 'Xbox1' }, null), 'Type').v, 'Xbox 1');
  // Un item sans ces champs n'invente RIEN : pas de ligne plutot qu'un zero faux.
  const nu = b.ficheLignes({ tid: '584109B7', name: 'Sans type' }, { etat: 'absent' });
  assert.strictEqual(ligne(nu, 'Type'), undefined, 'aucun style connu : aucune ligne');
  assert.strictEqual(ligne(nu, 'Title updates'), undefined);
  assert.strictEqual(ligne(nu, 'Catalogued covers'), undefined);
  assert.strictEqual(ligne(nu, 'Latest content'), undefined);
  // ... mais la ligne du genre est TOUJOURS la : c'est la reponse a « le style ».
  assert.ok(ligne(nu, 'Genre'), 'la ligne Genre est toujours la');
});

test('fiche : le disque se lit dans le chemin, ou ne se dit pas', () => {
  const b = banc();
  assert.strictEqual(b.disqueDe('H:\\Games\\4D5307E6'), 'H:');
  assert.strictEqual(b.disqueDe('h:/games/x'), 'H:');
  assert.strictEqual(b.disqueDe('/media/usb/Games/Halo'), '', 'un chemin sans lettre ne rend rien');
  assert.strictEqual(b.disqueDe(''), '');
  assert.strictEqual(b.disqueDe(null), '');
});

test('fiche : une entree de la BIBLIOTHEQUE est lue avec le vocabulaire de la fiche', () => {
  // LA DEUXIEME MOITIE DU MEME VOCABULAIRE. Le scan des disques rend un jeu Xbox 1
  // avec `format: 'Xbox1'` — le mot sur lequel `FICHE_TYPE` s'appuie deja pour un
  // titre Xbox 1 du CATALOGUE. Une entree de la bibliotheque presentee a la fiche
  // doit donc porter le MEME libelle : sans cela il y aurait deux vocabulaires pour
  // un seul type, celui du catalogue et celui du disque.
  const b = banc();
  const halo = { name: 'Halo', tid: '-', format: 'Xbox1', path: 'H:\\Games\\Halo', size: 4096 };
  const l = b.ficheLignes(halo, { etat: 'absent' });
  assert.strictEqual(ligne(l, 'Type').v, 'Xbox 1', 'le libelle de la fiche');
  assert.ok(!/Xbox1/.test(ligne(l, 'Type').v), 'jamais le code technique');
  // Le format qui dit COMMENT le jeu est range n'est PAS un type : « Extrait » ne
  // doit pas se retrouver dans la ligne Type — ce serait une information fausse.
  const extrait = b.ficheLignes({ ...halo, format: 'Extrait' }, { etat: 'absent' });
  assert.strictEqual(ligne(extrait, 'Type'), undefined, 'un format de rangement n est pas un type');
  // Et la ligne du catalogue, elle, n'a pas bouge : c'est la MEME table.
  assert.strictEqual(ligne(b.ficheLignes({ ...JEU, type: 'Xbox1' }, null), 'Type').v, 'Xbox 1');
  // La ligne « Dans ta bibliotheque » garde le format de RANGEMENT ('GOD' dit
  // comment le jeu est installe) : c'est une autre information, et elle est
  // verifiee plus bas.
  const biblio = ligne(b.ficheLignes(JEU, { etat: 'trouve', jeu: { ...halo, format: 'GOD', path: 'H:\\Games\\4D5307E6' } }), 'In your library');
  assert.match(biblio.v, /GOD/, 'le rangement reste dit : ' + biblio.v);
});

test('fiche : « dans ta bibliotheque » se decide par le TitleID', () => {
  const b = banc();
  const liste = [
    { tid: '584109B7', name: 'Un XBLA', format: 'GOD', size: 100, path: 'H:\\Games\\584109B7' },
    { tid: '4D5307E6', name: 'Halo 3', format: 'GOD', size: 6442450944, path: 'H:\\Games\\4D5307E6' }
  ];
  const trouve = b.ficheBiblio(liste, '4d5307e6');
  assert.ok(trouve && trouve.name === 'Halo 3', 'le TitleID se compare sans tenir compte de la casse');

  // LE PIEGE QUE CETTE LIGNE EXISTE POUR FERMER : le jeu cherche est dans la
  // bibliotheque, mais sur un AUTRE disque que celui du selecteur. Le comparer
  // au tableau `games` du client (un seul disque) dirait « absent ».
  const autre = b.ficheBiblio([{ tid: '4D5307E6', name: 'Halo 3', path: 'G:\\Games\\4D5307E6' }], '4D5307E6');
  assert.ok(autre, 'un jeu present sur un autre disque EST dans la bibliotheque');

  assert.strictEqual(b.ficheBiblio(liste, '58410A00'), null);
  assert.strictEqual(b.ficheBiblio([{ tid: '-', name: 'rangee' }], '-'), null,
    'un tid « - » ne designe aucun jeu : il ne doit jamais repondre oui');
  assert.strictEqual(b.ficheBiblio(null, '4D5307E6'), null, 'une reponse vide ne doit pas lever');
});

test('fiche : la bibliotheque interrogee est ENTIERE (aucun parametre drive)', async () => {
  const b = banc();
  const p = b.dlmFiche(JEU);
  assert.strictEqual(b.enVol.length, 1, 'une seule requete : la bibliotheque');
  const url = b.enVol[0].url;
  // `?drive=H` ne couvrirait que le disque affiche par le selecteur : la phrase
  // serait fausse des qu'un jeu est installe ailleurs.
  assert.ok(!/[?&]drive=/.test(url),
    'la fiche doit interroger TOUTE la bibliotheque, pas le disque selectionne : ' + url);
  assert.strictEqual(url, '/api/games');
  b.repondre(0, [{ tid: '4D5307E6', name: 'Halo 3', format: 'GOD', size: 6442450944, path: 'H:\\Games\\4D5307E6' }]);
  await p;
  assert.match(b.el('dlmFiche').innerHTML, /Halo 3/);
});

test('fiche : les deux etats de la ligne bibliotheque sont distincts', async () => {
  const b = banc();
  const HALO = { tid: '4D5307E6', name: 'Halo 3', format: 'GOD', size: 6442450944, path: 'H:\\Games\\4D5307E6' };

  // PRESENT : disque, format, taille, et le chemin en sous-ligne.
  const p1 = b.dlmFiche(JEU);
  b.repondre(0, [HALO, { tid: '11111111', name: 'Autre' }]);
  await p1;
  const present = b.el('dlmFiche').innerHTML;
  assert.match(present, /H: · GOD · 6442450944 o/, 'disque, format et taille');
  assert.match(present, /H:\\Games\\4D5307E6/, 'le chemin est dit');
  assert.match(present, /fiche-sub/, 'le chemin est une sous-ligne de la meme rangee');

  // ABSENT : le TitleID n'est dans AUCUN jeu de la bibliotheque.
  b.el('dlmFiche').innerHTML = '';
  const p2 = b.dlmFiche({ tid: '58410A00', name: 'Titre absent', kind: 'XBLA' });
  b.repondre(0, [HALO]);
  await p2;
  const absent = b.el('dlmFiche').innerHTML;
  assert.match(absent, /no installed game carries this TitleID/);
  assert.notStrictEqual(absent, present, 'les deux etats doivent se distinguer a l ecran');

  // PANNE : la bibliotheque ne repond pas. On le DIT — laisser « ... » a l'ecran
  // ferait croire a une recherche sans fin, et un « absent » serait un mensonge.
  b.el('dlmFiche').innerHTML = '';
  const p3 = b.dlmFiche(JEU);
  b.enVol[0].rej(new Error('HTTP 500'));
  await p3;
  assert.match(b.el('dlmFiche').innerHTML, /Library unreachable/);
});

test('fiche : une reponse en retard ne reecrit pas la fiche d un autre jeu', async () => {
  const b = banc();
  const A = { tid: '4D5307E6', name: 'Halo 3', kind: 'GOD' };
  const B = { tid: '58410A00', name: 'Fiche B', kind: 'XBLA' };
  const pA = b.dlmFiche(A);                 // requete 0
  const pB = b.dlmFiche(B);                 // requete 1 : c'est elle qui fait foi
  assert.strictEqual(b.enVol.length, 2);
  b.repondre(1, [{ tid: '58410A00', name: 'Fiche B', format: 'GOD', size: 10, path: 'H:\\Games\\B' }]);
  await pB;
  b.repondre(0, [{ tid: '4D5307E6', name: 'Halo 3', format: 'GOD', size: 20, path: 'H:\\Games\\A' }]);
  await pA;                                  // arrive APRES : elle doit se taire
  assert.match(b.el('dlmFiche').innerHTML, /Fiche B/);
  assert.ok(!/Halo 3/.test(b.el('dlmFiche').innerHTML),
    'la reponse en retard du premier jeu a reecrit la fiche du second');
});

test('fiche : la jaquette manquante a un repli, et la boite garde sa place', () => {
  const b = banc();
  const html = b.ficheHtml(JEU, null);
  // `covErr` est le handler de jaquette cassee du depot : il remplace l'image par
  // un bloc visible. Sans lui, une image en erreur laisse un trou.
  assert.match(html, /onerror="covErr\(this,/, 'l image doit porter le repli de jaquette cassee');
  assert.match(html, /<span class="fiche-cov">[\s\S]*<\/span>/, 'l image vit dans sa boite');
  // LA BOITE GARDE SA PLACE : c'est elle qui empeche le trou, donc elle a une
  // largeur ET une hauteur fixes — la sonde ne peut pas le voir, un `onerror`
  // ne se declenche jamais dans une mesure.
  const regle = /\.fiche-cov\{([^}]*)\}/.exec(css);
  assert.ok(regle, 'la feuille doit fixer la boite de la jaquette (.fiche-cov)');
  assert.match(regle[1], /width:\s*\d+px/, 'la largeur de la boite est fixe');
  assert.match(regle[1], /height:\s*\d+px/, 'la hauteur de la boite est fixe');
  // Un jeu sans TitleID ne demande AUCUNE image : la route rendrait 404, et un
  // 404 par ligne n'est pas une facon de dire « je ne sais pas ».
  assert.ok(!/<img/.test(b.ficheHtml({ name: 'Sans tid' }, null)),
    'sans TitleID, aucune requete de jaquette');
});

test('fiche : le TitleID se copie avec le geste du catalogue, et le dit', () => {
  const b = banc();
  b.copierTidFiche('4D5307E6');
  assert.deepStrictEqual(b.copies, ['4D5307E6'], 'le meme geste que la ligne du catalogue');
  // Le compte rendu de `copierTid` va dans la barre du CATALOGUE, qui est cachee
  // par la surcouche : la fiche l'ecrit donc aussi la ou l'on regarde.
  assert.match(b.el('dlmStatus').textContent, /TitleID copied : 4D5307E6/);
});

test('fiche : /api/unity publie la date du dernier contenu', () => {
  // CE TEST-LA LIT LE TEXTE DU SERVEUR, et il faut le dire : il ne prouve pas que
  // la route REPOND `newest`, il prouve que la projection continue de la porter.
  // C'est la seule ligne que ce panneau a demandee au serveur, et rien d'autre ne
  // la garderait — un champ retire d'une projection ne casse aucun test, il
  // disparait seulement de l'ecran. Le champ existe bien dans la reponse reelle de
  // TitleList.php (`NewestContent`, mesure : « 2026-02-12 »).
  const srv = fs.readFileSync(path.join(RACINE, 'server.js'), 'utf8');
  const bloc = /u\.pathname === '\/api\/unity'[\s\S]*?\n    \}/.exec(srv);
  assert.ok(bloc, 'la route /api/unity doit exister dans server.js');
  assert.match(bloc[0], /newest:\s*t\.NewestContent/,
    'la projection de /api/unity doit porter la date du dernier contenu publie');
});

test('fiche : l item du catalogue arrive JUSQU A la fiche (catRow -> openDlModal -> dlmFiche)', () => {
  const b = bancComplet();
  const rangee = b.catRow(JEU);

  // 1. ON CLIQUE, on ne relit pas le code. Les deux appels de la ligne (la rangee
  //    entiere et son bouton « Telecharger ») sont EVALUES avec le vrai
  //    `openDlModal` du banc : le `onclick` est le seul chemin qui existe.
  const clics = [...rangee.matchAll(/onclick="([^"]*)"/g)].map(m => m[1])
    .filter(c => /openDlModal\(/.test(c));
  assert.ok(clics.length >= 2,
    'la rangee du catalogue et son bouton doivent ouvrir la surcouche (trouve ' + clics.length + ')');
  for (const c of clics) {
    new Function('openDlModal', 'event', 'copierTid', 'dlAlt', decodes(c))(
      b.openDlModal, { stopPropagation() {} }, () => {}, () => {});
  }

  // 2. CE QUI EST ARRIVE DANS LA COLONNE DE GAUCHE. La fiche se remplit AVANT la
  //    requete de bibliotheque (elle est posee puis relue), donc la lecture est
  //    immediate — et c'est bien la moitie visible qui est mesuree ici : le Type,
  //    les TU, les jaquettes cataloguees et le dernier contenu viennent de l'item
  //    du catalogue, pas d'un appel de plus.
  const fiche = b.el('dlmFiche').innerHTML;
  assert.match(fiche, /Type<\/span><span class="fiche-v">Xbox 360</, 'le Type de l item perdu en route');
  assert.match(fiche, /Title updates<\/span><span class="fiche-v">11</, 'les TU perdues en route');
  assert.match(fiche, /Catalogued covers<\/span><span class="fiche-v">28</, 'les jaquettes cataloguees perdues en route');
  assert.match(fiche, /Latest content<\/span><span class="fiche-v">2026-02-12</, 'le dernier contenu perdu en route');
});
