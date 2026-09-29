// Sonde de types de systemes de fichiers : la sortie de `powershell Get-Volume`
// doit etre confiee a un FICHIER, jamais capturee par un PIPE.
//
// POURQUOI CE FICHIER EXISTE. Le 2026-09-20, `GET /api/drives` rendait `fs` vide
// pour C: et D:, et FAT32 pour H: seulement. Le depot etant `C:\_A_TRIER`,
// `pickDlDir` lisait `connu = false` (la carte ne portait pas C:), ne trouvait
// aucun disque dans ALTERNATIF (la carte ne portait qu'une lettre FAT32) et
// refusait un fichier de plus de 4 Go avec « detection muette » — exactement le
// message vu par le proprietaire sur une image de 4 Go et plus.
//
// La cause est le MODE DE CAPTURE : la sonde principale capture la sortie par un
// PIPE, que cet environnement refuse (`spawnSync powershell EPERM`), alors que
// `lib/platform.js` documente deja que la sortie peut aller dans un FICHIER — la
// technique qu'emploie son repli `fsutil`.
//
// ON NE DEPEND PAS DE POWERSHELL. Le lanceur est remplace par une doublure qui
// reproduit l'environnement MESURE : une capture par pipe echoue en EPERM, une
// capture par fichier reussit. C'est la FORME du defaut qui est testee, pas la
// machine. L'analyse, elle, reste pure et est testee sur du texte fabrique.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const plat = require('../lib/platform');

// Sortie reelle de la sonde sur la machine de reference : deux disques fixes NTFS
// et le depot amovible en FAT32. C'est CE genre de carte que le depot C: exige.
const SORTIE_VOLUMES = ['C:NTFS', 'D:NTFS', 'H:FAT32'].join('\r\n') + '\r\n';
const CARTE_COMPLETE = { 'C:': 'NTFS', 'D:': 'NTFS', 'H:': 'FAT32' };

// Doublure du lanceur de processus.
//
// - `powershell` : reproduit la mesure. Sans descripteur de fichier pour stdout,
//   la capture passe par un pipe et echoue en EPERM (mesure : `spawnSync
//   powershell EPERM`). Avec un descripteur, la sortie est ecrite dans le
//   fichier et la sonde doit alors rendre la carte COMPLETE.
// - tout autre outil : refuse. C'est la mesure du repli `fsutil` sur les disques
//   fixes (« Erreur : 5 : Acces refuse »), donc la doublure ne peut pas fabriquer
//   une carte par le repli : seule la sonde principale peut la produire.
function lanceurDoublure(journal) {
  return function (cmd, args, opts, cb) {
    const o = opts || {};
    const fd = Array.isArray(o.stdio) ? o.stdio[1] : undefined;
    const parFichier = typeof fd === 'number';
    journal.push({ cmd, mode: parFichier ? 'fichier' : 'pipe' });
    const echec = () => {
      const e = new Error('spawnSync ' + cmd + ' EPERM');
      e.code = 'EPERM';
      return e;
    };
    if (cmd !== 'powershell' || !parFichier) {
      const e = echec();
      if (typeof cb === 'function') { cb(e, '', ''); return null; }
      throw e;
    }
    fs.writeSync(fd, SORTIE_VOLUMES, null, 'utf8');
    if (typeof cb === 'function') { cb(null, '', ''); return null; }
    return Buffer.from('');
  };
}

