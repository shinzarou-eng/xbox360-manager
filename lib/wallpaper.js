'use strict';
// LE FOND D'ECRAN DE WINDOWS, POUR LA COUCHE MICA.
//
// Mica echantillonne le fond d'ecran du BUREAU. Une page web n'y a aucun acces :
// la seule facon de s'en approcher honnetement est de lire le fichier que Windows
// compose lui-meme pour dessiner le bureau.
//
// `TranscodedWallpaper` EST ce fichier. Windows y ecrit l'image DEJA rendue, dans
// le mode d'ajustement que l'utilisateur a choisi (remplir, ajuster, centrer,
// mosaique). Le lire, c'est donc s'accorder au bureau exactement, sans avoir a
// reappliquer le moindre recadrage. La valeur `WallPaper` du registre, elle,
// designe l'ORIGINAL : elle peut viser un fichier supprime, et il faudrait
// recalculer le cadrage nous-memes. On ne s'en sert pas.
//
// `CachedFiles\` a ete envisage comme SECONDE source et ECARTE : sur la machine
// de reference ce dossier est vide, donc ce repli n'a jamais pu etre exerce. Un
// chemin de repli qu'on ne peut pas verifier ne se livre pas — il ne se
// declencherait que chez quelqu'un d'autre, au moment ou l'on ne peut rien voir.
//
// Ce module ne touche au disque que par l'`io` qu'on lui passe : il est donc
// testable sans fond d'ecran, sans Windows, et sans dossier `Themes`.

const path = require('path');

// Le type se lit dans les OCTETS, jamais dans le nom : `TranscodedWallpaper` n'a
// pas d'extension. Windows transcode en JPEG, mais on ne le suppose pas — un
// fichier qu'on ne sait pas nommer ne sera pas servi.
const SIGNATURES = [
  [[0xff, 0xd8, 0xff], 'image/jpeg'],
  [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png'],
  [[0x47, 0x49, 0x46, 0x38], 'image/gif'],
  [[0x42, 0x4d], 'image/bmp']
];

function typeImage(buf) {
  if (!buf || typeof buf.length !== 'number' || buf.length < 12) return null;
  for (const [sig, type] of SIGNATURES) {
    if (sig.every((b, i) => buf[i] === b)) return type;
  }
  // WEBP : « RIFF » .... « WEBP »
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// Sans `APPDATA` il n'y a pas de Windows — et ce n'est PAS une erreur : c'est le
// cas normal sous Linux. On rend `null`, l'application retombe sur sa couleur de
// base, et rien ne casse.
function cheminFond(env) {
  const appdata = env && env.APPDATA;
  if (!appdata) return null;
  return path.join(appdata, 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper');
}

// La cle de cache : TAILLE et DATE. Le fond d'ecran peut changer sans que
// l'application le sache — clic droit > image suivante, ou un diaporama. Une
// cle qui ne regarderait que le chemin servirait l'ancien fond pour toujours.
function cleCache(st) {
  return String(st.size) + '-' + Math.round(st.mtimeMs);
}

// `cache` est la valeur rendue par l'appel PRECEDENT (ou `null`) : on la rend
// telle quelle si le fichier n'a pas bouge, sinon on en fabrique une neuve. Le
// serveur n'a donc qu'a garder ce qu'on lui rend — rien a muter, rien a partager.
function lire(io, env, cache) {
  const f = cheminFond(env);
  if (!f) return null;
  let st;
  try { st = io.statSync(f); } catch { return null; }   // aucun fond defini : repli, pas une panne
  if (!st.isFile() || !st.size) return null;
  const cle = cleCache(st);
  if (cache && cache.cle === cle && cache.buf) return cache;
  let buf;
  try { buf = io.readFileSync(f); } catch {
    // Windows verrouille brievement le fichier quand on change de fond. Rendre
    // `null` ferait disparaitre la couche Mica pour TOUTE la session, alors que
    // le fond precedent etait bon : on garde le dernier lisible.
    return cache && cache.buf ? cache : null;
  }
  const type = typeImage(buf);
  if (!type) return null;   // des octets qu'on ne comprend pas ne se servent pas
  return { cle, type, buf, taille: buf.length };
}

module.exports = { typeImage, cheminFond, cleCache, lire };
