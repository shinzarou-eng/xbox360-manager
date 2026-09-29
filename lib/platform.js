// Couche systeme : tout ce qui depend de l'OS est ici.
//
// POURQUOI
// Le serveur appelait PowerShell (`Get-Volume`, `Get-CimInstance`) et
// `explorer.exe` directement dans ses handlers, et raisonnait en lettres de
// lecteur (`H:`). Resultat : l'application ne pouvait pas demarrer ailleurs que
// sous Windows, alors que la logique metier (identification des packages,
// correspondance MediaID/TU) n'a rien de specifique a Windows.
//
// Ce module isole les quatre operations concernees et fournit une
// implementation par plateforme. Sur Linux, la lecture des types de systemes de
// fichiers se fait en lisant /proc/mounts : AUCUN processus externe, donc plus
// rapide et impossible a bloquer par une politique locale.
//
// Les fonctions de parsing sont pures et exportees : elles sont testables sans
// dependre de la machine sur laquelle tournent les tests.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

// execFile peut lever de facon SYNCHRONE (EPERM/EINVAL) sans passer par le
// callback : sans ce garde-fou, l'appel remonte tuer le process.
function spawnSafe(cmd, args, opts, cb) {
  try { return execFile(cmd, args, opts, cb); }
  catch (e) { try { cb(e, '', ''); } catch {} return null; }
}

// ---------------------------------------------------------------------------
// Cle de "racine" : ce a quoi on rattache un type de systeme de fichiers.
// Windows -> 'H:'   |   POSIX -> point de montage ('/', '/media/usb')
// ---------------------------------------------------------------------------
function rootKey(p) {
  if (!p) return '';
  if (IS_WIN) {
    const m = /^([A-Za-z]):/.exec(String(p));
    return m ? m[1].toUpperCase() + ':' : '';
  }
  return mountPointOf(String(p));
}

// Point de montage contenant `p`, d'apres une table { pointDeMontage: type }.
// On prend la correspondance la PLUS LONGUE : '/' ne doit pas gagner contre
// '/media/usb' pour un chemin situe sous /media/usb.
//
// Comparaison TEXTUELLE volontairement : utiliser path.resolve() ferait entrer
// la semantique de la machine hote (sur Windows, '/media/usb' devient
// 'C:\\media\\usb'), ce qui rendrait la fonction intestable ailleurs — et
// fausserait le resultat. Ici c'est un simple probleme de prefixe.
function mountPointOf(p, table) {
  const norm = s => String(s).replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  const cible = norm(p);
  const points = Object.keys(table || {}).sort((a, b) => b.length - a.length);
  for (const brut of points) {
    const base = norm(brut);
    if (cible === base) return brut;
    if (base === '/' ? cible.startsWith('/') : cible.startsWith(base + '/')) return brut;
  }
  return '/';
}

