// MESURE (Task 4, R11 puis Task de correction) — la manette en DIAPORAMA.
//
// DEUX CHOSES S'Y MESURENT, et elles viennent de deux defauts distincts :
//
//  1. R11 : la manette est un GESTE, elle doit rearmer le minuteur dans LES DEUX
//     branches. Le defaut corrige appelait `diaInactivite()` dans la seule branche
//     « diaporama ouvert », c'est-a-dire exactement la ou ca ne sert a rien —
//     quand il est deja ouvert, le minuteur ne peut plus rien ouvrir.
//
//  2. LA CORRECTION DE QUALITE : le diaporama ouvert ne prenait la manette qu'a
//     MOITIE. La croix et le stick appelaient encore `padDeplacer()` sur
//     `.view.active` — le focus et le `scrollIntoView` d'une vue CACHEE — tandis
//     que le clavier, lui, changeait de jaquette avec les fleches. START changeait
//     de vue par-dessus la surcouche et BACK focalisait un champ invisible.
//     La table ci-dessous EST la specification de cette branche : une direction
//     fait defiler d'une jaquette (avec le throttle de repetition), le haut et le
//     bas ne font RIEN, START et BACK sont avales.
//
// POURQUOI UNE SIMULATION ET PAS LA SONDE : `padBoucle` ne s'exerce qu'avec une
// manette PHYSIQUE annoncee par le navigateur, et `navigator.getGamepads()` est en
// lecture seule. La simulation remplace donc `navigator.getGamepads`,
// `requestAnimationFrame`, `performance.now` et `document.activeElement` — quatre
// frontieres — et laisse tourner le VRAI `padBoucle` extrait du fichier. Elle ne
// prouve pas qu'une manette fonctionne (personne ne l'a branchee) ; elle prouve
// QUI est appele dans quelle branche, avec quel argument, et combien de fois.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUB = path.join(__dirname, '..', 'public');
let app = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
// Le bloc etudie : `padBoucle`, du mot-cle au `requestAnimationFrame` final.
const i = app.indexOf('function padBoucle(){');
// LA FIN EST MARQUEE PAR L'ACIOLADE, PAS PAR `requestAnimationFrame` : `padBoucle`
// s'auto-relance DEUX fois (la garde « une image sur quatre », et la fin), et un
// troisieme appel vit plus bas dans le fichier. Un `indexOf` prenait la garde
// (bloc de trois lignes), un `lastIndexOf` prenait le troisieme : les deux
// annonçaient cinq echecs pour une raison qui n'a rien a voir avec le produit.
// On lit donc jusqu'a la premiere ligne qui n'est QUE « } ».
const lignes = app.slice(i).split('\n');
let n = 1;
while (n < lignes.length && lignes[n] !== '}') n++;
if (n >= lignes.length) { console.error('fin de padBoucle introuvable'); process.exit(1); }
const bloc = lignes.slice(0, n + 1).join('\n');
if (n < 30) { console.error('bloc extrait trop court : ' + n + ' lignes'); process.exit(1); }

// LE TEMPS EST SIMULE, image par image. Sans cela, le throttle de repetition
// (380 ms puis 110 ms) ne se mesure pas : `performance.now` rend la meme valeur a
// chaque image, donc un maintien et un appui unique seraient indiscernables — et
// c'est justement le maintien qui fait defiler 15 jaquettes par seconde.
//
// LE PAS EST GRAND DEVANT LE THROTTLE, et c'est deliberé : a 66 ms, un seuil de
// 110 ms tombait ENTRE deux images de la mesure, donc le nombre d'appels dependait
// d'un arrondi — une attente ecrite « 20 images » ne valait pas un temps, et la
// table annoncait des nombres faux de bonne foi. A 130 ms, le seuil de repetition
// tombe tous les 1,3 traitements, donc son effet se COMPTE.
const PAS_MS = 130;

