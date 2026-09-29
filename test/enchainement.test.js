// LE DESCRIPTEUR D'ENCHAINEMENT SURVIT-IL A UN REDEMARRAGE ?
//
// La file est persistee dans `downloads.json` PRECISEMENT pour survivre aux
// redemarrages : `server.js` remet un transfert `active` en `queued` au boot, et
// la reprise se fait par HTTP Range. Le descripteur d'enchainement (`chain`)
// doit donc faire le meme voyage, sinon l'automatisation est desarmee en
// silence : le disque 1 s'installe, et le disque 2 ne part jamais.
//
// CE QUE CE FICHIER MESURE, ET PAS CE QU'IL SUPPOSE : la persistance REELLE,
// extraite de `server.js` (de `const DLFILE` a `const freeSpace`) et evaluee sur
// un dossier TEMPORAIRE. On ne touche jamais au `downloads.json` du depot : un
// transfert de 6,7 Go y est en cours.
//
// Les doublures ne remplacent que `ROOT` : `saveDls` et la boucle de chargement
// sont le VRAI texte, pas une copie.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const debut = srv.indexOf('const DLFILE =');
const fin = srv.indexOf('const freeSpace =');
assert.ok(debut > 0 && fin > debut, 'le bloc de persistance doit etre trouvable dans server.js');
const bloc = srv.slice(debut, fin);

// `chaineDepuisItem` est une declaration de fonction du MEME module : dans
// `server.js` elle est hissee, donc le bloc de persistance peut l'appeler. On
// evalue donc le VRAI texte des deux, jamais une doublure.
const deriveSrc = srv.slice(srv.indexOf('function chaineDepuisItem'), srv.indexOf('function disqueDejaPris'));
assert.ok(deriveSrc.length > 0, 'chaineDepuisItem doit etre trouvable dans server.js');
const numeroDisqueReel = require('../lib/pkg').numeroDisque;
const derive = () => new Function('numeroDisque', deriveSrc + '\nreturn chaineDepuisItem;')(numeroDisqueReel);

// Ce qu'un item REELLEMENT persiste : l'url de la galette, l'en-tete qui porte
// le Referer de la fiche du jeu, et le nom du fichier.
const itemVimm = (extra) => Object.assign({
  id: '1789931694330_7081',
  url: 'https://dl2.vimm.net/?mediaId=74497&token=TOKEN%3D%3D',
  name: 'Castlevania - Lords of Shadow (USA, Europe) (En,Fr,De,Es,It) (Disc 1).iso',
  status: 'active', received: 80847080, total: 7242423564, speed: 84947,
  error: null, added: 1789931694330, after: 'install',
  note: 'Redirected to D:\\_A_TRIER',
  headers: { 'User-Agent': 'UA-VIMM', Referer: 'https://vimm.net/vault/78774', Cookie: 'AWSUSER_ID=x' }
}, extra || {});

// Le descripteur tel que `POST /api/vimmdl` le pose, avec ses DEUX galettes.
const chaineVraie = () => ({
  id: '78774',
  title: 'Castlevania: Lords of Shadow',
  action: 'https://dl2.vimm.net/',
  token: 'TOKEN==',
  ua: 'UA-VIMM',
  cookie: 'AWSUSER_ID=x',
  medias: [
    { id: '74497', file: 'Castlevania - Lords of Shadow (USA, Europe) (Disc 1).iso', alt: 0 },
    { id: '74496', file: 'Castlevania - Lords of Shadow (USA, Europe) (Disc 2).iso', alt: 0 }
  ],
  pris: ['74497']
});

