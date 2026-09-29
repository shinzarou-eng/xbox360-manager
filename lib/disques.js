// A QUOI SERT CHAQUE DISQUE.
//
// Le bandeau ne montrait que des lettres — `C`, `D` — sans rien dire de leur
// usage. L'utilisateur ne pouvait pas savoir ou vivent ses jeux, son depot, son
// emulateur, et surtout IL NE POUVAIT PAS CHOISIR en connaissance de cause.
//
// Or le choix du disque n'est pas cosmetique : un disque FAT32 refuse tout
// fichier de plus de 4 Go, et une image Xbox 360 en fait 7 a 8. L'application
// connaissait deja cette limite (elle redirige les telechargements), mais elle ne
// la disait qu'APRES, au moment de l'echec.
//
// Ici : on decrit, on ne decide pas. Aucune ecriture, aucun scan — juste ce qu'on
// peut dire d'un disque a partir de ce que l'application sait deja.

// Un fichier de plus de 4 Go ne passe pas sur FAT32. C'est la limite reelle.
const SANS_GROS_FICHIERS = /^(FAT32?|FAT16|FAT)$/i;

// Ce qui accepte les gros fichiers — la meme liste que celle utilisee pour
// rediriger les telechargements (`ALTERNATIF` dans server.js).
const AVEC_GROS_FICHIERS = /^(NTFS|exFAT|ReFS|ext[234]|xfs|btrfs|f2fs|apfs|hfsplus|zfs)$/i;

// LA CONSOLE NE LIT QUE LE FAT32 SUR UN SUPPORT USB.
//
// C'est une question DIFFERENTE de celle des gros fichiers, et les deux se
// confondent facilement :
//
//   « puis-je ecrire ici ? »  NTFS et exFAT sont parfaits, FAT32 plafonne a 4 Go.
//   « la console lira-t-elle ? »  FAT32 uniquement. Ni NTFS, ni exFAT.
//
// Un disque NTFS rempli de jeux s'affichait donc avec le role « Jeux installes »,
// sans le moindre avertissement, et la console n'y voyait RIEN. C'est exactement
// le defaut qu'on traque partout ailleurs : une action qui a l'air d'avoir
// reussi.
const CONSOLE_LIT = /^FAT32$/i;

const ROLES = {
  jeux: 'Jeux installés',
  depot: 'Dépôt (fichiers à ranger)',
  contenu: 'Contenu (DLC, mises à jour)',
  homebrew: 'Homebrew',
  emulateurs: 'Émulateurs',
  aurora: 'Aurora (scripts, plugins)',
  systeme: 'Système'
};

// Libelles COURTS, pour le menu deroulant. Les libelles longs sont justes mais
// occupent 400 px : dans le bandeau, la liste depassait la fenetre et le premier
// disque etait coupe. Le detail complet reste dans l'infobulle.
const ROLES_COURTS = {
  jeux: 'Jeux', depot: 'Dépôt', contenu: 'DLC/TU', homebrew: 'Homebrew',
  emulateurs: 'Émul.', aurora: 'Aurora', systeme: 'Système'
};

