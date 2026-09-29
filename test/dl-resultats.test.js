// La table RÉSULTATS ne doit montrer QUE la source choisie.
//
// Défaut mesuré dans le navigateur (2026-09-20, profil neuf, réseau réel) :
// une recherche « Toutes » encore EN VOL quand l'action VIMM du Catalogue est
// cliquée affichait 48 lignes Vimm, puis la réponse tardive de « Toutes » réécrivait
// la table — 7 lignes ARCHIVE.ORG, statut « 48 vimm + 7 archive.org », alors que le
// sélecteur affichait toujours « Vimm's Vault ». 20 échantillons sur 31 (500 ms
// pendant 15 s) montraient le mélange, jusqu'à la fin de la fenêtre.
//
// Le scoreur du bloc Pertinence est déjà testé en ÉVALUANT le texte extrait
// (test/pertinence.test.js) : on fait pareil ici, avec un DOM et un réseau de
// doublure, parce que ce qui est en cause est l'ORDRE des réponses, pas leur contenu.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const inline = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

// Bloc 1 : la note et la porte « pertinents » (classerPertinence, garderPertinents).
const dPert = inline.indexOf('// ---------- Pertinence');
const fPert = inline.indexOf('function gameQuery()');
// Bloc 2 : l'ÉTAT des DEUX tables de résultats et leurs écrivains (searchDl,
// searchStore, searchVimm, dlResRender pour #dlResults ; dlFilesRender,
// loadFiles, vimmFiles, searchDlcTab pour #dlFiles). Le repère de début précède
// la déclaration d'état : ce qui garde une table doit rester dedans, sinon le
// test ne le verrait pas. Le repère de FIN suit le DERNIER écrivain de #dlFiles
// (`searchDlcTab`) : c'est ce qui fait tomber le test « une seule porte » quand
// l'onglet DLC/XBLA se remet à décider seul de la longueur minimale.
const dRes = inline.indexOf('const MAX_RES=40;');
const fRes = inline.indexOf('async function downloadUrl()');
assert.ok(dPert > 0 && fPert > dPert, 'le bloc de pertinence doit etre trouvable dans app.js');
assert.ok(dRes > 0 && fRes > dRes, 'le bloc des resultats DL doit etre trouvable dans app.js');

const bloc = inline.slice(dPert, fPert) + '\n' + inline.slice(dRes, fRes);

const VIMM = [
  { id: '87234', name: 'Halo 3', regions: 'Asia', ver: '1.0' },
  { id: '81684', name: 'Halo 3', regions: 'Brazil', ver: '1.0' },
  { id: '92103', name: 'Dragon Age: Nachalo', regions: 'Russia', ver: '1.0' }
];
const ARCHIVE = [
  { id: 'halo3-redump', title: 'Halo 3 (Redump)', size: 7000000000 },
  { id: 'halo3-ost', title: 'Halo 3 Original Soundtrack', size: 200000000 }
];

