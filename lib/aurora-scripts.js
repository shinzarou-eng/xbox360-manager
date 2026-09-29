// Ou les scripts Aurora doivent-ils aller, sur CETTE console ?
//
// `AuroraRepo/Repos.ini`, dans le depot officiel XboxUnity, donne les chemins
// relatifs a une installation d'Aurora :
//
//   Utility Scripts -> Game:\User\Scripts\Utility\
//   Filters         -> Game:\User\Scripts\Content\Filters\
//   Subtitles       -> Game:\User\Scripts\Content\Subtitles\
//   Sorts           -> Game:\User\Scripts\Content\Sorts\
//
// Mais « Game: » est un alias de PERIPHERIQUE d'Aurora, pas un chemin de fichier,
// et rien ne dit ou Aurora est installe sur une console donnee. Sur celle de
// l'utilisateur, c'est /Game et les dossiers existent deja — mais on l'a
// VERIFIE, on ne l'a pas suppose.
//
// La regle : on CHERCHE une installation d'Aurora (un dossier qui contient
// Aurora.xex), et si on n'en trouve pas, on REFUSE. Ecrire dans un dossier
// qu'Aurora ne lit pas, c'est un succes en apparence et un script qui ne se
// charge jamais — exactement ce qu'il faut eviter.
'use strict';
const fs = require('fs');
const path = require('path');

// Les quatre categories, avec leur chemin RELATIF a la racine d'Aurora.
const CATEGORIES = [
  { id: 'utility', nom: 'Utilitaires', rel: 'User\\Scripts\\Utility', type: 'utility script', reload: false, refresh: true },
  { id: 'filters', nom: 'Filtres', rel: 'User\\Scripts\\Content\\Filters', type: 'filter', reload: true, refresh: false },
  { id: 'sorts', nom: 'Tris', rel: 'User\\Scripts\\Content\\Sorts', type: 'sorting script', reload: true, refresh: false },
  { id: 'subtitles', nom: 'Sous-titres', rel: 'User\\Scripts\\Content\\Subtitles', type: 'subtitle', reload: true, refresh: false }
];
const parId = id => CATEGORIES.find(c => c.id === id);

// L'executable qui identifie une installation d'Aurora.
const EXE = /^aurora\.xex$/i;

// Le chemin relatif en segments, utilisable cote FTP comme cote disque.
const segments = rel => String(rel).split(/[\\/]+/).filter(Boolean);

// Un dossier dont le nom annonce Aurora : sur la console de l'utilisateur,
// /Usb0 contient « Aurora/ », et l'executable est un niveau plus bas. Chercher
// seulement dans les dossiers de premier niveau raterait cette installation —
// et poserait le script dans un Aurora que la console ne demarre pas.
const NOMME_AURORA = /^aurora/i;

// --- Cote CONSOLE (FTP) ------------------------------------------------------
// On liste la racine, on ouvre chaque dossier de premier niveau a la recherche
// d'Aurora.xex (et, s'il porte le nom, un niveau plus bas), puis on regarde ce
// que contient son User\Scripts.
async function trouverConsole(ftp, declare) {
  if (!ftp) return { trouve: false, raison: 'aucune console connectee' };
  const installs = [];
  const essayer = async (dossier) => {
    let enfants;
    try { enfants = await ftp.liste(dossier); } catch { return null; }
    // `dossier` peut etre '' (racine) : Ftp.liste relit PWD, le chemin reel est
    // dans ftp.dossier.
    const base = String(dossier || '/').replace(/\/+$/, '') || '/';
    if (!enfants.some(e => !e.dir && EXE.test(e.name))) return null;
    const cats = {};
    for (const c of CATEGORIES) {
      const p = [base].concat(segments(c.rel)).join('/');
      try { const l = await ftp.liste(p); cats[c.id] = { chemin: p, entrees: l.length }; }
      catch { cats[c.id] = { chemin: p, entrees: null }; }
    }
    return { dossier: base, categories: cats };
  };

  if (declare) { const i = await essayer(declare); if (i) installs.push(i); }
  if (!installs.length) {
    let racine = [];
    try { racine = await ftp.liste('/'); } catch (e) { return { trouve: false, raison: 'racine illisible : ' + e.message }; }
    for (const d of racine.filter(e => e.dir)) {
      const i = await essayer(d.path);
      if (i) { installs.push(i); continue; }
      // Pas d'executable a ce niveau. On regarde les SOUS-dossiers qui portent le
      // nom d'Aurora : sur la console de l'utilisateur, la racine s'appelle
      // « Usb0 » et l'installation est dans « Usb0/Aurora ». Tester le nom de la
      // RACINE ne trouverait jamais rien — c'est l'inverse.
      let sous = [];
      try { sous = await ftp.liste(d.path); } catch { continue; }
      for (const s of sous.filter(e => e.dir && NOMME_AURORA.test(e.name))) {
        const j = await essayer(s.path);
        if (j) installs.push(j);
      }
    }
  }
  if (!installs.length) {
    return {
      trouve: false,
      raison: 'aucun dossier de la console ne contient Aurora.xex',
      // Ce qu'on a vu, pour que l'utilisateur puisse juger lui-meme.
      racine: (await ftp.liste('/').catch(() => [])).filter(e => e.dir).map(e => e.path)
    };
  }
  return verdict(installs);
}

