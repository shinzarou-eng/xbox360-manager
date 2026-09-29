// LES JEUX XBOX 1 VUS DEPUIS CE PC — et ce que le docteur en dit.
//
// Le diagnostic Xbox 1 (`lib/xbox1.js`) interroge la CONSOLE par FTP : il ne
// regarde jamais les disques locaux. Un disque plein de jeux Xbox 1 restait donc
// invisible, et la bibliotheque n'en affichait aucun. Ce module lit les disques du
// PC et rend exactement la meme forme qu'un jeu Xbox 360 — sauf `format`, qui vaut
// « Xbox1 », le type que la pastille de la bibliotheque et le libelle de la fiche
// connaissent deja (voir `public/app.js`).
//
// LA REGLE DE RECONNAISSANCE N'EST PAS REECRITE ICI : c'est `estUnJeuXbox1` de
// `lib/xbox1.js`, celle du diagnostic. Deux regles ecrites a deux endroits
// divergeraient au premier cas limite, et l'une des deux finirait par annoncer des
// jeux Xbox 360 comme des jeux Xbox 1.
//
// UN JEU XBOX 1 N'A PAS DE TITLEID, et ce n'est pas un detail : c'est ce qui le
// tient a l'ecart de tout ce qui se conduit par le TitleID — DLC, mises a jour,
// jaquettes cataloguees, MediaID, et surtout la CONVERSION ISO->GOD, qui ne doit
// jamais le concerner (il n'y a pas d'ISO 360 a convertir : le jeu se lance depuis
// son dossier, c'est Aurora qui l'execute).
const fs = require('fs');
const path = require('path');
const X = require('./xbox1');

// Deux lectures du meme dossier ne doivent pas compter double : `H:\Games` est a
// la fois le dossier configure ET une racine detectee a chaud (le depot a deja
// paye ce piege — 19 jeux affiches 38). Windows ne distingue pas non plus
// `H:\Games` de `h:/games`.
const cle = p => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

/**
 * Les racines a regarder pour un dossier de jeux donne.
 *
 * Le dossier de jeux lui-meme, PLUS les deux noms ou l'on range les jeux Xbox 1 a
 * part (`Xbox1`, `Jeux Xbox 1`). Ces deux noms viennent de `lib/xbox1.js` : c'est
 * la meme liste que celle du diagnostic de la console, et les ecrire ici en dur
 * ferait deux listes a tenir d'accord.
 */
function racinesJeux(base) {
  const out = [];
  const vus = new Set();
  const ajouter = p => {
    const k = cle(p);
    if (!k || vus.has(k)) return;
    vus.add(k);
    out.push(p);
  };
  ajouter(base);
  for (const n of X.DOSSIERS_JEUX) if (base) ajouter(path.join(base, n));
  return out;
}

/**
 * Les jeux Xbox 1 d'une liste de racines, sous la forme attendue par la
 * bibliotheque.
 *
 * @param {string[]} racines
 * @param {object} [opts]
 *   - taille : (chemin) => octets. La taille recursive est MEMOISEE cote serveur
 *     (elle coute un parcours complet) : on la recoit au lieu de la calculer ici.
 * @returns {Array<{name,tid,format,path,size}>}
 */
