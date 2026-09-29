// launch.ini — la configuration de DashLaunch (launch.xex V3.0, par cOz).
//
// Lu par simpleIni au demarrage de la console. C'est le fichier le plus sensible
// du disque : `Default` designe ce qui se lance quand on n'appuie sur rien. Un
// chemin invalide, et la console demarre sur RIEN — plus de dashboard.
//
// Regle de conception : ON NE RECONSTRUIT JAMAIS LE FICHIER. Le launch.ini
// d'origine EST sa documentation — chaque option y est commentee avec sa valeur
// par defaut. Le reecrire proprement detruirait la reference de l'utilisateur.
// On modifie donc les valeurs EN PLACE, et tout le reste est preserve a
// l'octet : commentaires, lignes vides, ordre, clefs inconnues.
'use strict';

// Les appareils que DashLaunch accepte en tete de chemin. Liste tiree de l'en-tete
// du launch.ini officiel.
const APPAREILS = ['Hdd', 'Usb', 'UsbMu', 'Mu', 'FlashMu', 'IntMu', 'MmcMu', 'Dvd', 'Sfc'];
const RE_CHEMIN = new RegExp('^(' + APPAREILS.join('|') + '):\\\\', 'i');

// Le catalogue des options : section, type, valeur par defaut, et ce qu'elle fait.
// Chaque entree vient du commentaire qui accompagne l'option dans le fichier
// officiel — « if not set this value will be X ».
const CATALOGUE = {
  Paths: {
    BUT_A: { type: 'chemin', def: '', doc: 'Lance ce titre si A est maintenu au demarrage.' },
    BUT_B: { type: 'chemin', def: '', doc: 'Lance ce titre si B est maintenu au demarrage.' },
    BUT_X: { type: 'chemin', def: '', doc: 'Lance ce titre si X est maintenu au demarrage.' },
    BUT_Y: { type: 'chemin', def: '', doc: 'Lance ce titre si Y est maintenu au demarrage.' },
    Start: { type: 'chemin', def: '', doc: 'Lance ce titre si Start est maintenu au demarrage.' },
    Back: { type: 'chemin', def: '', doc: 'Lance ce titre si Back est maintenu au demarrage.' },
    LBump: { type: 'chemin', def: '', doc: 'Lance ce titre si LB est maintenu au demarrage.' },
    RThumb: { type: 'chemin', def: '', doc: 'Lance ce titre si le stick droit est enfonce au demarrage.' },
    LThumb: { type: 'chemin', def: '', doc: 'Lance ce titre si le stick gauche est enfonce au demarrage.' },
    Default: { type: 'chemin', def: '', doc: 'Ce qui se lance quand aucune touche n\'est maintenue. VIDE = le dashboard officiel (NXE).' },
    Guide: { type: 'chemin', def: '', doc: 'Remplace Default si la console est allumee par le bouton Guide. Toujours supplante par remotenxe.' },
    Power: { type: 'chemin', def: '', doc: 'Remplace Default si la console est allumee par le bouton de facade.' },
    Configapp: { type: 'chemin', def: '', doc: 'Application lancee par « parametres systeme » depuis le HUD.' },
    Fakeanim: { type: 'chemin', def: '', doc: 'Execute avant toute autre option, sans pouvoir etre contourne. Sert a remplacer l\'animation de demarrage.' },
    Dumpfile: { type: 'chemin', def: '', doc: 'Fichier ou ecrire les exceptions non gerees. Sans effet si exchandler = false.' }
  },
  Plugins: {
    plugin1: { type: 'chemin', def: '', doc: 'Plugin charge au demarrage (xbdm, JRPC2, XRPC...).' },
    plugin2: { type: 'chemin', def: '', doc: 'Plugin charge au demarrage.' },
    plugin3: { type: 'chemin', def: '', doc: 'Plugin charge au demarrage.' },
    plugin4: { type: 'chemin', def: '', doc: 'Plugin charge au demarrage.' },
    plugin5: { type: 'chemin', def: '', doc: 'Plugin charge au demarrage.' }
  },
  Externals: {
    ftpserv: { type: 'bool', def: 'false', doc: 'L\'application de configuration demarre un serveur FTP (utilisateur/mot de passe : xbox).' },
    ftpport: { type: 'nombre', def: '21', doc: 'Port du serveur FTP de l\'application de configuration.' },
    updserv: { type: 'bool', def: 'false', doc: 'Demarre le serveur de mise a jour xebuild.' },
    calaunch: { type: 'bool', def: 'false', doc: 'Demarre en mode lancement plutot qu\'en mode options.' },
    fahrenheit: { type: 'bool', def: 'false', doc: 'Affiche les temperatures en Fahrenheit.' }
  },
  Settings: {
    nxemini: { type: 'bool', def: 'true', doc: 'Y dans le miniblade relance launch.xex.' },
    pingpatch: { type: 'bool', def: 'false', doc: 'Retire la limite de ping en jeu system link.' },
    contpatch: { type: 'bool', def: 'false', doc: 'Patche les bits de licence des DLC (contenu 00000002).' },
    xblapatch: { type: 'bool', def: 'false', doc: 'Patche les bits de licence des jeux XBLA (contenu 000D0000).' },
    licpatch: { type: 'bool', def: 'false', doc: 'Spoof les reponses de XamContentGetLicenseMask. Utile avec contpatch/xblapatch.' },
    fatalfreeze: { type: 'bool', def: 'false', doc: 'TRUE = la console gele sur une erreur fatale (et desactive le filtre d\'exceptions).' },
    fatalreboot: { type: 'bool', def: 'false', doc: 'Si fatalfreeze = false : TRUE redemarre, FALSE eteint. Sans effet si fatalfreeze = true.' },
    safereboot: { type: 'bool', def: 'true', doc: 'Redemarrage « propre ». Sur JTAG, a laisser TRUE sauf correctif SMC (sinon E71).' },
    regionspoof: { type: 'bool', def: 'false', doc: 'RB au lancement d\'un jeu spoofe la region.' },
    region: { type: 'hex', def: '0x7FFF', doc: 'Region utilisee quand regionspoof est actif.' },
    dvdexitdash: { type: 'bool', def: 'false', doc: 'Sortir d\'un DVD revient au dashboard officiel plutot qu\'au titre par defaut.' },
    xblaexitdash: { type: 'bool', def: 'false', doc: 'Quitter un jeu XBLA revient au menu arcade officiel.' },
    nosysexit: { type: 'bool', def: 'false', doc: 'Les options des miniblades ne quittent plus vers le NXE.' },
    nohud: { type: 'bool', def: 'false', doc: 'Les miniblades n\'apparaissent plus jamais. Contourne tout ce qui en depend.' },
    noupdater: { type: 'bool', def: 'true', doc: 'FALSE rend la console capable de trouver les mises a jour systeme.' },
    debugout: { type: 'bool', def: 'false', doc: 'Envoie les chaines de debogage sur l\'UART.' },
    exchandler: { type: 'bool', def: 'true', doc: 'Gere les exceptions de derniere chance. FALSE desactive aussi Dumpfile.' },
    liveblock: { type: 'bool', def: 'true', doc: 'Empeche la resolution DNS liee au LIVE.' },
    livestrong: { type: 'bool', def: 'false', doc: 'Bloque AUSSI les DNS Microsoft — mais casse les jaquettes de Freestyle/Aurora.' },
    remotenxe: { type: 'bool', def: 'false', doc: 'Les boutons Guide et power des telecommandes IR demarrent sur le NXE.' },
    hddalive: { type: 'bool', def: 'false', doc: 'Interroge les disques USB pour « alive.txt » et le reecrit, pour eviter qu\'ils se mettent en veille.' },
    hddtimer: { type: 'nombre', def: '210', doc: 'Intervalle en secondes du sondage hddalive.' },
    signnotice: { type: 'bool', def: 'false', doc: 'Tente de supprimer les popups de connexion. ATTENTION : d\'autres dialogues sont detectes par la meme heuristique.' },
    autoshut: { type: 'bool', def: 'false', doc: 'Preselectionne « eteindre » dans le dialogue d\'extinction.' },
    autooff: { type: 'bool', def: 'false', doc: 'Eteint directement, sans dialogue.' },
    xhttp: { type: 'bool', def: 'true', doc: 'Retire l\'obligation d\'etre connecte pour utiliser les fonctions http natives (14699+).' },
    tempbcast: { type: 'bool', def: 'false', doc: 'Diffuse les temperatures brutes du SMC en UDP.' },
    temptime: { type: 'nombre', def: '10', doc: 'Intervalle en secondes de tempbcast.' },
    tempport: { type: 'nombre', def: '7030', doc: 'Port UDP de tempbcast.' },
    sockpatch: { type: 'bool', def: 'false', doc: 'Donne le privilege de socket non securise a tous les titres.' },
    passlaunch: { type: 'bool', def: 'false', doc: 'N\'efface pas les launchdata avant de lancer un element de demarrage rapide.' },
    fakelive: { type: 'bool', def: 'false', doc: 'Spoof une connexion LIVE. Force liveblock a TRUE.' },
    nonetstore: { type: 'bool', def: 'true', doc: 'Masque les options de stockage reseau dans les dialogues de disque.' },
    shuttemps: { type: 'bool', def: 'false', doc: 'Affiche les temperatures dans le dialogue d\'extinction. Desactive autooff.' },
    devprof: { type: 'bool', def: 'false', doc: 'Utilise les profils devkit au lieu de les voir comme corrompus.' },
    devlink: { type: 'bool', def: 'false', doc: 'Chiffre les donnees system link pour communiquer avec des devkits.' },
    autoswap: { type: 'bool', def: 'false', doc: 'Echange de disque automatique. NE PAS activer avec FSD ou swap.xex.' },
    nohealth: { type: 'bool', def: 'true', doc: 'Desactive la pseudo-video de sante Kinect au lancement d\'un jeu.' },
    nooobe: { type: 'bool', def: 'true', doc: 'Desactive les ecrans de configuration de langue quand les reglages existent deja.' },
    autofake: { type: 'bool', def: 'false', doc: 'Active fakelive uniquement pendant les sessions dashboard et indie.' },
    autocont: { type: 'bool', def: 'false', doc: 'Avec autofake : contpatch seulement pour les jeux communautaires.' }
  }
};
for (let i = 0; i <= 9; i++) CATALOGUE.Settings['autofake' + i] = { type: 'hex', def: '0x00000000', doc: 'TitleID dont le jeu beneficie de fakelive (10 maximum).' };

