// Compatibilite des plugins Aurora.
//
// Source : « Guide Aurora FR 2026 », page Compatibilite
// (https://elmajor9.github.io/xbox360-aurora-guide/plugins/compatibilite/).
// Le guide se refere a **Aurora 0.7b.2**, la version de reference en 2026.
//
// CE QUE LE GUIDE NE DIT PAS, ET QU'ON NE DIRA PAS NON PLUS.
// Sa table « plugins signales comme non fonctionnels » est VIDE. Inventer une
// liste de plugins qui font freezer Aurora serait la faute la plus facile ici :
// elle ferait desinstaller des plugins qui marchent. Un plugin absent de la
// liste est « non teste », pas « casse ».
//
// Ce qu'on peut dire d'utile, en revanche, c'est la PROCEDURE DE SORTIE : le
// guide explique qu'un plugin incompatible fait freezer Aurora au demarrage, et
// qu'on s'en sort en le supprimant par FTP. Comme l'application sert justement a
// INSTALLER des plugins, elle doit dire comment revenir en arriere.

const VERSION_REFERENCE = 'Aurora 0.7b.2';

// Statuts du guide, avec sa legende exacte.
const STATUTS = {
  ok: { marque: 'OK', gravite: 0, texte: 'Fonctionne correctement' },
  partiel: { marque: 'PARTIEL', gravite: 1, texte: 'Fonctionne partiellement ou avec des limitations' },
  casse: { marque: 'INCOMPATIBLE', gravite: 2, texte: 'Ne fonctionne pas, plante ou est incompatible' },
  inconnu: { marque: 'NON TESTE', gravite: 1, texte: 'Non teste — retour de la communaute bienvenu' }
};

const PLUGINS = [
  { id: 'ftpd', nom: 'FTPd', auteur: 'Swizzy', version: '1.0.3', statut: 'ok', note: 'Plugin FTP de reference.', dossiers: ['FTPd', 'FTPdll', 'FTPDll', 'ftpd'] },
  { id: 'unity', nom: 'Aurora Unity', auteur: 'Phoenix', version: 'integre', statut: 'ok', note: 'Gestion du contenu, integre a Aurora.', dossiers: ['Unity', 'AuroraUnity'] },
  { id: 'f3', nom: 'F3', auteur: 'Joonie', version: '', statut: 'ok', note: 'Navigateur de fichiers.', dossiers: ['F3'] },
  { id: 'neighborhood', nom: 'Neighborhood', auteur: '', version: '', statut: 'inconnu', note: 'Outil de debug.', dossiers: ['Neighborhood', 'XboxNeighborhood'] },
  { id: 'connectx', nom: 'ConnectX', auteur: '', version: '', statut: 'inconnu', note: 'Acces SMB — non teste recemment.', dossiers: ['ConnectX'] }
];

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Retrouve un plugin par le nom de son dossier sur la console. Les dossiers
// circulent sous des noms varies : « FTPd », « FTPdll », « FTPDll » sont le
// meme plugin — l'utilisateur, lui, voit le nom du dossier.
function parDossier(nom) {
  const n = norm(nom);
  if (!n) return null;
  for (const p of PLUGINS) {
    if (p.dossiers.some(d => norm(d) === n)) return p;
    // Un dossier dont le nom CONTIENT celui du plugin : « FTPd-1.0.3 ».
    if (p.dossiers.some(d => n.includes(norm(d)) && norm(d).length >= 3)) return p;
  }
  return null;
}

/**
 * Statut d'un plugin trouve sur la console.
 *
 * On ne rend JAMAIS « casse » pour un plugin inconnu : le guide ne signale aucun
 * plugin non fonctionnel, et l'accuser ferait desinstaller quelque chose qui
 * marche.
 */
function statut(nomDossier) {
  const p = parDossier(nomDossier);
  if (!p) {
    return {
      connu: false, dossier: nomDossier, nom: nomDossier,
      statut: 'inconnu', marque: STATUTS.inconnu.marque, gravite: 1,
      note: 'Ce plugin n\'est pas dans la liste du guide (' + VERSION_REFERENCE + ').',
      conseil: 'Fais une sauvegarde avant de l\'activer : si Aurora se fige au demarrage, supprime son dossier par FTP.'
    };
  }
  const s = STATUTS[p.statut];
  return {
    connu: true, dossier: nomDossier, nom: p.nom, auteur: p.auteur, version: p.version,
    statut: p.statut, marque: s.marque, gravite: s.gravite,
    note: p.note, reference: VERSION_REFERENCE,
    conseil: p.statut === 'ok'
      ? 'Teste sur ' + VERSION_REFERENCE + '.'
      : 'Statut a verifier sur ' + VERSION_REFERENCE + '.'
  };
}

// LA PROCEDURE DE SORTIE. C'est la vraie valeur ajoutee : l'application sert a
// INSTALLER des plugins, elle doit dire comment revenir en arriere quand Aurora
// se fige — sans cela l'utilisateur se retrouve avec un dashboard qui ne demarre
// plus et aucun moyen de le savoir.
const DEPANNAGE = {
  symptome: 'Aurora se fige ou redemarre en boucle juste apres l\'ajout d\'un plugin',
  etapes: [
    'Connecte-toi en FTP : le serveur repond meme quand Aurora ne demarre plus, si le plugin FTP de DashLaunch est actif.',
    'Va dans <Aurora>/Plugins/ et supprime le dossier du plugin que tu viens d\'ajouter.',
    'Redemarre Aurora.',
    'Si ca tient : desactive les plugins un par un dans Aurora > Parametres > Plugins pour trouver le coupable.',
    'Si ca ne tient toujours pas : supprime <Aurora>/Data/cache/, puis settings.db en dernier recours (tu perdras tes reglages).'
  ]
};

/**
 * Les plugins presents dans des installations d'Aurora, LUES SUR LE DISQUE.
 *
 * L'application ne les lisait que par FTP : console eteinte, elle ne disait rien
 * de ce qui se trouve sur le disque pourtant branche. Or un disque de console
 * branche sur le PC EST le disque de la console — E:\Aurora est le /Usb0/Aurora
 * qu'Aurora lance. On peut donc le lire, et y ecrire, sans FTP.
 *
 * @param {Array<{dossier:string, entrees:Array<{name:string,dir:boolean}>}>} installs
 *   une entree par installation d'Aurora ; `entrees` est le contenu de son
 *   dossier `Plugins`, ou null si le dossier n'existe pas.
 */
function installationsLocales(installs) {
  return (installs || []).map(i => {
    const entrees = i.entrees || [];
    // Un plugin est un DOSSIER (`<Nom>/<Nom>.xex`) ou un `.xex` pose directement.
    // Aurora accepte les deux ; on les distingue pour pouvoir le dire.
    //
    // `statut()` en PREMIER, et le champ s'appelle `estDossier` : `statut()` rend
    // deja un champ `dossier` (le nom, une chaine), qui ecrasait mon booleen et
    // faisait afficher « [dossier] » en face de Nova.xex.
    const plugins = entrees.map(e => Object.assign(
      statut(e.name),
      { nom: e.name, aurora: i.dossier, estDossier: !!e.dir }
    ));
    return {
      aurora: i.dossier,
      existe: i.entrees !== null && i.entrees !== undefined,
      plugins,
      paquets: plugins.filter(p => p.estDossier).length,
      fichiers: plugins.filter(p => !p.estDossier).length
    };
  });
}

module.exports = { VERSION_REFERENCE, STATUTS, PLUGINS, DEPANNAGE, parDossier, statut, installationsLocales };
