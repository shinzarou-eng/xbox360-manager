// TROISIEME SOURCE DE LA SONDE : `[System.IO.DriveInfo]` (.NET), et la
// distinction entre « je ne sais pas » et « acces refuse ».
//
// POURQUOI CE FICHIER EXISTE. Le 2026-09-20, le proprietaire a vu un ISO de plus
// de 4 Go refuse avec :
//   « Fichier > 4 Go : impossible de verifier le systeme de fichiers du depot
//     (detection muette) et aucun disque NTFS/exFAT n a pu etre verifie »
// Le depot est `C:\_A_TRIER`. Le correctif precedent (b74220b) a bien supprime
// une dependance reelle — la capture par PIPE remplacee par un FICHIER — mais il
// ne repare PAS le symptome : mesure du controle, apres redemarrage, trois fois
// de suite et identiquement, `GET /api/drives` rend `C:=VIDE · D:=VIDE ·
// H:=FAT32`.
//
// LA SECONDE CAUSE, MESUREE (voir .probe-refus dans le rapport) :
//   - `Get-Volume` (WMI) : acces refuse  -> `HRESULT 0x80041003`, RIEN sur stdout ;
//   - `fsutil fsinfo volumeinfo C:` : accueil refuse -> « Erreur : 5 : Acces
//     refuse. » (ecrit sur STDOUT, donc DEJA lisible dans le fichier de capture),
//     et il repond FAT32 pour H: ;
//   - `[System.IO.DriveInfo]::GetDrives()` : rend `C:\NTFS D:\NTFS H:\FAT32` —
//     aucune WMI, aucun droit d'administrateur.
//
// Les deux sources existantes exigent donc des droits que ce contexte n'accorde
// pas, et la carte ne portait plus que le disque amovible. On AJOUTE une
// troisieme source entre les deux (primaire -> DriveInfo -> fsutil), et on garde
// chaque repli et son sens.
//
// ON NE DEPEND PAS DE POWERSHELL. L'analyse est PURE et testee sur du texte
// fabrique ; la chaine est testee avec une doublure de lanceur qui reproduit
// l'environnement MESURE (pipe refuse en EPERM, fichier accepte).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const plat = require('../lib/platform');

// Sortie REELLE de `[System.IO.DriveInfo]::GetDrives()` sur la machine de
// reference : deux disques fixes NTFS et le depot amovible en FAT32.
const SORTIE_DRIVEINFO = 'C:\\NTFS\r\nD:\\NTFS\r\nH:\\FAT32\r\n';
const CARTE_COMPLETE = { 'C:': 'NTFS', 'D:': 'NTFS', 'H:': 'FAT32' };

// Le refus de droits, tel qu'il s'ecrit VRAIMENT — `fsutil` le met sur stdout
// (donc dans le fichier que la sonde capture deja), WMI le met sur stderr.
const REFUS_FSUTIL = 'Erreur : 5 : Acc\u00e8s refus\u00e9.\r\n';
const REFUS_WMI = 'Get-Volume : Acc\u00e8s refus\u00e9\r\n'
  + '    + FullyQualifiedErrorId : HRESULT 0x80041003,Get-Volume\r\n';

// ---------------------------------------------------------------------------
// Doublure du lanceur : reproduit l'environnement MESURE, pas la machine.
//   - un descripteur de FICHIER pour stdout : la sortie est ecrite, et la sonde
//     doit la lire (c'est la technique en place depuis b74220b) ;
//   - un PIPE : refuse en EPERM (mesure : `spawnSync powershell EPERM`).
// `cfg` choisit ce que rend chaque maillon :
//   { volume: {texte, echec}, driveinfo: {texte, echec},
//     fsutil: { 'C:': {texte, echec}, ... } }
// ---------------------------------------------------------------------------
function doublure(cfg, journal) {
  return function (cmd, args, opts, cb) {
    const o = opts || {};
    const fd = Array.isArray(o.stdio) ? o.stdio[1] : undefined;
    const parFichier = typeof fd === 'number';
    let quoi = '', cle = '';
    if (/^(powershell|pwsh)$/.test(cmd)) {
      const c = String(args[args.length - 1] || '');
      quoi = /DriveInfo/.test(c) ? 'driveinfo' : 'volume';
    } else if (cmd === 'fsutil') {
      quoi = 'fsutil';
      cle = String(args[2] || '');
    }
    journal.push({ quoi, cle, parFichier });

    const regle = (quoi === 'fsutil' ? (cfg.fsutil || {})[cle] : cfg[quoi]) || {};
    if (!parFichier) {
      const e = new Error('spawnSync ' + cmd + ' EPERM');
      e.code = 'EPERM';
      if (typeof cb === 'function') { cb(e, '', ''); return null; }
      throw e;
    }
    if (regle.texte) fs.writeSync(fd, regle.texte, null, 'utf8');
    if (regle.echec) {
      // `fsutil` ecrit son refus PUIS sort en 1 : le texte est deja dans le
      // fichier quand le lancement leve, et c'est ce texte qui dit POURQUOI.
      const e = new Error('Command failed: ' + cmd);
      e.status = 1;
      if (typeof cb === 'function') { cb(e, '', ''); return null; }
      throw e;
    }
    if (typeof cb === 'function') { cb(null, '', ''); return null; }
    return Buffer.from('');
  };
}

