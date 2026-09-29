// FUSIONNER LES GALETTES D'UN MEME JEU DANS `Games\<TID>\`.
//
// CE QUE LA MESURE A ETABLI (2026-09-20, bibliotheque reelle de l'utilisateur) :
// chaque jeu installe occupe `Games\<TID>\00007000\<hash>` + `<hash>.data` — UN
// seul paquet GOD par jeu, un nom de 20 caracteres hexadecimaux, plus son
// dossier de donnees. 33 paquets examines sur 41 jeux : 33 fois la meme
// disposition, jamais deux paquets sous un meme <TID>. Deux GALETTES du meme jeu
// auront donc deux paquets sous le meme `<TID>`.
//
// D'ou le danger que ce module ferme : installer le disque 2 ecrivait dans le
// meme `<TID>` que le disque 1. Le code faisait `fs.rmSync(dest)` avant de
// deplacer la source — c'est-a-dire qu'il DETRUISAIT le disque 1, sans un mot.
//
// Ici, on ne detruit rien : on ajoute. Un paquet dont le MediaID est deja la est
// remplace (c'est le meme disque, on le met a jour) ; les autres sont CONSERVES.
//
// Le module est PUR : il ne touche au disque que par les fonctions qu'on lui
// passe. C'est ce qui permet de le tester sur une arborescence en memoire.

const fs = require('fs');

// Le MediaID declare dans l'en-tete d'un paquet GOD : les 4 octets a 0x354, en
// big-endian.
//
// CE QUE LA MESURE A VERIFIE, ET CE QU'ELLE A DEMENTI. Le nom du dossier `<hash>`
// n'est PAS le MediaID : sur 33 paquets, son prefixe de 8 caracteres ne
// correspond au MediaID que 19 fois (938EE064... -> 5940C9DB). La correspondance
// que le depot avait notee pour deux jeux (Rivals 603CD4F9, Brotherhood
// 6D88AE4F) tombe juste, mais elle vient du CHAMP, pas du nom — et prendre le nom
// pour la clef aurait donne deux clefs differentes pour le meme disque, donc un
// doublon a chaque installation.
//
// On lit donc 4 octets d'en-tete, ce qui est instantane meme sur un paquet de
// 7 Go. Deux galettes du meme jeu ont deux MediaID : la clef separe exactement
// ce qu'il faut separer.
const OFFSET_MEDIAID = 0x354;
function mediaIdPaquet(f) {
  let fd;
  try {
    fd = fs.openSync(f, 'r');
    const b = Buffer.alloc(4);
    if (fs.readSync(fd, b, 0, 4, OFFSET_MEDIAID) < 4) return null;
    const v = b.readUInt32BE(0);
    return v ? v.toString(16).toUpperCase().padStart(8, '0') : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
}

/**
 * La clef d'un paquet : son MediaID, ou son nom faute de mieux.
 *
 * Le repli sur le nom n'est pas cosmetique : un paquet dont l'en-tete est
 * illisible (fichier tronque, format inattendu) ne doit PAS etre pris pour
 * « un paquet different » — il serait alors duplique a chaque installation.
 */
function clefPaquet(f) {
  return mediaIdPaquet(f) || ('nom:' + String(f).replace(/\\/g, '/').split('/').pop());
}

/**
 * Les entrees a DEPLACER de `src` vers `dest`, sans rien detruire.
 *
 * @param {string} src    le dossier produit par iso2god (`<TID>/00007000`)
 * @param {string} dest   le dossier deja en place (`Games/<TID>/00007000`), ou null
 * @param {Function} [clef] injecte pour les tests : chemin -> clef
 * @returns {{garder: string[], remplacer: string[], deja: string[]}}
 *   - garder    : les paquets de `dest` a CONSERVER tels quels (une autre galette)
 *   - remplacer : les paquets de `dest` a effacer (meme galette, on remplace)
 *   - deja      : les paquets de `src` a ignorer (le meme est deja installe)
 */
function fusionnerPaquets(src, dest, clef) {
  const k = clef || clefPaquet;
  const out = { garder: [], remplacer: [], deja: [] };
  let srcs = [], dests = [];
  try { srcs = fs.readdirSync(src); } catch { return out; }
  try { if (dest) dests = fs.readdirSync(dest); } catch { dests = []; }
  // Un paquet GOD, c'est le FICHIER d'en-tete : `<hash>` sans extension. Son
  // dossier `.data` l'accompagne et suit toujours — le compter a part ferait
  // deux entrees pour une seule galette.
  const estPaquet = n => !/\.data$/i.test(n);
  const paquetsSrc = srcs.filter(estPaquet).map(n => ({ nom: n, clef: k(join(src, n)) }));
  const paquetsDest = dests.filter(estPaquet).map(n => ({ nom: n, clef: k(join(dest, n)) }));
  const clefsSrc = new Set(paquetsSrc.map(p => p.clef));
  const clefsDest = new Set(paquetsDest.map(p => p.clef));
  // 1. CE QUI EST DEJA LA. Meme galette = remplacee (une reinstallation du meme
  //    disque met a jour le paquet) ; galette differente = CONSERVEE. C'est la
  //    seule regle qui empeche l'installation du disque 2 de detruire le disque 1.
  for (const d of paquetsDest) {
    (clefsSrc.has(d.clef) ? out.remplacer : out.garder).push(d.nom);
  }
  // 2. CE QUI EST DEJA INSTALLE et n'a donc pas a etre redeplace.
  for (const p of paquetsSrc) if (clefsDest.has(p.clef)) out.deja.push(p.nom);
  return out;
}

// Recolle avec le separateur DEJA present dans le chemin : `path.join` ferait le
// travail, mais ce module est aussi charge par les tests depuis n'importe ou et
// on evite d'y melanger deux conventions de chemin.
function join(dir, nom) {
  const s = String(dir || '');
  const sep = s.includes('\\') ? '\\' : '/';
  return s.replace(/[\\/]+$/, '') + sep + nom;
}

module.exports = { mediaIdPaquet, clefPaquet, fusionnerPaquets, OFFSET_MEDIAID };