// Lit le fichier en CONSERVANT tout : lignes de commentaire, lignes vides, ordre,
// sections et clefs inconnues. `lignes` est la seule source de verite pour
// l'ecriture.
function lire(texte) {
  const lignes = String(texte == null ? '' : texte).split(/\r?\n/);
  const sections = [];
  const index = new Map();          // « Section.cle » -> { section, cle, i }
  const doubles = [];               // clefs presentes plusieurs fois
  let courante = null;
  lignes.forEach((brute, i) => {
    const l = brute.trim();
    const s = /^\[(.+)\]$/.exec(l);
    if (s) { courante = s[1].trim(); sections.push(courante); return; }
    if (!l || l.startsWith(';') || l.startsWith('#')) return;
    const p = l.indexOf('=');
    if (p < 0) return;
    const cle = l.slice(0, p).trim();
    const valeur = l.slice(p + 1).trim();
    const sec = courante || '';
    const k = sec + '.' + cle;
    // simpleIni — celui qu'utilise DashLaunch — refuse les clefs multiples : la
    // PREMIERE occurrence gagne, la deuxieme ne sert a rien. C'est exactement le
    // genre de chose qu'on ne voit pas a l'oeil nu dans 80 lignes commentees.
    if (index.has(k)) { doubles.push(k); return; }
    index.set(k, { section: sec, cle, valeur, ligne: i });
  });
  return {
    lignes, sections, doubles,
    valeurs: Object.fromEntries([...index].map(([k, v]) => [k, v.valeur])),
    index,
    // Ce qui est present dans le fichier, avec le catalogue quand on le connait.
    options: [...index.values()].map(o => {
      const c = (CATALOGUE[o.section] || {})[o.cle];
      return { ...o, connu: !!c, type: c ? c.type : 'inconnu', defaut: c ? c.def : '', doc: c ? c.doc : '' };
    })
  };
}