// Une instance NEUVE du module, chargee pendant que la doublure est en place.
function platformSousDoublure(cfg, journal) {
  const cible = require.resolve('../lib/platform');
  const cache = require.cache[cible];
  const vraiSync = cp.execFileSync, vraiAsync = cp.execFile;
  cp.execFileSync = doublure(cfg, journal);
  cp.execFile = doublure(cfg, journal);
  let mod;
  try {
    delete require.cache[cible];
    mod = require('../lib/platform');
  } finally {
    cp.execFileSync = vraiSync;
    cp.execFile = vraiAsync;
    delete require.cache[cible];
    if (cache) require.cache[cible] = cache;
  }
  return mod;
}

// L'environnement MESURE chez le proprietaire, exactement :
//   Get-Volume refuse par WMI (stdout vide), fsutil refuse sur C: et D:,
//   fsutil repond FAT32 pour H:, et DriveInfo repond pour les trois.
const ENV_MESURE = {
  volume: { texte: '', echec: true },
  driveinfo: { texte: SORTIE_DRIVEINFO, echec: false },
  fsutil: {
    'C:': { texte: REFUS_FSUTIL, echec: true },
    'D:': { texte: REFUS_FSUTIL, echec: true },
    'H:': { texte: 'Nom du volume : XBOX360\r\nNom du syst\u00e8me de fichiers : FAT32\r\n', echec: false }
  }
};

const surWindows = process.platform === 'win32';

// ---------------------------------------------------------------------------
// L'ANALYSE DE LA NOUVELLE SOURCE — pure, donc testable sans PowerShell
// ---------------------------------------------------------------------------
test('parseDriveInfo : la sortie de DriveInfo devient la carte complete', () => {
  assert.strictEqual(typeof plat.parseDriveInfo, 'function',
    'l analyse de la troisieme source doit etre exportee : elle est pure, et c est elle qui doit etre testable sans PowerShell');
  assert.deepStrictEqual(plat.parseDriveInfo(SORTIE_DRIVEINFO), CARTE_COMPLETE);
});

test('parseDriveInfo : c est bien CE disque-la, et le depot y est', () => {
  // Le point du defaut : ce n est pas « une carte » qu on veut, c est la lettre
  // du DEPOT. Trois disques doivent sortir, C: compris.
  const carte = plat.parseDriveInfo(SORTIE_DRIVEINFO);
  assert.strictEqual(carte['C:'], 'NTFS', 'le disque du depot doit etre dans la carte');
  assert.strictEqual(plat.limite4Go(carte['C:']), false, 'C: en NTFS n a pas la limite de 4 Go');
  assert.strictEqual(plat.limite4Go(carte['H:']), true, 'H: en FAT32 garde la limite de 4 Go');
});

test('parseDriveInfo : un disque sans type lisible ne produit AUCUNE entree', () => {
  // Meme doctrine que parseVolumes : « je ne sais pas » ne doit pas devenir une
  // entree vide, qui se lirait « pas de limite » plus loin (le 7,9 Go en FAT32).
  const texte = ['C:\\NTFS', 'D:\\', 'E:  ', '', 'Volume monte sans lettre'].join('\r\n');
  assert.deepStrictEqual(plat.parseDriveInfo(texte), { 'C:': 'NTFS' });
  assert.deepStrictEqual(plat.parseDriveInfo(''), {});
  assert.deepStrictEqual(plat.parseDriveInfo(null), {});
});