// Un `server.js` en miniature, sur un dossier jetable.
function bac(items) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'x360-dlfile-'));
  const fichier = path.join(racine, 'downloads.json');
  if (items) fs.writeFileSync(fichier, JSON.stringify(items));
  const api = new Function('ROOT', 'DATA', 'path', 'fs', 'numeroDisque',
    deriveSrc + bloc + '\nreturn { file: DLFILE, items: () => dls, saveDls, charger(t) { dls = JSON.parse(t); } };'
  )(racine, racine, path, fs, numeroDisqueReel);
  return {
    api, fichier,
    ecrire: () => api.saveDls(),
    ecrit: () => JSON.parse(fs.readFileSync(fichier, 'utf8')),
    // Un REDEMARRAGE : relire le fichier comme le fait le module au chargement,
    // avec la remise en file des transferts actifs.
    redemarrer() {
      const t = fs.readFileSync(fichier, 'utf8');
      api.charger(t);
      api.items().forEach(d => { if (d.status === 'active') d.status = 'queued'; });
      return api.items();
    },
    fin: () => fs.rmSync(racine, { recursive: true, force: true })
  };
}

test('enchainement : le descripteur fait l ALLER-RETOUR par downloads.json', () => {
  const b = bac();
  try {
    const it = itemVimm({ chain: chaineVraie() });
    b.api.charger(JSON.stringify([it]));
    b.ecrire();
    // Ce que le fichier contient VRAIMENT, relu depuis le disque.
    const surDisque = b.ecrit()[0];
    assert.ok(surDisque.chain, 'le descripteur doit etre ecrit dans downloads.json');
    assert.deepStrictEqual(surDisque.chain, chaineVraie(), 'le descripteur doit y etre ENTIER');
    // Puis ce qu'en fait un redemarrage.
    const apres = b.redemarrer();
    assert.deepStrictEqual(apres[0].chain, chaineVraie(),
      'un redemarrage ne doit pas desarmer l enchainement');
  } finally { b.fin(); }
});

test('enchainement : la remise en file au boot ne touche PAS au descripteur', () => {
  const b = bac([itemVimm({ chain: chaineVraie() })]);
  try {
    const apres = b.redemarrer();
    assert.strictEqual(apres[0].status, 'queued', 'un transfert actif est remis en file');
    assert.deepStrictEqual(apres[0].chain, chaineVraie(), 'et il garde de quoi enchainer');
    assert.strictEqual(apres[0].received, 80847080, 'les octets recus sont conserves');
  } finally { b.fin(); }
});

// ---- LE DESCRIPTEUR MANQUANT SE DERIVE -------------------------------------
//
// MESURE (2026-09-20) : l'item du transfert en cours a ete cree a 21:14:54, et
// le code qui pose `chain` est arrive au commit ecb9e12, a 21:31:18 — dix-sept
// minutes PLUS TARD. Son entree persistee n'a donc ni `chain` ni `mediaId`, et
// rien ne les derive : le disque 2 ne partira jamais. Le corriger en relancant
// le telechargement par la route normale couterait les 78 Mo deja recus.
//
// Tout ce qu'il faut est DANS l'item : `url` porte le mediaId et le token,
// `headers.Referer` porte l'id de la fiche, `headers` l'UA et le cookie. Aucun
// reseau au demarrage : la liste des medias se lit a l'heure de l'enchainement,
// sur la page que `chaineVimm` relit de toute facon (le token expire).

test('enchainement : un item SANS descripteur le derive de sa propre entree', () => {
  const chaineDepuisItem = derive();
  const c = chaineDepuisItem(itemVimm());
  assert.ok(c, 'l item du 2026-09-20 doit pouvoir etre repare');
  assert.strictEqual(c.id, '78774', 'l id du jeu vient du Referer de la fiche');
  assert.strictEqual(c.action, 'https://dl2.vimm.net/');
  assert.strictEqual(c.token, 'TOKEN==');
  assert.strictEqual(c.ua, 'UA-VIMM');
  assert.strictEqual(c.cookie, 'AWSUSER_ID=x');
  assert.deepStrictEqual(c.pris, ['74497'], 'le disque courant est marque COMME PRIS');
  assert.deepStrictEqual(c.medias, [], 'aucun media invente : la page les donnera');
});