function jouer({ diaOuvert, bouton, seq }) {
  const appels = [];
  const refs = { av: [], dep: [] };
  const pad = {
    connected: true, id: 'Pad simule',
    axes: [0, 0],
    // Tous les boutons relaches, SAUF ceux qu'on presse a cette image.
    buttons: Array.from({ length: 17 }, () => ({ pressed: false }))
  };
  const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, START: 9, BACK: 8, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const etapes = seq || [{ b: bouton }];
  const relache = () => { for (const b of pad.buttons) b.pressed = false; };
  // ON NE RELACHE PAS ENTRE LES PAS : une serie de pas avec le MEME bouton est un
  // MAINTIEN, et c'est tout l'objet de la mesure. Le harnais relachait tout avant
  // chaque pas, donc la manette annoncait un front neuf a chaque image : le
  // throttle etait contourne par le harnais lui-meme, et il comptait 18 appels sur
  // 20 images en accusant le produit. Les pas dont le bouton change, eux, relachent
  // bien l'ancien — sinon un bouton resterait enfonce pour toujours.
  let presse = null;

  let images = 0, horloge = 1000, k = 0;
  // `padPrec` et `padDir` sont des variables du contexte, PAS des proprietes de
  // l'objet `ctx` recopie : le bloc les lit et les ECRIT, donc elles doivent
  // persister d'une image a l'autre — sinon le throttle ne verrait jamais deux
  // images de suite dans la meme direction.
  const ctx = {
    PAD, padPrec: {}, padVivant: false, padNom: '', padDir: '', padProchain: 0, padSeuil: 0.55,
    // LES VALEURS DE DEPART DE L'APPLICATION, lues dans le fichier : un `let`
    // declare ailleurs ne peut pas etre simule par une constante recopiee, et une
    // valeur fausse ferait passer la mesure pour une raison qui n'a rien a voir.
    dl: /let padVivant=false,padNom='',padPrec=\{\},padRepos=0,padDir='',padProchain=0,padFrame=0,padSeuil=([0-9.]+)/.exec(app),
    padFrame: 3,                      // pour que `++padFrame%4` tombe juste sur 0
    navigator: { getGamepads: () => [pad] },
    performance: { now: () => horloge },
    requestAnimationFrame: () => { images++; },
    document: {
      activeElement: { tagName: 'BUTTON', click() {}, hasAttribute: () => false },
      dispatchEvent() {}, querySelector: () => null, body: { classList: { toggle() {} } }
    },
    window: {},
    innerWidth: 1280,
    console,
    // Les frontieres de l'application, remplacees : on ne mesure QUE les appels.
    padEtat() {}, majCtlLegende() {}, padOnglet() {}, padRetour() {},
    padBoucle() {},                   // la fonction se relance elle-meme en sortie
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0,
    diaEstOuvert: () => diaOuvert,
    diaBascule() {}, diaAvancer(s) { refs.av.push(s); },
    diaInactivite: () => appels.push('diaInactivite'),
    $: () => null, T: (fr) => fr
  };
  ctx.padDeplacer = d => refs.dep.push(d);
  vm.createContext(ctx);
  vm.runInContext('function __boucle()' + bloc.slice(bloc.indexOf('{')) + '\n', ctx);
  const avant = appels.length;
  for (const e of etapes) {
    // Relache seulement quand le bouton CHANGE : sinon un pas avec un autre bouton
    // laisserait le precedent enfonce, et le pas suivant ne verrait aucun front.
    if (presse !== null && presse !== e.b) relache();
    presse = e.b;
    pad.buttons[PAD[e.b]] = { pressed: e.p !== false };
    horloge = 1000 + k * PAS_MS;
    // LA GARDE « UNE IMAGE SUR QUATRE » EST ARMEE A CHAQUE PAS. Sans cette ligne,
    // trois pas sur quatre sortaient avant meme de lire la manette, et la mesure
    // comptaient des appels toutes les quatre images pour une raison qui n'a rien a
    // voir avec le throttle — un harnais qui mesure le harnais. `padFrame=3` fait
    // tomber `++padFrame%4` sur 0, donc l'image est bien traitee.
    ctx.padFrame = 3;
    // `performance.now` est lu a l'INTERIEUR de la boucle : on avance l'horloge
    // avant chaque image, jamais apres.
    ctx.__boucle();
    k++;
  }
  return {
    appels: appels.length - avant, images,
    av: refs.av.slice(), dep: refs.dep.slice(),
    seuil: ctx.dl ? Number(ctx.dl[1]) : null
  };
}