// ---------------------------------------------------------------------------
// LA CHAINE — primaire -> DriveInfo -> fsutil
// ---------------------------------------------------------------------------
test('LA MESURE DU PROPRIETAIRE : la carte porte enfin C: et D:', { skip: !surWindows }, () => {
  // C est le defaut rapporte, rejoue tel quel : Get-Volume refuse par WMI et
  // fsutil refuse sur les disques fixes. Avant, la carte ne portait que H: —
  // donc `pickDlDir` ne pouvait pas verifier `C:\_A_TRIER` et refusait 4 Go.
  const journal = [];
  const p = platformSousDoublure(ENV_MESURE, journal);
  const carte = p.fsTypesSync();
  const appels = journal.filter(a => a.quoi === 'driveinfo');
  assert.ok(appels.length,
    'la troisieme source doit avoir ete interrogee : les deux premieres echouent par manque de droits, mesure du 2026-09-20');
  assert.strictEqual(appels[0].parFichier, true,
    'DriveInfo doit aussi ecrire dans un FICHIER, jamais capturer par un pipe (mesure : la capture par pipe meurt en EPERM)');
  assert.deepStrictEqual(carte, CARTE_COMPLETE,
    'la carte doit porter C:, D: et H: : c est C: qui manquait, et c est lui le depot');
});

test('le chemin ASYNCHRONE porte la meme carte', { skip: !surWindows }, async () => {
  // L application emploie LES DEUX chemins : le synchrone pour `pickDlDir`, qui
  // doit decider tout de suite ou ecrire, et l asynchrone au demarrage et depuis
  // /api/drives. N en reparer qu un laisserait le refus en place.
  const journal = [];
  const p = platformSousDoublure(ENV_MESURE, journal);
  const carte = await new Promise(res => p.fsTypesAsync(res));
  assert.ok(journal.some(a => a.quoi === 'driveinfo'), 'le chemin asynchrone doit interroger DriveInfo');
  assert.deepStrictEqual(carte, CARTE_COMPLETE);
});

test('fsutil reste le DERNIER recours, et garde son sens', { skip: !surWindows }, () => {
  // `fsutil` survit a ce qui tue PowerShell ET DriveInfo. On garde donc le repli,
  // et on verifie l ORDRE : primaire, puis la nouvelle source, puis lui.
  const journal = [];
  const cfg = {
    volume: { texte: '', echec: true },
    driveinfo: { texte: '', echec: false },
    fsutil: { 'H:': { texte: 'Nom du syst\u00e8me de fichiers : FAT32\r\n', echec: false } }
  };
  const p = platformSousDoublure(cfg, journal);
  const carte = p.fsTypesSync();
  assert.deepStrictEqual(carte, { 'H:': 'FAT32' }, 'le repli fsutil doit encore repondre');
  const ordre = journal.filter(a => a.quoi !== 'inconnu').map(a => a.quoi);
  assert.deepStrictEqual(ordre.slice(0, 3), ['volume', 'driveinfo', 'fsutil'],
    'l ordre doit rester primaire -> DriveInfo -> fsutil');
});

test('DriveInfo qui repond evite d appeler fsutil du tout', { skip: !surWindows }, () => {
  // Le disque amovible met parfois plus de 8 s a repondre a `fsutil` (mesure :
  // de 37 ms a plus de 8000 ms) : la nouvelle source rend la carte sans l attendre.
  const journal = [];
  const p = platformSousDoublure(ENV_MESURE, journal);
  p.fsTypesSync();
  assert.ok(!journal.some(a => a.quoi === 'fsutil'),
    'aucun appel a fsutil ne doit avoir lieu quand DriveInfo a repondu');
});

test('la sonde ne laisse pas son fichier temporaire derriere elle', { skip: !surWindows }, () => {
  const reste = () => fs.readdirSync(os.tmpdir()).filter(f => /^x360-sonde-driveinfo/.test(f));
  const avant = reste();
  const p = platformSousDoublure(ENV_MESURE, []);
  p.fsTypesSync();
  assert.deepStrictEqual(reste(), avant, 'aucun fichier temporaire de la troisieme source ne doit rester');
});