test('enchainement : on ne derive QUE ce qui manque, et jamais rien d autre', () => {
  const chaineDepuisItem = derive();
  // Deja arme : on n y touche pas (le `pris` accumule dit ce qui a ete pris).
  assert.strictEqual(chaineDepuisItem(itemVimm({ chain: chaineVraie() })), null);
  // Pas une URL de telechargement Vimm.
  assert.strictEqual(chaineDepuisItem(itemVimm({ url: 'https://archive.org/x.iso' })), null);
  // Aucun mediaId dans l URL : on ne saurait pas quoi marquer comme pris.
  assert.strictEqual(chaineDepuisItem(itemVimm({ url: 'https://dl2.vimm.net/?token=x' })), null);
  // Aucun id de fiche dans le Referer : on ne saurait pas quelle page relire.
  assert.strictEqual(chaineDepuisItem(itemVimm({ headers: { Referer: 'https://vimm.net/vault/' } })), null);
  // LE NOM NE PORTE AUCUN NUMERO DE GALETTE : rien ne dit qu il y en a plusieurs.
  // Une entree ne compte comme disque que si son nom porte « (Disc N) ».
  assert.strictEqual(chaineDepuisItem(itemVimm({ name: 'Castlevania (USA, Europe).iso' })), null);
});

test('enchainement : au CHARGEMENT, le transfert en cours est repare ET ecrit', () => {
  const b = bac([itemVimm()]);
  try {
    // Le bloc de persistance a deja charge le fichier : l item doit porter un
    // descripteur, SANS qu on ait relance quoi que ce soit.
    const apres = b.api.items();
    assert.ok(apres[0].chain, 'un item sans descripteur doit etre repare au chargement');
    assert.strictEqual(apres[0].chain.id, '78774');
    assert.strictEqual(apres[0].mediaId, '74497', 'le mediaId se derive aussi');
    // ET LA REPARATION EST ECRITE : c est elle qui doit survivre au prochain boot.
    const surDisque = b.ecrit()[0];
    assert.ok(surDisque.chain, 'la reparation doit etre ecrite dans downloads.json');
  } finally { b.fin(); }
});

// ---- L'ENCHAINEMENT D'UN DESCRIPTEUR DERIVE --------------------------------
//
// Un descripteur derive n'a AUCUN media (il ne les a jamais eus). Or
// `chaineVimm` ne regardait que `ch.medias` : il n'aurait donc rien trouve et
// aurait renonce en silence. La page qu'il relit DE TOUTE FACON pour le token
// rend la liste — c'est la meme source que `/api/vimmfiles`, donc la seule qui
// fasse autorite : la galette se lit dans `medias[]`, jamais dans les resultats
// de recherche (mesure : la recherche rend deux REGIONS pour ce jeu, 78774 et
// 79715, pas deux disques).
const chaineSrc = srv.slice(srv.indexOf('function disqueDejaPris'), srv.indexOf('// ---------- Connexion archive.org automatique'));
assert.ok(chaineSrc.length > 0, 'disqueDejaPris + chaineVimm doivent etre trouvables dans server.js');

const DISC1 = { id: '74497', file: 'Castlevania - Lords of Shadow (USA, Europe) (Disc 1).iso', alt: 0 };
const DISC2 = { id: '74496', file: 'Castlevania - Lords of Shadow (USA, Europe) (Disc 2).iso', alt: 0 };

function bancChaine(opts) {
  const o = opts || {};
  const demarres = [];
  const lus = [];
  const api = new Function('dls', 'numeroDisque', 'vimmResolve', 'startDownload', 'slog', 'T', 'VIMM_UA',
    chaineSrc + '\nreturn { chaineVimm, disqueDejaPris };'
  )(
    o.dls || [], require('../lib/pkg').numeroDisque,
    (id, ctx) => { lus.push({ id, ctx }); return Promise.resolve(o.page || { title: 'Castlevania', action: 'https://dl2.vimm.net/', token: 'NEUF', medias: [DISC1, DISC2] }); },
    (url, nom, opts2) => { demarres.push({ url, nom, opts: opts2 }); return { queued: 1 }; },
    () => {}, (fr) => fr, 'UA-DEFAUT'
  );
  return { api, demarres, lus };
}