// LA TABLE DES CAS. `attendu` est le nombre d'appels a `diaInactivite`, `attenduAv`
// la suite des sens passes a `diaAvancer` (-1 = precedent, +1 = suivant), et
// `attenduDep` le nombre de `padDeplacer`. Les cas sans `attenduAv`/`attenduDep`
// ne sont pas verifies sur ce point.
const cas = [
  { nom: 'diaporama FERME + bouton A', diaOuvert: false, bouton: 'A', attendu: 1, attenduDep: 0 },
  { nom: 'diaporama FERME + bouton LB', diaOuvert: false, bouton: 'LB', attendu: 1, attenduDep: 0 },
  { nom: 'diaporama FERME + bouton B', diaOuvert: false, bouton: 'B', attendu: 1, attenduDep: 0 },
  { nom: 'diaporama FERME + bouton START', diaOuvert: false, bouton: 'START', attendu: 1 },
  { nom: 'diaporama FERME + bouton BACK', diaOuvert: false, bouton: 'BACK', attendu: 1 },
  { nom: 'diaporama FERME + croix GAUCHE', diaOuvert: false, bouton: 'LEFT', attendu: 1, attenduDep: 1 },
  { nom: 'diaporama FERME + croix HAUT', diaOuvert: false, bouton: 'UP', attendu: 1, attenduDep: 1 },
  { nom: 'diaporama OUVERT + bouton A', diaOuvert: true, bouton: 'A', attendu: 1 },
  { nom: 'diaporama OUVERT + bouton LB', diaOuvert: true, bouton: 'LB', attendu: 1, attenduAv: [-1] },
  { nom: 'diaporama OUVERT + bouton RB', diaOuvert: true, bouton: 'RB', attendu: 1, attenduAv: [1] },
  { nom: 'diaporama OUVERT + bouton B', diaOuvert: true, bouton: 'B', attendu: 1 },
  { nom: 'diaporama OUVERT + START (avale)', diaOuvert: true, bouton: 'START', attendu: 0 },
  { nom: 'diaporama OUVERT + BACK (avale)', diaOuvert: true, bouton: 'BACK', attendu: 0 },
  { nom: 'diaporama OUVERT + croix GAUCHE', diaOuvert: true, bouton: 'LEFT', attendu: 1, attenduAv: [-1], attenduDep: 0 },
  { nom: 'diaporama OUVERT + croix DROITE', diaOuvert: true, bouton: 'RIGHT', attendu: 1, attenduAv: [1], attenduDep: 0 },
  { nom: 'diaporama OUVERT + croix HAUT (rien)', diaOuvert: true, bouton: 'UP', attendu: 1, attenduAv: [], attenduDep: 0 },
  { nom: 'diaporama OUVERT + croix BAS (rien)', diaOuvert: true, bouton: 'DOWN', attendu: 1, attenduAv: [], attenduDep: 0 },
  { nom: 'AUCUN bouton (rien a lire)', diaOuvert: false, bouton: 'Y', attendu: 0 },
  // LE THROTTLE, mesure par une SERIE D'IMAGES. Un maintien ne doit PAS produire
  // un appel par image : sans le throttle, tenir la croix ferait defiler a la
  // cadence de la boucle. On ne fige pas le nombre attendu — il derive du pas et
  // des seuils — mais on MESURE qu'il reste bien en deca d'une image par appel.
  { nom: 'diaporama OUVERT + DROITE MAINTENUE, 3 images', diaOuvert: true, attendu: 3,
    seq: [{ b: 'RIGHT' }, { b: 'RIGHT' }, { b: 'RIGHT' }], attenduAv: [1] },
  { nom: 'diaporama OUVERT + DROITE MAINTENUE, 20 images', diaOuvert: true, attendu: 20,
    seq: Array.from({ length: 20 }, () => ({ b: 'RIGHT' })), avSous: 20, avMin: 2, avSens: 1 },
  { nom: 'diaporama FERME + GAUCHE MAINTENUE, 20 images', diaOuvert: false, attendu: 20,
    seq: Array.from({ length: 20 }, () => ({ b: 'LEFT' })), depSous: 20, depMin: 2 },
  { nom: 'diaporama OUVERT + HAUT MAINTENU, 20 images', diaOuvert: true, attendu: 20,
    seq: Array.from({ length: 20 }, () => ({ b: 'UP' })), attenduAv: [], attenduDep: 0 }
];
let echecs = 0, verif = 0;
const dire = (ok, quoi) => { if (!ok) echecs++; verif++; return ok ? 'OK   ' : 'ECHEC'; };
for (const c of cas) {
  const r = jouer(c);
  const lignesCas = [];
  lignesCas.push(dire(r.appels === c.attendu, 'geste')
    + ' diaInactivite ' + r.appels + '/' + c.attendu);
  if (c.attenduAv) lignesCas.push(dire(JSON.stringify(r.av) === JSON.stringify(c.attenduAv), 'av')
    + ' diaAvancer ' + JSON.stringify(r.av) + '/' + JSON.stringify(c.attenduAv));
  if (c.attenduDep !== undefined) lignesCas.push(dire(r.dep.length === c.attenduDep, 'dep')
    + ' padDeplacer ' + r.dep.length + '/' + c.attenduDep);
  // LE THROTTLE SE MESURE EN DEUX TEMPS : un appel par image SERAIT le defaut
  // (« maintenir la croix fait defiler a la cadence de la boucle »), et AUCUN
  // appel signifierait qu'on ne fait rien. On exige donc STRICTEMENT moins d'appels
  // que d'images, et au moins deux. Le nombre exact depend du pas simule : le figer
  // ici serait un litteral qui derive — c'est la forme du defaut que ce fichier
  // existe pour mesurer.
  if (c.avSous !== undefined) {
    const ok = r.av.length < c.avSous && r.av.length >= c.avMin && r.av.every(s => s === c.avSens);
    lignesCas.push(dire(ok, 'throttle') + ' diaAvancer ' + r.av.length + ' appels pour ' + c.seq.length
      + ' images (exige : < ' + c.avSous + ', >= ' + c.avMin + ', tous = ' + c.avSens + ')');
  }
  if (c.depSous !== undefined) {
    const ok = r.dep.length < c.depSous && r.dep.length >= c.depMin;
    lignesCas.push(dire(ok, 'throttle') + ' padDeplacer ' + r.dep.length + ' appels pour ' + c.seq.length
      + ' images (exige : < ' + c.depSous + ', >= ' + c.depMin + ')');
  }
  console.log(lignesCas.join('  ·  ') + '   — ' + c.nom);
}
// LE VERDICT SE COMPTE, IL NE S'ECRIT PAS. Cette ligne disait « les cinq cas
// passent » alors que la table en portait SIX : un litteral recopie a la main, qui a
// derive des le deuxieme cas ajoute. C'est exactement la forme du defaut que ce
// fichier existe pour mesurer — un nombre affiche sans etre derive de ce qu'il
// decrit.
console.log(echecs
  ? ('MESURE EN ECHEC : ' + echecs + ' verification(s) sur ' + verif + ', pour ' + cas.length + ' cas')
  : ('MESURE : les ' + cas.length + ' cas passent (' + verif + ' verifications) — la manette rearme le minuteur dans les DEUX branches, et le diaporama prend la croix avec le throttle'));
process.exit(echecs ? 1 : 0);