function jeuxXbox1(racines, opts) {
  const taille = (opts && opts.taille) || (() => 0);
  const out = [];
  const vus = new Set();
  for (const racine of racines || []) {
    let entrees;
    // Une racine absente est le cas NORMAL (disque debranche) : elle ne doit ni
    // lever ni interrompre le parcours des autres.
    try { entrees = fs.readdirSync(racine, { withFileTypes: true }); } catch { continue; }
    for (const e of entrees) {
      if (!e.isDirectory()) continue;
      const dp = path.join(racine, e.name);
      const k = cle(dp);
      if (vus.has(k)) continue;
      let dedans;
      try { dedans = fs.readdirSync(dp); } catch { continue; }
      // LA regle, une seule fois : celle du diagnostic.
      if (!X.estUnJeuXbox1(dedans)) continue;
      vus.add(k);
      out.push({ name: e.name, tid: '-', format: 'Xbox1', path: dp, size: taille(dp) });
    }
  }
  // Ordre stable : `readdir` ne promet rien, et une liste qui change d'ordre a
  // chaque scan ferait scintiller la bibliotheque (ce defaut a deja ete corrige
  // une fois, sur la reconstruction de la grille).
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * La partition de compatibilite, cherchee sur les disques QUE L'ON PEUT LIRE.
 *
 * @param {string[]} racines racines de disques (`H:\`)
 * @returns {{trouvee:boolean, nom:string|null, chemin:string|null, fichiers:string[]}}
 *   `fichiers` : les FICHIERS de `<partition>/Compatibility` — c'est ce que
 *   `Xbox1.diagnostic` attend, et c'est ce qui distingue « pas de partition » de
 *   « partition vide ».
 */
function partitionHddX(racines) {
  for (const racine of racines || []) {
    let entrees;
    try { entrees = fs.readdirSync(racine, { withFileTypes: true }); } catch { continue; }
    // La casse ne se suppose pas : la console monte `HddX`, un disque prepare a la
    // main peut porter `hddx`. Chercher le seul nom exact conclurait « pas de
    // partition » sur un disque qui en a une — et enverrait chercher un correctif
    // inutile. On rend le nom TROUVE, pour pouvoir le dire.
    const e = entrees.find(x => x.isDirectory() && x.name.toLowerCase() === X.PARTITION.toLowerCase());
    if (!e) continue;
    const chemin = path.join(racine, e.name);
    let fichiers = [];
    try {
      fichiers = fs.readdirSync(path.join(chemin, X.DOSSIER), { withFileTypes: true })
        .filter(f => f.isFile()).map(f => f.name);
    } catch { fichiers = []; }
    return { trouvee: true, nom: e.name, chemin, fichiers };
  }
  return { trouvee: false, nom: null, chemin: null, fichiers: [] };
}

// ---------- Ce que le docteur en dit ----------------------------------------
// LES DEUX MOITIES SE PARLENT ICI, et c'est tout l'objet de ce chantier.
// `Xbox1.diagnostic()` sait deja l'etat et le remede ; le docteur, lui, sait quels
// jeux sont poses sur les disques. Sans ce rapprochement, la bibliotheque se
// remplissait de jeux Xbox 1 qui ne se lanceraient JAMAIS, sans un mot : la console
// n'affiche aucun message d'erreur, elle ne lance simplement pas le jeu.
//
// `T` est le traducteur du serveur (`T(fr, en)`). Il est RECU en parametre et
// jamais lu d'un global : c'est ce qui rend cette fonction mesurable avec une
// doublure qui MARQUE le francais, donc ce qui prouve que chaque libelle affiche
// passe par la traduction au lieu d'etre ecrit en dur. Les arguments de `T()` sont
// TOUS des litteraux — aucune concatenation a l'interieur : un appel concatené
// echappe au garde-fou des traductions (`test/i18n.test.js`), et la phrase reste
// alors en francais dans les quatre langues, anglais compris.
/**
 * @param {function} T traducteur `(fr, en) => string`
 * @param {object} faits `{ jeux: [...], partition: {trouvee, fichiers} }`
 * @returns {object|null} une carte du docteur, ou null quand il n'y a rien a dire
 */
function carteCompatibilite(T, faits) {
  const jeux = (faits && faits.jeux) || [];
  const p = (faits && faits.partition) || {};
  // Sans jeu Xbox 1, il n'y a rien a signaler : crier sur un emulateur absent
  // alors qu'aucun jeu n'en depend ferait du bruit, et un docteur qui parle pour
  // rien finit par etre ignore.
  if (!jeux.length) return null;
  const d = X.diagnostic({ partitionExiste: !!p.trouvee, fichiers: p.fichiers || [], dossiersJeux: jeux.map(j => j.name) });
  // L'EMULATEUR EST INSTALLE : on se tait. C'est le module qui decide de l'etat,
  // pas cette fonction — une regle recopiee ici finirait par contredire la sienne.
  // Une installation INCOMPLETE laisse `emulateurInstalle` a vrai, et le module dit
  // alors « un jeu peut echouer », pas « les jeux ne demarrent pas » : ce n'est pas
  // un blocage, et on ne crie pas au loup sur un avertissement qu'il donne deja.
  if (d.emulateurInstalle) return null;

  const n = jeux.length;
  const noms = jeux.map(j => j.name);
  // DEUX ETATS, DEUX REMEDES — et ils ne se confondent pas. « Pas de partition » se
  // repare avec l'outil de partition ; « partition vide » se repare en y copiant un
  // paquet XeFu. Envoyer chercher le mauvais des deux ferait perdre une soiree a
  // quelqu'un qui a deja la partition, sans qu'il comprenne pourquoi rien ne change.
  const cause = d.etat === 'sans-partition'
    ? T('aucune partition HddX sur les disques que je peux lire : l\'émulateur des jeux Xbox 1 n\'est nulle part, et sans lui la console n\'affiche AUCUN message — le jeu ne se lance pas, c\'est tout.',
        'no HddX partition on the drives I can read: the Xbox 1 emulator is nowhere, and without it the console shows NO message — the game simply does not start.')
    : T('la partition HddX est là, mais son dossier Compatibility est vide : l\'émulateur des jeux Xbox 1 n\'est pas installé, et sans lui la console n\'affiche AUCUN message — le jeu ne se lance pas, c\'est tout.',
        'the HddX partition is there, but its Compatibility folder is empty: the Xbox 1 emulator is not installed, and without it the console shows NO message — the game simply does not start.');
  // LE REMEDE EST CELUI DU MODULE. Le nom de l'outil, celui de son fichier, celui
  // du paquet et le nombre de fichiers attendus sont des DONNEES : ils viennent de
  // `lib/xbox1.js` et ne se traduisent pas (ce sont des noms propres et des
  // nombres, exactement comme TitleID ou xboxftp).
  const remede = d.etat === 'sans-partition'
    ? T('Le correctif est ', 'The fix is ') + X.CORRECTIF.nom + ' (' + X.CORRECTIF.fichier + ')'
      + T(', et il se lance SUR LA CONSOLE : aucun outil ne peut créer cette partition à distance.',
          ', and it runs ON THE CONSOLE: no tool can create that partition remotely.')
    : T('Il faut y copier un paquet XeFu — par exemple ', 'Copy a XeFu pack into it — for example ') + X.PAQUETS[0].nom
      + T(', le choix par défaut sur une console modifiée (', ', the default choice on a modded console (')
      + X.FICHIERS_ATTENDUS + T(' fichiers, environ 31 Mo).', ' files, about 31 MB).');

  return {
    type: 'xbox1', sev: 'err', etat: d.etat, jeux: noms,
    title: n + T(' jeu(x) Xbox 1 ne démarreront pas', ' Xbox 1 game(s) will not start'),
    detail: noms.slice(0, 4).join(', ') + (n > 4 ? '…' : '') + ' — ' + cause + ' ' + remede
  };
}

module.exports = { racinesJeux, jeuxXbox1, partitionHddX, carteCompatibilite };