const norm = p => String(p || '').replace(/\//g, '\\').toUpperCase();
// Racine d'un chemin : 'H:' sous Windows, '/' ailleurs.
function racineDe(p) {
  const s = String(p || '');
  const m = /^([A-Za-z]):/.exec(s);
  if (m) return m[1].toUpperCase() + ':';
  return s.startsWith('/') ? '/' : '';
}

/**
 * Decrit chaque disque : ce a quoi il sert, et ce qu'il peut porter.
 *
 * @param {object} vu
 *   - disques : [{ letter, free, total, auto }] comme /api/drives
 *   - fsTypes : { 'C:': 'NTFS', ... }
 *   - cfg     : { games, drop, content, homebrew, emulators }
 *   - aurora   : ['E:\\Aurora'] (les installations d'Aurora trouvees)
 *   - systeme : la lettre du disque systeme, si on la connait
 */
function decrire(vu) {
  const v = vu || {};
  const cfg = v.cfg || {};
  const fsTypes = v.fsTypes || {};

  // A quoi sert chaque chemin configure, ramene a sa racine.
  const usages = {};
  const ajouter = (chemin, role) => {
    const r = racineDe(chemin);
    if (!r) return;
    (usages[r] = usages[r] || []).push(role);
  };
  for (const c of ['games', 'drop', 'content', 'homebrew', 'emulators']) {
    const role = c === 'games' ? 'jeux' : c === 'drop' ? 'depot' : c === 'content' ? 'contenu'
      : c === 'homebrew' ? 'homebrew' : 'emulateurs';
    ajouter(cfg[c], role);
  }
  // LE DISQUE QUI PORTE AURORA. Il portait deja « Homebrew · Emulateurs » et
  // l'application taisait l'essentiel : c'est LA que vivent Aurora, ses scripts et
  // ses plugins. Sur la clef de l'utilisateur, E:\Aurora est le /Usb0/Aurora que
  // la console lance — le role le plus important du disque, et le seul absent.
  for (const a of (v.aurora || [])) {
    const r = racineDe(a);
    if (r) (usages[r] = usages[r] || []).push('aurora');
  }

  // UN ROLE CONFIGURE SUR UN DISQUE ABSENT DOIT SE VOIR. Sans cela, le disque
  // debranche disparait simplement de la liste et l'utilisateur lit « D: non
  // utilise » alors que l'application cherche encore ses jeux sur un H: qui n'est
  // plus la. Le manque serait invisible, donc impossible a corriger.
  const presents = new Set((v.disques || []).map(d => d.letter + ':'));
  const absents = Object.entries(usages)
    .filter(([r]) => r.endsWith(':') && !presents.has(r))
    .map(([r, roles]) => ({ cle: r, roles: [...new Set(roles)], roleTexte: [...new Set(roles)].map(x => ROLES[x] || x).join(' · ') }));

  const liste = (v.disques || []).map(d => {
    const cle = d.letter + ':';
    const fs = fsTypes[cle] || '';
    const roles = [...new Set(usages[cle] || [])];
    const systeme = v.systeme ? cle === String(v.systeme).toUpperCase() + ':' : false;
    if (systeme && !roles.length) roles.push('systeme');

    // Peut-il porter un jeu ? Deux conditions, et elles sont independantes :
    // le systeme de fichiers, et la place.
    const grosFichiers = fs ? AVEC_GROS_FICHIERS.test(fs) : null;
    const libre = d.free || 0;
    // La console le lira-t-elle ? C'est une AUTRE question que les gros fichiers.
    const consoleLit = fs ? CONSOLE_LIT.test(fs) : null;

    let avertissement = null;
    if (fs && SANS_GROS_FICHIERS.test(fs)) {
      avertissement = fs + ' : aucun fichier de plus de 4 Go. Une image Xbox 360 en fait 7 à 8 — '
        + 'les téléchargements seront redirigés ailleurs.';
    }
    // LE DISQUE PORTE DU CONTENU XBOX MAIS LA CONSOLE NE LE LIRA PAS. On ne le dit
    // que dans ce cas : avertir sur un disque de sauvegarde en NTFS serait du bruit.
    // Les marqueurs sont ce qui trahit l'intention — jeux, contenu, Aurora.
    const contenuXbox = roles.some(r => ['jeux', 'contenu', 'aurora', 'homebrew', 'emulateurs'].includes(r));
    if (consoleLit === false && contenuXbox) {
      avertissement = (avertissement ? avertissement + ' ' : '')
        + 'Ce disque est en ' + fs + ' et contient du contenu Xbox : la console ne lit que le FAT32 '
        + 'sur un support USB, elle n’y verra RIEN. Reformate-le en FAT32, ou déplace ce contenu '
        + 'sur un disque FAT32.';
    }

    return {
      letter: d.letter, cle, fs, roles,
      roleTexte: roles.map(r => ROLES[r] || r).join(' · '),
      // Libelle COURT pour le menu deroulant, libelle long pour l'infobulle.
      roleCourt: roles.map(r => ROLES_COURTS[r] || r).join(' · '),
      free: libre, total: d.total || 0,
      auto: !!d.auto,
      systeme,
      grosFichiers,
      // Deux reponses distinctes, deux champs distincts : « puis-je ecrire » et
      // « la console lira-t-elle ». Les confondre etait le defaut.
      consoleLit,
      avertissement,
      // Ce qu'on peut dire en une ligne, pour un menu deroulant.
      resume: [
        fs || '?',
        fmt(libre) + ' libres',
        roles.length ? roles.map(r => ROLES[r] || r).join(' + ') : 'non utilisé'
      ].join(' · ')
    };
  });
  // `liste` et `absents` : un tableau ne peut pas porter les deux, et une
  // propriete posee sur un tableau se perdrait au premier `.map`. On rend un
  // objet, et `disques` reste le nom que le client attend.
  return { disques: liste, absents };
}

function fmt(o) {
  if (!o) return '0 o';
  if (o >= 1099511627776) return (o / 1099511627776).toFixed(1) + ' To';
  if (o >= 1073741824) return (o / 1073741824).toFixed(1) + ' Go';
  if (o >= 1048576) return (o / 1048576).toFixed(0) + ' Mo';
  // Sous 1 Ko, arrondir en Ko donnait « 0 Ko » pour 500 octets — un affichage
  // qui a l'air d'une panne alors que la valeur est simplement petite.
  if (o >= 1024) return Math.round(o / 1024) + ' Ko';
  return Math.round(o) + ' o';
}

/**
 * Quel disque choisir pour un usage donne ?
 *
 * On ne CHOISIT pas a la place de l'utilisateur : on CLASSE, et on dit pourquoi.
 * Un disque qui porte deja l'usage est prefere (on ne disperse pas), puis celui
 * qui peut vraiment porter les fichiers, puis celui qui a le plus de place.
 */
function conseiller(disques, besoin) {
  const gros = besoin === 'jeux' || besoin === 'depot' || besoin === 'contenu';
  return (disques || [])
    .filter(d => !d.systeme)
    .map(d => {
      let note = 0;
      const raisons = [];
      if (d.roles.includes(besoin)) { note += 100; raisons.push('porte déjà ' + (ROLES[besoin] || besoin)); }
      if (gros && d.grosFichiers === false) { note -= 100; raisons.push('ne peut pas porter de fichier de plus de 4 Go'); }
      if (gros && d.grosFichiers === true) { note += 20; raisons.push('accepte les gros fichiers'); }
      note += Math.min(30, d.free / (100 * 1073741824));
      return { ...d, note, raisons };
    })
    .sort((a, b) => b.note - a.note);
}

module.exports = { ROLES, SANS_GROS_FICHIERS, AVEC_GROS_FICHIERS, racineDe, decrire, conseiller, fmt };
