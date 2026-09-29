// Lecteur XDVDFS — le systeme de fichiers des disques Xbox 1 ET Xbox 360.
//
// POURQUOI CE MODULE EXISTE : `exiso.exe` (v2.7) ne lit que les XISO « propres »
// (signature a 0x10000). Les dumps complets redump — ~7,8 Go, couche video +
// couche jeu — portent la partition de jeu a `0x18300000` (XGD1) et exiso les
// refuse : « does not appear to be a valid xbox iso image », mesure. iso2god-rs
// ne fait, lui, QUE du Xbox 360 : un ISO Xbox 1 finissait sans destination.
//
// Le format est simple et stable (meme lecture que xdvdfs-rs / Cxbx) :
//   base + 0x10000  magic « MICROSOFT*XBOX*MEDIA » (20 octets)
//   base + 0x10014  secteur de la table racine (u32 LE, en secteurs de 2048)
//   base + 0x10018  taille de la table racine   (u32 LE, en octets)
//   entree          u16 gauche | u16 droite | u32 secteur | u32 taille
//                   u8 attributs (0x10 = dossier) | u8 taille-nom | nom
// Les entrees forment un arbre AVL : gauche/droite sont des INDEX * 4 octets
// dans la table, 0 = vide. Lire la table EN LIGNE ne rend qu'une partie des
// fichiers — mesure : 186 entrees vues sur 2502 reelles. Il FAUT suivre
// l'arbre a partir de l'entree d'offset 0.
//
// Toutes les fonctions qui lisent un VRAI fichier prennent un descripteur
// ouvert (ou un chemin pour les commodites de plus haut niveau) ; rien de
// global, tout est testable sur des buffers synthetiques.
const fs = require('fs');
const path = require('path');

const MAGIC = Buffer.from('MICROSOFT*XBOX*MEDIA', 'latin1');
const SECTEUR = 2048;
const DECALAGE_MAGIC = 0x10000;

// Bases de partition connues, essayees AVANT le scan (le scan coute jusqu'a
// plusieurs centaines de Mo lus) :
//   0           XSF / XISO  (image non decoupee — Xbox 1 ET parfois 360)
//   0x18300000  XGD1        (dump complet Xbox 1, le cas des redump ~7,8 Go)
//   0xfd90000   XGD2        (Xbox 360)
//   0x2080000   XGD3        (Xbox 360, double couche recents)
// On y cherche la signature a base + 0x10000 — la meme regle qu'iso2god-rs.
const BASES_CONNUES = [0, 0x18300000, 0xfd90000, 0x2080000];

function lire(fd, len, off) {
  const b = Buffer.alloc(len);
  if (fs.readSync(fd, b, 0, len, off) < len) return null;
  return b;
}

/** offset de la partition XDVDFS dans l'image, ou -1. */
function trouverBase(fd, taille) {
  for (const base of BASES_CONNUES) {
    if (base + DECALAGE_MAGIC + 20 > taille) continue;
    const b = lire(fd, 20, base + DECALAGE_MAGIC);
    if (b && b.equals(MAGIC)) return base;
  }
  // Repli : scan 64 Mo par 64 Mo aux frontieres de secteur (images exotiques).
  const CHUNK = 64 * 1024 * 1024;
  const buf = Buffer.alloc(CHUNK);
  let pos = 0;
  while (pos < taille) {
    const lu = fs.readSync(fd, buf, 0, Math.min(CHUNK, taille - pos), pos);
    for (let i = 0; i + 20 <= lu; i += SECTEUR) {
      if (buf[i] === 0x4D && buf.compare(MAGIC, 0, 20, i, i + 20) === 0) {
        const base = pos + i - DECALAGE_MAGIC;
        return base >= 0 ? base : -1;
      }
    }
    pos += lu;
  }
  return -1;
}

/** une entree de table de repertoires a `off` octets dans `buf`, ou null. */
function lireEntree(buf, off) {
  if (off + 14 > buf.length) return null;
  const nomLen = buf[off + 13];
  if (nomLen === 0 || nomLen > 40) return null;
  return {
    gauche: buf.readUInt16LE(off),
    droite: buf.readUInt16LE(off + 2),
    sect: buf.readUInt32LE(off + 4),
    taille: buf.readUInt32LE(off + 8),
    dir: (buf[off + 12] & 0x10) !== 0,
    nom: buf.slice(off + 14, off + 14 + nomLen).toString('latin1')
  };
}

/** parcours in-order de l'arbre AVL d'une table de repertoires. */
function parcourirTable(buf, prefixe, visite, lireTable) {
  const marche = idx => {
    const e = lireEntree(buf, idx * 4);
    if (!e) return;
    if (e.gauche) marche(e.gauche);
    const p = prefixe ? prefixe + '/' + e.nom : e.nom;
    visite(e, p);
    if (e.dir && lireTable) lireTable(e, p);
    if (e.droite) marche(e.droite);
  };
  marche(0); // l'entree d'offset 0 EST la racine de l'arbre
}

/**
 * Liste recursive de l'image : [{ chemin, sect, taille, dir }] — les dossiers
 * portent dir:true et un chemin termine par '/'.
 * `fd` est un descripteur deja ouvert, `base` celui de trouverBase().
 */