// ---------------------------------------------------------------------------
// PARTIE 2 — « JE NE SAIS PAS » N EST PAS « ACCES REFUSE »
// ---------------------------------------------------------------------------
// Un cas manque d INFORMATION, l autre manque de DROITS : deux messages, deux
// remedes. Envoyer chercher un disque NTFS quand le probleme est un refus de
// droits fait perdre du temps et ne repare rien.
test('refusDroits : le refus de droits se RECONNAIT dans le texte', () => {
  assert.strictEqual(typeof plat.refusDroits, 'function', 'la distinction doit etre exportee et pure');
  assert.strictEqual(plat.refusDroits(REFUS_FSUTIL), true, 'le refus de fsutil (sur stdout) doit etre reconnu');
  assert.strictEqual(plat.refusDroits(REFUS_WMI), true, 'le refus de WMI (0x80041003) doit etre reconnu');
  assert.strictEqual(plat.refusDroits('Access is denied.'), true, 'la forme anglaise doit etre reconnue aussi');
  assert.strictEqual(plat.refusDroits('Erreur : 5 : Acces refuse'), true, 'la forme sans accent doit etre reconnue');
});

test('refusDroits : une reponse et un silence ne sont PAS des refus', () => {
  const reponse = 'Nom du volume : XBOX360\r\nNom du syst\u00e8me de fichiers : FAT32\r\n';
  assert.strictEqual(plat.refusDroits(reponse), false, 'une reponse valide n est pas un refus');
  assert.strictEqual(plat.refusDroits(''), false, 'un silence n est pas un refus');
  assert.strictEqual(plat.refusDroits(null), false);
});

test('raisonSondeDe : la carte muette dit POURQUOI elle est muette', () => {
  assert.strictEqual(typeof plat.raisonSondeDe, 'function');
  // La sonde a repondu : il n y a rien a excuser.
  assert.strictEqual(plat.raisonSondeDe({ 'C:': 'NTFS' }, true), '', 'une carte non vide n a pas de raison');
  // Les outils ont REFUSE de repondre : il manque des DROITS.
  assert.strictEqual(plat.raisonSondeDe({}, true), 'refus', 'un refus doit se dire « refus »');
  // Les outils ont repondu, mais n avaient rien a dire : il manque une INFORMATION.
  assert.strictEqual(plat.raisonSondeDe({}, false), 'muette', 'un silence doit se dire « muette »');
  assert.strictEqual(plat.raisonSondeDe(null, false), 'muette', 'une absence de carte est un silence');
});

test('la sonde retient le refus quand tous les maillons sont refuses', { skip: !surWindows }, () => {
  // C est le cas ou MEME DriveInfo est refuse : la carte est vide, et la seule
  // chose honnete a dire est que l application n a pas le DROIT de lire le type.
  const cfg = {
    volume: { texte: '', echec: true },
    driveinfo: { texte: '', echec: true },
    fsutil: { 'C:': { texte: REFUS_FSUTIL, echec: true }, 'D:': { texte: REFUS_FSUTIL, echec: true } }
  };
  const p = platformSousDoublure(cfg, []);
  assert.deepStrictEqual(p.fsTypesSync(), {});
  assert.strictEqual(p.raisonSonde(), 'refus',
    'la carte est vide PARCE QUE les droits manquent : le refus doit dire ce qu il est');
});

test('la sonde dit « muette » quand les outils n ont simplement rien dit', { skip: !surWindows }, () => {
  const cfg = { volume: { texte: '', echec: false }, driveinfo: { texte: '', echec: false }, fsutil: {} };
  const p = platformSousDoublure(cfg, []);
  assert.deepStrictEqual(p.fsTypesSync(), {});
  assert.strictEqual(p.raisonSonde(), 'muette',
    'sans refus, c est bien l information qui manque — pas les droits');
});

test('la sonde ne crie pas au refus quand elle a repondu', { skip: !surWindows }, () => {
  const p = platformSousDoublure(ENV_MESURE, []);
  const carte = p.fsTypesSync();
  assert.deepStrictEqual(carte, CARTE_COMPLETE);
  assert.strictEqual(p.raisonSonde(), '',
    'une carte complete n a aucune raison a donner : le refus de fsutil sur C: ne doit pas etre retenu');
});