// Banc : un DOM minimal, un réseau où RIEN ne part tout seul. `api()` met la requête
// EN ATTENTE ; c'est le test qui décide qui répond, et dans quel ordre.
function banc() {
  const els = {};
  const el = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', hidden: false, style: {} });
  const enVol = [];
  const api = url => new Promise(res => { enVol.push({ url, res }); });
  const faux = {
    api, $: el,
    T: fr => fr,
    dlSec: () => {},
    skelRows: () => '<tr class="sq"><td class="tdfill" colspan="3">chargement</td></tr>',
    // La VRAIE `etatVide` rend un `<div class="empty">` : ce sont les appelants
    // qui l'enveloppent dans leur `<tr><td colspan=…>`. La doublure dit la meme
    // chose, sinon le nombre de cellules mesure ici serait celui de la doublure
    // et non celui que la porte ecrit pour SA table.
    etatVide: o => '<div class="empty"><div class="empty-t">' + o.titre + '</div></div>',
    fmt: n => String(n),
    escH: s => String(s == null ? '' : s),
    // `vimmRow` construit une INFOBULLE (le marquage « non hebergé » explique ce
    // qu'il veut dire) : elle passe donc par l'echappeur d'ATTRIBUT. Il manquait
    // ici, et le banc ne s'en apercevait pas tant qu'aucune ligne n'etait
    // indisponible — le ternaire du gabarit court-circuitait l'appel. Un banc qui
    // n'exerce pas le chemin ne dit rien de lui.
    escA: s => String(s == null ? '' : s),
    // `enTete` lit le libelle d'une colonne dans l'EN-TETE de sa table, donc
    // dans le DOM. Ce banc-ci n'a pas de DOM (son `$` rend des objets vides) :
    // la doublure nomme la colonne par son rang, ce qui suffit a ce que ces cas
    // mesurent — l'ORDRE des reponses et le nombre de colonnes. Le libelle
    // traduit, lui, est verrouille dans `ui-quality.test.js` (le `data-l` doit
    // venir de l'en-tete) ; le verifier ici demanderait un `<thead>`, donc un
    // DOM, et ce n'est pas le sujet de ce banc.
    enTete: (id, i) => id + '#' + i,
    jsA: s => JSON.stringify(s),
    DL_EXT: ['.iso', '.7z'],
    hasCookie: true,
    pickSrcVal: () => {}, setSrcNote: () => {}, cookieHelp: () => {},
    document: { querySelectorAll: () => [] },
    setTimeout, clearTimeout
  };
  const noms = Object.keys(faux);
  const fabrique = new Function(...noms, 'dlSrc', bloc + `
    return { searchDl, searchStore, searchVimm, searchDlcTab, loadFiles, dlResRender, dlResToutOn,
             getBrut: () => dlBrut, getTout: () => dlResTout,
             getFilesBrut: () => dlFilesBrut, getFilesTout: () => dlFilesTout,
             setSrc: v => { dlSrc = v; } };`);
  const out = fabrique(...Object.values(faux), 'all');
  return Object.assign(out, { el, enVol });
}

// Indices des requetes en vol dont l'URL contient le motif.
const enVolDe = (b, motif) => b.enVol.map((r, i) => r.url.includes(motif) ? i : -1).filter(i => i >= 0);
// La DERNIERE lancee : c'est celle de la recherche la plus recente.
const derniere = (b, motif) => { const l = enVolDe(b, motif); return l[l.length - 1]; };
// Repond a la requete en vol d'indice i, et la retire de la file.
function repondre(b, i, donnees) {
  assert.ok(i >= 0 && b.enVol[i], 'aucune requete en vol a l indice ' + i);
  const r = b.enVol.splice(i, 1)[0];
  r.res(donnees);
  return r.url;
}
const contientArchive = b => /ARCHIVE\.ORG/.test(b.el('dlResults').innerHTML);

test('une reponse en retard de « Toutes » ne peut pas reecrire une table Vimm', async () => {
  const b = banc();
  b.setSrc('all'); b.el('dlSearch').value = 'halo';
  const pToutes = b.searchDl();          // deux requetes en vol : vimm + archive.org

  b.setSrc('vimm');                      // l'utilisateur clique VIMM au Catalogue
  const pVimm = b.searchVimm();          // ... pendant que « Toutes » est encore en vol
  assert.strictEqual(b.enVol.length, 3, 'deux requetes « toutes » + une requete Vimm');

  // La liste du vault repond d'abord : la table est propre, seulement Vimm.
  repondre(b, derniere(b, '/api/vimm'), VIMM);
  await pVimm;
  assert.strictEqual(contientArchive(b), false, 'la table Vimm doit etre propre');

  // Puis les deux jambes de « Toutes » repondent, en retard. C'est ce qui arrive
  // pour de vrai : l'application annonce elle-meme « ~30 s si Cloudflare ».
  repondre(b, enVolDe(b, '/api/search')[0], ARCHIVE);
  repondre(b, enVolDe(b, '/api/vimm')[0], VIMM);
  await pToutes;

  // La table appartient a la DERNIERE recherche lancee, et elle est Vimm.
  assert.strictEqual(contientArchive(b), false,
    'apres une recherche Vimm, la table ne doit contenir QUE des lignes Vimm — ' +
    'une reponse tardive de « Toutes » l a reecrite');
  assert.strictEqual(b.getBrut().al.length, 0,
    'l etat brut ne doit plus porter les resultats archive.org de la recherche precedente');
  assert.ok(!/archive\.org/.test(b.el('dlStatus').textContent),
    'le statut ne doit pas annoncer des resultats archive.org — lu : ' + b.el('dlStatus').textContent);
});

