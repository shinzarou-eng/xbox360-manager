#!/usr/bin/env node
// Sonde d'interface : ouvre l'app dans un vrai navigateur et rapporte des FAITS
// mesurables sur le rendu — pas une capture d'ecran.
//
// Pourquoi ce script existe : sans lui, une modification de la feuille de style
// ne se verifie qu'a l'oeil, donc jamais. Les tests de `test/ui-quality.test.js`
// lisent le CODE (contraste des jetons, classes definies, regle de centrage en
// dernier) ; ils ne peuvent pas voir qu'un tableau deborde de 40 px ou qu'une
// colonne fait 300 px de large. Cette sonde lit le RENDU.
//
// Elle passe par CDP sans jamais appeler `Page.enable` : c'est cet appel qui fait
// planter le moteur dans cet environnement (STATUS_BREAKPOINT). `Runtime.evaluate`
// suffit pour mesurer.
//
// Usage : node scripts/uicheck.js [vue] [recherche] [--modal] [--dlc] [--launch]
//   node scripts/uicheck.js cat halo        le catalogue, filtre « halo »
//   node scripts/uicheck.js dl halo         les telechargements, recherche « halo »
//   node scripts/uicheck.js lib             la bibliotheque
//   node scripts/uicheck.js cat --modal     la surcouche catalogue -> sources
//   node scripts/uicheck.js cat --modal --dlc   son onglet DLC/XBLA
//   UICHECK_OVL=#diaModal node scripts/uicheck.js dash    mesure une surcouche
//
// La sonde mesure AUSSI la barre haute (#topbar) : hauteur en part de fenetre,
// nombre de rangees, hauteur des onglets, et troncature du selecteur de disque.
// C'est une region qu'aucune vue ne couvre, et un en-tete trop haut se paie sur
// toutes les vues a la fois.
//
// UICHECK_SIZE=1600x1000 (defaut) choisit la taille de fenetre : la colonne de
// lecture ne se borne qu'au-dela de --w-max (1400 px), donc mesurer a 800 px ne
// dit rien de la mise en page reelle. UICHECK_GAME / UICHECK_TID choisissent le
// jeu mesure dans la surcouche.
//
// UICHECK_PHONE=1 MESURE L'APPLICATION COMME UN TELEPHONE. Sans lui, la sonde ne
// regardait AUCUNE ergonomie tactile : elle rendait « Aucun defaut mesure » a
// 390 px en se taisant sur les cibles de 37 px, sur ce qui depasse l'ecran et
// sur les textes coupes — un vert sur ce qu'elle n'avait jamais regarde.
// Le drapeau fait deux choses, et la premiere est la condition de l'autre :
//   - il emule un appareil mobile (`mobile:true`), ce qui rend VRAIS dans la page
//     `pointer: coarse` et `hover: none` : les regles tactiles de la feuille
//     deviennent mesurables, alors qu'ecrites sous ces media features elles
//     n'avaient aucun effet observable ;
//   - il ajoute QUATRE mesures (cibles sous 44 px, elements interactifs hors de
//     l'ecran, textes tronques sans ellipse, inventaire des cibles), qui poussent
//     toutes dans `R.defauts` — donc exit 1 des qu'un defaut de telephone existe.
// L'interface de sortie ne change pas, et SANS le drapeau rien ne change non
// plus : les releves de bureau restent comparables d'une passe a l'autre.
//
// SANS `--launch`, la sonde se contente de SE CONNECTER a un navigateur deja
// lance en debug. C'est volontaire : le lancer soi-meme sur une machine ou le
// moteur de rendu ne demarre pas ouvre une boite « Erreur d'application » sur le
// bureau de l'utilisateur. Une sonde ne doit jamais rien casser pour mesurer.
//
//   "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
//     --remote-debugging-port=9444 --user-data-dir=%TEMP%\x360-uicheck about:blank
//
// PIEGE : Chromium a besoin de PIPES NOMMES pour son IPC (Mojo). Un bac a sable
// qui les refuse fait mourir le navigateur sur
//   FATAL:mojo\public\cpp\platform\platform_channel.cc: Acces refuse (0x5)
// avant meme que la page ne se charge. Aucun drapeau n'y remede : il faut lancer
// le navigateur hors de ce bac a sable.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = Number(process.env.UICHECK_PORT || 9444);
const APP = process.env.UICHECK_URL || 'http://localhost:4360/';
const LANCER = process.argv.includes('--launch');
const ARGS = process.argv.slice(2).filter(a => !a.startsWith('--'));
const VUE = ARGS[0] || 'cat';
const RECHERCHE = ARGS[1] || '';
// `--modal` mesure la surcouche de telechargement au lieu d'une vue : c'est le
// chemin reel catalogue -> sources -> fichiers, et le seul ecran que la mesure
// d'une vue ne couvre pas.
const MODAL = process.argv.includes('--modal');
const MODAL_DLC = process.argv.includes('--dlc');
const JEU = process.env.UICHECK_GAME || 'Halo 3';
const JEU_TID = process.env.UICHECK_TID || '4D5307E6';
// LA SURCOUCHE MESUREE EST CHOISIE, plus figee. `--modal` etait cable sur
// `#dlModal` : chaque nouvelle surcouche demandait de toucher la sonde, et
// celles qu'on oubliait n'etaient jamais mesurees. `UICHECK_OVL` prend un
// selecteur ; `--modal` reste comme raccourci pour le cas le plus courant.
const RACINE = process.env.UICHECK_OVL || (MODAL ? '#dlModal' : '.view.active');
// La fenetre compte : la colonne de lecture ne se borne qu'au-dela de --w-max
// (1400 px), donc une mesure a 800 px ne dit rien de la mise en page reelle.
const TAILLE = (process.env.UICHECK_SIZE || '1600x1000').split('x').map(Number);
// PHONE n'est PAS un confort : c'est ce qui distingue « une fenetre etroite »,
// que la sonde savait deja mesurer, de « un doigt sur un ecran », qu'elle ne
// mesurait pas. Voir le bloc d'en-tete pour ce que le drapeau change.
const PHONE = process.env.UICHECK_PHONE === '1';
const PROF = path.join(os.tmpdir(), 'x360-uicheck');

// Chrome d'abord : c'est le navigateur avec lequel la sonde a ete validee.
const CANDIDATS = [
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].filter(Boolean);

const NAV = process.env.UICHECK_BROWSER || CANDIDATS.find(p => fs.existsSync(p));
if (!NAV) { console.error('Aucun navigateur trouve.'); process.exit(2); }

const dormir = ms => new Promise(r => setTimeout(r, ms));

