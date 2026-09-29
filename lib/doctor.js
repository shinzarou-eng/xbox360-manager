// Diagnostic de l'environnement.
//
// Pourquoi : a l'installation, les echecs sont SILENCIEUX. Si 7z manque, le tri
// d'archives echoue avec un message vague ; si iso2god.exe manque, la conversion
// ISO->GOD echoue ; si le dossier de jeux est sur un disque absent, le scan rend
// une bibliotheque vide sans rien dire. Ce module transforme tout ca en une
// liste de verifications explicites, utilisable en CLI (`npm run doctor`) et par
// le serveur (GET /api/doctor) pour l'afficher dans l'UI.
const fs = require('fs');
const os = require('os');
const path = require('path');
const platform = require('./platform');

const MIN_NODE = 18;

// --- outils externes -------------------------------------------------------
// Recherche dans PATH en PUR NODE : pas de `where`/`which` en processus enfant
// (un environnement restreint peut refuser le spawn, et on raterait alors un
// binaire pourtant present).
//
// PIEGE VERIFIE : 7-Zip installe depuis le Microsoft Store (l'installation par
// defaut sur Windows 11) est un alias de 0 octet, de type reparse point. Sur ce
// fichier `fs.existsSync` rend FALSE et `fs.statSync` leve EACCES — alors que
// `spawn('7z')` FONCTIONNE parfaitement (le chargeur Windows, lui, resout
// l'alias). Un `existsSync` seul produit donc un faux negatif : on traite EACCES
// comme "present".
function existe(p) {
  try { fs.statSync(p); return true; }
  catch (e) { return e.code === 'EACCES'; }
}