// Applique des changements SANS toucher au reste. `modifs` : { « Section.cle »: valeur }.
// Une clef absente du fichier est AJOUTEE dans sa section (creee au besoin, a la
// fin) — jamais ailleurs, et jamais en ecrasant une ligne existante.
function ecrire(ini, modifs) {
  const lignes = ini.lignes.slice();
  const aAjouter = new Map();      // section -> [[cle, valeur]]
  for (const [clef, valeur] of Object.entries(modifs || {})) {
    const o = ini.index.get(clef);
    const v = valeur == null ? '' : String(valeur);
    if (o) {
      const brute = lignes[o.ligne];
      const p = brute.indexOf('=');
      // On garde l'alignement d'origine : « cle = valeur » reste aligne.
      lignes[o.ligne] = brute.slice(0, p + 1) + (v ? ' ' + v : ' ');
    } else {
      const sec = clef.includes('.') ? clef.slice(0, clef.indexOf('.')) : '';
      if (!aAjouter.has(sec)) aAjouter.set(sec, []);
      aAjouter.get(sec).push([clef.slice(sec.length + 1), v]);
    }
  }
  for (const [sec, paires] of aAjouter) {
    // On insere a la fin de la section visee si elle existe, sinon a la fin.
    let fin = lignes.length;
    if (sec) {
      const debut = lignes.findIndex(l => l.trim() === '[' + sec + ']');
      if (debut >= 0) {
        fin = lignes.findIndex((l, i) => i > debut && /^\s*\[/.test(l));
        if (fin < 0) fin = lignes.length;
      } else {
        lignes.push('', '[' + sec + ']');
        fin = lignes.length;
      }
    }
    lignes.splice(fin, 0, ...paires.map(([k, v]) => k + ' = ' + v));
  }
  return lignes.join('\n');
}

// Ce que l'analyse doit dire AVANT d'ecrire. On ne bloque rien : on previent.
// Un launch.ini fautif se paie au redemarrage, pas a l'ecriture.
function diagnostic(ini) {
  const avis = [];
  const v = k => (ini.valeurs[k] != null ? ini.valeurs[k] : null);
  const bool = k => v(k) === 'true';

  // 1. LES CHEMINS. Un appareil inconnu et la console ne trouve plus rien.
  for (const o of ini.options) {
    const c = (CATALOGUE[o.section] || {})[o.cle];
    if (!c || c.type !== 'chemin' || !o.valeur) continue;
    if (!RE_CHEMIN.test(o.valeur)) {
      avis.push({ niveau: 'err', cle: o.section + '.' + o.cle,
        texte: 'Appareil inconnu dans « ' + o.valeur + ' ». DashLaunch accepte ' + APPAREILS.join(', ') + ' suivis de « :\\ ».' });
    } else if (o.section === 'Plugins' && !/\.xex$/i.test(o.valeur)) {
      avis.push({ niveau: 'warn', cle: o.section + '.' + o.cle, texte: 'Un plugin est un fichier .xex.' });
    }
  }
  // 2. LA PANNE LA PLUS GRAVE : un Default invalide = plus de dashboard.
  const def = v('Paths.Default');
  if (def) {
    avis.push({ niveau: 'info', cle: 'Paths.Default',
      texte: 'La console demarrera sur « ' + def + ' ». Laisse vide pour demarrer sur le dashboard officiel — c\'est le seul chemin de secours si ce titre ne se lance pas.' });
  }
  // 3. Les contraintes croisees, tirees des commentaires du fichier officiel.
  if (bool('Settings.fakelive') && v('Settings.liveblock') === 'false') {
    avis.push({ niveau: 'warn', cle: 'Settings.liveblock', texte: 'fakelive = true force liveblock a TRUE : la valeur FALSE ecrite ici sera ignoree.' });
  }
  if (bool('Settings.shuttemps') && bool('Settings.autooff')) {
    avis.push({ niveau: 'warn', cle: 'Settings.shuttemps', texte: 'shuttemps desactive autooff : les deux a TRUE, autooff ne fera rien.' });
  }
  if (bool('Settings.autofake')) {
    const tids = [];
    for (let i = 0; i <= 9; i++) { const x = v('Settings.autofake' + i); if (x && x !== '0x00000000') tids.push(x); }
    if (!tids.length) avis.push({ niveau: 'warn', cle: 'Settings.autofake', texte: 'autofake est actif mais aucun TitleID n\'est renseigne dans autofake0..9 : l\'option ne sert a rien.' });
  }
  if (bool('Settings.autoswap')) {
    avis.push({ niveau: 'warn', cle: 'Settings.autoswap', texte: 'NE PAS activer autoswap si tu utilises FSD ou swap.xex : ils font deja l\'echange de disque.' });
  }
  if (bool('Settings.livestrong')) {
    avis.push({ niveau: 'warn', cle: 'Settings.livestrong', texte: 'livestrong bloque aussi les DNS Microsoft : les jaquettes et les mises a jour d\'Aurora cesseront de fonctionner.' });
  }
  if (v('Settings.safereboot') === 'false') {
    avis.push({ niveau: 'warn', cle: 'Settings.safereboot', texte: 'safereboot = false sur JTAG sans correctif SMC peut donner une erreur E71 au redemarrage.' });
  }
  // 4. Les valeurs qui doivent avoir une forme precise.
  const port = v('Externals.ftpport');
  if (port != null && port !== '' && !(/^\d+$/.test(port) && +port >= 1 && +port <= 65535)) {
    avis.push({ niveau: 'err', cle: 'Externals.ftpport', texte: 'Un port va de 1 a 65535, pas « ' + port + ' ».' });
  }
  for (const k of ['region', 'autofake0', 'autofake1', 'autofake2', 'autofake3', 'autofake4', 'autofake5', 'autofake6', 'autofake7', 'autofake8', 'autofake9']) {
    const x = v('Settings.' + k);
    if (x && !/^0x[0-9a-f]{1,8}$/i.test(x)) {
      avis.push({ niveau: 'err', cle: 'Settings.' + k, texte: 'Une valeur hexadecimale s\'ecrit 0x suivie de chiffres hexa, pas « ' + x + ' ».' });
    }
  }
  for (const o of ini.options) {
    const c = (CATALOGUE[o.section] || {})[o.cle];
    if (!c || c.type !== 'bool' || o.valeur === '') continue;
    if (o.valeur !== 'true' && o.valeur !== 'false') {
      avis.push({ niveau: 'err', cle: o.section + '.' + o.cle, texte: 'Une option booleenne vaut true ou false, pas « ' + o.valeur + ' ».' });
    }
  }
  // 5. Les clefs en double : la deuxieme ligne ne sert a RIEN, et personne ne le
  // voit dans un fichier de 80 lignes commentees.
  for (const k of ini.doubles || []) {
    avis.push({ niveau: 'warn', cle: k,
      texte: 'Cette clef apparait plusieurs fois. DashLaunch garde la PREMIERE : la ligne suivante est sans effet. Supprime-la pour eviter la confusion.' });
  }
  // 6. Ce qu'on ne connait pas : on le DIT au lieu de le laisser passer.
  const inconnues = ini.options.filter(o => !o.connu).map(o => o.section + '.' + o.cle);
  if (inconnues.length) {
    avis.push({ niveau: 'info', cle: '', texte: 'Clefs hors catalogue (elles sont conservees telles quelles) : ' + inconnues.join(', ') });
  }
  return avis;
}

module.exports = { lire, ecrire, diagnostic, CATALOGUE, APPAREILS, RE_CHEMIN };