// Combien d'installations sont REELLEMENT utilisables ? Une installation sans
// aucun dossier de categorie n'est pas une destination : Aurora n'y lit rien.
function verdict(installs) {
  const util = o => Object.values(o.categories).filter(v => v.entrees !== null).length;
  installs.sort((a, b) => util(b) - util(a));
  const utilisables = installs.filter(i => util(i) > 0);
  // DEUX installations utilisables : on ne choisit PAS. Sur la console de
  // l'utilisateur il y en a deux — /Game et /Usb0/Aurora — et rien ne dit
  // laquelle la console demarre. Envoyer le script dans la mauvaise donne un
  // script qui ne se charge jamais, sans que rien ne le signale.
  if (utilisables.length > 1) {
    return {
      trouve: true, installs, choisi: null, ambigu: true,
      raison: utilisables.length + ' installations d\'Aurora contiennent des scripts',
      candidats: utilisables.map(i => i.dossier)
    };
  }
  return { trouve: true, installs, choisi: utilisables[0] || installs[0], ambigu: false };
}

// --- Cote DISQUE (le disque de la console, branche sur le PC) ----------------
// Meme logique, sans reseau : on descend d'un niveau sous chaque racine fournie.
function trouverLocal(racines) {
  const installs = [];
  const essayer = (dossier) => {
    let enfants;
    try { enfants = fs.readdirSync(dossier, { withFileTypes: true }); } catch { return; }
    if (!enfants.some(e => e.isFile() && EXE.test(e.name))) return;
    const cats = {};
    for (const c of CATEGORIES) {
      const p = path.join(dossier, ...segments(c.rel));
      let n = null;
      try { if (fs.statSync(p).isDirectory()) n = fs.readdirSync(p).length; } catch {}
      cats[c.id] = { chemin: p, entrees: n };
    }
    installs.push({ dossier, categories: cats });
  };
  for (const r of racines || []) {
    essayer(r);
    let noms = [];
    try { noms = fs.readdirSync(r, { withFileTypes: true }); } catch { continue; }
    for (const n of noms) {
      if (!n.isDirectory()) continue;
      const p = path.join(r, n.name);
      essayer(p);
      // On descend dans les sous-dossiers nommes « Aurora », QUEL QUE SOIT le nom
      // du parent. C'est ce que fait deja `trouverConsole` — et le commentaire
      // ci-dessus le disait deja (« Usb0 » ne dit rien). Le code, lui, sortait ici
      // quand le niveau 1 ne s'appelait pas Aurora : une installation dans
      // « H:\Usb0\Aurora » etait donc INVISIBLE cote disque, alors que la console
      // la voyait. Deux cotes qui se contredisent sur la meme disposition.
      let sous = [];
      try { sous = fs.readdirSync(p, { withFileTypes: true }); } catch { continue; }
      for (const s of sous) {
        if (!s.isDirectory() || !NOMME_AURORA.test(s.name)) continue;
        const q = path.join(p, s.name);
        essayer(q);
        let bas = [];
        try { bas = fs.readdirSync(q, { withFileTypes: true }); } catch { continue; }
        for (const b of bas) if (b.isDirectory() && NOMME_AURORA.test(b.name)) essayer(path.join(q, b.name));
      }
    }
  }
  if (!installs.length) return { trouve: false, raison: 'aucun dossier ne contient Aurora.xex', racine: racines || [] };
  return verdict(installs);
}

/**
 * OU POSER le script. Fonction PURE : on lui donne ce qui a ete trouve, elle rend
 * la destination. C'est le seul endroit qui decide, pour que l'ecran, l'envoi et le
 * refus ne puissent plus se contredire.
 *
 * ORDRE, decide par l'utilisateur :
 *   1. l'installation Aurora trouvee SUR LE DISQUE. La cle USB EST le support de la
 *      console : y ecrire EST installer — sans reseau, sans transfert partiel, et
 *      console eteinte.
 *   2. la console par FTP, si elle repond et si une seule installation est utilisable.
 *   3. sinon on REFUSE en disant pourquoi.
 *
 * @returns {{chemin:string, ou:('disque'|'console'|null), raison:string}}
 */
