// Lecture des en-tetes de packages Xbox 360 (GOD / LIVE / PIRS / CON).
// Toutes ces fonctions sont pures : un chemin en entree, une valeur ou null en
// sortie, aucun etat global, aucun acces config. Elles sont donc testables
// directement (voir test/pkg.test.js).
//
// Disposition des en-tetes (verifiee sur des packages reels + XboxUnity) :
//   0x000  magic            'LIVE' | 'CON ' | 'PIRS'
//   0x344  type de contenu  00000002 DLC · 000B0000 TU · 00000001 Save
//                           00007000 GOD · 00080000/000D0000 XBLA · 00009000 Avatar
//   0x360  TitleID          (4 octets, hex ASCII inverse -> on lit brut)
//   0x412  nom du titre     UTF-16LE, termine par \0
const fs = require('fs');

// lit `len` octets a l'offset `off` ; null si le fichier est trop court/illisible
function readAt(f, len, off) {
  let fd;
  try {
    fd = fs.openSync(f, 'r');
    const b = Buffer.alloc(len);
    const n = fs.readSync(fd, b, 0, len, off);
    if (n < len) return null;
    return b;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
}

const hex8 = b => [...b].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');

// magic du package : LIVE (Xbox Live), CON (console), PIRS (PIRS)
function isGodFile(f) {
  const b = readAt(f, 4, 0);
  if (!b) return false;
  const m = b.toString('ascii');
  return m === 'LIVE' || m === 'CON ' || m === 'PIRS';
}

// TitleID declare dans l'en-tete du package (0x360)
function godTid(f) {
  const b = readAt(f, 4, 0x360);
  return b ? hex8(b) : null;
}

// nom du titre (0x412, UTF-16LE) ; null si vide
function godName(f) {
  const b = readAt(f, 256, 0x412);
  if (!b) return null;
  const s = b.toString('utf16le').split('\0')[0].trim();
  return s || null;
}

// type de contenu (0x344) : '00000002', '000B0000', ...
function contentType(f) {
  const b = readAt(f, 4, 0x344);
  return b ? hex8(b) : null;
}

// types de contenu Xbox 360 : le sous-dossier dans Content\<TID>\ porte le nom du type
const CT_LABELS = {
  '00000001': 'SAVE', '00000002': 'DLC', '000B0000': 'TU', '00007000': 'GOD',
  '00080000': 'XBLA', '000D0000': 'XBLA', '00009000': 'AVATAR', '00004000': 'INSTALLE',
  '00040000': 'CACHE', '00010000': 'SYSTEME', 'FFFE07D1': 'SYSTEME', 'FFFE07DF': 'CACHE'
};

// les packages JEU (GOD/XBLA) vont dans Games\<TID>\<type> ; DLC/TU/saves DOIVENT
// rester dans Content\<TID>\<type> (la console ne lit DLC/TU QUE dans Content)
const GAME_SUBS = new Set(['00007000', '00080000', '000D0000']);

const isHex8 = s => /^[0-9A-Fa-f]{8}$/.test(s || '');

// sous-dossier de destination : le type de contenu, '00007000' par defaut
function ctSub(f) {
  const ct = contentType(f);
  return /^[0-9A-F]{8}$/i.test(ct || '') ? ct.toUpperCase() : '00007000';
}

const ctLabel = ct => CT_LABELS[(ct || '').toUpperCase()] || 'PKG';

const isGameSub = sub => GAME_SUBS.has((sub || '').toUpperCase());

// Renifle le VRAI format par les octets magiques, jamais par l'extension :
// vimm.net sert regulierement une archive 7z/zip renommee en .iso.
// -> 'archive' (7z | zip | rar), sinon null.
function magicKind(p) {
  const b = readAt(p, 8, 0);
  if (!b) return null;
  if (b[0] === 0x37 && b[1] === 0x7A && b[2] === 0xBC && b[3] === 0xAF && b[4] === 0x27 && b[5] === 0x1C) return 'archive'; // 7z
  if (b[0] === 0x50 && b[1] === 0x4B) return 'archive'; // zip (PK)
  if (b.toString('latin1', 0, 4) === 'Rar!') return 'archive'; // rar
  return null;
}

// magic de package sans toucher au disque (utile pour tester)
const isGodMagic = b => {
  const m = b.toString('ascii', 0, 4);
  return m === 'LIVE' || m === 'CON ' || m === 'PIRS';
};

// ---------------------------------------------------------------------------
// EST-CE UN ISO XBOX ? (XGD1/2/3 ou XSF)
// ---------------------------------------------------------------------------
// POURQUOI CE TEST EXISTE : l'application convertit tout `.iso` telecharge avec
// iso2god. Quand la source sert un ISO qui n'est PAS un jeu Xbox 360 — mesure du
// 2026-09-20 : un disque d'installation PC de 7,11 Go (« Dark Messiah of Might and
// Magic », le titre PC ; la version 360 s'appelle « ... Elements ») — iso2god
// echoue APRES avoir lu le fichier, et celui-ci reste dans le depot sans que rien
// ne dise pourquoi. On regarde donc AVANT de convertir, pour 80 octets lus.
//
// REFERENCE, PAS DEVINEE : iso2god-rs, `src/iso/iso_type.rs`. La signature XDVDFS
// « MICROSOFT*XBOX*MEDIA » (20 octets) se lit a `0x20 * SECTOR_SIZE + root_offset`,
// avec SECTOR_SIZE = 0x800 (`src/iso/mod.rs`, donc le descripteur est au secteur
// 0x20) et root_offset valant :
//     0            XSF   (image non decoupee)
//     0xfd90000    XGD2  (le cas courant des jeux 360)
//     0x18300000   XGD1  (jeux Xbox 1)
//     0x2080000    XGD3  (double couche recents)
const SIGNATURE_XBOX = 'MICROSOFT*XBOX*MEDIA';
const OFFSET_DESCRIPTEUR = 0x20 * 0x800;
const OFFSETS_XBOX = [0, 0xfd90000, 0x18300000, 0x2080000].map(o => o + OFFSET_DESCRIPTEUR);

// Un ISO Xbox porte la signature a UN de ces offsets — pas a tous.
function estIsoXbox(p) {
  if (!p) return false;
  for (const off of OFFSETS_XBOX) {
    const b = readAt(p, 20, off);
    if (b && b.toString('latin1') === SIGNATURE_XBOX) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Disques multiples
// ---------------------------------------------------------------------------
// Un jeu sur plusieurs galettes partage UN SEUL TitleID : « Assassin's Creed IV
// Disc 1 » et « ... Disc 2 » sont le meme jeu. Sans le reconnaitre, l'application
// les prenait pour des doublons — badge « ×2 » dans la bibliotheque et conseil
// DOUBLONS dans l'assistant, c'est-a-dire une invitation a supprimer une galette.
// Ne jamais confondre « deux copies du meme disque » et « un jeu en deux parties ».
const MOTS_DISQUE = new Set(['disc', 'disk', 'cd', 'dvd', 'disque']);
const MOTIF_DISQUE = /\b(?:disc|disk|dvd|disque|cd)\s*[-_.]?\s*([0-9])\b/i;

// Numero de disque porte par un nom, 0 s'il n'en porte aucun.
function numeroDisque(nom) {
  const m = MOTIF_DISQUE.exec(String(nom || ''));
  return m ? Number(m[1]) : 0;
}

// Nom debarrasse de son suffixe de disque, pour parler du JEU et non de la
// galette : « Assassin's Creed IV Disc 2 » -> « Assassin's Creed IV ».
// Le marqueur peut etre dans une parenthese qui porte aussi autre chose
// (« Halo 3 Multiplayer (ODST Disc 2) ») : la parenthese ouvrante se retrouve
// alors sans fermante, et on la retire.
function sansNumeroDisque(nom) {
  return String(nom || '')
    .replace(/\s*[-_.(]?\s*\b(?:disc|disk|dvd|disque|cd)\s*[-_.]?\s*\d\b\s*\)?/ig, '')
    .replace(/\((?![^()]*\))/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/[\s\-_.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Vrai si ces entrees sont les GALETTES d'un meme jeu plutot que des doublons :
// meme TitleID, mais des numeros de disque differents. Deux entrees sans numero,
// ou deux fois « Disc 2 », restent des doublons.
function sontDesDisques(noms) {
  const nums = new Set((noms || []).map(numeroDisque));
  return nums.size > 1;
}

// Numero de galette, un nom sans numero etant la premiere.
const galette = nom => numeroDisque(nom) || 1;

// Deux galettes du meme TitleID ne peuvent pas occuper le meme dossier : toutes
// les galettes d'un jeu partagent `Games\<TID>`. Ecraser ce dossier pour installer
// le disque 2 DETRUIT le disque 1, sans avertissement et sans confirmation.
// On traite « pas de numero » comme la premiere galette, dans les deux sens :
// installer « Halo 3 » par-dessus « Halo 3 Multiplayer (ODST Disc 2) » est
// exactement le meme danger.
function galettesEnConflit(existantNom, sourceNom) {
  return galette(existantNom) !== galette(sourceNom);
}

// Clef de comparaison d'un titre.
// « Gun (USA, Europe) (En,Fr,Es,It).iso » et « Gun » doivent donner la meme
// clef : c'est ce qui permet de reconnaitre qu'un fichier laisse dans le depot
// est le RESIDU d'un jeu deja installe, et non un jeu a ranger.
function cleTitre(nom) {
  return sansNumeroDisque(String(nom || ''))
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[\(\[][^\)\]]*[\)\]]/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}


const DOSSIER_MISE_A_JOUR = /\$systemupdate/i;

/**
 * L'executable du JEU dans un dossier extrait.
 *
 * On cherche `default.xex` — le nom que la console attend — et on ignore tout
 * ce qui vit sous `$SystemUpdate`. Repli sur un `.xex` quelconque seulement si
 * aucun `default.xex` n'existe (dispositions exotiques).
 *
 * @param {string} dir
 * @param {Function} [walk]  injecte pour les tests : dir -> [fichiers]
 */
function trouverXexJeu(dir, walk) {
  const fichiers = walk ? [...walk(dir)] : (() => {
    // Parcours local : pkg.js reste sans dependance a fsutil.
    const out = [];
    const path = require('path');
    const rec = (p) => {
      let e; try { e = fs.readdirSync(p, { withFileTypes: true }); } catch { return; }
      for (const x of e) {
        const q = path.join(p, x.name);
        if (x.isDirectory()) rec(q); else out.push(q);
      }
    };
    rec(dir);
    return out;
  })();
  const pasSysteme = p => !DOSSIER_MISE_A_JOUR.test(p);
  return fichiers.find(p => pasSysteme(p) && /(^|[\\/])default\.xex$/i.test(p))
    || fichiers.find(p => pasSysteme(p) && /\.xex$/i.test(p))
    || null;
}

module.exports = {
  readAt, hex8, isGodFile, godTid, godName, contentType, ctSub, ctLabel,
  isGameSub, isHex8, magicKind, isGodMagic, CT_LABELS, GAME_SUBS,
  // `estIsoXbox` : le test qui evite de lancer une conversion GOD sur un fichier
  // qui n'est pas un jeu Xbox 360. Les deux constantes sont exportees pour que le
  // test PUISSE epingler les offsets sur la reference (iso2god-rs).
  estIsoXbox, OFFSETS_XBOX, SIGNATURE_XBOX,
  MOTS_DISQUE, numeroDisque, sansNumeroDisque, sontDesDisques, galettesEnConflit, cleTitre,
  trouverXexJeu, DOSSIER_MISE_A_JOUR
};