function lister(fd, base) {
  const tete = lire(fd, 32, base + DECALAGE_MAGIC);
  if (!tete || !tete.compare(MAGIC, 0, 20, 0)) return null;
  const rootSect = tete.readUInt32LE(0x14);
  const rootTaille = tete.readUInt32LE(0x18);
  const out = [];
  const rec = (secteur, tailleTab, prefixe) => {
    const buf = lire(fd, tailleTab, base + secteur * SECTEUR);
    if (!buf) return;
    parcourirTable(buf, prefixe, (e, p) => {
      out.push({ chemin: p + (e.dir ? '/' : ''), sect: e.sect, taille: e.taille, dir: e.dir });
    }, (e, p) => rec(e.sect, e.taille, p));
  };
  rec(rootSect, rootTaille, '');
  return out;
}

/** le contenu d'une entree-fichier en Buffer. */
function lireFichier(fd, base, e) {
  return lire(fd, e.taille, base + e.sect * SECTEUR);
}

/** { tid, titre, region } lus dans un default.xbe (Buffer), ou null. */
function infosXbe(buf) {
  if (!buf || buf.length < 0x178 || buf.toString('latin1', 0, 4) !== 'XBEH') return null;
  const base = buf.readUInt32LE(0x104);          // adresse de base de l'image
  const cert = buf.readUInt32LE(0x118) - base;   // certificat : VA -> offset
  if (cert < 0 || cert + 0xA4 > buf.length) return null;
  const reg = buf.readUInt32LE(cert + 0xA0);     // bit0 = NA/US, bit1 = JAP, bit2 = PAL
  return {
    tid: buf.readUInt32LE(cert + 8).toString(16).toUpperCase().padStart(8, '0'),
    titre: buf.slice(cert + 0x0C, cert + 0x0C + 80).toString('utf16le').split('\0')[0].trim(),
    region: reg,
    regionNom: [[1, 'US'], [2, 'JAP'], [4, 'PAL']].filter(([b]) => reg & b).map(([, n]) => n).join('+') || ('0x' + reg.toString(16))
  };
}

/**
 * La signature Xbox 1, PAS SEULEMENT la signature Xbox : l'image est Xbox 1 si
 * sa partition porte un `default.xbe` a la racine. Un XSF Xbox 360 (meme magic
 * a 0x10000, mais `default.xex`) ne doit PAS etre route ici — mesure du besoin :
// sans ce test, un XSF 360 partirait dans le pipeline Xbox 1.
 * Retour : { base, tid, titre, region, regionNom } ou null.
 */
function estXbox1(p) {
  let fd;
  try {
    fd = fs.openSync(p, 'r');
    const taille = fs.fstatSync(fd).size;
    // bases Xbox 1 uniquement : les bases XGD2/XGD3 sont du Xbox 360 certain.
    let base = -1;
    for (const b of [0, 0x18300000]) {
      if (b + DECALAGE_MAGIC + 20 > taille) continue;
      const m = lire(fd, 20, b + DECALAGE_MAGIC);
      if (m && m.equals(MAGIC)) { base = b; break; }
    }
    if (base < 0) return null;
    const entrees = lister(fd, base);
    if (!entrees) return null;
    if (entrees.some(e => !e.dir && e.chemin === 'default.xex')) return null; // XSF 360
    const xbe = entrees.find(e => !e.dir && /^default\.xbe$/i.test(e.chemin));
    if (!xbe) return null;
    const infos = infosXbe(lireFichier(fd, base, xbe));
    return { base, ...(infos || {}), sansXbe: !infos };
  } catch { return null; }
  finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch {} } }
}

/**
 * Extraction complete de l'image dans `dest` (cree les sous-dossiers).
 * `prog(nOctets, nFichiers)` est appele a chaque fichier si fourni.
 * Retourne { fichiers, octets }. ASYNCHRONE volontairement : plusieurs Go.
 */
async function extraire(p, dest, prog) {
  const fd = fs.openSync(p, 'r');
  try {
    const taille = fs.fstatSync(fd).size;
    const base = trouverBase(fd, taille);
    if (base < 0) throw new Error('pas de partition XDVDFS');
    const entrees = lister(fd, base);
    if (!entrees) throw new Error('table racine illisible');
    let octets = 0, fichiers = 0;
    const BLK = 4 * 1024 * 1024;
    const buf = Buffer.alloc(BLK);
    for (const e of entrees) {
      if (e.dir) { fs.mkdirSync(path.join(dest, e.chemin), { recursive: true }); continue; }
      const cible = path.join(dest, e.chemin);
      fs.mkdirSync(path.dirname(cible), { recursive: true });
      const w = fs.openSync(cible, 'w');
      try {
        let reste = e.taille, pos = base + e.sect * SECTEUR;
        while (reste > 0) {
          const lu = fs.readSync(fd, buf, 0, Math.min(BLK, reste), pos);
          if (!lu) throw new Error('image tronquee : ' + e.chemin); // un secteur au-dela de la fin ne bouclerait jamais
          fs.writeSync(w, buf, 0, lu);
          pos += lu; reste -= lu;
        }
      } finally { fs.closeSync(w); }
      octets += e.taille; fichiers++;
      if (prog) { prog(octets, fichiers); await new Promise(r => setImmediate(r)); }
    }
    return { fichiers, octets };
  } finally { try { fs.closeSync(fd); } catch {} }
}

module.exports = {
  MAGIC, SECTEUR, DECALAGE_MAGIC, BASES_CONNUES,
  trouverBase, lireEntree, parcourirTable, lister, lireFichier,
  infosXbe, estXbox1, extraire
};