function destination(m) {
  const o = m || {};
  const cat = parId(o.catId);
  if (!cat) return { chemin: '', ou: null, raison: 'categorie inconnue : ' + o.catId };

  // --- 1. le disque ---------------------------------------------------------
  const surDisque = ((o.disque && o.disque.installs) || [])
    .filter(i => i && i.categories && i.categories[cat.id] && i.categories[cat.id].entrees !== null);
  if (surDisque.length === 1) return { chemin: surDisque[0].categories[cat.id].chemin, ou: 'disque', raison: '' };
  if (surDisque.length > 1) {
    return {
      chemin: '', ou: null,
      raison: surDisque.length + ' installations Aurora sur le disque contiennent ' + cat.nom
        + ' (' + surDisque.map(i => i.dossier).join(', ') + ')'
    };
  }

  // --- 2. la console --------------------------------------------------------
  const c = o.console;
  if (c && c.trouve) {
    // `choisi` vaut null quand DEUX installations sont utilisables : le module
    // refuse de deviner, et c'est voulu. Le dereferencer faisait planter
    // l'installation — on refuse, en nommant les candidats.
    if (!c.choisi) {
      return {
        chemin: '', ou: null,
        raison: (c.raison || 'plusieurs installations Aurora sont utilisables')
          + (c.candidats && c.candidats.length ? ' : ' + c.candidats.join(', ') : '')
      };
    }
    const info = (c.choisi.categories || {})[cat.id];
    if (info && info.chemin && info.entrees !== null) return { chemin: info.chemin, ou: 'console', raison: '' };
    return { chemin: '', ou: null, raison: 'Aurora a ete trouve sur la console, mais pas son dossier ' + cat.nom };
  }

  // --- 3. rien --------------------------------------------------------------
  return { chemin: '', ou: null, raison: (c && c.raison) || 'aucune installation Aurora trouvee' };
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Les scripts DEJA INSTALLES, lus sur le disque.
 *
 * `/api/ascripts` ne rendait que le CATALOGUE du depot XboxUnity : 38 scripts a
 * telecharger. Rien ne disait ce qui etait deja en place — l'utilisateur voyait le
 * magasin, jamais son propre placard. Une installation Aurora branchee sur le PC
 * contient pourtant tout : `E:\Aurora\User\Scripts\{Utility,Content\*}`.
 *
 * @param {Array} installs  ce que rend `trouverLocal()` : `{dossier, categories}`
 * @param {Function} [lire] lit un dossier ; injecte pour les tests
 */
function listerInstalles(installs, lire) {
  const lireDossier = lire || ((p) => {
    try {
      return fs.readdirSync(p, { withFileTypes: true }).map(x => {
        let taille = 0;
        try { if (!x.isDirectory()) taille = fs.statSync(path.join(p, x.name)).size; } catch {}
        return { name: x.name, dir: x.isDirectory(), taille };
      });
    } catch { return null; }          // absent : a ne pas confondre avec « vide »
  });
  const out = [];
  for (const inst of installs || []) {
    for (const cat of CATEGORIES) {
      const info = (inst.categories || {})[cat.id];
      // `segments()` ET PAS `cat.rel` BRUT. `rel` s'ecrit avec des antislashs
      // (`User\Scripts\Utility`) : sous Linux, `path.join` les garde litteralement
      // et fabrique `E:/Aurora/User\Scripts\Utility`, un chemin qui n'existe pas.
      // Le CI Ubuntu l'a attrape — les trois tests d'inventaire echouaient la et
      // passaient sous Windows. Le fichier utilisait DEJA `segments()` trente
      // lignes plus haut : c'est cet ecart qui etait le defaut.
      const chemin = (info && info.chemin) || path.join(inst.dossier, ...segments(cat.rel));
      const entrees = lireDossier(chemin);
      if (!entrees) continue;
      for (const e of entrees) {
        // `readme.txt` ou `icon.png` ne sont pas des scripts : les compter ferait
        // croire a des installations qui n'existent pas.
        if (!e.dir && !/\.lua$/i.test(e.name)) continue;
        out.push({
          cat: cat.id, catNom: cat.nom, nom: e.name, estDossier: !!e.dir,
          chemin: path.join(chemin, e.name), aurora: inst.dossier, taille: e.taille || 0
        });
      }
    }
  }
  return out;
}

/**
 * Marque dans le catalogue ce qui est DEJA installe.
 *
 * La comparaison se fait sur le nom SANS son extension : le catalogue annonce
 * « DBCleaner » quand le disque porte le dossier `DBCleaner`, mais un filtre
 * s'appelle `HideBackups.lua` la ou le catalogue dit `HideBackups`. Comparer a la
 * lettre raterait la moitie des correspondances.
 */
function marquerInstalles(items, installes) {
  const vus = new Map();
  for (const i of installes || []) {
    vus.set(norm(i.nom), i);
    vus.set(norm(String(i.nom).replace(/\.[a-z0-9]+$/i, '')), i);
  }
  return (items || []).map(it => {
    const trouve = vus.get(norm(it.nom)) || vus.get(norm(it.id || '')) || null;
    return Object.assign({}, it, {
      installe: !!trouve,
      // On dit OU il est : le disque ou la console. Un script pose sur le disque
      // branche n'est pas au meme endroit que celui envoye par FTP.
      installeDans: trouve ? trouve.aurora : null,
      installeChemin: trouve ? trouve.chemin : null
    });
  });
}

module.exports = { CATEGORIES, parId, segments, trouverConsole, trouverLocal, listerInstalles, marquerInstalles, destination, EXE, NOMME_AURORA };