// --- Requete trop courte : la table ne doit pas garder l'ancienne recherche -----
//
// MEME FAMILLE DE MENSONGE que la course ci-dessus, par un autre mecanisme, et
// mesuree avant d'etre corrigee : les trois fonctions de recherche sortaient sur
// leur garde « moins de deux caracteres » AVANT de toucher la table. Releve dans
// le navigateur (profil neuf, reseau reel) : apres une recherche « toutes »
// affichant 61 lignes dont 7 archive.org, taper « a » avec le selecteur sur Vimm
// laissait les 61 lignes ET les 7 archive.org en place — la table affirmait autre
// chose que la barre de recherche.
//
// La sortie utile n'est pas de garder l'ancienne liste : c'est de la VIDER en
// disant pourquoi. Un tableau vide sans explication est le defaut qu'on corrige
// ailleurs dans ce fichier.
const contientVimm = b => /onclick="vimmFiles\(/.test(b.el('dlResults').innerHTML);
// Garnit la table par une recherche « toutes » qui va jusqu'au bout : c'est
// l'etat de depart du releve (les deux sources melangees).
async function garnirToutes(b, q) {
  b.setSrc('all'); b.el('dlSearch').value = q;
  const p = b.searchDl();
  repondre(b, enVolDe(b, '/api/vimm')[0], VIMM);
  repondre(b, enVolDe(b, '/api/search')[0], ARCHIVE);
  await p;
}

test('une requete trop courte vide la table « toutes » au lieu de garder la precedente', async () => {
  const b = banc();
  await garnirToutes(b, 'halo');
  assert.ok(b.el('dlResults').innerHTML.length > 0, 'la table doit etre garnie avant');

  b.el('dlSearch').value = 'a';
  await b.searchDl();

  assert.strictEqual(b.enVol.length, 0, 'aucune requete ne doit partir sous deux caracteres');
  assert.strictEqual(contientVimm(b), false, 'aucune ligne de l ancienne recherche ne doit rester');
  assert.strictEqual(contientArchive(b), false, 'aucune ligne archive.org ne doit rester');
  assert.strictEqual(b.getBrut().vl.length + b.getBrut().al.length, 0,
    'l etat brut ne doit plus decrire l ancienne recherche');
  assert.match(b.el('dlStatus').textContent, /au moins 2 caract/,
    'le statut doit dire POURQUOI la table est vide — lu : ' + b.el('dlStatus').textContent);
});

test('le scenario mesure : Vimm, un seul caractere — plus une ligne de l ancienne recherche', async () => {
  const b = banc();
  await garnirToutes(b, 'halo');
  assert.strictEqual(contientArchive(b), true,
    '« toutes » doit bien melanger les deux sources avant la frappe');

  b.setSrc('vimm'); b.el('dlSearch').value = 'a';
  await b.searchVimm();

  assert.strictEqual(contientVimm(b), false,
    'la table ne doit plus contenir une seule ligne de l ancienne recherche');
  assert.strictEqual(contientArchive(b), false, 'ni une seule ligne archive.org');
  assert.strictEqual(b.enVol.length, 0, 'aucune requete ne doit partir');
  assert.match(b.el('dlStatus').textContent, /au moins 2 caract/,
    'le statut doit dire POURQUOI la table est vide — lu : ' + b.el('dlStatus').textContent);
});

test('une requete trop courte vide aussi la table archive.org', async () => {
  const b = banc();
  await garnirToutes(b, 'halo');

  b.setSrc('ia'); b.el('dlSearch').value = 'a';
  await b.searchStore();

  assert.strictEqual(b.enVol.length, 0, 'aucune requete ne doit partir');
  assert.strictEqual(contientArchive(b), false, 'aucune ligne de l ancienne recherche ne doit rester');
  assert.match(b.el('dlStatus').textContent, /au moins 2 caract/,
    'le statut doit dire POURQUOI la table est vide — lu : ' + b.el('dlStatus').textContent);
});

