// Emulateurs sur la console — la structure que le guide Aurora documente.
//
// Source : « Guide Aurora FR 2026 », page Emulation
// (https://elmajor9.github.io/xbox360-aurora-guide/emulation/). Rien n'est
// invente ici : la disposition des dossiers, les extensions de ROMs et le besoin
// de BIOS viennent de ce guide.
//
//   Hdd1:/Emulators/<Nom>/default.xex      l'emulateur, lance par Aurora
//   Hdd1:/Roms/<Console>/                  les ROMs, rangees par machine
//
// POURQUOI L'APPLICATION S'EN OCCUPE. Installer un emulateur sans son dossier de
// ROMs donne un emulateur qui demarre sur une liste vide : l'utilisateur croit
// avoir installe quelque chose de casse, alors qu'il manque juste un dossier. Le
// diagnostic le dit AVANT, et nomme le dossier exact.

// Le dossier de ROMs attendu par machine. Le guide donne cette correspondance
// par emulateur ; on la centralise, parce que deux emulateurs peuvent partager
// une machine (pSX et PCSX ReARMed sont tous deux de la PS1).
//
// Les machines marquees « hors guide » viennent de dossiers REELS rencontres sur
// une console (E:\ROMS : Arcade, MAME, ScummVM, OpenBOR, DOS, Amiga). Le guide
// ne les cite pas, mais ils existent — et un catalogue qui ne connait pas ce que
// l'utilisateur a sous les yeux ne sert a rien.
const MACHINES = {
  NES: { nom: 'NES', extensions: ['.nes'], dossiers: ['NES'] },
  SNES: { nom: 'Super Nintendo', extensions: ['.smc', '.sfc', '.zip'], dossiers: ['SNES', 'Snes'] },
  GBA: { nom: 'Game Boy / GBC / GBA', extensions: ['.gb', '.gbc', '.gba'], dossiers: ['GBA', 'GB', 'GBC'] },
  MEGADRIVE: { nom: 'Mega Drive / Genesis', extensions: ['.md', '.bin', '.smd', '.zip'], dossiers: ['MegaDrive', 'Genesis', 'MD'] },
  PS1: { nom: 'PlayStation 1', extensions: ['.cue', '.bin', '.img', '.iso'], dossiers: ['PS1', 'PSX'], bios: true },
  N64: { nom: 'Nintendo 64', extensions: ['.z64', '.n64', '.v64'], dossiers: ['N64'] },
  // --- hors guide : dossiers reels, conventions bien etablies ---
  ARCADE: { nom: 'Arcade (Final Burn)', extensions: ['.zip'], dossiers: ['Arcade', 'FBA', 'FBANext'] },
  MAME: { nom: 'MAME', extensions: ['.zip'], dossiers: ['MAME'] },
  SCUMMVM: { nom: 'ScummVM (aventures)', extensions: ['.scummvm'], dossiers: ['ScummVM', 'Scumm'] },
  OPENBOR: { nom: 'OpenBOR (beat\'em up)', extensions: ['.pak'], dossiers: ['OpenBOR', 'BOR'] },
  DOS: { nom: 'DOS', extensions: ['.zip', '.exe'], dossiers: ['DOS', 'DOSBox'] },
  AMIGA: { nom: 'Amiga', extensions: ['.adf', '.hdf', '.zip'], dossiers: ['Amiga', 'AmigaHD'] }
};

