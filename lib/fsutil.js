// Deplacement de fichiers/dossiers, sur et testable.
// Un renameSync echoue en EXDEV quand la source et la destination sont sur
// deux disques differents (cas frequent : depot D:\ -> jeux H:\) : on retombe
// alors sur une copie suivie de la suppression de la source.
const fs = require('fs');
const path = require('path');

function movePath(src, dest) {
  // chemin rapide : rename atomique, quasi instantane, meme sur 13 Go
  try {
    fs.renameSync(src, dest);
    return;
  } catch (e) {
    // `ENOENT` a DEUX causes, et les confondre fait echouer un deplacement
    // parfaitement legitime :
    //   - la SOURCE n'existe pas  -> on leve, c'est une vraie erreur ;
    //   - le PARENT de la destination n'existe pas encore -> on continue, le
    //     chemin lent cree les dossiers.
    // Le test « destination dans un dossier neuf » l'a attrape.
    if (e.code === 'ENOENT' && !fs.existsSync(src)) throw e;
  }
  // chemin lent : autre disque (EXDEV), parent manquant, point de montage, etc.
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.statSync(src).isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
  } else {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

/**
 * Le meme deplacement, mais ASYNCHRONE.
 *
 * Le chemin lent ci-dessus BLOQUE la boucle d'evenements : `cpSync` d'un jeu de
 * 8 Go gele l'application entiere — plus de reponse HTTP, plus de progression de
 * telechargement, plus rien — pendant toute la copie. Or c'est exactement le
 * trajet courant : le depot est sur D: (NTFS, pour les fichiers de plus de 4 Go)
 * et la bibliotheque sur H: (FAT32), donc deux disques, donc EXDEV, donc copie.
 *
 * Meme contrat, memes garanties : rename d'abord (atomique et instantane), copie
 * seulement s'il echoue, et la source n'est supprimee QU'APRES une copie reussie.
 * Une copie interrompue laisse la source intacte.
 */
async function movePathAsync(src, dest) {
  try {
    await fs.promises.rename(src, dest);
    return;
  } catch (e) {
    // Meme distinction que ci-dessus : source absente, ou parent manquant.
    if (e.code === 'ENOENT' && !fs.existsSync(src)) throw e;
  }
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const st = await fs.promises.stat(src);
  if (st.isDirectory()) {
    await fs.promises.cp(src, dest, { recursive: true });
    await fs.promises.rm(src, { recursive: true, force: true });
  } else {
    await fs.promises.copyFile(src, dest);
    await fs.promises.unlink(src);
  }
}

// Taille recursive d'un dossier. ATTENTION : synchrone et non borne — sur un
// dossier de plusieurs centaines de Go c'est plusieurs secondes de blocage de
// la boucle d'evenements. Ne jamais l'appeler directement depuis un handler
// HTTP sans cache (voir dirSizeCached).
function dirSize(d) {
  let t = 0;
  try {
    for (const e of fs.readdirSync(d, { withFileTypes: true, recursive: true })) {
      if (e.isFile()) t += fs.statSync(path.join(e.parentPath || e.path || d, e.name)).size;
    }
  } catch {}
  return t;
}

// parcourt recursivement les fichiers d'un dossier (generateur)
function* walkFiles(dir, depth = 5) {
  if (depth < 0) return;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) yield* walkFiles(p, depth - 1);
      else yield p;
    }
  } catch {}
}

const findFirst = (dir, test) => { for (const f of walkFiles(dir)) if (test(f)) return f; return null; };

// nettoie un nom pour en faire un nom de dossier valide sous Windows
const cleanName = n => n.replace(/[<>:"/\\|?*]/g, '_').trim();

// copie recursive (utilisee pour les dossiers homebrew)
const copyDir = (src, dst) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const c of fs.readdirSync(src)) {
    const s = path.join(src, c), d = path.join(dst, c);
    try { if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d); } catch {}
  }
};

// ---------- CRC32 ----------
// Table standard IEEE (polynome 0xEDB88320), la meme que celle qu'annonce FtpDll
// avec sa commande XCRC. Node expose `zlib.crc32` depuis la 22 seulement : on
// l'ecrit, c'est quinze lignes, et ca marche sur Node 18 comme sur les autres.
const TABLE_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf, depart) {
  let c = ~(depart >>> 0) >>> 0;
  for (let i = 0; i < buf.length; i++) c = TABLE_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
}

// CRC32 d'un fichier, lu par morceaux : une archive de 8 Go ne tient pas en
// memoire, et la verifier ne doit pas faire tomber le serveur.
function crc32Fichier(chemin, tailleMorceau) {
  return new Promise((res, rej) => {
    let c = 0;
    const flux = fs.createReadStream(chemin, { highWaterMark: tailleMorceau || 4 * 1024 * 1024 });
    flux.on('data', d => { c = crc32(d, c); });
    flux.on('end', () => res((c >>> 0).toString(16).toUpperCase().padStart(8, '0')));
    flux.on('error', rej);
  });
}

module.exports = { movePath, movePathAsync, dirSize, walkFiles, findFirst, cleanName, copyDir, crc32, crc32Fichier };