test('apres un vidage, la porte unique ne peut pas rallumer l ancienne recherche', async () => {
  const b = banc();
  await garnirToutes(b, 'halo');

  b.el('dlSearch').value = 'a';
  await b.searchDl();
  b.dlResToutOn();          // l action du bouton « Afficher les N resultats »

  assert.strictEqual(contientArchive(b), false,
    'la porte unique de sortie ne doit rien rallumer d une recherche qui n est plus la');
});

test('une reponse en retard ne peut pas regarnir une table videe', async () => {
  const b = banc();
  b.setSrc('all'); b.el('dlSearch').value = 'halo';
  const pToutes = b.searchDl();          // deux requetes en vol
  b.el('dlSearch').value = 'a';          // l utilisateur efface avant que ca reponde
  await b.searchDl();                    // la porte vide la table
  assert.strictEqual(contientVimm(b), false, 'la table doit etre videe tout de suite');

  repondre(b, enVolDe(b, '/api/vimm')[0], VIMM);
  repondre(b, enVolDe(b, '/api/search')[0], ARCHIVE);
  await pToutes;

  assert.strictEqual(contientVimm(b), false,
    'une reponse en retard ne doit pas regarnir une table videe');
  assert.strictEqual(contientArchive(b), false,
    'une reponse en retard ne doit pas regarnir une table videe');
});

test('une seule porte decide de la longueur minimale', () => {
  // Les trois fonctions repetaient la meme garde : c'est ce qui a permis a chacune
  // d'oublier de vider la table. `searchDlcTab` en avait une QUATRIEME, dans
  // #dlFiles — meme mensonge, autre tableau. Une cinquieme fonction ajoutee demain
  // doit passer par la meme porte — sinon ce test tombe.
  // Le motif ne présume pas du SENS de la comparaison : la porte peut sortir des
  // qu'elle a assez de caracteres comme des qu'il en manque. Ce qui compte est
  // qu'une seule ligne du bloc consulte cette longueur.
  const gardes = [...bloc.matchAll(/q\.length\s*[<>]=?\s*2/g)].length;
  assert.strictEqual(gardes, 1,
    'la longueur minimale doit se decider a UN seul endroit, il y en a ' + gardes);
});

test('deux caracteres passent : la porte ne refuse que le DESSOUS', async () => {
  // La porte a UNE comparaison, et c'est elle qui decide. Un `>` au lieu d'un
  // `>=` refuserait « ha » — une recherche que l'application acceptait avant, donc
  // une regression invisible ailleurs. Discriminant verifie par mutation servie :
  // avec `q.length>2`, le navigateur refuse « ha » et annonce « Saisis au moins
  // 2 caracteres » au lieu d'interroger le vault (et ce test tombe : 0 requete).
  const b = banc();
  b.setSrc('vimm'); b.el('dlSearch').value = 'ha';
  const p = b.searchVimm();
  assert.strictEqual(b.enVol.length, 1, 'une requete de deux caracteres doit PARTIR');
  assert.ok(!/au moins 2 caract/.test(b.el('dlStatus').textContent),
    'la porte ne doit PAS refuser deux caracteres — lu : ' + b.el('dlStatus').textContent);
  repondre(b, 0, VIMM);
  await p;
});

test('apres une recherche Vimm, la porte unique ne peut plus rouvrir archive.org', async () => {
  const b = banc();
  // 1. une recherche « toutes » garnit l'etat brut des deux sources
  b.setSrc('all'); b.el('dlSearch').value = 'halo';
  const pToutes = b.searchDl();
  repondre(b, enVolDe(b, '/api/vimm')[0], VIMM);
  repondre(b, enVolDe(b, '/api/search')[0], ARCHIVE);
  await pToutes;
  assert.strictEqual(contientArchive(b), true, '« toutes » doit bien melanger les deux sources');

  // 2. puis une recherche Vimm-seule
  b.setSrc('vimm');
  const pVimm = b.searchVimm();
  repondre(b, derniere(b, '/api/vimm'), VIMM);
  await pVimm;
  assert.strictEqual(contientArchive(b), false);

  // 3. l'etat brut doit decrire la table AFFICHEE. Sinon la premiere porte venue
  //    (« Afficher les N resultats », ou un retour sur « Toutes ») rallume
  //    archive.org sous une table Vimm.
  b.dlResToutOn();
  assert.strictEqual(contientArchive(b), false,
    'la porte unique de sortie ne doit jamais rallumer les lignes archive.org ' +
    'sous une recherche Vimm');
});