// Une instance NEUVE du module, chargee pendant que la doublure est en place :
// `lib/platform.js` capture `execFileSync`/`execFile` au chargement. L'instance
// d'origine est rendue a la fin pour que le reste de la suite ne voie rien.
function platformSousDoublure(journal) {
  const cible = require.resolve('../lib/platform');
  const cache = require.cache[cible];
  const vraiSync = cp.execFileSync, vraiAsync = cp.execFile;
  cp.execFileSync = lanceurDoublure(journal);
  cp.execFile = lanceurDoublure(journal);
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

// ---------------------------------------------------------------------------
// L'ANALYSE — pure, donc testable sans lancer le moindre processus
// ---------------------------------------------------------------------------
test('parseVolumes : la sortie de la sonde devient la carte complete', () => {
  assert.strictEqual(typeof plat.parseVolumes, 'function',
    'l analyse de la sortie doit etre exportee : elle est pure, et c est elle qui doit etre testable sans PowerShell');
  assert.deepStrictEqual(plat.parseVolumes(SORTIE_VOLUMES), CARTE_COMPLETE);
});

test('parseVolumes : un volume dont le type est INCONNU reste inconnu', () => {
  // « JE NE SAIS PAS » N EST PAS « PAS DE LIMITE ». Une lettre sans type (ou avec
  // un type vide) ne doit pas entrer dans la carte : le depot doit rester
  // « non verifie », donc refuse pour un gros fichier.
  const carte = plat.parseVolumes(['C:NTFS', 'E:', 'F:   ', 'G: '].join('\r\n'));
  assert.deepStrictEqual(carte, { 'C:': 'NTFS' }, 'un type absent ne doit pas fabriquer une entree');
  assert.strictEqual(plat.limite4Go(carte['E:'] || ''), false);
  // et un vrai FAT32 reste bien reconnu comme limite a 4 Go
  assert.strictEqual(plat.limite4Go(plat.parseVolumes('H:FAT32')['H:']), true);
});

test('parseVolumes : une sortie vide ou illisible ne rend rien', () => {
  for (const rien of ['', '   ', null, undefined, '\n\n', 'Get-Volume : Acces refuse', 'Acces refuse']) {
    assert.deepStrictEqual(plat.parseVolumes(rien), {}, JSON.stringify(rien) + ' ne doit rien rendre');
  }
});

// ---------------------------------------------------------------------------
// LA FORME DU DEFAUT — un pipe refuse ne doit plus rendre la sonde muette
// ---------------------------------------------------------------------------
test('la sonde principale ecrit dans un FICHIER : un pipe refuse ne la rend plus muette', () => {
  const journal = [];
  const p = platformSousDoublure(journal);
  const carte = p.fsTypesSync();
  const appels = journal.filter(a => a.cmd === 'powershell');
  assert.ok(appels.length, 'la sonde principale doit avoir interroge powershell');
  assert.strictEqual(appels[0].mode, 'fichier',
    'la sonde doit confier un DESCRIPTEUR DE FICHIER a l enfant, pas un pipe : mesure de l environnement, la capture par pipe meurt en EPERM');
  // ET LA CONSEQUENCE : la carte doit etre complete malgre le pipe refuse.
  assert.deepStrictEqual(carte, CARTE_COMPLETE,
    'le type du disque du depot (C:) manque : c est ce silence qui a fait refuser un fichier de plus de 4 Go');
});

test('la sonde ASYNCHRONE ecrit elle aussi dans un FICHIER', async () => {
  // L application emploie LES DEUX chemins : le synchrone pour `pickDlDir`, qui
  // doit decider tout de suite ou ecrire, et l asynchrone au demarrage et depuis
  // /api/drives. Corriger un seul des deux laisserait le refus en place.
  const journal = [];
  const p = platformSousDoublure(journal);
  const carte = await new Promise(res => p.fsTypesAsync(res));
  const appels = journal.filter(a => a.cmd === 'powershell');
  assert.ok(appels.length, 'la sonde asynchrone doit avoir interroge powershell');
  assert.strictEqual(appels[0].mode, 'fichier',
    'la sonde asynchrone doit ecrire dans un fichier, pas capturer par un pipe');
  assert.deepStrictEqual(carte, CARTE_COMPLETE,
    'la carte doit etre complete par le chemin asynchrone aussi');
});

// ---------------------------------------------------------------------------
// MEDIA PHYSIQUE — la carte SSD/HDD qui pilote le -j d'iso2god
// ---------------------------------------------------------------------------
test('parseMedia : la sortie de la sonde devient la carte des medias', () => {
  assert.strictEqual(typeof plat.parseMedia, 'function',
    'l analyse du media physique doit etre exportee : pure, testable sans PowerShell');
  assert.deepStrictEqual(
    plat.parseMedia('C:SSD\r\nD:SSD\r\nH:HDD\r\n'),
    { 'C:': 'SSD', 'D:': 'SSD', 'H:': 'HDD' });
  // Une lettre sans media lisible ne produit aucune entree — l'inconnu vaut
  // « pas un SSD » pour -j, le choix qui ne casse jamais un disque mecanique.
  assert.deepStrictEqual(plat.parseMedia('E:\r\nF:   \r\nG:Unspecified'), { 'G:': 'Unspecified' });
  for (const rien of ['', '   ', null, undefined]) {
    assert.deepStrictEqual(plat.parseMedia(rien), {});
  }
});

// ---------------------------------------------------------------------------
// Le fichier temporaire ne doit pas survivre a l appel
// ---------------------------------------------------------------------------
test('la sonde ne laisse pas son fichier temporaire derriere elle', () => {
  const avant = fs.readdirSync(require('os').tmpdir()).filter(f => /^x360-sonde-volume/.test(f));
  const p = platformSousDoublure([]);
  p.fsTypesSync();
  const apres = fs.readdirSync(require('os').tmpdir()).filter(f => /^x360-sonde-volume/.test(f));
  assert.deepStrictEqual(apres, avant, 'aucun fichier temporaire de sonde ne doit rester');
});