test('enchainement : un descripteur SANS medias lit la page et enchaine quand meme', async () => {
  const b = bancChaine();
  await b.api.chaineVimm({
    name: 'Castlevania - Lords of Shadow (USA, Europe) (Disc 1).iso',
    chain: { id: '78774', title: '', action: 'https://dl2.vimm.net/', token: 'VIEUX', ua: 'UA-VIMM', cookie: 'C', medias: [], pris: ['74497'] }
  });
  assert.strictEqual(b.lus.length, 1, 'la page est relue : le token de Vimm expire');
  assert.strictEqual(b.demarres.length, 1, 'le disque 2 doit partir');
  const d = b.demarres[0];
  assert.match(d.url, /mediaId=74496/, 'c est le DISQUE 2, lu dans le nom et non dans l ordre');
  assert.match(d.nom, /\(Disc 2\)/);
  assert.strictEqual(d.opts.after, 'install');
  assert.match(d.opts.note, /Disque suivant/);
  assert.deepStrictEqual(d.opts.vimm.pris, ['74497', '74496'], 'le disque pris est ACCUMULE');
});

test('enchainement : la lecture de la page reste EVITEE quand il n y a rien a enchainer', async () => {
  // Le comportement d avant est conserve pour les descripteurs qui PORTENT
  // leurs medias : une seule galette ne coute pas une requete de plus.
  const b = bancChaine({ page: { title: 'Solo', action: 'https://dl2.vimm.net/', token: 'N', medias: [DISC1] } });
  await b.api.chaineVimm({
    name: 'Castlevania (Disc 1).iso',
    chain: { id: '1', medias: [DISC1], pris: ['74497'] }
  });
  assert.strictEqual(b.lus.length, 0, 'aucune galette suivante : aucune relecture inutile');
  assert.strictEqual(b.demarres.length, 0);
});

test('enchainement : un descripteur derive dont la page ne rend qu UNE galette ne fait rien', async () => {
  const b = bancChaine({ page: { title: 'Castlevania', action: 'https://dl2.vimm.net/', token: 'N', medias: [DISC1] } });
  await b.api.chaineVimm({
    name: 'Castlevania (Disc 1).iso',
    chain: { id: '78774', medias: [], pris: ['74497'] }
  });
  assert.strictEqual(b.demarres.length, 0, 'un seul disque : rien a enchainer, et on ne l invente pas');
  assert.strictEqual(b.lus.length, 1, 'la page a bien ete lue : c est elle qui a repondu');
});

test('enchainement : le disque DEJA pris est saute', async () => {
  const b = bancChaine({ dls: [{ mediaId: '74496', status: 'queued' }] });
  await b.api.chaineVimm({
    name: 'Castlevania (Disc 1).iso',
    chain: { id: '78774', medias: [DISC1, DISC2], pris: ['74497'] }
  });
  assert.strictEqual(b.demarres.length, 0,
    'reprendre 6,7 Go pour un disque deja en file serait le pire des gaspillages');
});

test('enchainement : le descripteur reste PETIT (le fichier est ecrit souvent)', () => {
  // `downloads.json` est reecrit a chaque rafale de sauvegarde : y verser toute
  // la fiche du jeu ferait grossir un fichier de file d'attente. Le descripteur
  // ne porte donc que les medias (identifiant + nom), jamais la page entiere.
  const b = bac();
  try {
    b.api.charger(JSON.stringify([itemVimm({ chain: chaineVraie() })]));
    b.ecrire();
    const t = fs.readFileSync(b.fichier, 'utf8');
    const sans = JSON.stringify([itemVimm()]);
    const surplus = t.length - sans.length;
    assert.ok(surplus > 0, 'le descripteur doit bien etre ecrit');
    assert.ok(surplus < 2048, 'surplus mesure : ' + surplus + ' octets pour deux galettes');
  } finally { b.fin(); }
});
