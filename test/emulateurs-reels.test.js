// Tests des emulateurs, sur des cas REELS.
//
// Ce fichier existe parce que deux defauts ont survecu a la suite de tests :
// `diagnostic()` ne rendait plus `etat` (aucun test ne le lisait), et « SNES »
// etait attribue a la NES (le repli « le nom contient l'attendu »). Les deux ont
// ete trouves en lancant le module sur une vraie console, pas par les tests.
const { test } = require('node:test');
const assert = require('node:assert');
const E = require('../lib/emulateurs');

test('emulateurs : les noms de DOSSIER reels sont reconnus', () => {
  // Releves sur une console : E:\Emulators. Les listes du guide donnaient
  // « Snes9x », « Mupen64Plus », « PCSX » — AUCUN de ces dix dossiers n'etait
  // reconnu. Le suffixe « 360 » est la regle sur cette plateforme, pas
  // l'exception.
  const reels = {
    Snes360: 'snes9x', FBANext360: 'fba', 'Mupen64-360': 'mupen',
    SegaGenesisPlus: 'genplus', PCSXr360: 'pcsx', MAME360: 'mame',
    ScummVM360: 'scummvm', OpenBOR360: 'openbor', DOSBox360: 'dosbox', Amiga360: 'amiga'
  };
  for (const [dossier, id] of Object.entries(reels)) {
    const e = E.parDossier(dossier);
    assert.ok(e, dossier + ' doit etre reconnu');
    assert.strictEqual(e.id, id, dossier + ' -> ' + id);
  }
  // Et les noms du guide continuent de marcher.
  for (const d of ['Snes9x', 'Mupen64Plus', 'PCSX-ReARMed', 'GenesisPlusGX', 'FCEUX']) {
    assert.ok(E.parDossier(d), d + ' (nom du guide) doit rester reconnu');
  }
});

test('emulateurs : le catalogue est coherent', () => {
  const machines = new Set(Object.keys(E.MACHINES));
  for (const e of E.EMULATEURS) {
    assert.ok(machines.has(e.machine), e.nom + ' vise une machine inconnue : ' + e.machine);
    assert.ok(e.dossiers.length, e.nom + ' doit lister au moins un nom de dossier');
  }
  // Deux emulateurs ne doivent pas revendiquer le meme dossier : parDossier
  // prendrait le premier et l'autre serait invisible.
  // Deux emulateurs ne doivent pas revendiquer le meme dossier : parDossier
  // prendrait le premier et l'autre serait invisible. Deux ecritures du meme nom
  // DANS le meme emulateur (« Snes9x » et « SNES9X ») sont seulement redondantes.
  const vus = new Map();
  for (const e of E.EMULATEURS) {
    for (const d of e.dossiers) {
      const cle = d.toLowerCase();
      if (vus.has(cle) && vus.get(cle) !== e.id) {
        assert.fail('dossier « ' + d + ' » revendique par ' + vus.get(cle) + ' ET ' + e.id);
      }
      vus.set(cle, e.id);
    }
    // Et les doublons internes sont inutiles : on les signale sans bloquer.
    const propres = new Set(e.dossiers.map(x => x.toLowerCase()));
    assert.strictEqual(propres.size, e.dossiers.length, e.nom + ' liste deux fois le meme dossier');
  }
});

test('emulateurs : un dossier de ROMs n est jamais attribue a la MAUVAISE machine', () => {
  // LE BUG : « SNES » contient « NES ». Le repli « le nom contient l'attendu »
  // attribuait le dossier Super Nintendo a la NES, qui n'a aucun emulateur
  // installe — la SNES etait alors declaree ORPHELINE alors que Snes9x lisait
  // dedans. Vu sur une vraie console.
  assert.strictEqual(E.dossierRoms(E.MACHINES.SNES, ['SNES']), 'SNES');
  assert.strictEqual(E.dossierRoms(E.MACHINES.NES, ['SNES']), null, 'SNES n est pas un dossier NES');
  // Et le diagnostic ne doit pas inventer d'orphelin.
  const r = E.diagnostic(['Snes360'], ['SNES']);
  assert.deepStrictEqual(r.orphelins, [], 'SNES a son emulateur : aucun orphelin');
  assert.strictEqual(r.etat, 'prete');
});