// ---------------------------------------------------------------------------
// Parsing /proc/mounts (Linux) : "device mountpoint fstype options dump pass"
// ---------------------------------------------------------------------------
function parseProcMounts(texte) {
  const out = {};
  for (const ligne of String(texte || '').split('\n')) {
    const p = ligne.split(/\s+/);
    if (p.length < 3) continue;
    const point = p[1].replace(/\\040/g, ' '); // les espaces sont echappes en \040
    const type = p[2];
    // on ignore les pseudo-systemes : ils ne disent rien sur une capacite disque
    if (/^(proc|sysfs|tmpfs|devtmpfs|devpts|cgroup|cgroup2|overlay|squashfs|securityfs|debugfs|tracefs|pstore|bpf|autofs|mqueue|hugetlbfs|configfs|fusectl|binfmt_misc|ramfs|nsfs)$/.test(type)) continue;
    out[point] = type;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Types de systemes de fichiers par racine
// ---------------------------------------------------------------------------
// SONDE PRINCIPALE : SA SORTIE VA DANS UN FICHIER, JAMAIS DANS UN PIPE
//
// Elle lançait `powershell Get-Volume` et capturait sa sortie par un PIPE. Le
// 2026-09-20, mesure : dans un environnement qui refuse les pipes nommes, cet
// appel meurt en `spawnSync powershell EPERM` et le `catch` rendait un objet
// VIDE. `GET /api/drives` rendait alors `fs` vide pour C: et D:, et FAT32 pour
// H: seulement ; le depot etant `C:\_A_TRIER`, `pickDlDir` ne pouvait plus
// verifier son systeme de fichiers et refusait un fichier de plus de 4 Go
// (« detection muette ») — le refus etait juste, c'est la sonde qui se taisait.
//
// C'est la technique du repli `fsutil` (plus bas) qui est reprise ici : un
// fichier temporaire ouvert et passe comme stdout de l'enfant. Elle ne depend
// donc plus du contexte de lancement du serveur.
const CMD_VOLUMES = 'Get-Volume | ForEach-Object { "$($_.DriveLetter):$($_.FileSystemType)" }';

// Un fichier par appel : deux sondes concurrentes ne doivent pas ecrire dans le
// meme fichier.
let _sondeNo = 0;
function fichierTempSonde(prefixe) {
  return path.join(os.tmpdir(), prefixe + '-' + process.pid + '-' + (_sondeNo++) + '.txt');
}

// PURE : la sortie de l'outil devient la carte { 'C:': 'NTFS', ... }.
//
// Separee du lancement de processus A DESSEIN : c'est cette moitie qui est
// testable sur du texte fabrique, sans PowerShell et sans dependre de la machine.
//
// Une lettre SANS type ne produit AUCUNE entree : « je ne sais pas » ne doit pas
// devenir une entree vide, qui se lirait « pas de limite » plus loin.
function parseVolumes(texte) {
  const res = {};
  for (const l of String(texte || '').split(/\r?\n/)) {
    const m = l.trim().match(/^([A-Z]):(\w+)/);
    if (m) res[m[1] + ':'] = m[2];
  }
  return res;
}

// Lance la sonde et rend sa carte. Un echec rend un objet VIDE, jamais une carte
// inventee : l'appelant doit pouvoir distinguer « rien » de « aucun disque ».
function typesViaVolumeSync() {
  const tmp = fichierTempSonde('x360-sonde-volume');
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'w');
    execFileSync('powershell', ['-NoProfile', '-Command', CMD_VOLUMES], { stdio: ['ignore', fd, 'ignore'], timeout: 8000 });
    fs.closeSync(fd); fd = null;
    return parseVolumes(fs.readFileSync(tmp, 'utf8'));
  } catch { return {}; }
  finally {
    try { if (fd !== null) fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// Meme sonde, sans bloquer la boucle d'evenements. Le descripteur est ferme, le
// fichier lu puis efface DANS le callback — y compris quand le lancement a echoue
// de facon synchrone, sinon le fichier temporaire survivrait a l'appel.
function typesViaVolumeAsync(cb) {
  const tmp = fichierTempSonde('x360-sonde-volume');
  let fd = null;
  try { fd = fs.openSync(tmp, 'w'); } catch { return cb({}); }
  spawnSafe('powershell', ['-NoProfile', '-Command', CMD_VOLUMES], { stdio: ['ignore', fd, 'ignore'], timeout: 8000 }, () => {
    try { fs.closeSync(fd); } catch {}
    let carte = {};
    try { carte = parseVolumes(fs.readFileSync(tmp, 'utf8')); } catch {}
    try { fs.unlinkSync(tmp); } catch {}
    cb(carte);
  });
}

// ---------------------------------------------------------------------------
// SONDE SECONDAIRE : `[System.IO.DriveInfo]` (.NET), sans WMI et sans droits
// ---------------------------------------------------------------------------
// Les DEUX sources existantes exigent des droits que ce contexte n'accorde pas,
// et c'est la SECONDE CAUSE du refus des 4 Go. Mesure du 2026-09-20 :
//   - `Get-Volume` (WMI) echoue en `HRESULT 0x80041003` et n'ecrit RIEN sur
//     stdout, donc la sonde principale rend un objet vide ;
//   - `fsutil fsinfo volumeinfo C:` repond « Erreur : 5 : Acces refuse. ».
// Les DEUX ne se taisent que sur les disques FIXES — `fsutil` repond encore
// FAT32 pour le disque amovible — si bien que la carte ne portait plus que
// celui-ci. Le depot etant `C:\_A_TRIER`, `pickDlDir` ne pouvait plus verifier
// son systeme de fichiers et refusait tout fichier de plus de 4 Go.
//
// `[System.IO.DriveInfo]::GetDrives()` lit le type par l'API Windows
// `GetVolumeInformation` : AUCUNE WMI, AUCUN droit d'administrateur. Mesure du
// meme jour, meme contexte : il rend `C:\NTFS`, `D:\NTFS` et `H:\FAT32` la ou
// les deux autres se taisent. Sa sortie va dans un FICHIER, comme les autres.
//
// Le `try` par disque n'est pas decoratif : un lecteur de carte vide LEVE a la
// lecture de `DriveFormat`, et sans lui la boucle entiere ne rendrait rien.
const CMD_DRIVEINFO = '[System.IO.DriveInfo]::GetDrives() | ForEach-Object { try { $_.Name + $_.DriveFormat } catch { } }';

// PURE : « C:\NTFS » -> { 'C:': 'NTFS' }. Meme doctrine que `parseVolumes` : un
// disque dont le type n'est pas lisible (lecteur vide, volume monte sans lettre)
// ne produit AUCUNE entree, parce qu'une entree vide se lirait « pas de limite ».
function parseDriveInfo(texte) {
  const res = {};
  for (const l of String(texte || '').split(/\r?\n/)) {
    const m = l.trim().match(/^([A-Za-z]):[\\/]?(\w+)/);
    if (m) res[m[1].toUpperCase() + ':'] = m[2];
  }
  return res;
}

// Meme capture par FICHIER que les deux autres sondes, et meme menage du
// fichier temporaire : c'est le contexte de lancement qui a tue le pipe.
function typesViaDriveInfoSync() {
  const tmp = fichierTempSonde('x360-sonde-driveinfo');
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'w');
    execFileSync('powershell', ['-NoProfile', '-Command', CMD_DRIVEINFO], { stdio: ['ignore', fd, 'ignore'], timeout: 8000 });
    fs.closeSync(fd); fd = null;
    return parseDriveInfo(fs.readFileSync(tmp, 'utf8'));
  } catch { return {}; }
  finally {
    try { if (fd !== null) fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// Meme filet que la sonde principale : un refus n'est pas une reponse, et le
// repli `fsutil` garde son sens — il reste le DERNIER recours.
//
// La troisieme source est lancee en SYNCHRONE depuis les deux chemins, comme
// `fsutil` l'est deja : c'est un repli, il ne tourne que lorsque la source
// precedente s'est tue, et il repond en quelques dizaines de millisecondes.
function fsTypesSync() {
  if (IS_WIN) {
    const vu = { refus: false }; // le refus appartient a CE passage
    let res = typesViaVolumeSync();
    // SONDE MUETTE — echec OU reponse vide, c'est le meme neant : « je ne sais
    // pas » et « aucun disque » etaient indiscernables, et le serveur prenait le
    // second pour une reponse. On demande donc a la source qui ne depend NI de
    // WMI NI des droits, puis a `fsutil`, qui survit a ce qui tue PowerShell
    // (WMI refuse, execution policy, pipes interdits).
    if (!Object.keys(res).length) res = typesViaDriveInfoSync();
    if (!Object.keys(res).length) res = fsTypesViaFsutil(vu);
    // La carte vide PORTE UNE RAISON : information manquante ou droits refuses.
    _raisonSonde = raisonSondeDe(res, vu.refus);
    return res;
  }
  // Linux : /proc/mounts est un fichier ordinaire, pas besoin de processus
  try { return parseProcMounts(fs.readFileSync('/proc/mounts', 'utf8')); } catch {}
  if (IS_MAC) {
    try {
      const out = execFileSync('mount', [], { encoding: 'utf8', timeout: 8000 });
      const res = {};
      for (const l of String(out).split('\n')) {
        const m = l.match(/ on (\/\S*) \(([^,)]+)/);
        if (m) res[m[1]] = m[2];
      }
      return res;
    } catch { return {}; }
  }
  return {};
}

function fsTypesAsync(cb) {
  if (IS_WIN) {
    // Meme sonde, meme capture par FICHIER : l'application emploie les DEUX
    // chemins (le synchrone depuis `pickDlDir`, qui doit decider tout de suite ou
    // ecrire, l'asynchrone au demarrage et depuis /api/drives).
    const vu = { refus: false }; // le refus appartient a CE passage
    typesViaVolumeAsync(res => {
      // Meme regle que la version synchrone, et meme ORDRE : une sonde muette
      // n'est pas une reponse, donc on descend la chaine — la source sans droits,
      // puis `fsutil` en dernier recours — et la carte garde sa raison.
      let carte = res;
      if (!Object.keys(carte).length) carte = typesViaDriveInfoSync();
      if (!Object.keys(carte).length) carte = fsTypesViaFsutil(vu);
      _raisonSonde = raisonSondeDe(carte, vu.refus);
      cb(carte);
    });
    return;
  }
  cb(fsTypesSync()); // POSIX : lecture de fichier, instantane
}

// ---------------------------------------------------------------------------
// MEDIA PHYSIQUE par lettre : SSD, HDD, ou non lisible
// ---------------------------------------------------------------------------
// Ce que cette carte pilote : le `-j` d'iso2god. Mesure du 2026-09-26 (ISO
// 7,8 Go, H: = HDD USB) : 20 threads d'ecriture en parallele sur un disque
// mecanique font une tempete de seeks — 223 s contre ~70 s a un thread. Sur
// NVMe, le hachage parallelise divisait le temps par 2,6. Le choix se paie
// donc a chaque conversion et depend du MEDIA de destination, pas du nombre
// de coeurs de la machine.
//
// Meme doctrine que les sondes de type de systeme de fichiers : la sortie de
// PowerShell va dans un FICHIER (les pipes meurent dans certains contextes),
// une lettre sans media lisible ne produit AUCUNE entree, et une carte vide
// n'est pas « aucun disque ».
const CMD_MEDIA = '$m=@{}; Get-PhysicalDisk | ForEach-Object { $m[[string]$_.DeviceId]=$_.MediaType }; Get-Partition | Where-Object { $_.DriveLetter } | ForEach-Object { "$($_.DriveLetter):$($m[[string]$_.DiskNumber])" }';

// PURE : « H:SSD » -> { 'H:': 'SSD' }. MediaType rend ses noms en texte via
// Get-PhysicalDisk (SSD / HDD / SCM / Unspecified).
function parseMedia(texte) {
  const res = {};
  for (const l of String(texte || '').split(/\r?\n/)) {
    const m = l.trim().match(/^([A-Za-z]):(\w+)/);
    if (m) res[m[1].toUpperCase() + ':'] = m[2];
  }
  return res;
}

function mediaTypesAsync(cb) {
  if (!IS_WIN) return cb({}); // POSIX : pas de sonde — l'inconnu lit « pas SSD », choix prudent
  // execFile IGNORE l'option stdio (mesure : la sortie arrive dans le callback,
  // le descripteur passe en stdio reste vide) — on lit donc le buffer direct.
  spawnSafe('powershell', ['-NoProfile', '-Command', CMD_MEDIA], { timeout: 8000 },
    (e, stdout) => cb(e ? {} : parseMedia(stdout)));
}

// Un systeme de fichiers plafonne-t-il les fichiers a 4 Go ?
// FAT32 cote Windows, vfat/msdos cote Linux : oui, tous les deux.
//
// ATTENTION AU SENS DE `undefined` : un type INCONNU rend FAUX, donc « pas de
// limite ». C'est dangereux, et c'est au CHOIX DE DESTINATION de le traiter
// (voir `pickDlDir` dans server.js) : ici on ne repond que sur ce qu'on SAIT.
// Le 2026-09-20, une sonde muette a fait ecrire un fichier de 7,9 Go dans un
// depot FAT32 : il s'est arrete a 4 Go, sur un disque ayant 730 Go libres.
const limite4Go = type => /^(FAT32|FAT|vfat|msdos|VFAT)$/i.test(String(type || '').trim());

// ---------------------------------------------------------------------------
// « JE NE SAIS PAS » N'EST PAS « ACCES REFUSE »
// ---------------------------------------------------------------------------
// Une sonde muette recouvre DEUX pannes, et `pickDlDir` les traitait pareil :
//   - l'INFORMATION manque — les outils ont tourne et n'ont rien dit ;
//   - les DROITS manquent — les outils ont REFUSE de repondre.
// Deux messages, et surtout deux remedes : chercher un disque NTFS ne repare pas
// un refus de droits. Mesure du 2026-09-20 : `fsutil` ecrit son refus sur STDOUT
// (« Erreur : 5 : Acces refuse. »), donc DANS le fichier que la sonde capture
// deja ; WMI ecrit le sien sur stderr (« HRESULT 0x80041003 »).
const REFUS_DROITS = /(acc[e\u00e8]s\s+refus|access\s+is\s+denied|permissiondenied|0x80041003|erreur\s*:\s*5\b)/i;

function refusDroits(texte) { return REFUS_DROITS.test(String(texte || '')); }

// PURE : la carte est-elle vide, et si oui POURQUOI ? '' = la sonde a repondu,
// il n'y a rien a excuser.
function raisonSondeDe(carte, refus) {
  if (carte && Object.keys(carte).length) return '';
  return refus ? 'refus' : 'muette';
}

// Ce que la DERNIERE sonde a eu a dire. Sous Windows seulement : c'est le seul
// endroit ou un refus de droits est possible (`/proc/mounts` se lit sans droits).
// Le drapeau de refus, lui, appartient a UN passage de sonde (`vu`) : le chemin
// synchrone et le chemin asynchrone tournent ENSEMBLE dans l'application — le
// premier depuis `pickDlDir`, le second au demarrage et depuis /api/drives — et
// un drapeau partage attribuerait a l'un le refus constate par l'autre.
let _raisonSonde = '';
function raisonSonde() { return _raisonSonde; }

// ---------------------------------------------------------------------------
// SONDE DE SECOURS : `fsutil`, sans WMI et sans pipe
// ---------------------------------------------------------------------------
// `fsTypesSync` interroge `powershell Get-Volume`, qui depend de WMI et dont la
// sortie est capturee par un PIPE. Le 2026-09-20, mesure : dans un environnement
// qui refuse les pipes nommes, l'appel meurt en `spawnSync powershell EPERM`, le
// `catch` rendait un objet VIDE, et le serveur ne savait plus rien d'aucun disque.
//
// `fsutil fsinfo volumeinfo <lettre>:` lit les metadonnees du volume, ne depend
// d'aucun service, et sa sortie peut aller dans un FICHIER au lieu d'un pipe.
// Mesure du meme jour, meme environnement : `powershell` echoue par les deux
// chemins, `fsutil` repond encore — et dit `FAT32` pour H:.
const NOMS_FS = /\b(exFAT|FAT32|FAT16|FAT12|NTFS|ReFS|UDF|CDFS)\b/i;

// Le LIBELLE de la ligne est traduit par Windows, la VALEUR ne l'est pas : on
// cherche donc le nom du systeme de fichiers, jamais « Nom du systeme de
// fichiers ». C'est ce qui rend l'analyse independante de la langue du systeme.
function parseFsutil(texte) {
  const m = NOMS_FS.exec(String(texte || ''));
  return m ? m[1] : '';
}

// Un appel par disque EXISTANT, et seulement quand la sonde principale a echoue.
function typeViaFsutil(lettre, vu) {
  const nom = String(lettre).replace(/[^A-Za-z]/g, '') || 'X';
  const tmp = path.join(os.tmpdir(), 'x360-fs-' + nom + '-' + process.pid + '.txt');
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'w');
    execFileSync('fsutil', ['fsinfo', 'volumeinfo', nom + ':'], { stdio: ['ignore', fd, 'ignore'], timeout: 8000 });
  } catch {
    // L'OUTIL A ECHOUE — MAIS IL A PARLE. Mesure du 2026-09-20 : `fsutil` ecrit
    // « Erreur : 5 : Acces refuse. » sur stdout AVANT de sortir en 1. Avant, la
    // sortie en erreur faisait rendre '' sans jamais lire le fichier : le refus
    // etait donc jete, et il ne restait qu'un silence. On lit dans TOUS les cas.
  }
  finally {
    try { if (fd !== null) fs.closeSync(fd); } catch {}
  }
  let texte = '';
  try { texte = fs.readFileSync(tmp, 'utf8'); } catch {}
  try { fs.unlinkSync(tmp); } catch {}
  // Le refus se RETIENT : c'est la seule source qui dise POURQUOI elle n'a pas
  // repondu, et « je ne sais pas » n'est pas « acces refuse ».
  if (refusDroits(texte)) vu.refus = true;
  return parseFsutil(texte);
}

// TOUTES les lettres existantes, pour que la carte soit complete : `pickDlDir` et
// `dropDirs` cherchent une destination PARMI les disques, donc une carte partielle
// les rend aveugles — et c'est exactement ce qui est arrive.
function fsTypesViaFsutil(vu) {
  const res = {};
  for (const L of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (!fs.existsSync(L + ':\\')) continue;
    const t = typeViaFsutil(L, vu);
    if (t) res[L + ':'] = t;
  }
  return res;
}


// ---------------------------------------------------------------------------
// Supports amovibles
// ---------------------------------------------------------------------------
function removableAsync(cb) {
  if (IS_WIN) {
    const cmd = 'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=2" | ForEach-Object { $_.DeviceID }';
    spawnSafe('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8', timeout: 8000 }, (e, out) => {
      if (e) return cb([]);
      cb(String(out).split(/\r?\n/).map(s => s.trim()).filter(Boolean));
    });
    return;
  }
  // Linux : emplacements conventionnels des montages amovibles, plus /media/<user>
  const res = [];
  for (const base of ['/media', '/run/media', '/mnt', '/Volumes']) {
    try {
      if (!fs.existsSync(base)) continue;
      for (const e of fs.readdirSync(base, { withFileTypes: true })) {
        // /media/<utilisateur>/<volume> : on descend d'un niveau
        if (base === '/media' || base === '/run/media') {
          const sub = path.join(base, e.name);
          try {
            for (const s of fs.readdirSync(sub, { withFileTypes: true })) {
              if (s.isDirectory()) res.push(path.join(sub, s.name));
            }
            continue;
          } catch {}
        }
        res.push(path.join(base, e.name));
      }
    } catch {}
  }
  cb([...new Set(res)]);
}

// ---------------------------------------------------------------------------
// Ouvrir dans le gestionnaire de fichiers
// ---------------------------------------------------------------------------
function openPath(p, cb) {
  const done = cb || (() => {});
  const cible = fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : path.dirname(p);
  let cmd, args;
  if (IS_WIN) { cmd = 'explorer.exe'; args = [cible]; }
  else if (IS_MAC) { cmd = 'open'; args = [cible]; }
  else { cmd = 'xdg-open'; args = [cible]; }
  spawnSafe(cmd, args, {}, e => done(e || null));
}

// ---------------------------------------------------------------------------
// Reconnaissance d'un support Xbox 360
// ---------------------------------------------------------------------------
// Brancher un disque doit suffire : encore faut-il savoir que c'en est un. On ne
// devine pas au nom du volume — les cles RGH sont souvent en FAT32 sans nom — on
// regarde CE QU'IL CONTIENT.
const MARQUEURS_XBOX = ['Aurora', 'Content', 'Games', 'XeXMenu', 'DashLaunch', 'Homebrew', 'Emulators', '_A_TRIER', 'launch.ini'];

// Ou chercher des jeux sur ce support : les MEMES sous-dossiers que chez soi, et
// rien d'autre. Scanner aussi la racine faisait apparaitre le meme jeu deux fois
// — une fois par son dossier <TID>, une fois retrouve par recouvrement depuis la
// racine, avec un TitleID approximatif.
const SOUS_DOSSIERS_JEUX = ['Games', path.join('Content', '0000000000000000')];

// La ou les consoles rangent leurs applications : Aurora, XeXMenu, DashLaunch et
// les emulateurs n'occupent pas le meme dossier que les jeux.
const SOUS_DOSSIERS_APP = ['Homebrew', 'Emulators', 'ROMS', 'Apps', 'XeXMenu', 'DashLaunch'];

function classerRacine(racine) {
  const marqueurs = [];
  for (const m of MARQUEURS_XBOX) { try { if (fs.existsSync(path.join(racine, m))) marqueurs.push(m); } catch {} }
  const dossiers = noms => {
    const out = [];
    for (const s of noms) {
      const d = path.join(racine, s);
      try { if (fs.statSync(d).isDirectory()) out.push(d); } catch {}
    }
    return out;
  };
  return {
    racine,
    marqueurs,
    // Un dossier « Games » seul ne suffit pas (n'importe quel disque peut en
    // avoir un) : il faut un marqueur propre a une console modifiee.
    xbox: marqueurs.includes('Aurora') || marqueurs.includes('Content') || marqueurs.includes('_A_TRIER') || marqueurs.includes('XeXMenu') || marqueurs.includes('DashLaunch'),
    racines: dossiers(SOUS_DOSSIERS_JEUX),
    apps: dossiers(SOUS_DOSSIERS_APP)
  };
}

module.exports = {
  IS_WIN, IS_MAC,
  rootKey, mountPointOf, parseProcMounts,
  fsTypesSync, fsTypesAsync, limite4Go,
  // Exporte pour que l'analyse de la sonde principale, celle de la troisieme
  // source (`DriveInfo`) et celle du repli `fsutil` soient TESTABLES sans
  // dependre de la machine : ce sont des fonctions pures sur du texte (voir
  // test/sonde-volume-fichier.test.js, test/sonde-driveinfo.test.js et
  // test/platform.test.js).
  parseVolumes,
  parseFsutil,
  parseDriveInfo,
  // « je ne sais pas » n'est pas « acces refuse » : la raison d'une carte vide,
  // et de quoi la lire dans le texte d'un outil.
  refusDroits, raisonSondeDe, raisonSonde,
  // Media physique par lettre (SSD/HDD) — pilote le -j d'iso2god.
  parseMedia, mediaTypesAsync,
  MARQUEURS_XBOX, classerRacine,
  removableAsync, openPath, spawnSafe
};