// --- Requete trop courte dans l'onglet DLC/XBLA (#dlFiles) --------------------
//
// MEME FAMILLE DE MENSONGE que la course et la requete courte ci-dessus, dans
// l'AUTRE tableau. `searchDlcTab` gardait sa PROPRE garde « moins de deux
// caracteres » et sortait AVANT de toucher #dlFiles : apres une recherche DLC qui
// remplit la liste, une frappe d'un seul caractere laissait les packs precedents
// sous une barre de recherche qui ne les decrivait plus. Les deux tables sont
// donc servies par la MEME porte, parametree par le tableau a vider : deux copies
// d'une meme intention divergent toujours.
const DLC = [
  { name: 'Halo_3.rar', col: 'DLC', size: 1788958530, url: 'https://archive.org/x/h3' },
  { name: 'Halo_4.rar', col: 'DLC', size: 3700783993, url: 'https://archive.org/x/h4' }
];
const contientDlc = b => /dlcDl\(/.test(b.el('dlFiles').innerHTML);
const contientFichiers = b => /downloadFile\(/.test(b.el('dlFiles').innerHTML);
// Un item archive.org : `loadFiles` ecrit dans le MEME #dlFiles, et c'est cette
// autre liste que la porte doit emporter avec la recherche.
const FICHIERS = [{ name: 'Halo 3 (Europe).iso', size: 7000000000, url: 'https://archive.org/x/h3.iso' }];
async function garnirDlc(b, q) {
  b.setSrc('dlc'); b.el('dlSearch').value = q;
  const p = b.searchDlcTab();
  repondre(b, enVolDe(b, '/api/dlc')[0], DLC);
  await p;
}
// Colonnes couvertes par une ligne, `colspan` compris — la mesure de
// ui-quality.test.js, appliquee ici a la ligne que la porte ecrit pour SA table.
const cellules = html => [...html.matchAll(/<td\b[^>]*>/g)]
  .reduce((s, t) => s + Number((/colspan="(\d+)"/.exec(t[0]) || [])[1] || 1), 0);

test('une requete trop courte vide la liste DLC/XBLA au lieu de garder la precedente', async () => {
  const b = banc();
  await garnirDlc(b, 'halo');
  assert.strictEqual(contientDlc(b), true, 'la liste DLC doit etre garnie avant la frappe');

  b.el('dlSearch').value = 'a';
  await b.searchDlcTab();

  assert.strictEqual(b.enVol.length, 0, 'aucune requete ne doit partir sous deux caracteres');
  assert.strictEqual(contientDlc(b), false,
    'aucune ligne de l ancienne recherche ne doit rester dans #dlFiles');
  assert.match(b.el('dlStatus').textContent, /au moins 2 caract/,
    'le statut doit dire POURQUOI la liste est vide — lu : ' + b.el('dlStatus').textContent);
});

test('une requete trop courte vide aussi les fichiers d un item deja ouverts', async () => {
  // #dlFiles porte DEUX listes selon le chemin qui l'ecrit : les packs DLC/XBLA
  // (`searchDlcTab`) et les fichiers d'un item archive.org (`loadFiles`). L'etat
  // brut doit decrire la liste AFFICHEE — sinon le premier `dlFilesRender` venu
  // rallume l'ancienne, exactement comme `dlBrut` pour la table RÉSULTATS. C'est
  // ce que la remise a zero de la porte protege, et c'est ce que ce cas mesure.
  const b = banc();
  b.el('dlSearch').value = 'halo';
  const pFiles = b.loadFiles('halo3-redump');
  repondre(b, enVolDe(b, '/api/item')[0], FICHIERS);
  await pFiles;
  assert.strictEqual(b.getFilesBrut().length, 1, 'l item doit avoir charge ses fichiers');
  assert.strictEqual(contientFichiers(b), true, 'la liste des fichiers doit etre affichee avant');

  b.el('dlSearch').value = 'a';
  await b.searchDlcTab();

  assert.strictEqual(contientFichiers(b), false,
    'aucun fichier de l ancienne liste ne doit rester dans #dlFiles');
  assert.strictEqual(b.getFilesBrut().length, 0,
    'l etat brut de #dlFiles ne doit plus decrire l ancienne liste');
  assert.match(b.el('dlStatus').textContent, /au moins 2 caract/,
    'le statut doit dire POURQUOI la liste est vide — lu : ' + b.el('dlStatus').textContent);
});

test('une reponse DLC en retard ne peut pas regarnir la liste videe', async () => {
  const b = banc();
  b.setSrc('dlc'); b.el('dlSearch').value = 'halo';
  const pDlc = b.searchDlcTab();         // la requete part, la liste est en attente
  b.el('dlSearch').value = 'a';          // l utilisateur efface avant que ca reponde
  await b.searchDlcTab();                // la porte vide la liste
  assert.strictEqual(contientDlc(b), false, 'la liste doit etre videe tout de suite');

  repondre(b, enVolDe(b, '/api/dlc')[0], DLC);
  await pDlc;

  assert.strictEqual(contientDlc(b), false,
    'une reponse en retard ne doit pas regarnir une liste videe');
});

test('l etat vide de chaque table couvre TOUTES ses colonnes', async () => {
  // #dlResults a trois colonnes, #dlFiles quatre. La porte ecrit les deux lignes :
  // le garde-fou de ui-quality.test.js associe une fonction a UNE table et ne voit
  // donc pas la ligne que la porte ecrit pour l'autre. Un colspan faux y creerait
  // une colonne fantome sans que rien ne le dise.
  const bRes = banc();
  await garnirToutes(bRes, 'halo');
  bRes.el('dlSearch').value = 'a';
  await bRes.searchDl();
  assert.strictEqual(cellules(bRes.el('dlResults').innerHTML), 3,
    '#dlResults a trois colonnes — lu : ' + bRes.el('dlResults').innerHTML);

  const bDlc = banc();
  await garnirDlc(bDlc, 'halo');
  bDlc.el('dlSearch').value = 'a';
  await bDlc.searchDlcTab();
  assert.strictEqual(cellules(bDlc.el('dlFiles').innerHTML), 4,
    '#dlFiles a quatre colonnes — lu : ' + bDlc.el('dlFiles').innerHTML);
});

// --- LE VAULT DIGITAL : une valeur de plus, et des lignes MARQUEES -----------
//
// Second vault Xbox 360 du site (`system=X360-D`, « Xbox 360 (Digital) », No-Intro
// — DLC, Title Updates, XBLA, XBLIG). Il est ajoute comme une VALEUR du controle de
// source, pas comme un chemin : meme `searchVimm`, meme table, memes colonnes,
// meme porte de sortie. Ce que ces cas verrouillent :
//
//   1. la source `vimmd` demande BIEN `system=X360-D` (et les disques ne changent
//      pas de requete : c'est ce qui garde leur reponse identique a l'octet) ;
//   2. une ligne sans fichier est MARQUEE a l'ecran, et une ligne telechargeable ne
//      l'est pas — mesure du 2026-09-20 : 5 lignes sur 6 pour « WWE 2K17 »,
//      2 sur 5 pour « Tiger Woods PGA Tour 12 », 0 sur 46 pour « halo ».
//      Aujourd'hui l'utilisateur ne le decouvre qu'apres DEUX clics.
//
// Les deux lignes ci-dessous portent les valeurs MESUREES sur la page reelle
// (`?p=list&system=X360-D&q=WWE 2K17`, 6 lignes dont 5 sans fichier) : ce sont les
// identifiants, les noms, le type et la disponibilite de 127119 et 127120.
const VIMM_DIGITAL = [
  { id: '127119', name: 'WWE 2K17', regions: 'World', ver: '4', langs: '-', type: 'Title Update', available: true },
  { id: '127120', name: 'WWE 2K17: Accelerator - Goldberg Pack - NXT Legacy Pack', regions: 'World', ver: '1.0', langs: '-', type: 'DLC', available: false }
];

async function chercherVault(b, src, q, reponse) {
  b.setSrc(src); b.el('dlSearch').value = q;
  const p = b.searchDl();
  const url = repondre(b, derniere(b, '/api/vimm'), reponse);
  await p;
  return url;
}

test('le vault digital est une VALEUR de plus : la source demande system=X360-D', async () => {
  const b = banc();
  const url = await chercherVault(b, 'vimmd', 'WWE 2K17', VIMM_DIGITAL);
  assert.match(url, /system=X360-D/, 'la requete doit viser le vault digital — lue : ' + url);
  assert.match(url, /[?&]q=WWE%202K17/, 'et porter la recherche encodee — lue : ' + url);
  assert.strictEqual(/onclick="vimmFiles\(/.test(b.el('dlResults').innerHTML), true,
    'les lignes du vault digital s affichent dans la MEME table : ' + b.el('dlResults').innerHTML);
});

test('le vault des disques garde sa requete d origine, sans parametre system', async () => {
  // C'est la contrepartie du cas precedent, et elle protege la mesure « le parcours
  // disques rend exactement ce qu'il rendait » : le client n'ajoute `system` que
  // lorsqu'on a CHOISI le digital. Une valeur par defaut envoyee partout ferait
  // dependre la reponse des disques d'un parametre que personne n'a demande.
  const b = banc();
  const url = await chercherVault(b, 'vimm', 'halo', VIMM);
  assert.strictEqual(url, '/api/vimm?q=halo', 'la requete des disques ne doit pas bouger');
});

test('une ligne non hebergee est MARQUEE, une ligne telechargeable ne l est pas', async () => {
  const b = banc();
  await chercherVault(b, 'vimmd', 'WWE 2K17', VIMM_DIGITAL);
  const html = b.el('dlResults').innerHTML;
  // Le marquage, et son COMPTE : une seule des deux lignes est sans fichier.
  const marques = html.match(/Non hébergé/g) || [];
  assert.strictEqual(marques.length, 1,
    'seule la ligne sans fichier doit etre marquee — lu : ' + html);
  assert.ok(html.indexOf('Future Stars') === -1, 'aucune ligne inventee');
  // Le TYPE est affiche lui aussi : sans lui, un DLC et un Title Update sont
  // indiscernables (le badge du site n'affiche qu'une abbreviation).
  assert.ok(html.indexOf('>Title Update<') > 0, 'le type doit etre affiche — lu : ' + html);
  assert.ok(html.indexOf('>DLC<') > 0, 'le type DLC doit etre affiche — lu : ' + html);
  // Le compte remonte aussi dans la barre d'etat : l'utilisateur sait AVANT de
  // cliquer combien de lignes ne mèneront a rien.
  assert.match(b.el('dlStatus').textContent, /1 non hébergé/,
    'le statut doit dire combien de lignes sont sans fichier — lu : ' + b.el('dlStatus').textContent);
  // Et la ligne garde ses TROIS cellules : la table n'a pas gagne de colonne.
  assert.strictEqual(cellules(html), 6, 'deux lignes de trois cellules');
});

test('un champ de disponibilite ABSENT ne fait pas marquer la ligne', async () => {
  // Le marquage se declenche sur `available === false`, jamais sur `!available` :
  // une reponse d'avant le champ, ou un item sans badge, ne doit pas etre presente
  // comme morte. Crier au loup sur une ligne telechargeable ferait ignorer le vrai
  // marquage — et l'ancien etat de l'API (sans `available`) est exactement ce cas.
  const b = banc();
  await chercherVault(b, 'vimm', 'halo', VIMM);
  const html = b.el('dlResults').innerHTML;
  assert.strictEqual(/Non hébergé/.test(html), false,
    'aucune ligne sans le champ ne doit etre marquee — lu : ' + html);
  assert.strictEqual(/non hébergé/.test(b.el('dlStatus').textContent), false,
    'ni le statut — lu : ' + b.el('dlStatus').textContent);
});