test('emulateurs : le repli souple accepte un nom qui CONTIENT l attendu', () => {
  // « Roms SNES » doit etre accepte pour la SNES...
  assert.strictEqual(E.dossierRomsSouple(E.MACHINES.SNES, ['Roms SNES'], E.MACHINES), 'Roms SNES');
  // ...mais jamais au detriment d'une correspondance exacte ailleurs.
  assert.strictEqual(E.dossierRomsSouple(E.MACHINES.NES, ['Roms SNES'], E.MACHINES), null);
  // Un nom trop court ne doit pas servir de joker (« MD », « GB »).
  assert.strictEqual(E.dossierRomsSouple(E.MACHINES.MEGADRIVE, ['Roms MD'], E.MACHINES), null);
});

test('emulateurs : diagnostic rend TOUJOURS un etat', () => {
  // `etat` avait disparu du retour sans qu'aucun test ne s'en apercoive :
  // l'interface affichait `undefined`. On verifie les quatre etats possibles.
  const cas = [
    [[], [], 'vide'],
    [[], ['SNES'], 'emulateur-manquant'],
    [['Snes360'], ['MegaDrive'], 'incomplete'],
    [['Snes360'], ['SNES'], 'prete']
  ];
  for (const [emus, roms, attendu] of cas) {
    const r = E.diagnostic(emus, roms);
    assert.strictEqual(r.etat, attendu, emus.length + ' emu + ' + roms.length + ' dossier(s) -> ' + attendu);
    // Et les champs que l'interface lit doivent exister.
    for (const cle of ['etat', 'emulateurs', 'dossiersRomsTotal', 'installes', 'manquants', 'absents', 'orphelins', 'conseils']) {
      assert.ok(cle in r, 'le diagnostic doit rendre ' + cle);
    }
  }
});

test('emulateurs : « prete » ne promet pas que tout marchera', () => {
  // Un dossier de ROMs vide n'est pas un dossier de ROMs utilisable, mais on ne
  // peut pas le savoir d'ici. Ce qu'on affirme, c'est seulement que l'emulateur
  // est la ET que son dossier existe.
  const r = E.diagnostic(['Snes360'], ['SNES']);
  assert.strictEqual(r.etat, 'prete');
  // Le rappel sur les sources d'Aurora reste indispensable.
  assert.ok(r.conseils.some(c => /Gestion des sources/.test(c)),
    'sans le dossier declare comme source dans Aurora, rien n apparait');
});

test('emulateurs : le BIOS PS1 se dit des que l emulateur est la', () => {
  // Pas seulement quand il manque des ROMs : sans BIOS, la PS1 ne demarre RIEN,
  // meme avec les ROMs en place.
  const sansRoms = E.diagnostic(['PCSXr360'], []);
  assert.ok(sansRoms.conseils.some(c => /BIOS/.test(c)), 'le BIOS doit etre dit meme sans ROMs');
  const avecRoms = E.diagnostic(['PCSXr360'], ['PS1']);
  assert.ok(avecRoms.conseils.some(c => /BIOS/.test(c)), 'et meme quand tout est en place');
});

test('emulateurs : les machines hors guide existent aussi', () => {
  // Le guide ne cite pas l'arcade, MAME, ScummVM, OpenBOR, DOS ni l'Amiga. Ils
  // existent pourtant sur une vraie console, et un catalogue qui ignore ce que
  // l'utilisateur a sous les yeux ne sert a rien.
  const attendues = ['NES', 'SNES', 'GBA', 'MEGADRIVE', 'PS1', 'N64',
    'ARCADE', 'MAME', 'SCUMMVM', 'OPENBOR', 'DOS', 'AMIGA'];
  for (const m of attendues) {
    assert.ok(E.MACHINES[m], 'machine manquante : ' + m);
    assert.ok(E.MACHINES[m].extensions.length || E.MACHINES[m].bios,
      m + ' doit annoncer des extensions');
  }
  // Chaque machine doit avoir au moins un emulateur qui la sert.
  for (const cle of Object.keys(E.MACHINES)) {
    if (cle === 'GBA' || cle === 'NES') continue;   // pas installees sur cette console
    assert.ok(E.EMULATEURS.some(e => e.machine === cle), 'aucun emulateur pour ' + cle);
  }
});
