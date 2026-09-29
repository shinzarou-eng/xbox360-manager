// Moteur Title Update : lecture XboxUnity, compatibilite par MediaID, verdict.
//
// POURQUOI CE MODULE EXISTE
// Une Title Update n'est active que pour le MediaID du disque sur lequel elle
// est installee. Installer « la derniere version » a l'aveugle ne sert a rien si
// le MediaID differe : la console ignore la TU, et les DLC qui en dependent
// restent bloques. Cas reel rencontre : TU v5 pour CAA468A3 installee sur un
// disque 6D88AE4F -> jeu ignore -> DLC bloques, sans aucun message.
//
// Aucun outil public ne fait cette correspondance : XboxUnity expose bien la
// liste des TU par TitleID, mais jamais « laquelle correspond a MON disque ».
// C'est ce que ce module calcule, et c'est la raison pour laquelle il est
// isole : la logique est testable sans reseau ni fichiers de jeu.
//
// FORME DE LA REPONSE XBOXUNITY (TitleUpdateInfo.php?titleid=XXXXXXXX)
//   { "MediaIDS": [ { "MediaID": "6D88AE4F",
//                     "Updates": [ { "TitleUpdateID": "...", "Version": 5,
//                                    "Size": "1234", ... } ] } ] }
// Attention : les TU sont sous `MediaIDS[].Updates[]`, PAS sous `Updates` racine.
// `Size` est en KILOOCTETS.
const HEX8 = /^[0-9A-Fa-f]{8}$/;

const hex8 = v => {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  return HEX8.test(s) ? s : null;
};

// Normalise la reponse XboxUnity en structure stable :
//   { mediaIds: [ { media, updates: [ { tuid, version, size } ] } ] }
// - les MediaID invalides sont ecartes
// - les mises a jour sans identifiant sont ecartees
// - `size` est converti en OCTETS (XboxUnity publie des kilooctets)
// - les mises a jour sont triees par version DECROISSANTE
function parseTuInfo(doc) {
  const out = { mediaIds: [] };
  if (!doc || !Array.isArray(doc.MediaIDS)) return out;
  for (const groupe of doc.MediaIDS) {
    const media = hex8(groupe && groupe.MediaID);
    if (!media) continue;
    const updates = [];
    for (const up of (groupe.Updates || [])) {
      const tuid = up && up.TitleUpdateID != null ? String(up.TitleUpdateID) : '';
      if (!tuid) continue;
      updates.push({
        tuid,
        version: Number(up.Version) || 0,
        size: (parseInt(up.Size || '0', 10) || 0) * 1024,
        media
      });
    }
    updates.sort((a, b) => b.version - a.version);
    if (updates.length) out.mediaIds.push({ media, updates });
  }
  return out;
}

// Toutes les mises a jour, tous MediaID confondus (aplati)
const allUpdates = parsed => (parsed && parsed.mediaIds ? parsed.mediaIds : []).flatMap(g => g.updates);

// Les mises a jour compatibles avec un MediaID donne
const compatibleUpdates = (parsed, mediaId) => {
  const m = hex8(mediaId);
  if (!m) return [];
  const g = (parsed && parsed.mediaIds ? parsed.mediaIds : []).find(x => x.media === m);
  return g ? g.updates : [];
};

// La meilleure mise a jour pour un MediaID : version la plus haute, ou null.
// Ne renvoie JAMAIS de TU d'un autre MediaID — c'est la garantie qui evite le
// bug « meilleure version pour ton disque » alors que la console l'ignorera.
function bestFor(parsed, mediaId) {
  const c = compatibleUpdates(parsed, mediaId);
  if (!c.length) return null;
  return c.reduce((a, b) => (b.version > a.version ? b : a));
}

// La meilleure mise a jour tous MediaID confondus (utilise quand le MediaID du
// disque n'est pas encore connu : on informe sans affirmer la compatibilite)
function bestOverall(parsed) {
  const t = allUpdates(parsed);
  if (!t.length) return null;
  return t.reduce((a, b) => (b.version > a.version ? b : a));
}

// Le MediaID d'une TU est-il un de ceux publies pour ce jeu ?
const isKnownMedia = (parsed, mediaId) => compatibleUpdates(parsed, mediaId).length > 0;

// VERDICT actionnable pour un jeu installe.
//
// Entrees :
//   parsed        : resultat de parseTuInfo (ou null tant que non charge)
//   mediaId       : MediaID du disque installe (null si pas encore calcule)
//   installedTuids: tuids marques installes (tu_installed.json)
//   tuFiles       : nombre de fichiers de TU presents dans Content\<TID>\000B0000
//
// Rend un verdict + les FAITS qui le composent :
//   state            'unknown' | 'no-updates' | 'up-to-date' | 'update-available'
//                    | 'wrong-media' | 'no-compatible'
//   best             la meilleure TU COMPATIBLE avec ce disque (jamais d'un autre)
//   special          meilleure TU tous MediaID confondus (cas MediaID inconnu)
//   installedWrong   une TU est installee, mais pour un AUTRE MediaID : la console
//                    l'ignore et les DLC restent bloques
//   updateAvailable  une TU compatible, plus recente, n'est pas installee
//
// La priorite entre `updateAvailable` et `installedWrong` reproduit exactement
// celle du serveur d'origine (la disponibilite d'une MAJ l'emporte). Les deux
// faits sont exposes separement pour qu'un appelant puisse choisir un autre
// ordre plus tard, en connaissance de cause.
function diagnose({ parsed, mediaId, installedTuids = [], tuFiles = 0 }) {
  const installes = (installedTuids || []).map(String);
  const toutes = allUpdates(parsed);

  if (!parsed || !toutes.length) return { state: 'no-updates', best: null, special: null, total: 0 };

  const mid = hex8(mediaId);
  const fichiers = Number(tuFiles) || 0;

  // MediaID pas encore connu : on informe, sans affirmer la compatibilite
  if (!mid) {
    return {
      state: 'unknown', best: null, special: bestOverall(parsed),
      total: toutes.length, pending: true
    };
  }

  const compatibles = compatibleUpdates(parsed, mid);
  const best = bestFor(parsed, mid);
  const installedWrong = installes.length > 0 && !compatibles.some(t => installes.includes(t.tuid));
  // tuFiles > 0 sans marqueur : la TU est presente sur le disque (installation
  // manuelle) -> on la considere installee
  const installed = installes.length > 0 || fichiers > 0;
  const updateAvailable = !!best && !installes.includes(best.tuid) && !fichiers;

  let state;
  if (updateAvailable) state = 'update-available';
  else if (installedWrong) state = 'wrong-media';
  else if (!best) state = 'no-compatible';
  else state = 'up-to-date';

  return { state, best, special: best || bestOverall(parsed), total: toutes.length, installedWrong, updateAvailable };
}

module.exports = {
  parseTuInfo, allUpdates, compatibleUpdates, bestFor, bestOverall,
  isKnownMedia, diagnose, hex8
};
