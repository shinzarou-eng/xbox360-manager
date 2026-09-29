// Jeux Xbox 1 sur Xbox 360 — la compatibilite descendante.
//
// Sources :
//  - https://saveeditors.github.io/xecli/wiki/Original-Xbox-Compatibility.html
//  - https://consolemods.org/wiki/Xbox_360:Original_Xbox_Games
//  - le format des jeux vient d'un utilitaire de conversion RGH :
//    https://github.com/blahpr/Xbox360-Utility-Create-Extract
//
// RIEN N'EST DEVINE ICI. La Xbox 360 ne lit pas les jeux Xbox 1 nativement : elle
// fait tourner un EMULATEUR (« XeFu ») qui doit etre installe sur le disque, dans
// une partition a part. Sans lui, un jeu Xbox 1 pose sur le disque ne se lance
// pas — et rien ne le dit a l'utilisateur.

// La partition de compatibilite. Ce n'est PAS un dossier ordinaire : c'est la
// deuxieme partition du disque 360, montee sous le nom `HddX`. Un disque non
// officiel peut ne pas l'avoir du tout.
const PARTITION = 'HddX';
const DOSSIER = 'Compatibility';
const CHEMIN = '/HddX/Compatibility';

// Les trois paquets publics, avec ce que dit la source.
const PAQUETS = [
  { id: 'hacked', nom: 'Hacked XeFu Pack',
    quoi: 'Retire la liste blanche et les controles de restriction de Microsoft.',
    quand: 'Le choix par defaut sur une console modifiee : il fait tourner les jeux qui ne sont pas dans la liste officielle.',
    consoleModifiee: true },
  { id: 'hud', nom: 'Hacked XeFu Pack with HUD',
    quoi: 'Le meme, mais garde le guide Xbox 360 accessible pendant les jeux Xbox 1.',
    quand: 'Si tu veux le guide ou le chat en jeu. Consomme plus de ressources : certains jeux tournent moins bien ou sont moins stables.',
    consoleModifiee: true },
  { id: 'retail', nom: 'Unmodified Retail XeFu Pack',
    quoi: 'Le comportement Microsoft d\'origine, liste blanche comprise.',
    quand: 'Si tu veux l\'emulateur d\'origine, sans les modifications de compatibilite.',
    consoleModifiee: false }
];

// Le nombre de fichiers et la taille annonces par la source, pour pouvoir dire
// « l'installation est incomplete » plutot que « elle existe ».
const FICHIERS_ATTENDUS = 23;
const TAILLE_ATTENDUE = 31.42 * 1024 * 1024;

// Sans cette partition, les fichiers ne peuvent aller nulle part. Le correctif
// doit etre LANCE SUR LA CONSOLE : aucun outil ne peut la creer a distance.
const CORRECTIF = {
  nom: 'HDD Compatibility Partition Fixer',
  quand: 'Quand la partition HddX n\'existe pas — disque non officiel, ou prepare a la main.',
  ou: 'Il se lance SUR LA CONSOLE. Aucun outil ne peut creer cette partition a distance.',
  fichier: 'Hdd_compat_partition_fixer_v1.zip'
};

// Les deux pieges que la source signale explicitement. Ils sont ici parce qu'un
// jeu Xbox 1 qui ne demarre pas n'a AUCUN message d'erreur : on croit le fichier
// casse alors que c'est un plugin.
const PIEGES = [
  { quoi: 'plugins',
    texte: 'Les plugins de stealth serveur empechent les jeux Xbox 1 de demarrer. Si un jeu ne boote pas, desactive-les et reessaie.' },
  { quoi: 'resolution',
    texte: 'Certains titres Xbox 1 tournent mieux en 480p qu\'en 720p. Si l\'image saccade, baisse la sortie video de la console.' }
];

// Ou l'on range les jeux Xbox 1, EN PLUS du dossier de jeux lui-meme. Une seule
// liste pour les deux moities : le diagnostic de la console les parcourt sous sa
// racine, et le scan des disques locaux (`lib/xbox1-local.js`) les parcourt sous
// le dossier de jeux configure. Deux listes separees finiraient par diverger, et
// les jeux d'un utilisateur qui a suivi l'un des deux rangements deviendraient
// invisibles.
const DOSSIERS_JEUX = ['Xbox1', 'Jeux Xbox 1'];

