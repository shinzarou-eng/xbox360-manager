// Construction du dataset MediaID -> Title Update.
//
// POURQUOI CE DATASET
// XboxUnity publie les TU par TitleID, mais jamais la correspondance qui compte
// vraiment : « pour un disque de MediaID X, quelle est la derniere TU, et
// lesquelles existent ». Cette table n'existe nulle part ailleurs sous forme
// exploitable, et c'est elle qui determine si une TU sera active sur la console.
//
// Ce module ne fait AUCUN acces reseau : il transforme des reponses deja
// recuperees en dataset, et sait le serialiser puis le relire a l'identique.
// La partie HTTP vit dans scripts/build-tu-dataset.js. C'est ce qui rend la
// construction du dataset testable hors ligne.
const { parseTuInfo, allUpdates } = require('./tu');

const SCHEMA = 1;
const SOURCE = 'https://xboxunity.net/Resources/Lib/TitleUpdateInfo.php';

// Une entree de dataset pour un jeu. `doc` = reponse XboxUnity brute.
// Rend null si le jeu ne publie aucune TU : inutile de gonfler le dataset avec
// des entrees vides.
function entry(tid, name, doc) {
  const t = String(tid || '').trim().toUpperCase();
  if (!/^[0-9A-F]{8}$/.test(t)) return null;
  const parsed = parseTuInfo(doc);
  const total = allUpdates(parsed).length;
  if (!total) return null;
  return {
    tid: t,
    name: name || null,
    mediaIds: parsed.mediaIds.map(g => ({
      media: g.media,
      updates: g.updates.map(u => ({ tuid: u.tuid, version: u.version, size: u.size }))
    }))
  };
}

const emptyDataset = () => ({ schema: SCHEMA, source: SOURCE, generated: null, titles: [] });

// Fusionne des entrees dans un dataset existant, en remplacant celles des memes
// TitleID (une collecte interrompue puis reprise ne doit pas creer de doublons).
function merge(dataset, entries) {
  const d = dataset && Array.isArray(dataset.titles) ? dataset : emptyDataset();
  const parTid = new Map(d.titles.map(e => [e.tid, e]));
  for (const e of (entries || [])) {
    if (!e || !e.tid) continue;
    parTid.set(e.tid, e);
  }
  const titles = [...parTid.values()].sort((a, b) => a.tid.localeCompare(b.tid));
  return { ...d, schema: SCHEMA, source: SOURCE, titles };
}

// --- CSV : une ligne par (titleid, mediaid, tuid) ---------------------------
// C'est la forme la plus directement exploitable (tableur, SQL, diff git lisible).
const CSV_ENTETE = 'titleid,name,mediaid,tuid,version,size';

const csvEchappe = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function toCsv(dataset) {
  const lignes = [CSV_ENTETE];
  for (const e of ((dataset && dataset.titles) || [])) {
    for (const g of e.mediaIds) {
      for (const u of g.updates) {
        lignes.push([e.tid, csvEchappe(e.name), g.media, u.tuid, u.version, u.size].join(','));
      }
    }
  }
  return lignes.join('\n') + '\n';
}

// Analyse CSV minimale mais correcte (guillemets, virgules et retours echappes)
function parseCsvRow(ligne) {
  const champs = [];
  let courant = '', dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (ligne[i + 1] === '"') { courant += '"'; i++; }
        else dansGuillemets = false;
      } else courant += c;
    } else if (c === '"') dansGuillemets = true;
    else if (c === ',') { champs.push(courant); courant = ''; }
    else courant += c;
  }
  champs.push(courant);
  return champs;
}

function fromCsv(texte) {
  const lignes = String(texte || '').split(/\r?\n/).filter(l => l.trim());
  if (!lignes.length || lignes[0].trim() !== CSV_ENTETE) return emptyDataset();
  const parTid = new Map();
  for (const ligne of lignes.slice(1)) {
    const [tid, name, media, tuid, version, size] = parseCsvRow(ligne);
    const t = String(tid || '').toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(t) || !media || !tuid) continue;
    if (!parTid.has(t)) parTid.set(t, { tid: t, name: name || null, mediaIds: new Map() });
    const e = parTid.get(t);
    if (!e.mediaIds.has(media)) e.mediaIds.set(media, []);
    e.mediaIds.get(media).push({ tuid, version: Number(version) || 0, size: Number(size) || 0 });
  }
  const titles = [...parTid.values()].map(e => ({
    tid: e.tid, name: e.name,
    mediaIds: [...e.mediaIds.entries()]
      .map(([media, updates]) => ({ media, updates: updates.sort((a, b) => b.version - a.version) }))
      .sort((a, b) => a.media.localeCompare(b.media))
  })).sort((a, b) => a.tid.localeCompare(b.tid));
  return { ...emptyDataset(), titles };
}

// --- statistiques -----------------------------------------------------------
// Sert a la fois au rapport de fin de collecte et a une verification de
// coherence : si `titles` est non nul mais `updates` vaut 0, quelque chose s'est
// mal passe dans la normalisation.
function stats(dataset) {
  let updates = 0, medias = 0;
  for (const e of ((dataset && dataset.titles) || [])) {
    medias += e.mediaIds.length;
    for (const g of e.mediaIds) updates += g.updates.length;
  }
  return { titles: ((dataset && dataset.titles) || []).length, mediaIds: medias, updates };
}

module.exports = { entry, merge, toCsv, fromCsv, stats, emptyDataset, SCHEMA, SOURCE, CSV_ENTETE };