// Les emulateurs cites par le guide, avec le nom de DOSSIER qu'ils prennent sur
// la console. `dossiers` en liste plusieurs : les paquets circulent sous des
// noms varies (« FCEUX », « FCE Ultra GX 360 »).
//
// LE SUFFIXE « 360 » EST LA REGLE, PAS L'EXCEPTION : les ports Xbox 360 s'appellent
// Snes360, Mupen64-360, PCSXr360, MAME360... Mes premieres listes n'avaient que
// les noms du guide (Snes9x, Mupen64Plus, PCSX) et ne reconnaissaient AUCUN des
// dix emulateurs reellement installes. Verifie sur une console reelle : 0 sur 10.
const EMULATEURS = [
  { id: 'fceux', nom: 'FCE Ultra GX 360', machine: 'NES', dossiers: ['FCEUX', 'FCEUltra', 'FCE Ultra GX', 'FCE360'], note: 'Compatibilite tres haute, performances excellentes.' },
  { id: 'snes9x', nom: 'Snes9x 360', machine: 'SNES', dossiers: ['Snes9x', 'Snes9x360', 'Snes360', 'Snes9xbox'], note: 'Quelques jeux a puce SuperFX peuvent ralentir.' },
  { id: 'vbam', nom: 'VBA-M 360', machine: 'GBA', dossiers: ['VBA-M', 'VisualBoyAdvance', 'VBA360', 'VBAM360'], note: 'Bon en GB/GBC, correct en GBA.' },
  { id: 'genplus', nom: 'Genesis Plus GX 360', machine: 'MEGADRIVE', dossiers: ['GenesisPlus', 'GenesisPlusGX', 'GenPlusGX', 'SegaGenesisPlus', 'Genesis360'], note: 'Reference de l\'emulation Mega Drive.' },
  { id: 'pcsx', nom: 'PCSX ReARMed / pSX', machine: 'PS1', dossiers: ['PCSX', 'PCSX-ReARMed', 'PCSXR', 'pSX', 'PCSXr360', 'PCSX360'], note: 'BIOS PS1 original requis, configuration plus longue.' },
  { id: 'mupen', nom: 'Mupen64Plus 360', machine: 'N64', dossiers: ['Mupen64Plus', 'Mupen64', 'Mupen64Plus360', 'Mupen64-360'], note: 'Compatibilite inegale : les jeux simples passent bien.' },
  // --- hors guide : rencontres sur une console reelle ---
  { id: 'fba', nom: 'FBANext 360', machine: 'ARCADE', dossiers: ['FBANext360', 'FBANext', 'FBA360', 'FinalBurn'], note: 'Arcade : les romsets doivent correspondre a la version de FBA.' },
  { id: 'mame', nom: 'MAME 360', machine: 'MAME', dossiers: ['MAME360', 'MAME'], note: 'Arcade : les romsets sont lies a une version precise de MAME.' },
  { id: 'scummvm', nom: 'ScummVM 360', machine: 'SCUMMVM', dossiers: ['ScummVM360', 'ScummVM'], note: 'Aventures point-and-click : les jeux sont des DOSSIERS de donnees, pas des ROMs.' },
  { id: 'openbor', nom: 'OpenBOR 360', machine: 'OPENBOR', dossiers: ['OpenBOR360', 'OpenBOR'], note: 'Beat\'em up : chaque jeu est un fichier .pak.' },
  { id: 'dosbox', nom: 'DOSBox 360', machine: 'DOS', dossiers: ['DOSBox360', 'DOSBox'], note: 'Jeux DOS : souvent des dossiers, parfois une archive.' },
  { id: 'amiga', nom: 'Amiga 360', machine: 'AMIGA', dossiers: ['Amiga360', 'Amiga', 'UAE360', 'AmigaUAE'], note: 'Amiga : .adf pour les disquettes, .hdf pour les disques durs.' }
];

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Retrouve un emulateur par le nom de son dossier sur la console.
function parDossier(nom) {
  const n = norm(nom);
  return EMULATEURS.find(e => e.dossiers.some(d => norm(d) === n)) || null;
}
function machineDe(id) { const e = EMULATEURS.find(x => x.id === id); return e ? MACHINES[e.machine] : null; }

// Le dossier de ROMs qui correspond a une machine, tel qu'il EXISTE s'il existe.
// On accepte les variantes d'ecriture : « SNES » et « Snes » sont le meme dossier
// pour l'utilisateur, mais pas pour une comparaison de chaines.
function dossierRoms(machine, dossiersPresents) {
  const presents = (dossiersPresents || []).map(d => ({ brut: d, n: norm(d) }));
  for (const attendu of machine.dossiers) {
    const t = presents.find(p => p.n === norm(attendu));
    if (t) return t.brut;
  }
  return null;
}

// Le repli « le nom contient l'attendu » ne s'applique QUE si aucun dossier ne
// correspond exactement a AUCUNE machine.
//
// Sans cette precaution, « SNES » contient « NES » : le dossier de ROMs Super
// Nintendo etait attribue a la NES, qui n'a aucun emulateur installe, et la SNES
// etait declaree ORPHELINE alors que Snes9x lisait dedans. Constate sur une
// console reelle.
function dossierRomsSouple(machine, dossiersPresents, toutesMachines) {
  const exact = dossierRoms(machine, dossiersPresents);
  if (exact) return exact;
  const tous = Object.values(toutesMachines || MACHINES);
  const presents = (dossiersPresents || []).map(d => ({ brut: d, n: norm(d) }));
  for (const attendu of machine.dossiers) {
    const a = norm(attendu);
    if (a.length < 4) continue;             // « NES » ou « MD » matchent trop large
    const t = presents.find(p => {
      if (!p.n.includes(a)) return false;
      // Et si ce dossier correspond exactement a une AUTRE machine, il n'est pas
      // a nous : « SNES » appartient a la SNES, pas a la NES.
      return !tous.some(m => m !== machine && dossierRoms(m, [p.brut]));
    });
    if (t) return t.brut;
  }
  return null;
}