function which(bin, env) {
  const e = env || process.env;
  const exts = process.platform === 'win32'
    ? (e.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  const dirs = String(e.PATH || '').split(path.delimiter).filter(Boolean);
  if (process.platform === 'win32' && e.LOCALAPPDATA) {
    dirs.push(path.join(e.LOCALAPPDATA, 'Microsoft', 'WindowsApps'));
  }
  for (const d of dirs) {
    for (const ext of exts) {
      const p = path.join(d, bin + ext);
      if (existe(p)) return p;
    }
    // un nom deja suffixe (ex. `xextool.exe`) ne doit pas etre re-suffixe
    const p = path.join(d, bin);
    if (existe(p)) return p;
  }
  return null;
}

const OUTILS = [
  {
    id: '7z', nom: '7-Zip', requis: false, alt: ['7za', '7zr'],
    pourquoi: 'extraction des archives (zip/7z/rar) du depot et des telechargements',
    hint: 'https://www.7-zip.org/ — ou `winget install 7zip.7zip` / `apt install p7zip-full`',
    chemins: ['C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe', '/usr/bin/7z', '/usr/bin/7za', '/usr/local/bin/7z']
  },
  {
    id: 'iso2god', nom: 'iso2god', requis: false, winOnly: true,
    pourquoi: 'conversion ISO -> GOD',
    hint: 'fourni avec le projet (iso2god.exe) ou https://github.com/iliazeus/iso2god-rs',
    chemins: ['iso2god.exe', 'ISO2GOD/iso2god.exe', 'bin/iso2god']
  },
  {
    id: 'exiso', nom: 'exiso', requis: false, winOnly: true,
    pourquoi: 'extraction d\'un ISO en dossier de jeu',
    hint: 'fourni avec le projet (exiso/exiso.exe)',
    chemins: ['exiso/exiso.exe', 'exiso/exiso', 'bin/exiso']
  },
  {
    id: 'xextool', nom: 'xextool', requis: false, winOnly: true,
    pourquoi: 'lecture du TitleID d\'un .xex (jeux extraits)',
    hint: 'fourni avec le projet (ISO2GOD/xextool.exe)',
    chemins: ['ISO2GOD/xextool.exe', 'bin/xextool']
  }
];

// `isWin` est injectable pour que le comportement des autres plateformes soit
// testable depuis n'importe quelle machine (on ne peut pas changer
// process.platform dans un test).
function checkOutil(o, racine, isWin) {
  const windows = isWin === undefined ? platform.IS_WIN : !!isWin;
  const base = { id: o.id, nom: o.nom, requis: o.requis, pourquoi: o.pourquoi };

  // Un outil Windows sur une autre plateforme n'est pas « manquant » : il n'existe
  // pas. Le signaler comme manquant enverrait l'utilisateur chercher un binaire
  // qu'il ne pourra jamais installer (et ferait echouer le diagnostic pour rien).
  if (o.winOnly && !windows) {
    return { ...base, ok: null, indisponible: true, detail: 'indisponible hors Windows', hint: null };
  }

  let trouve = null;
  for (const nom of [o.id, ...(o.alt || [])]) {
    trouve = which(nom);
    if (trouve) break;
  }
  if (!trouve) {
    for (const c of o.chemins) {
      const p = path.isAbsolute(c) ? c : path.join(racine, c);
      if (existe(p)) { trouve = p; break; }
    }
  }
  return {
    ...base, ok: !!trouve, chemin: trouve,
    detail: trouve ? undefined : 'introuvable',
    hint: trouve ? null : o.hint
  };
}

// --- base de titres --------------------------------------------------------
function checkTitres(racine) {
  const csv = path.join(racine, 'ISO2GOD', 'gamelist_xbox360.csv');
  try {
    const n = fs.readFileSync(csv, 'utf8').split('\n').filter(l => /^[0-9A-Fa-f]{8}\t/.test(l)).length;
    return { id: 'titres', nom: 'Base de titres', ok: n > 0, detail: n + ' titres', chemin: csv };
  } catch {
    return {
      id: 'titres', nom: 'Base de titres', ok: false, detail: 'absente',
      hint: 'ISO2GOD/gamelist_xbox360.csv — sans elle, les jeux s\'affichent par TitleID'
    };
  }
}

// --- dossiers configures ---------------------------------------------------
// Verifie l'existence ET l'ecriture : un dossier en lecture seule fait echouer
// le tri au milieu d'une operation, apres avoir deja deplace des fichiers.
function checkDossier(nom, p) {
  if (!p) return { id: 'dir:' + nom, nom, ok: false, detail: 'non configure', hint: 'a renseigner dans DOSSIERS' };
  const existe = fs.existsSync(p);
  if (!existe) {
    // un disque absent n'est pas une erreur fatale (E: non branche), mais il
    // faut le DIRE plutot que d'afficher un vague "dossier inexistant"
    const m = /^([A-Za-z]):/.exec(p);
    const disqueAbsent = m ? !fs.existsSync(m[1] + ':\\') : false;
    return {
      id: 'dir:' + nom, nom, ok: false, chemin: p,
      detail: disqueAbsent ? 'disque ' + m[1].toUpperCase() + ': absent' : 'dossier inexistant',
      hint: disqueAbsent ? 'brancher le disque, ou changer le dossier dans DOSSIERS' : 'sera cree au premier usage'
    };
  }
  let ecriture = true;
  try { fs.accessSync(p, fs.constants.W_OK); } catch { ecriture = false; }
  return { id: 'dir:' + nom, nom, ok: ecriture, chemin: p, detail: ecriture ? 'ok' : 'lecture seule', hint: ecriture ? null : 'le tri echouera : choisir un dossier inscriptible' };
}

// --- rapport ---------------------------------------------------------------
function runDoctor(cfg, racine) {
  const root = racine || path.join(__dirname, '..');
  const majeur = Number(process.versions.node.split('.')[0]);
  const node = {
    id: 'node', nom: 'Node.js', ok: majeur >= MIN_NODE,
    detail: 'v' + process.versions.node + (majeur >= MIN_NODE ? '' : ' (>= ' + MIN_NODE + ' requis)'),
    hint: majeur >= MIN_NODE ? null : 'https://nodejs.org/'
  };

  const outils = OUTILS.map(o => checkOutil(o, root));
  const dossiers = [
    checkDossier('depot', cfg.drop),
    checkDossier('jeux', cfg.games),
    checkDossier('contenu', cfg.content)
  ].concat([
    checkDossier('homebrew', cfg.homebrew),
    checkDossier('emulateurs', cfg.emulators)
  ]);

  const checks = [node, checkTitres(root), ...outils, ...dossiers];

  // Un outil optionnel manquant ne doit PAS bloquer : on separe "empeche de
  // demarrer" de "degrade une fonctionnalite".
  // Un outil indisponible sur la plateforme (ok === null) n'est ni bloquant ni
  // degradant : il n'y a rien a corriger.
  const bloquants = checks.filter(c => c.ok === false && (c.id === 'node' || c.requis));
  const degradants = checks.filter(c => c.ok === false && !bloquants.includes(c));
  const indisponibles = checks.filter(c => c.indisponible);

  return {
    checks,
    bloquants: bloquants.length,
    degradants: degradants.length,
    indisponibles: indisponibles.length,
    // resume utilisable directement par l'UI
    resume: bloquants.length ? 'inutilisable' : (degradants.length ? 'degrade' : 'ok'),
    plateforme: process.platform + ' ' + os.arch()
  };
}

module.exports = { runDoctor, checkOutil, checkDossier, checkTitres, dossiersAbsents, which, OUTILS, MIN_NODE };

/**
 * Regroupe les dossiers configures INTROUVABLES par disque.
 *
 * Trois dossiers absents du meme disque donnaient trois conseils identiques, et
 * repeter la meme phrase fait perdre le vrai message. On rend UNE entree par
 * disque, avec les dossiers concernes.
 *
 * `existe` est injectable : on teste la logique sans dependre du disque de la
 * machine.
 *
 * @param {object} cfg    { games, content, drop }
 * @param {function} [existe] remplace fs.existsSync
 */
function dossiersAbsents(cfg, existe) {
  const ex = existe || fs.existsSync;
  const parVolume = {};
  const champs = [['games', 'games'], ['content', 'content'], ['drop', 'drop']];
  for (const [cle, quoi] of champs) {
    const p = cfg && cfg[cle];
    if (!p || ex(p)) continue;
    const lettre = (/^([A-Za-z]):/.exec(p) || [])[1];
    const vol = lettre ? lettre.toUpperCase() + ':' : p;
    if (!parVolume[vol]) parVolume[vol] = { volume: vol, quoi: [], chemins: [], volumeAbsent: false };
    const e = parVolume[vol];
    e.quoi.push(quoi);
    e.chemins.push(p);
    if (lettre && !ex(lettre + ':\\')) e.volumeAbsent = true;
  }
  return Object.values(parVolume);
}