// Un jeu Xbox 1 est un DOSSIER contenant `default.xbe` (l'executable Xbox), ou
// une image ISO. On ne regarde pas l'extension seule.
const EXECUTABLE = /^default\.xbe$/i;
const ISO = /\.(iso|xiso)$/i;

/**
 * Diagnostic, a partir de ce qu'on a VU sur la console.
 *
 * @param {object} vu
 *   - partitionExiste : la partition HddX est-elle la ?
 *   - fichiers        : noms presents dans HddX/Compatibility
 *   - dossiersJeux    : dossiers candidats a etre des jeux Xbox 1
 * @returns {{etat: string, ...}}
 */
function diagnostic(vu) {
  const v = vu || {};
  const fichiers = v.fichiers || [];
  const dossiers = v.dossiersJeux || [];
  const conseils = [];

  // La partition d'abord : sans elle, tout le reste est sans objet.
  if (v.partitionExiste === false) {
    return {
      etat: 'sans-partition',
      emulateurInstalle: false,
      jeux: 0,
      correctif: CORRECTIF,
      paquets: PAQUETS,
      pieges: PIEGES,
      conseils: [
        'La partition ' + PARTITION + ' n\'existe pas sur ce disque : aucun jeu Xbox 1 ne peut se lancer, meme avec les bons fichiers.',
        'Il faut ' + CORRECTIF.nom + ' (' + CORRECTIF.fichier + '). ' + CORRECTIF.ou
      ]
    };
  }

  // L'emulateur est-il la, et complet ?
  const installe = fichiers.length > 0;
  const complet = fichiers.length >= FICHIERS_ATTENDUS;
  const jeux = dossiers.length;

  if (!installe) {
    conseils.push('Aucun fichier de compatibilite : les jeux Xbox 1 ne se lanceront pas.');
    conseils.push('Choisis un paquet : « hacked » est le choix par defaut sur une console modifiee.');
    conseils.push('Les fichiers vont dans ' + CHEMIN + ' (' + FICHIERS_ATTENDUS + ' fichiers, environ '
      + Math.round(TAILLE_ATTENDUE / 1048576) + ' Mo).');
  } else if (!complet) {
    conseils.push(fichiers.length + ' fichier(s) sur les ' + FICHIERS_ATTENDUS + ' attendus : l\'installation est INCOMPLETE, et un jeu peut echouer sans raison apparente.');
  }

  if (installe && !jeux) {
    conseils.push('L\'emulateur est en place, mais aucun jeu Xbox 1 n\'a ete trouve : chaque jeu est un dossier contenant default.xbe.');
  }
  if (jeux && !installe) {
    conseils.push(jeux + ' jeu(x) Xbox 1 sur le disque, mais l\'emulateur manque : ils ne se lanceront pas.');
  }
  // « Tout est en place » seulement si c'est VRAI. Le dire sur une installation
  // incomplete affichait « l'installation est INCOMPLETE » et « tout est en
  // place » dans la meme liste : deux phrases qui se contredisent, et l'utilisateur
  // ne sait plus laquelle croire.
  if (installe && complet && jeux) {
    conseils.push('L\'emulateur et les jeux sont en place. Si un jeu ne demarre pas, pense aux deux pieges ci-dessous avant de croire le fichier casse.');
  } else if (installe && complet && !jeux) {
    conseils.push('L\'emulateur est complet : il ne manque que des jeux.');
  }

  return {
    etat: installe ? (complet ? 'prete' : 'incomplete') : (jeux ? 'emulateur-manquant' : 'vide'),
    emulateurInstalle: installe,
    complet,
    fichiersPresents: fichiers.length,
    fichiersAttendus: FICHIERS_ATTENDUS,
    jeux,
    paquets: PAQUETS,
    pieges: PIEGES,
    conseils
  };
}

/**
 * Un dossier est-il un jeu Xbox 1 ? On cherche `default.xbe` dedans — jamais
 * l'extension seule, parce qu'un dossier Xbox 360 contient `default.xex` et que
 * confondre les deux afficherait des jeux 360 comme des jeux Xbox 1.
 */
function estUnJeuXbox1(noms) {
  const l = noms || [];
  if (l.some(n => EXECUTABLE.test(n))) return true;
  return l.some(n => ISO.test(n));
}

module.exports = {
  PARTITION, DOSSIER, CHEMIN, PAQUETS, CORRECTIF, PIEGES, DOSSIERS_JEUX,
  FICHIERS_ATTENDUS, TAILLE_ATTENDUE,
  diagnostic, estUnJeuXbox1
};