/**
 * Diagnostic : que manque-t-il pour que cet emulateur serve a quelque chose ?
 *
 * @param {string[]} dossiersEmulateurs  noms presents dans <racine>/Emulators
 * @param {string[]} dossiersRoms        noms presents dans <racine>/Roms
 * @returns {{installes: object[], manquants: object[], orphelins: string[], conseils: string[]}}
 */
function diagnostic(dossiersEmulateurs, dossiersRoms) {
  const emus = dossiersEmulateurs || [];
  const roms = dossiersRoms || [];
  const installes = [], manquants = [], conseils = [];

  for (const dossier of emus) {
    const e = parDossier(dossier);
    if (!e) continue;                       // un dossier inconnu : ni installé ni manquant
    const m = MACHINES[e.machine];
    const dossierRom = dossierRomsSouple(m, roms, MACHINES);
    installes.push({
      id: e.id, nom: e.nom, dossier, machine: e.machine,
      machineNom: m.nom, extensions: m.extensions,
      dossierRoms: dossierRom, romsOk: !!dossierRom,
      bios: !!m.bios, note: e.note,
      conseil: dossierRom
        ? null
        : 'Cree ' + m.dossiers[0] + '/ dans Roms/ : sans lui, ' + e.nom + ' demarre sur une liste vide.'
    });
    if (!dossierRom) {
      manquants.push({ emulateur: e.nom, dossier: m.dossiers[0], machine: m.nom, extensions: m.extensions });
    }
  }

  // Un emulateur connu, absent : c'est le catalogue, pas un reproche.
  const connus = new Set(emus.map(d => { const e = parDossier(d); return e && e.id; }).filter(Boolean));
  const absents = EMULATEURS.filter(e => !connus.has(e.id)).map(e => ({ id: e.id, nom: e.nom, machine: MACHINES[e.machine].nom }));

  // Un dossier de ROMs sans emulateur installe : l'utilisateur a des ROMs qui ne
  // serviront a rien tant qu'il n'a pas l'emulateur correspondant.
  const orphelins = [];
  for (const d of roms) {
    const dedans = Object.entries(MACHINES).filter(([, m]) => dossierRoms(m, [d]));
    if (!dedans.length) continue;
    const [cle, m] = dedans[0];
    const servi = installes.some(i => i.machine === cle);
    if (!servi) orphelins.push({ dossier: d, machine: m.nom });
  }

  if (installes.length && manquants.length) {
    conseils.push(installes.length + ' emulateur(s) installe(s), mais ' + manquants.length + ' sans dossier de ROMs : ils demarreront sur une liste vide.');
  }
  if (orphelins.length) {
    conseils.push(orphelins.length + ' dossier(s) de ROMs sans emulateur : les ROMs ne seront pas lisibles tant que l\'emulateur correspondant n\'est pas installe.');
  }
  // Le BIOS se dit des qu'un emulateur qui en exige un est installe — PAS
  // seulement quand il manque des ROMs : sans BIOS, la PS1 ne demarre rien du
  // tout, meme avec les ROMs en place.
  if (installes.some(i => i.bios)) {
    conseils.push('L\'emulation PS1 exige un BIOS d\'origine (SCPH1001.BIN ou equivalent). Il ne peut venir que de ta propre console — aucun guide ne le fournit.');
  }
  // Le guide precise qu'Aurora ne voit les emulateurs que si le dossier est
  // declare comme source. Sans cela, tout est en place et rien n'apparait.
  if (installes.length) {
    conseils.push('Dans Aurora : Parametres > Gestion des sources, ajoute le dossier Emulators. Sans cela, tout est en place et rien n\'apparait.');
  }
  return {
    // Ces champs avaient DISPARU d'une edition precedente sans qu'aucun test ne
    // s'en apercoive : le diagnostic rendait « etat: undefined » et l'interface
    // n'avait plus rien a afficher. Trouve en le lancant sur une vraie console.
    //
    // « prete » ne veut PAS dire que tout marchera : il dit qu'un emulateur est
    // la ET que son dossier de ROMs existe. Le BIOS PS1, lui, reste a part.
    etat: installes.length ? (manquants.length ? 'incomplete' : 'prete') : (roms.length ? 'emulateur-manquant' : 'vide'),
    emulateurs: installes.length,
    // Compte, et non liste : la route expose `dossiersRoms` comme un TABLEAU de
    // noms. Un meme nom pour deux types selon le chemin, c'est un piege.
    dossiersRomsTotal: roms.length,
    jeux: roms.length,
    installes, manquants, absents, orphelins, conseils
  };
}

module.exports = { MACHINES, EMULATEURS, parDossier, machineDe, dossierRoms, dossierRomsSouple, diagnostic };