function httpJson(chemin, methode) {
  return new Promise((resolve, reject) => {
    const rq = require('http').request({ host: '127.0.0.1', port: PORT, path: chemin, method: methode || 'GET' }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    rq.on('error', reject);
    rq.setTimeout(4000, () => rq.destroy(new Error('timeout')));
    rq.end();
  });
}

async function attendreNavigateur(limite) {
  const fin = Date.now() + limite;
  while (Date.now() < fin) { try { return await httpJson('/json/version'); } catch { await dormir(400); } }
  return null;
}

// --- L'expression evaluee DANS la page -------------------------------------
// Elle ne modifie rien : elle mesure. Chaque mesure repond a une question qu'on
// ne peut pas trancher en lisant le code. `racine` est le conteneur mesure : une
// vue (${racine}) ou une surcouche (#dlModal).
const SONDE = (racine, estVue) => `(() => {
  const px = n => Math.round(n);
  const boite = el => { if (!el) return null; const b = el.getBoundingClientRect(); return {x:px(b.x),y:px(b.y),w:px(b.width),h:px(b.height)}; };
  const R = { vue: null, viewport: {w: innerWidth, h: innerHeight}, defauts: [] };

  // 1. La colonne de lecture : les marges gauche et droite doivent etre egales,
  //    sinon le contenu est decale — c'est le defaut qu'on ne voit qu'a l'oeil.
  //    La regle ne vaut QUE pour une vue : une surcouche occupe volontairement
  //    toute la largeur, la lui appliquer inventait un defaut.
  const vb = document.querySelector('${racine}');
  R.vue = vb ? (vb.id || vb.className) : null;
  // LA BOITE DE LA RACINE REMONTE, et elle est la preuve que la mesure a bien eu
  // lieu. Sans elle, mesurer une surcouche FERMEE rendait « Aucun defaut mesure »
  // en 0 : un vert sur rien, le pire resultat possible pour un instrument.
  R.racineBoite = boite(vb);
  // La propriete CSS lue est display et non la boite seule : display:none est un
  // fait du style, tandis qu'une boite de 0 px peut aussi venir d'un conteneur
  // reellement vide — les deux cas sont separes dans le rapport.
  // (AUCUN backtick dans ce commentaire : l'expression envoyee est un template
  // literal, et un backtick ici terminerait la chaine — le script ne demarrerait
  // meme plus. Le piege est arrive pour de vrai pendant cette passe.)
  R.affiche = (vb && R.racineBoite && R.racineBoite.w === 0 && R.racineBoite.h === 0)
    ? getComputedStyle(vb).display : null;
  const vc = vb ? getComputedStyle(vb) : null;
  if (vc && ${estVue}) {
    const g = parseFloat(vc.paddingLeft), d = parseFloat(vc.paddingRight);
    R.colonne = { gauche: px(g), droite: px(d), ecart: px(Math.abs(g - d)) };
    if (Math.abs(g - d) > 1) R.defauts.push('colonne decalee de ' + px(Math.abs(g - d)) + ' px (gauche ' + px(g) + ' / droite ' + px(d) + ')');
    const contenu = vb.scrollWidth - g - d;
    R.colonne.largeurContenu = px(contenu);
    const max = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--w-max')) || 0;
    if (max && contenu > max + 1) R.defauts.push('contenu large de ' + px(contenu) + ' px > --w-max ' + max + ' px');
  }

  // 2. Debordement horizontal : un element plus large que son parent pousse les
  //    dernieres colonnes hors de l'ecran sans aucun moyen de les atteindre.
  R.debordent = [];
  for (const el of document.querySelectorAll('${racine} *')) {
    if (!el.offsetParent && el.tagName !== 'TD' && el.tagName !== 'TH') continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      R.debordent.push((el.id ? '#' + el.id : el.className || el.tagName) + ' ' + el.scrollWidth + '>' + el.clientWidth);
    }
  }
  R.debordent = R.debordent.slice(0, 12);

  // 3. Tableaux : un en-tete sans cellule, ou des lignes qui n'ont pas le meme
  //    nombre de cellules que l'en-tete, cassent l'alignement des colonnes.
  R.tableaux = [];
  for (const t of document.querySelectorAll('${racine} table')) {
    const ths = [...t.querySelectorAll('thead th')];
    const lignes = [...t.querySelectorAll('tbody tr')];
    const corps = t.querySelector('tbody');
    // ON ADDITIONNE LES COLSPAN, comme le fait deja le garde-fou « cellules =
    // en-tetes » du depot. Une ligne d'etat VIDE est legitime et couvre ses
    // colonnes par colspan : il n'y a rien a aligner puisqu'il n'y a rien.
    // Compter ses ENFANTS la faisait passer pour une ligne a une seule cellule,
    // et la sonde annoncait « aucune ligne n'a 3 cellules » sur un tableau
    // CORRECT — mesure : tableau dlResults : 3 en-tetes, 1 lignes, cellules
    // {"1":1} avec exit 1, sur l'etat vide de la recherche Vimm. Le faux positif
    // vaut pour TOUT etat vide de TOUT tableau : c'est la sonde qui criait, pas
    // la page. Math.max(1, ...) parce qu'un colspan absent, vide ou nul vaut
    // UNE colonne, jamais zero.
    const compte = {};
    for (const tr of lignes) {
      const n = [...tr.children].reduce((s, c) => s + Math.max(1, Number(c.getAttribute('colspan')) || 1), 0);
      compte[n] = (compte[n] || 0) + 1;
    }
    // une cellule vide en en-tete = un tableau qui n'assume pas ses colonnes
    const vides = ths.filter(th => !th.textContent.trim() && !th.querySelector('img,svg')).length;
    const info = {
      id: corps ? corps.id : null,
      enTetes: ths.length,
      vides,
      lignes: lignes.length,
      cellules: compte,
      largeur: px(t.getBoundingClientRect().width),
      colonnes: ths.map(th => px(th.getBoundingClientRect().width))
    };
    if (ths.length && lignes.length && !compte[ths.length]) R.defauts.push('tableau ' + info.id + ' : aucune ligne n\\'a ' + ths.length + ' cellules (en-tete) — ' + JSON.stringify(compte));
    if (vides) R.defauts.push('tableau ' + info.id + ' : ' + vides + ' en-tete(s) sans intitule');
    R.tableaux.push(info);
  }

  // 4. Typographie reellement rendue : la feuille peut dire 12 px et l'element
  //    en afficher 9 apres heritage.
  const petites = [];
  for (const el of document.querySelectorAll('${racine} *')) {
    if (!el.textContent.trim() || el.children.length) continue;
    const f = parseFloat(getComputedStyle(el).fontSize);
    if (f && f < 12) petites.push((el.className || el.tagName) + ' ' + f + 'px');
  }
  R.petites = [...new Set(petites)].slice(0, 10);
  if (R.petites.length) R.defauts.push('texte sous 12 px : ' + R.petites.join(', '));

  // 5. Contraste mesure sur les vrais fonds composes (le fond reel, pas le jeton).
  const lum = c => { const m = c.match(/[\\d.]+/g).map(Number); const [r,g,b] = m.slice(0,3).map(v => { const s = v/255; return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4); }); return 0.2126*r + 0.7152*g + 0.0722*b; };
  const fondDe = el => { let n = el; while (n && n !== document.documentElement) { const c = getComputedStyle(n).backgroundColor; const a = c.startsWith('rgba') ? parseFloat(c.split(',')[3]) : 1; if (a > 0.75) return c; n = n.parentElement; } return 'rgb(26,26,26)'; };
  R.contrasteFaible = [];
  // LES BOUTONS Y SONT, et ils n'y etaient pas : c'est l'element qu'on clique le
  // plus, et personne ne mesurait son contraste. Un bouton d'accent portait du
  // blanc a 77 % sur son propre vert (1,8:1) sans qu'aucun releve ne le signale.
  //
  // LA LEGENDE DU DIAPORAMA AUSSI, et c'est le trou par lequel un vrai defaut est
  // passe : ces quatre elements ne portent AUCUNE classe, donc la liste d'origine
  // ne les voyait pas, et la sonde rendait « Aucun defaut mesure » sur un
  // diaporama dont la legende tombait a 2,05:1 sur une jaquette claire. Un
  // controle qui ne regarde pas ne dit pas « tout va bien », il ne dit rien.
  //
  // TOUS PREFIXES PAR LA RACINE, y compris eux. Ils vivent dans #diaModal, qui
  // reste dans le DOM quand on mesure une AUTRE surcouche : un selecteur nu
  // mesurerait la legende du diaporama pendant qu'on regarde la surcouche de
  // telechargement, et signalerait un defaut que personne n'a sous les yeux.
  const SELECTEURS_CONTRASTE = ['.status', 'h2', 'th', '.lead', '.srcnote', '.c-nm', '.badge',
    '.btn:not(.quiet)', '#diaNom', '#diaMeta', '#diaCompteur', '#diaPause', '#diaVide'];
  for (const el of document.querySelectorAll(SELECTEURS_CONTRASTE.map(s => '${racine} ' + s).join(', '))) {
    if (!el.textContent.trim()) continue;
    const c = getComputedStyle(el).color;
    const f = fondDe(el);
    const l1 = lum(c), l2 = lum(f);
    const ratio = (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
    if (ratio < 4.5) R.contrasteFaible.push((el.className||el.tagName) + ' ' + ratio.toFixed(2) + ':1');
  }
  R.contrasteFaible = [...new Set(R.contrasteFaible)];

  // 6. Sections repliables, et sections annoncees mais sans contenu.
  //    Attention : un bloc d'IMAGES n'a aucun textContent — une etagere pleine de
  //    jaquettes etait donc comptee comme vide. Un bloc est vide quand il n'a ni
  //    texte, ni enfants. Et un en-tete masque par style.display (pas par
  //    l'attribut hidden) n'est pas rendu : offsetParent le dit.
  R.repliables = [...document.querySelectorAll('${racine} .sec-fold')].map(d => ({ titre: d.querySelector('summary').textContent.trim(), ouvert: d.open }));
  R.sectionsVides = [...document.querySelectorAll('${racine} h2.sec')].filter(h => {
    if (h.hidden || h.offsetParent === null) return false;
    const n = h.nextElementSibling;
    if (!n) return true;
    return !n.textContent.trim() && n.children.length === 0;
  }).map(h => h.textContent.trim());
  if (R.sectionsVides.length) R.defauts.push('section annoncee mais vide : ' + R.sectionsVides.join(', '));

  // 7. Alignement en colonne : les blocs d'une meme vue doivent partager la meme
  //    bordure gauche. Un decalage de quelques pixels se voit immediatement.
  //    On ignore ce qui est masque : un element cache a une boite nulle, donc
  //    un bord a 0 — le compter signalait un defaut qui n'existe pas.
  const bords = [...document.querySelectorAll('${racine} > .lead, ${racine} > .toolbar, ${racine} > .tablewrap, ${racine} > .store, ${racine} > .sec-fold, ${racine} > h2, ${racine} > #dlMgr')]
    .filter(el => !el.hidden && el.getBoundingClientRect().width > 0)
    .map(el => ({ el: (el.className || el.tagName) + (el.id ? '#' + el.id : ''), x: px(el.getBoundingClientRect().x) }));
  R.bords = bords;
  if (bords.length) {
    const xs = [...new Set(bords.map(b => b.x))];
    if (xs.length > 1) R.defauts.push('bords gauches desalignes : ' + JSON.stringify(bords));
  }

  // 8. TAILLE DES ICONES. Un <svg> sans largeur ni hauteur prend celle de son
  //    conteneur : la ligne de transfert faisait 200 px de haut avec des fleches
  //    geantes, et aucun releve ne l'avait vu parce que le panneau etait vide.
  //    Une icone se mesure sur la page RENDUE — une regle CSS peut etre absente,
  //    ce qu'aucun test de feuille ne peut voir.
  const grosses = [...document.querySelectorAll('${racine} svg')]
    //   .bl-orb n'est pas une icone : c'est la marque du rail — la sphere X
    //   et son anneau — dimensionnee volontairement, comme le logo de marque.
    .filter(sv => !sv.closest('.bl-orb'))
    .filter(sv => { const r = sv.getBoundingClientRect(); return r.width > 48 || r.height > 48; })
    .map(sv => { const r = sv.getBoundingClientRect(); return (sv.parentElement && sv.parentElement.className || sv.getAttribute('class') || 'svg') + ' ' + px(r.width) + 'x' + px(r.height); });
  R.icones = grosses;
  if (grosses.length) R.defauts.push('icone surdimensionnee (48 px max) : ' + grosses.slice(0, 4).join(', '));

  // 9. Barres d'outils : une barre dont la hauteur depasse nettement celle de ses
  //    controles a passe a la ligne. Ce n'est pas toujours un defaut, mais a
  //   1600 px de large, une barre sur deux lignes veut dire que quelque chose
  //    occupe trop de place.
  R.barres = [];
  for (const tb of document.querySelectorAll('${racine} .toolbar, ${racine} .srcrow, ${racine} .storebar')) {
    if (tb.hidden || !tb.getBoundingClientRect().width) continue;
    const h = px(tb.getBoundingClientRect().height);
    const enfants = [...tb.children].map(c => px(c.getBoundingClientRect().height)).filter(Boolean);
    const max = enfants.length ? Math.max(...enfants) : 0;
    R.barres.push({ h, max, ligne: h <= max + 6 ? 1 : Math.round(h / Math.max(max, 1)) });
  }

  // 8. Le total annonce doit correspondre a ce qui est affiche.
  const st = document.querySelector('${racine} .status');
  R.statut = st ? st.textContent.trim() : '';
  const corps = document.querySelector('${racine} tbody');
  R.lignesAffichees = corps ? corps.querySelectorAll('tr').length : 0;

  // 10. Couleurs reellement rendues des elements porteurs de texte. Une capture
  //     d'ecran se juge a l'oeil, mais une teinte inattendue se mesure : le vert
  //     d'accent et l'ambre d'avertissement se ressemblent sur un fond sombre.
  R.couleurs = {};
  for (const sel of ['.status', 'h2.sec', '.lead', '.srcnote', 'th', '.c-nm', '.c-tid', '.seg-i.on']) {
    const el = document.querySelector('${racine} ' + sel);
    if (el) R.couleurs[sel] = getComputedStyle(el).color;
  }

  // 10. Defilement. C'est le defaut qui a echappe le plus longtemps : la coque
  //     n'etait pas un conteneur flex, donc la vue n'avait pas de hauteur bornee,
  //     donc overflow:auto ne faisait RIEN. Le contenu depassait le bas de la
  //     fenetre et overflow:hidden le coupait : inaccessible a la molette comme
  //     a la barre. Aucune mesure de mise en page ne le voyait — il fallait
  //     comparer la hauteur du contenu a celle de la vue.
  R.scroll = [];
  for (const el of [document.querySelector('${racine}'), document.querySelector('${racine} > *')].filter(Boolean)) {
    const c = getComputedStyle(el);
    const info = {
      el: el.id || el.className || el.tagName,
      client: el.clientHeight, contenu: el.scrollHeight,
      'overflow-y': c.overflowY, defilable: el.scrollHeight > el.clientHeight + 1
    };
    R.scroll.push(info);
    const cache = c.overflowY === 'hidden' || c.overflowY === 'visible';
    if (info.defilable && cache && c.overflowY === 'hidden') {
      R.defauts.push('contenu coupe, sans defilement : ' + info.el + ' (' + info.contenu + ' px de contenu pour ' + info.client + ' px visibles, overflow-y:' + c.overflowY + ')');
    }
  }

  // 12. LA BARRE HAUTE. C'etait la SEULE region que rien ne mesurait : la sonde
  //     ne regarde que la vue active, alors qu'un en-tete trop haut mange la
  //     hauteur utile de TOUTES les vues a la fois. On mesure ce qui se voit :
  //     sa hauteur en part de fenetre, son nombre de RANGEES, la hauteur des
  //     onglets, et si le selecteur de disque coupe son libelle. Une ellipse
  //     dans un <select> ne se voit ni dans la feuille, ni dans une capture :
  //     elle depend du texte de l'option, donc des roles configures.
  const haut = document.getElementById('topbar');
  if (haut) {
    const bh = boite(haut);
    const enfants = [...haut.children].filter(e => e.getBoundingClientRect().height > 0);
    const ys = [...new Set(enfants.map(e => px(e.getBoundingClientRect().y)))];
    // LES ONGLETS VIVENT DANS LE RAIL. Depuis la refonte NXE la navigation est
    // dans #blades (rail lateral, ou bande repliee sous l'en-tete) ; chercher
    // les .ttab sous #topbar ne trouvait plus rien — une mesure d'onglets nulle
    // n'est pas une mesure d'onglets.
    const nav = document.getElementById('blades') || haut;
    const onglets = [...nav.querySelectorAll('.ttab')].map(o => {
      const r = o.getBoundingClientRect();
      return { t: o.textContent.trim(), x: px(r.x), w: px(r.width), h: px(r.height), fs: px(parseFloat(getComputedStyle(o).fontSize)) };
    });
    let sel = null;
    const sd = document.getElementById('drive');
    if (sd) {
      const cs = getComputedStyle(sd);
      const cv = document.createElement('canvas').getContext('2d');
      cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const txt = sd.options.length ? sd.options[sd.selectedIndex].text : '';
      const large = cv.measureText(txt).width;
      // La fleche native du select occupe une vingtaine de pixels qu'aucun
      // rembourrage ne declare : la compter, sinon on croit que ca passe.
      const dispo = sd.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 20;
      sel = { texte: txt, rendu: px(large), dispo: px(dispo), tronque: large > dispo + 1 };
    }
    const bande = nav.querySelector('.tb-tabs');
    R.haut = {
      h: bh.h, pct: Math.round(bh.h / innerHeight * 100), rangees: ys.length, rangeesY: ys,
      onglets, largeurOnglets: onglets.length ? px(onglets[onglets.length - 1].x + onglets[onglets.length - 1].w - onglets[0].x) : 0,
      place: bande ? px(boite(bande).w) : null,
      defile: bande ? bande.scrollWidth > bande.clientWidth + 1 : false,
      select: sel
    };
    // LE CLIQUET PORTE SUR LA HAUTEUR, PAS SUR LE RATIO. Le ratio seul se
    // trompait de cause : a 1280x800 la barre faisait 11 % de la fenetre alors
    // qu'elle mesurait toujours 84 px — ce n'est pas elle qui avait grossi,
    // c'est la fenetre qui avait retreci. 96 px est le plafond (le defaut
    // mesure etait 108) ; le ratio ne sert qu'a attraper une fenetre si courte
    // que la barre y prend vraiment l'ecran.
    if (bh.h > 96) R.defauts.push('barre haute : ' + bh.h + ' px (96 px au plus)');
    else if (R.haut.pct > 12) R.defauts.push('barre haute : ' + R.haut.pct + ' % d une fenetre de ' + innerHeight + ' px');
    // Le NOMBRE DE RANGEES n'est PAS un defaut, et l'avoir compte comme tel
    // etait une faute de la sonde : un en-tete sur deux rangees bien remplies
    // coute exactement sa hauteur, et rien de plus. Ce qui se paie sur toutes
    // les vues, c'est le RATIO ci-dessus. On le rend comme un fait, pour
    // pouvoir juger si une rangee est la pour quelque chose.
    if (R.haut.defile) R.defauts.push('la bande d onglets defile : ' + R.haut.largeurOnglets + ' px d onglets pour ' + R.haut.place + ' px de place');
    // Une page SANS onglet mesure n'a pas de navigation mesuree : c'est un
    // defaut de l'app ou du DOM, jamais un succes silencieux.
    if (!onglets.length) R.defauts.push('aucun onglet mesure dans #blades/#topbar');
    const bas = onglets.filter(o => o.h < 44).map(o => o.t + ' ' + o.h + 'px');
    if (bas.length) R.defauts.push('onglet sous 44 px : ' + bas.join(', '));
    if (sel && sel.tronque) R.defauts.push('selecteur de disque tronque : le libelle demande ' + sel.rendu + ' px pour ' + sel.dispo + ' px');
  }

  // 11. Les premiers libelles de resultats : c'est ce qui permet de juger la
  //     PERTINENCE sur du texte, sans avoir a lire une capture d'ecran.
  R.premieres = [];
  const tb = document.querySelector('${racine} tbody');
  if (tb) for (const tr of tb.querySelectorAll('tr')) {
    // On filtre AVANT de couper : les lignes repliees d'un groupe sont masquees,
    // et un slice prealable ne laissait voir que les deux premiers groupes.
    if (tr.style.display === 'none' || !tr.offsetParent) continue;
    if (R.premieres.length >= 14) break;
    // DOUBLE ANTISLASH ET NON UN SEUL : cette ligne vit dans un TEMPLATE LITERAL.
    // Un antislash-s y est une echappee INCONNUE, rendue telle quelle — le motif
    // arrive donc dans la page sous la forme /s+/g, et le releve perd ses « s » :
    // « Legends Pack » s'affichait « Legend  Pack », « Not hosted » devenait
    // « Not ho ted ». Le DOM etait intact : c'est le RAPPORT de la sonde qui etait
    // corrompu, donc precisement ce qu'on lit pour decider. La ligne 499 du meme
    // fichier utilisait deja le double antislash.
    //
    // ET PAS DE BACKTICK DANS CE COMMENTAIRE : il terminerait la chaine du
    // template literal, et la sonde ne demarrerait plus du tout. C'est ecrit dans
    // les notes du projet ; la premiere version de ce commentaire y a suffi.
    const t = tr.textContent.replace(/\\s+/g, ' ').trim();
    if (t) R.premieres.push(t.slice(0, 72));
  }

  // 13. LA COUCHE MICA. Aucune mesure ne verifiait qu'elle echantillonne QUELQUE
  //     CHOSE. Le fond etait le fanart du jeu courant, et la sonde ne selectionne
  //     aucun jeu : elle mesurait donc, en toute bonne foi, un aplat gris
  //     parfaitement conforme — et le defaut ne pouvait pas apparaitre.
  //     Ce qu'on verifie : la couche ANNONCE une image (defaut si non — c'est une
  //     regression de la feuille), elle est floutee, et elle deborde de l'ecran
  //     pour que le flou ne decouvre pas ses bords. Le fait que l'image se charge
  //     ou non depend de la MACHINE (sans fond d'ecran defini, la route rend 204)
  //     : c'est rapporte comme un fait, pas comme un defaut.
  const mica = document.getElementById('appbg');
  if (mica) {
    const cm = getComputedStyle(mica);
    const r = mica.getBoundingClientRect();
    // DOUBLE ANTISLASH, et ce n'est pas une coquetterie : cette expression est un
    // TEMPLATE LITERAL cote Node. Un antislash simple y est MANGE, donc un motif
    // ecrit avec un seul antislash arrive dans la page sans lui — le moteur de
    // regex recoit alors une parenthese ouvrante non echappee et refuse le motif
    // entier (« Unterminated group »). La sonde ne renvoyait plus RIEN, avec pour
    // seul message « La page n'a rien renvoye », qui n'oriente pas vers la cause.
    // C'est le piege du backtick, en moins visible : ici on n'ecrit donc AUCUN
    // backtick dans ces commentaires, sans quoi la chaine se termine et le script
    // ne demarre plus du tout. Un garde-fou verifie que l'expression compile.
    const flou = /blur\\(([\\d.]+)px\\)/.exec(cm.filter);
    R.mica = {
      annonce: /url\\(/.test(cm.backgroundImage),
      src: (cm.backgroundImage.match(/url\\(["']?([^"')]+)/) || [])[1] || null,
      flou: flou ? Number(flou[1]) : 0,
      deborde: px(r.left) < 0 && px(r.top) < 0 && px(r.right) > innerWidth && px(r.bottom) > innerHeight,
      filtre: cm.filter,
      papier: document.body.classList.contains('papier')
    };
    // LE PAPIER PEINT EST UNE OPTION. Le mode graphite (defaut) n'a NI image NI
    // flou — les exiger ici ferait de l'etat nominal un defaut, et l'inverse
    // (une image qui persiste en graphite) est exactement la fuite a detecter.
    if (R.mica.papier) {
      if (!R.mica.annonce) R.defauts.push('couche Mica : mode papier peint sans image declaree');
      if (!R.mica.flou) R.defauts.push('couche Mica : mode papier peint sans flou, ce n est plus un materiau mais un fond');
      if (!R.mica.deborde) R.defauts.push('couche Mica : elle ne deborde pas de l ecran, le flou decouvre ses bords');
    } else {
      if (R.mica.annonce) R.defauts.push('couche Mica : le mode graphite annonce quand meme une image');
      if (R.mica.flou) R.defauts.push('couche Mica : le mode graphite paie un flou sans image');
    }
  }

  // 14. TELEPHONE : LES QUATRE MESURES DU DOIGT.
  //     Sans elles, la sonde rendait « Aucun defaut mesure » a 390 px en ne
  //     regardant NI les cibles, NI ce qui depasse l'ecran, NI les troncatures.
  //     Un instrument qui ne regarde pas ne dit pas « tout va bien » : il ne dit
  //     rien, et c'est le pire resultat possible ici.
  //
  //     LES MEDIA FEATURES SONT RAPPORTEES MEME QUAND ON NE MESURE PAS : c'est la
  //     seule preuve que l'emulation mobile:true a bien pris. Si elle
  //     disparaissait de la sonde, pointer:coarse retomberait a faux et
  //     personne ne s'en apercevrait — les regles tactiles de la feuille
  //     deviendraient invisibles a la mesure, exactement le defaut d'origine.
  const TACTILE = {
    demande: ${process.env.UICHECK_PHONE === '1'},
    coarse: matchMedia('(pointer: coarse)').matches,
    hoverNone: matchMedia('(hover: none)').matches,
    points: navigator.maxTouchPoints || 0
  };
  R.tactile = TACTILE;
  // LE DRAPEAU COMMANDE LA MESURE, LUI SEUL. On ne mesure pas « parce que la page
  // se dit grossiere » : sur un portable a ecran tactile, pointer:coarse peut
  // basculer sans qu'aucun telephone soit en jeu, et un releve de bureau
  // changerait de nature d'une machine a l'autre. Les media features restent
  // rapportees comme un FAIT, pas comme un interrupteur.
  const MESURER_TEL = TACTILE.demande;
  if (TACTILE.demande && !TACTILE.coarse) {
    R.defauts.push('UICHECK_PHONE=1 est demande mais la page ne se voit PAS en pointeur grossier :' +
      ' l emulation mobile n a pas pris, donc aucune regle tactile ne sera mesuree');
  }

  if (MESURER_TEL) {
    // LE SEUIL EST 44 px, largeur ET hauteur : c'est la cible minimale du doigt.
    const SEUIL = 44;
    // LA BORDURE DE L'ECRAN N'EST PAS innerWidth, ET C'EST MESURE.
    // Sur une page mobile qui deborde, Chrome elargit innerWidth a la largeur du
    // CONTENU — 1041 px pour un ecran de 390 — alors que
    // document.documentElement.clientWidth, screen.width et visualViewport.width
    // restent tous les trois a 390 (releve fait en poussant le bouton de langue a
    // x=996). Comparer les bords a innerWidth rendait donc « tout est dans la
    // fenetre » sur une page qui deborde de 651 px : le defaut meme que cette
    // mesure existe pour attraper, efface par la reference choisie. On mesure
    // contre l'ECRAN.
    const BORD = document.documentElement.clientWidth || innerWidth;
    if (innerWidth > BORD + 1) {
      R.defauts.push('la page deborde : innerWidth s elargit a ' + innerWidth + ' px pour un ecran de ' + BORD
        + ' px — sur un telephone, ce qui depasse le bord est coupe, et aucune cible n y est atteignable');
    }
    // CE QU'UN DOIGT DOIT ATTEINDRE. Le perimetre est la PAGE ENTIERE, pas la
    // seule vue mesuree, et c'est volontaire : les huit onglets vivent dans
    // #topbar, HORS de .view.active. Une mesure bornee a la racine n'aurait pas
    // vu le premier defaut du chantier (37 x 44 px) — precisement ce qu'on
    // demande a cette mesure d'attraper.
    const CLIQUABLE = 'button, a[href], [tabindex="0"], input, select, textarea, label.checkline';
    const nomDe = el => {
      const cls = (typeof el.className === 'string' && el.className.trim())
        ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
      const txt = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 28);
      return (el.id ? '#' + el.id : el.tagName.toLowerCase() + cls) + (txt ? ' « ' + txt + ' »' : '');
    };
    const cibles = [];
    // UN CONTENEUR QUI DEFILE HORIZONTALEMENT REND SES ENFANTS ATTEIGNABLES.
    // C'est un FAIT, pas un defaut — et sans cette distinction, la mesure
    // inventait trente-quatre defauts : le coverflow #flow (overflow-x:auto)
    // porte 34 pochettes a x>390, toutes atteignables en le faisant defiler.
    // Elles noyaient le seul element VRAIMENT intouchable, qui est la raison
    // d'etre de cette mesure. On ne retient donc que le conteneur qui defile
    // REELLEMENT (scrollWidth > clientWidth) : un ancetre en overflow:hidden ne
    // sauve personne, il cache.
    const conteneurDefilant = el => {
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        const c = getComputedStyle(n);
        if ((c.overflowX === 'auto' || c.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 1) {
          return n.id ? '#' + n.id : (n.className || n.tagName);
        }
      }
      return null;
    };
    // Un ancetre ENTIEREMENT hors du cadre horizontal = un tiroir ferme. On ne
    // regarde pas le vertical : une page defile toujours vers le bas, alors
    // qu'elle ne defile jamais lateralement sans que ce soit le defaut lui-meme.
    const dansLeCadre = el => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const b = n.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.left >= BORD - 1 || b.right <= 1) return false;
      }
      return true;
    };
    for (const el of document.querySelectorAll(CLIQUABLE)) {
      if (el.disabled) continue;
      if (el.closest('[hidden]')) continue;
      // CE QUI EST « A L ECRAN ». Un panneau qui GLISSE (position fixe, gare hors
      // de la fenetre quand il est ferme) garde une boite NON NULLE : sans cette
      // regle, la fiche de jeu fermee etait comptee et ses six boutons d'action
      // (AOPEN, XCOPY TID, RENOMMER, DEPLACER, JAQUETTE, SUPPRIMER) sortaient a
      // x=392 — la sonde criait « hors de l ecran » sur un tiroir FERME, et
      // fabriquait sept defauts d'un coup. Un panneau ferme n'est pas une cible :
      // c'est exactement le piege que la boite de la racine a deja appris a cette
      // sonde (une surcouche fermee rendait « Aucun defaut mesure », d'ou l'exit 8).
      // L'ELEMENT, LUI, PEUT ETRE HORS DE L'ECRAN : c'est ce que la mesure 2 doit
      // attraper (« le bouton de langue a x=599 dans une fenetre de 390 »). Seuls
      // ses ANCETRES entierement sortis du cadre le disqualifient.
      if (!dansLeCadre(el)) continue;
      // LA CASE D'UN label.checkline EST ECARTEE : c'est le <label> qui porte le
      // clic, sur toute la largeur de la ligne. Mesurer la case de 14 px
      // signalerait un defaut que le doigt ne rencontre jamais — une sonde qui
      // invente un defaut est pire qu'une sonde muette.
      if (el.tagName === 'INPUT' && el.closest('label.checkline')) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const b = el.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) continue;
      cibles.push({ nom: nomDe(el), w: px(b.width), h: px(b.height), x: px(b.x), y: px(b.y), defile: conteneurDefilant(el) });
    }

    // 1. CIBLES TACTILES. Le rapport COMPTE les fautives et nomme les cinq pires
    //    (les plus petites), en disant QUELLE dimension echoue : un compte sans
    //    nom ne dit pas quoi corriger, et « 37 px de large » ne se repare pas
    //    comme « 30 px de haut ».
    const fautives = cibles.filter(c => c.w < SEUIL || c.h < SEUIL);
    R.cibles = {
      seuil: SEUIL, total: cibles.length, sous44: fautives.length,
      pires: fautives.slice().sort((a, b) => (a.w * a.h) - (b.w * b.h)).slice(0, 5).map(c =>
        c.nom + ' ' + c.w + 'x' + c.h + (c.w < SEUIL && c.h < SEUIL ? ' (les deux)' : (c.w < SEUIL ? ' (largeur)' : ' (hauteur)')))
    };
    if (fautives.length) R.defauts.push('cibles tactiles sous ' + SEUIL + ' px : ' + fautives.length
      + ' sur ' + cibles.length + ' — ' + R.cibles.pires.join(' · '));

    // 2. ATTEIGNABILITE. Un element interactif dont la boite depasse le bord droit
    //    — ou commence avant le bord gauche — est hors d'atteinte : le doigt ne
    //    peut pas le toucher. C'est ce qui attrape « le bouton de langue a x=599
    //    dans une fenetre de 390 ».
    //    Le document lui-meme N'EST PAS une echappatoire : une page qui defile
    //    lateralement sur un telephone est le defaut, pas la solution.
    const sortis = cibles.filter(c => c.x + c.w > BORD + 1 || c.x < -1);
    R.horsEcran = sortis.filter(c => !c.defile)
      .map(c => c.nom + ' a x=' + c.x + ' (' + c.w + ' px de large pour un ecran de ' + BORD + ')');
    // Ceux qui sont hors vue DANS un conteneur qui defile : atteignables, donc
    // pas des defauts — mais on les NOMME quand meme, avec leur conteneur. Une
    // mesure qui se tairait sur ce qu'elle a vu ne vaudrait pas mieux que celle
    // qui ne regardait pas.
    const parConteneur = {};
    for (const c of sortis) { if (c.defile) parConteneur[c.defile] = (parConteneur[c.defile] || 0) + 1; }
    R.horsVueDefilant = Object.keys(parConteneur).map(k => parConteneur[k] + ' dans ' + k);
    if (R.horsEcran.length) R.defauts.push('elements interactifs hors de l ecran : ' + R.horsEcran.length
      + ' — ' + R.horsEcran.slice(0, 5).join(' · '));

    // 3. TRONCATURES. Un texte plus large que sa boite, sans text-overflow:
    //    ellipsis : il est coupe SANS que rien ne le dise. Trois exclusions, et
    //    chacune ferme un faux defaut :
    //     - la boite doit REELLEMENT couper (overflow hidden ou clip). Avec
    //       overflow:visible, rien n'est cache : appeler ca une troncature
    //       serait inventer un defaut ;
    //     - une boite de 4 px ou moins ne MONTRE aucun texte : c'est le motif
    //       « libelle pour lecteur d'ecran » (position absolue, 1 px, clip-path)
    //       qu'emploient les onglets en icones. Le compter signalerait huit faux
    //       defauts sur des libelles volontairement sortis de l'ecran ;
    //     - un texte FONDU par un masque (mask-image) ou decoupe par un
    //       clip-path est un ornement assume, pas une information perdue : le
    //       titre en filigrane #flowGhost est fait exactement comme ca, et le
    //       signaler ferait corriger une decoration. Ceux-la sont rendus a part,
    //       comme un fait, pas effaces du rapport.
    const tronques = [], masques = [];
    for (const el of document.querySelectorAll('*')) {
      if (!el.textContent.trim() || el.children.length) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      if (s.textOverflow === 'ellipsis') continue;
      if (s.overflowX !== 'hidden' && s.overflowX !== 'clip') continue;
      const b = el.getBoundingClientRect();
      if (b.width <= 4 || b.height <= 4) continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      if (s.maskImage !== 'none' || s.webkitMaskImage !== 'none'
        || (s.clipPath && s.clipPath !== 'none')) {
        masques.push(nomDe(el)); continue;
      }
      tronques.push(nomDe(el) + ' ' + el.scrollWidth + ' px de texte pour ' + el.clientWidth + ' px');
    }
    R.tronques = tronques;
    R.masques = masques;
    if (tronques.length) R.defauts.push('textes tronques sans ellipse : ' + tronques.length
      + ' — ' + tronques.slice(0, 5).join(' · '));

    // 4. L'INVENTAIRE. La liste de ce qu'il y a a toucher, avec sa taille : c'est
    //    ce qui permet de dire « voila tout, et voila ce qui est trop petit » au
    //    lieu de le deviner. Les tailles sont AUSSI regroupees : quarante boutons
    //    identiques n'apprennent rien de plus qu'une ligne « 32x32 x 40 ».
    const groupes = {};
    for (const c of cibles) { const k = c.w + 'x' + c.h; groupes[k] = (groupes[k] || 0) + 1; }
    R.inventaire = {
      total: cibles.length,
      ecran: BORD,            // la largeur REELLE de l'ecran, et non innerWidth
      tailles: Object.keys(groupes).map(k => ({ taille: k, n: groupes[k] }))
        .sort((a, b) => b.n - a.n).slice(0, 12),
      liste: cibles.slice(0, 60).map(c =>
        (c.w < SEUIL || c.h < SEUIL ? 'PETIT ' : '      ') + (c.w + 'x' + c.h).padEnd(10) + c.nom)
    };
  }

  return JSON.stringify(R);
})()`;

(async () => {
  let deja = await attendreNavigateur(600);
  if (!deja) {
    if (!LANCER) {
      console.error('');
      console.error('  Aucun navigateur en debug sur le port ' + PORT + '.');
      console.error('  Lance-le d\'abord (ou relance cette commande avec --launch) :');
      console.error('');
      console.error('    "' + NAV + '" --remote-debugging-port=' + PORT + ' \\');
      console.error('       --user-data-dir="' + PROF + '" about:blank');
      console.error('');
      process.exit(3);
    }
    fs.mkdirSync(PROF, { recursive: true });
    const nav = spawn(NAV, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + PROF,
      '--no-first-run', '--no-default-browser-check', '--window-size=1600,1000', 'about:blank'],
      { detached: true, stdio: 'ignore' });
    nav.unref();
    if (!await attendreNavigateur(12000)) {
      console.error('Le navigateur n\'a pas ouvert son port de debug (moteur de rendu en echec ?).');
      process.exit(3);
    }
  }
  const cible = await httpJson('/json/new?' + encodeURIComponent(APP), 'PUT');
  if (!cible || !cible.webSocketDebuggerUrl) { console.error('Aucun onglet de debug.'); process.exit(4); }

  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; ws.onerror = r; setTimeout(r, 5000); });
  let mid = 0;
  // Un marqueur unique : une expression n'a aucune raison de le renvoyer elle-meme.
  const ECHEC_EVAL = Symbol('eval en echec');
  let evalEnEchec = false;
  const evalJs = expr => new Promise(res => {
    const id = ++mid;
    // 60 s : une action ad hoc peut attendre une requete qui interroge
    // archive.org (les DLC d'un jeu), et le moteur rend la main avant.
    const to = setTimeout(() => res(null), 60000);
    const h = ev => { try { const m = JSON.parse(ev.data); if (m.id === id) {
      clearTimeout(to); ws.removeEventListener('message', h);
      // UNE EXCEPTION NE DOIT PAS RESSEMBLER A UNE ACTION SANS EFFET. Sans ce
      // test, `m.result.result` existe mais n'a pas de `value`, on rend
      // `undefined`, et rien ne s'imprime nulle part : la sonde se tait et sort
      // avec un code de succes. C'est ce qui a fait croire pendant des heures a
      // une page qui ne repondait pas, alors que le script de la page s'arretait
      // sur une ReferenceError.
      if (m.result && m.result.exceptionDetails) {
        const d = m.result.exceptionDetails;
        const txt = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'exception sans message';
        // On dit QUELLE expression a leve : sinon un « null.classList » parmi les
        // nombreux evals de la sonde est introuvable sans instrumenter a la main.
        console.error('  eval ECHEC : ' + String(txt).split('\n')[0] + '   << ' + String(expr).slice(0, 140));
        res(ECHEC_EVAL);
        return;
      }
      res(m.result && m.result.result ? m.result.result.value : null);
    } } catch {} };
    ws.addEventListener('message', h);
    try { ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); } catch { res(null); }
  });
  // Le domaine `Emulation` ne fait pas partie de `Page` : il ne declenche pas le
  // plantage du moteur, et il permet de mesurer a une taille de fenetre choisie
  // plutot qu'a la taille par defaut du mode sans interface.
  const envoyer = (method, params) => new Promise(res => {
    const id = ++mid;
    const to = setTimeout(() => res(null), 5000);
    const h = ev => { try { const m = JSON.parse(ev.data); if (m.id === id) { clearTimeout(to); ws.removeEventListener('message', h); res(m.result || {}); } } catch {} };
    ws.addEventListener('message', h);
    try { ws.send(JSON.stringify({ id, method, params })); } catch { res(null); }
  });
  await envoyer('Emulation.setDeviceMetricsOverride', {
    width: TAILLE[0] || 1600, height: TAILLE[1] || 1000,
    // `mobile:true` N'EST PAS UN CONFORT D'AFFICHAGE, c'est LUI qui fait basculer
    // les media features de la page : `pointer: coarse` et `hover: none` y
    // deviennent vrais. Une regle ecrite sous `@media (pointer: coarse)` n'a donc
    // d'effet MESURABLE que si cet appel a eu lieu — sans lui, la sonde
    // approuverait un telephone qu'elle n'a jamais simule.
    // Le facteur d'echelle 3 est celui d'un ecran de telephone reel : il ne change
    // pas les pixels CSS mesures, mais il empeche de confondre « ca tient » et
    // « ca tient a un pixel pres » sur un ecran a haute densite.
    deviceScaleFactor: PHONE ? 3 : 1, mobile: PHONE
  });
  // Un appareil mobile a un ECRAN TACTILE. Sans cet appel, la page se declare
  // `pointer: coarse` tout en annoncant `maxTouchPoints === 0` — une combinaison
  // qui n'existe sur aucun telephone, et qui ferait mentir toute mesure fondee
  // sur le nombre de points de contact.
  if (PHONE) await envoyer('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  // Attendre que la vue soit STABLE avant de mesurer : un scan de disque peut
  // prendre plus de temps que l'attente fixe, et on mesurait alors des
  // squelettes de chargement — un « section annoncee mais vide » qui n'existe
  // que parce que la donnee n'etait pas encore arrivee.
  const stable = async (max) => {
    const fin = Date.now() + (max || 20000);
    while (Date.now() < fin) {
      const n = await evalJs("document.querySelectorAll('.skel-card,.skel-row').length");
      if (n === 0) return true;
      await dormir(500);
    }
    return false;
  };

  await dormir(2500);                                   // la SPA charge sa config et son disque
  // Un profil neuf n'a pas de langue enregistree : la modale de langue s'ouvre et
  // son voile assombrit toute la page, ce qui rend la capture inexploitable. On
  // la referme — `LANG` reste vide, donc l'interface s'affiche en francais.
  await evalJs("var lm=document.getElementById('langModal');if(lm)lm.style.display='none';");
  await dormir(300);
  if (MODAL) {
    await evalJs("openDlModal(" + JSON.stringify(JEU) + "," + JSON.stringify(JEU_TID) + ")");
    await dormir(11000);                                // recherche archive.org / Xbox 360
    if (MODAL_DLC) { await evalJs("dlmSearch('dlc')"); await dormir(9000); }
  } else {
    // Un serveur qui redemarrre peut servir le HTML en plusieurs lots : la bande
    // des onglets arrive tot (haut du document) mais la vue #v-<x> des centaines
    // de lignes plus bas. Appeler showView alors leve sur null.classList — un
    // delai fixe ne protege de rien, on attend l'element lui-meme.
    for (let i = 0; i < 40; i++) {
      const ok = await evalJs("typeof showView==='function'&&!!document.getElementById('v-" + VUE + "')&&!!document.getElementById('nv-" + VUE + "')");
      if (ok === true) break;
      await dormir(500);
    }
    await evalJs("showView('" + VUE + "',document.getElementById('nv-" + VUE + "'))");
    await dormir(1200);
    if (RECHERCHE) {
      await evalJs("document.getElementById('catSearch').value=" + JSON.stringify(RECHERCHE) + ";document.getElementById('dlSearch').value=" + JSON.stringify(RECHERCHE) + ";loadCatalog();searchDl();");
      await dormir(6000);
    }
  }
  await stable();
  // UICHECK_EVAL permet de mettre la page dans un etat precis avant de mesurer
  // (deplier la fiche d'un jeu, lancer la recherche de ses DLC...). Sans cela, la
  // sonde ne sait mesurer que l'etat d'arrivee d'une vue.
  if (process.env.UICHECK_EVAL) {
    const retour = await evalJs(process.env.UICHECK_EVAL);
    // On affiche ce que l'evaluation a renvoye : sans cela, une action ad hoc qui
    // echoue est indiscernable d'une action qui n'a rien fait. Une EXCEPTION est
    // exactement ce cas : elle a maintenant son propre marqueur, parce que le
    // `undefined` d'un `Runtime.evaluate` qui leve ne s'imprime nulle part.
    if (retour === ECHEC_EVAL) evalEnEchec = true;
    else if (retour !== null && retour !== undefined) console.log('  eval      : ' + String(retour).replace(/\s+/g, ' ').slice(0, 300));
    // Attente longue et volontaire : une action ad hoc declenche souvent une
    // requete qui interroge archive.org (les DLC d'un jeu, par exemple), et cela
    // prend des secondes. Le controle des squelettes ne suffit pas — ces panneaux
    // affichent « Recherche... », pas un squelette.
    await dormir(Number(process.env.UICHECK_EVAL_WAIT || 14000));
    await stable();
  }

  // LE FOND D'ECRAN SE CHARGE-T-IL VRAIMENT ? La couche Mica tire son image d'une
  // route : si elle ne rend rien, la couche est vide et l'on mesure un fond plat
  // sans que rien ne le signale. On charge l'URL pour de vrai, dans la page.
  // La reponse dit la TAILLE quand elle arrive, et « rien en 8 s » sinon — cette
  // formulation-la est volontaire : un delai n'est PAS un echec de la route. Le
  // scan MediaID tourne en synchrone et bloque le serveur une minute ou plus, ce
  // qui retarde n'importe quelle requete ; un « DELAI » se lit ici comme un aveu
  // d'ignorance, pas comme un verdict.
  const micaImg = await evalJs(
    "new Promise(function(r){var i=new Image();i.onload=function(){r(i.naturalWidth+'x'+i.naturalHeight)};" +
    "i.onerror=function(){r('la route n a rien rendu')};i.src='/api/wallpaper';" +
    "setTimeout(function(){r('rien en 8 s — serveur occupe ?')},8000);})");

  // UNE SURCOUCHE CHOISIE N'EST PAS UNE VUE. `estVue` commande la regle de la
  // colonne de lecture, ecrite pour une vue : une surcouche occupe volontairement
  // toute la largeur, et la lui appliquer inventait un defaut (« contenu large de
  // 1600 px > --w-max 1280 px » sur #diaModal, qui n'a aucun padding). On ne passe
  // donc PAS par `--modal` pour mesurer une surcouche : ce drapeau ouvrirait en plus
  // #dlModal et attendrait onze secondes.
  const brut = await evalJs(SONDE(RACINE, !MODAL && !process.env.UICHECK_OVL));

  // Capture d'ecran : `Page.captureScreenshot` ne demande PAS `Page.enable`
  // (c'est `enable` qui fait planter le moteur). Une mesure dit ce qui est
  // mesurable ; elle ne dit pas si c'est beau, ni si quelque chose saute aux
  // yeux. La capture reste donc le seul moyen de juger la mise en page.
  const shot = process.env.UICHECK_SHOT;
  if (shot) {
    const r2 = await envoyer('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r2 && r2.data) {
      fs.writeFileSync(shot, Buffer.from(r2.data, 'base64'));
      console.log('  capture   : ' + shot + ' (' + Math.round(fs.statSync(shot).size / 1024) + ' Ko)');
    } else {
      console.error('  capture   : echec (le domaine Page a refuse)');
    }
  }
  try { ws.close(); } catch {}
  try { await httpJson('/json/close/' + cible.id); } catch {}

  if (brut === ECHEC_EVAL) {
    // La sonde ELLE-MEME a leve dans la page (motif invalide, par exemple).
    // Sans ce cas, le marqueur — un Symbol — passait pour un resultat, et
    // `JSON.parse` levait a son tour : on lisait « Sonde interrompue : Cannot
    // convert a Symbol value to a string », qui ne dit rien de la cause.
    console.error('L expression de mesure a leve dans la page (voir « eval ECHEC » ci-dessus) : la mesure n a pas eu lieu.');
    process.exit(7);
  }
  if (!brut) { console.error('La page n\'a rien renvoye (navigateur plante ou script en erreur).'); process.exit(5); }
  const r = JSON.parse(brut);

  const l = console.log;
  l('');
  l('  SONDE D\'INTERFACE — vue « ' + r.vue + ' », fenetre ' + r.viewport.w + 'x' + r.viewport.h);

  // UNE RACINE FERMEE N'EST PAS UNE MESURE PROPRE. `UICHECK_OVL` choisit la racine
  // mais RIEN n'ouvre la surcouche (a la difference de `--modal`, qui appelle
  // `openDlModal()`) : `UICHECK_OVL=#diaModal` mesurait donc un element
  // `display:none` — boite 0x0, aucune mesure — et rendait « Aucun defaut mesure »
  // avec le code 0. C'est exactement ce que le code 7 venait de fermer ailleurs :
  // un instrument qui approuve ce qu'il n'a pas regarde. On REFUSE de conclure.
  // La propriete CSS lue est `display` et non la boite seule : `display:none` est
  // un fait du style, tandis qu'une boite de 0 px peut aussi venir d'un conteneur
  // reellement vide — les deux cas sont separes ci-dessous.
  // La sonde n'OUVRE PAS la surcouche elle-meme : elle ne peut pas savoir comment,
  // et `--modal` a deja son propre chemin.
  const rb = r.racineBoite;
  const fermee = !!rb && rb.w === 0 && rb.h === 0 && r.affiche === 'none';
  l('  ' + '-'.repeat(66));
  if (!rb) {
    l('  racine    : « ' + RACINE + ' » INTROUVABLE — aucun element ne repond a ce selecteur.');
    l('');
    l('  RIEN N\'A ETE MESURE. Verifie le selecteur passe a UICHECK_OVL.');
    l('');
    process.exit(8);
  }
  if (fermee) {
    l('  racine    : « ' + RACINE + ' » trouvee mais display:none — RIEN N\'A ETE MESURE.');
    l('');
    l('  La surcouche mesuree est FERMEE (boite ' + rb.w + 'x' + rb.h
      + ') : une mesure sur un element cache ne dit rien du rendu.');
    l('  La sonde n\'ouvre AUCUNE surcouche — elle ne peut pas savoir comment.');
    l('  Ouvre-la d\'abord : UICHECK_OVL=\'' + RACINE + '\' UICHECK_EVAL=\'ouvreLa()\' node scripts/uicheck.js ' + VUE);
    l('  (ou mesure `--modal` pour la surcouche de telechargement, qui a son propre chemin).');
    l('');
    process.exit(8);
  }
  if (r.colonne) l('  colonne   : marge ' + r.colonne.gauche + ' / ' + r.colonne.droite + ' px, contenu ' + r.colonne.largeurContenu + ' px');
  if (r.mica) {
    l('  mica      : ' + (r.mica.papier ? 'mode PAPIER PEINT' : 'mode graphite')
      + ' ' + (r.mica.annonce ? 'image declaree' : 'aucune image') + ' ' + (r.mica.src || '')
      + '  flou ' + r.mica.flou + 'px  ' + (r.mica.deborde ? 'deborde' : 'NE DEBORDE PAS')
      + '  ·  fond d ecran charge : ' + micaImg);
  }
  if (r.haut) {
    l('  barre haut: ' + r.haut.h + ' px = ' + r.haut.pct + ' % de la fenetre, ' + r.haut.rangees + ' rangee(s)');
    l('  onglets   : ' + r.haut.largeurOnglets + ' px pour ' + r.haut.place + ' px de place'
      + (r.haut.defile ? '  DEFILE' : '') + '  >  '
      + r.haut.onglets.map(o => o.t + ' ' + o.w + 'x' + o.h + '@' + o.fs).join('  '));
    if (r.haut.select) l('  selecteur : « ' + r.haut.select.texte + ' »  ' + r.haut.select.rendu
      + ' px de texte pour ' + r.haut.select.dispo + ' px' + (r.haut.select.tronque ? '  TRONQUE' : ''));
  }
  if (r.bords && r.bords.length) l('  bords     : ' + [...new Set(r.bords.map(b => b.x))].join(' / ') + ' px  (' + r.bords.length + ' blocs)');
  l('  statut    : « ' + r.statut + ' »   lignes affichees : ' + r.lignesAffichees);
  for (const t of r.tableaux) {
    l('  tableau ' + (t.id || '?') + ' : ' + t.enTetes + ' en-tetes, ' + t.lignes + ' lignes, cellules ' + JSON.stringify(t.cellules) + ', largeur ' + t.largeur);
    l('            colonnes ' + t.colonnes.join(' | '));
  }
  if (r.repliables.length) l('  repliable : ' + r.repliables.map(d => d.titre + (d.ouvert ? ' [ouvert]' : '')).join(' · '));
  if (r.barres && r.barres.length) l('  barres    : ' + r.barres.map(b => b.ligne + ' ligne(s) (' + b.h + ' px)').join(' · '));
  if (r.debordent.length) l('  DEBORDE   : ' + r.debordent.join(' · '));
  if (r.petites.length) l('  <12 px    : ' + r.petites.join(' · '));
  if (r.contrasteFaible.length) l('  CONTRASTE : ' + r.contrasteFaible.join(' · '));
  if (r.sectionsVides.length) l('  vides     : ' + r.sectionsVides.join(' · '));
  if (r.couleurs && Object.keys(r.couleurs).length) {
    l('  couleurs  : ' + Object.entries(r.couleurs).map(([k, v]) => k + '=' + v.replace(/\s/g, '')).join('  '));
  }
  if (r.premieres && r.premieres.length) {
    l('  premiers  : ');
    for (const p of r.premieres) l('      ' + p);
  }
  if (r.scroll && r.scroll.length) {
    l('  defilement: ' + r.scroll.map(s => s.el + ' ' + s.client + '/' + s.contenu + 'px overflow-y:' + s['overflow-y']).join('  ·  '));
  }
  // LA SECTION TELEPHONE. Elle s'affiche des que le drapeau a ete demande (ou que
  // la page se declare grossiere) et elle REND LES MEDIA FEATURES en clair :
  // c'est la preuve — ou le dementi — que l'emulation mobile a pris. Une mesure
  // tactile qui ne dit pas si la page se croyait tactile ne vaut rien.
  // Sans le drapeau et sans pointeur grossier, RIEN ne s'ajoute : un releve de
  // bureau garde exactement la sortie qu'il avait avant cette mesure.
  if (r.tactile && (r.tactile.demande || r.tactile.coarse || r.cibles)) {
    l('');
    l('  TELEPHONE  pointeur grossier : ' + (r.tactile.coarse ? 'OUI' : 'NON')
      + '   survol : ' + (r.tactile.hoverNone ? 'AUCUN' : 'present')
      + '   points tactiles : ' + r.tactile.points
      + '   ecran : ' + r.inventaire.ecran + ' px'
      + (r.viewport.w > r.inventaire.ecran + 1 ? '  (innerWidth ' + r.viewport.w + ' — LA PAGE DEBORDE)' : '')
      + (r.tactile.demande ? '   [UICHECK_PHONE=1]' : '   [UICHECK_PHONE absent]'));
  }
  if (r.cibles) {
    l('  1. cibles : ' + r.cibles.total + ' element(s) interactif(s) visible(s), '
      + r.cibles.sous44 + ' sous ' + r.cibles.seuil + ' px'
      + (r.cibles.pires.length ? '  >  ' + r.cibles.pires.join('  ·  ') : ''));
    l('  2. atteinte: ' + (r.horsEcran.length
      ? r.horsEcran.length + ' element(s) hors de l ecran  >  ' + r.horsEcran.join('  ·  ')
      : 'tout est dans la fenetre')
      + (r.horsVueDefilant && r.horsVueDefilant.length
        ? '   [hors vue mais atteignables en defilant : ' + r.horsVueDefilant.join(', ') + ']' : ''));
    l('  3. tronque: ' + (r.tronques.length
      ? r.tronques.length + ' texte(s) coupe(s) sans ellipse  >  ' + r.tronques.join('  ·  ')
      : 'aucun texte coupe sans ellipse')
      + (r.masques && r.masques.length
        ? '   [fondus par un masque, donc voulus : ' + r.masques.join(', ') + ']' : ''));
    l('  4. inventaire: ' + r.inventaire.total + ' cible(s)  >  '
      + r.inventaire.tailles.map(t => t.taille + ' x' + t.n).join('  ·  '));
    for (const c of r.inventaire.liste) l('       ' + c);
  }
  l('');
  if (r.defauts.length) { l('  DEFAUTS (' + r.defauts.length + ') :'); for (const d of r.defauts) l('    - ' + d); }
  else l('  Aucun defaut mesure.');
  l('');
  // 7 : une expression qui a leve invalide la mesure. Ce code doit etre rendu ICI,
  // par `process.exit` — `process.exitCode` pose plus haut serait ecrase, et un
  // script qui teste le code de sortie croirait la mesure bonne.
  process.exit(evalEnEchec ? 7 : (r.defauts.length ? 1 : 0));
})().catch(e => { console.error('Sonde interrompue : ' + e.message); process.exit(6); });
