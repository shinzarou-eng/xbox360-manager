// Tests des emulateurs.
//
// La correspondance emulateur <-> dossier de ROMs vient du guide Aurora FR 2026.
// Ce qui compte ici : on ne dit jamais « installe » quand il manque le dossier de
// ROMs. Un emulateur sans ROMs demarre sur une liste vide, et l'utilisateur croit
// avoir installe quelque chose de casse.
const { test } = require('node:test');
const assert = require('node:assert');
const E = require('../lib/emulateurs');

test('emulateurs : le catalogue suit le guide', () => {
  // Six emulateurs, une machine chacun, et les extensions annoncees par le guide.
  // Un compte FIGE obligeait a le corriger a chaque ajout sans rien verifier de
  // plus. Le catalogue est passe de 6 a 12 en relevant les noms reels des
  // consoles ; ce qui compte est qu'il couvre les machines ci-dessous.
  assert.ok(E.EMULATEURS.length >= 6, 'le catalogue doit rester fourni');
  assert.strictEqual(E.EMULATEURS.length, E.EMULATEURS.map(e => e.id).filter((v, i, a) => a.indexOf(v) === i).length,
    'chaque emulateur doit avoir un identifiant unique');
  const parId = Object.fromEntries(E.EMULATEURS.map(e => [e.id, e]));
  assert.strictEqual(parId.fceux.machine, 'NES');
  assert.strictEqual(parId.snes9x.machine, 'SNES');
  assert.strictEqual(parId.vbam.machine, 'GBA');
  assert.strictEqual(parId.genplus.machine, 'MEGADRIVE');
  assert.strictEqual(parId.pcsx.machine, 'PS1');
  assert.strictEqual(parId.mupen.machine, 'N64');
  // Chaque machine a des extensions, sinon on ne saurait pas quoi chercher.
  for (const e of E.EMULATEURS) {
    const m = E.MACHINES[e.machine];
    assert.ok(m && m.extensions.length, 'machine sans extensions : ' + e.id);
    assert.ok(m.dossiers.length, 'machine sans dossier de ROMs : ' + e.id);
  }
});

test('emulateurs : le dossier se reconnait malgre les variantes d ecriture', () => {
  // Les paquets circulent sous des noms varies : « FCEUX », « FCE Ultra GX ».
  assert.strictEqual(E.parDossier('FCEUX').id, 'fceux');
  assert.strictEqual(E.parDossier('fce ultra gx').id, 'fceux');
  assert.strictEqual(E.parDossier('Snes9x').id, 'snes9x');
  assert.strictEqual(E.parDossier('VBA-M').id, 'vbam');
  assert.strictEqual(E.parDossier('vba m').id, 'vbam');
  assert.strictEqual(E.parDossier('GenesisPlusGX').id, 'genplus');
  // Un dossier inconnu ne doit PAS etre attribue au hasard.
  assert.strictEqual(E.parDossier('RetroArch'), null);
  assert.strictEqual(E.parDossier(''), null);
});

test('emulateurs : le dossier de ROMs accepte les variantes', () => {
  const snes = E.MACHINES.SNES;
  assert.strictEqual(E.dossierRoms(snes, ['NES', 'SNES']), 'SNES');
  assert.strictEqual(E.dossierRoms(snes, ['Snes']), 'Snes');
  // Le repli « le nom CONTIENT l'attendu » n'est plus dans `dossierRoms` :
  // « SNES » contient « NES », ce qui attribuait le dossier Super Nintendo a la
  // NES — et declarait la SNES orpheline alors que Snes9x lisait dedans. Le repli
  // vit dans `dossierRomsSouple`, qui ecarte ce piege.
  assert.strictEqual(E.dossierRoms(snes, ['Roms SNES']), null, 'dossierRoms est STRICT');
  assert.strictEqual(E.dossierRomsSouple(snes, ['Roms SNES'], E.MACHINES), 'Roms SNES');
  assert.strictEqual(E.dossierRomsSouple(E.MACHINES.NES, ['Roms SNES'], E.MACHINES), null,
    'SNES ne doit JAMAIS etre attribue a la NES');
  assert.strictEqual(E.dossierRoms(snes, ['NES', 'GBA']), null);
});

test('emulateurs : un emulateur sans dossier de ROMs est SIGNALE', () => {
  // Le cas qui fait croire a une panne : l'emulateur est la, les ROMs non.
  const d = E.diagnostic(['FCEUX', 'Snes9x'], ['NES']);
  assert.strictEqual(d.installes.length, 2);
  assert.strictEqual(d.manquants.length, 1);
  assert.strictEqual(d.manquants[0].emulateur, 'Snes9x 360');
  assert.strictEqual(d.manquants[0].dossier, 'SNES');
  const fceux = d.installes.find(i => i.id === 'fceux');
  const snes = d.installes.find(i => i.id === 'snes9x');
  assert.strictEqual(fceux.romsOk, true);
  assert.strictEqual(fceux.conseil, null);
  assert.strictEqual(snes.romsOk, false);
  assert.match(snes.conseil, /liste vide/, 'le conseil doit dire ce qui se passera');
  assert.ok(d.conseils.some(c => /dossier de ROMs/.test(c)), 'un conseil doit resumer');
});

test('emulateurs : des ROMs sans emulateur sont SIGNALEES', () => {
  // L'inverse : des ROMs qui ne serviront a rien.
  const d = E.diagnostic(['FCEUX'], ['NES', 'N64']);
  assert.strictEqual(d.orphelins.length, 1);
  assert.strictEqual(d.orphelins[0].dossier, 'N64');
  assert.match(d.conseils.join(' '), /sans emulateur/);
});

test('emulateurs : le BIOS PS1 est annonce, jamais fourni', () => {
  const d = E.diagnostic(['PCSX'], ['PS1']);
  const ps1 = d.installes.find(i => i.id === 'pcsx');
  assert.strictEqual(ps1.bios, true);
  assert.match(d.conseils.join(' '), /BIOS/);
  assert.match(d.conseils.join(' '), /ta propre console/, 'on dit d ou il vient, on ne le fournit pas');
});

test('emulateurs : la source Aurora est rappelee', () => {
  // Le guide est explicite : sans le dossier declare comme source, tout est en
  // place et rien n'apparait. Le taire ferait chercher une panne inexistante.
  const d = E.diagnostic(['FCEUX'], ['NES']);
  assert.match(d.conseils.join(' '), /Gestion des sources/);
});

test('emulateurs : aucun emulateur installe ne produit aucun conseil trompeur', () => {
  const d = E.diagnostic([], []);
  assert.deepStrictEqual(d.installes, []);
  assert.strictEqual(d.conseils.length, 0);
  assert.ok(d.absents.length >= 6, 'le catalogue reste disponible');
  assert.ok(d.absents.every(e => e.nom && e.machine), 'chaque absent est decrit');
  // Et l'etat doit exister : il avait disparu du retour sans qu'aucun test ne le
  // lise, et l'interface affichait `undefined`.
  assert.strictEqual(d.etat, 'vide');
});
