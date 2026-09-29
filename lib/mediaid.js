// MediaID d'un disque de jeu Xbox 360.
//
// Pourquoi c'est important : une Title Update n'est active QUE pour le MediaID
// du disque sur lequel elle est installee. Installer « la derniere version » a
// l'aveugle ne sert a rien si le MediaID differe — le jeu ignore la TU et les
// DLC restent bloques. Cas reel rencontre : TU v5 pour CAA468A3 installee sur un
// disque 6D88AE4F.
//
// Ou le trouver : dans le XEX, l'en-tete XEX2 pointe (u32 a +0x10) vers la
// security info ; le MediaID est l'u32 a securityInfo + 0x14C.
// Verifie contre XboxUnity : Rivals 603CD4F9, Brotherhood 6D88AE4F.
const fs = require('fs');
const { walkFiles } = require('./fsutil');

const XEX2_MAGIC = 0x58455832; // 'XEX2'
const SEX_XSI_MAX = 0x400;     // borne de l'offset de security info
const SEX_LEN_MAX = 0x80000;   // borne de la taille declaree

// MediaID dans un buffer contenant un XEX2 a l'offset xo.
// Les deux bornes ne sont pas cosmetiques : elles evitent de lire n'importe ou
// quand la signature 'XEX2' apparait par hasard dans des donnees de jeu.
function xexMid(buf, xo) {
  try {
    const xsi = buf.readUInt32BE(xo + 0x10);
    if (xsi <= 0 || xsi > SEX_XSI_MAX) return null;
    if (buf.readUInt32BE(xo + xsi) > SEX_LEN_MAX) return null;
    const mid = buf.readUInt32BE(xo + xsi + 0x14C);
    return mid ? mid.toString(16).toUpperCase().padStart(8, '0') : null;
  } catch { return null; }
}

const HEAD = 0x20000;

// .xex direct (jeux extraits / homebrew) : la signature est en tete de fichier
function fileMediaId(f) {
  let fd;
  try {
    fd = fs.openSync(f, 'r');
    const buf = Buffer.alloc(HEAD);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    if (n < 0x200 || buf.readUInt32BE(0) !== XEX2_MAGIC) return null;
    return xexMid(buf, 0);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
}

const CHUNK = 8 * 1024 * 1024;
const MIN_CANDIDATE = 40960; // en dessous, ce n'est jamais le default.xex

// GOD : le default.xex est embarque dans les fichiers .data (qui sont en realite
// des DOSSIERS contenant DataNNNN). On cherche la signature XEX2 par blocs, avec
// un chevauchement de 8 octets : sans lui, une signature a cheval sur deux blocs
// serait manquee et le MediaID resterait introuvable.
function godMediaId(gamePath) {
  const buf = Buffer.alloc(CHUNK);
  const files = [];
  for (const f of walkFiles(gamePath, 4)) {
    try { if (fs.statSync(f).size > MIN_CANDIDATE) files.push(f); } catch {}
  }
  files.sort();
  for (const fp of files) {
    let fd;
    try { fd = fs.openSync(fp, 'r'); } catch { continue; }
    let pos = 0;
    try {
      for (;;) {
        let n = 0;
        try { n = fs.readSync(fd, buf, 0, CHUNK, pos); } catch { break; }
        if (n <= 0) break;
        const i = buf.indexOf('XEX2');
        if (i >= 0) {
          const mid = xexMid(buf, i);
          if (mid) return mid;
        }
        pos += Math.max(1, n - 8); // chevauchement : la signature peut etre a cheval
      }
    } finally {
      try { fs.closeSync(fd); } catch {}
    }
  }
  return null;
}

module.exports = {
  xexMid, fileMediaId, godMediaId,
  XEX2_MAGIC, SEX_XSI_MAX, SEX_LEN_MAX, CHUNK
};
