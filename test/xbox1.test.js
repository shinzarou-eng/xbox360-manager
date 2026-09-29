// Tests de la compatibilite Xbox 1.
//
// Le point qui compte : ne JAMAIS confondre un jeu Xbox 1 (`default.xbe`) avec un
// jeu Xbox 360 (`default.xex`). Les deux sont des dossiers avec un « default.* »
// dedans, et les melanger afficherait des jeux 360 dans la liste Xbox 1.
const { test } = require('node:test');
const assert = require('node:assert');
const X = require('../lib/xbox1');

test('xbox1 : la partition et le dossier viennent des sources', () => {
  // Ce n'est pas un dossier ordinaire : c'est la deuxieme partition du disque.
  // Se tromper de chemin donnerait une installation qui ne sert a rien.
  assert.strictEqual(X.PARTITION, 'HddX');
  assert.strictEqual(X.DOSSIER, 'Compatibility');
  assert.strictEqual(X.CHEMIN, '/HddX/Compatibility');
  assert.strictEqual(X.FICHIERS_ATTENDUS, 23);
  assert.ok(X.TAILLE_ATTENDUE > 30 * 1048576 && X.TAILLE_ATTENDUE < 33 * 1048576);
});

test('xbox1 : les trois paquets publics sont decrits, avec leur usage', () => {
  assert.strictEqual(X.PAQUETS.length, 3);
  const parId = Object.fromEntries(X.PAQUETS.map(p => [p.id, p]));
  assert.ok(parId.hacked && parId.hud && parId.retail);
  // « hacked » est celui qui retire la liste blanche : c'est le defaut sur RGH.
  assert.match(parId.hacked.quoi, /liste blanche/i);
  assert.strictEqual(parId.hacked.consoleModifiee, true);
  // Et « retail » est le seul qui ne l'exige pas.
  assert.strictEqual(parId.retail.consoleModifiee, false);
  // Le paquet hud doit dire son COUT, pas seulement son avantage.
  assert.match(parId.hud.quand, /moins bien|moins stable/i);
});

test('xbox1 : un jeu se reconnait a default.xbe, PAS a default.xex', () => {
  // Confondre les deux melangerait les jeux Xbox 360 dans la liste Xbox 1.
  assert.strictEqual(X.estUnJeuXbox1(['default.xbe', 'Media']), true);
  assert.strictEqual(X.estUnJeuXbox1(['DEFAULT.XBE']), true, 'la casse ne doit pas compter');
  assert.strictEqual(X.estUnJeuXbox1(['default.xex', 'Media']), false, 'default.xex est un jeu Xbox 360');
  assert.strictEqual(X.estUnJeuXbox1([]), false);
  assert.strictEqual(X.estUnJeuXbox1(null), false);
  // Une image Xbox 1 compte aussi.
  assert.strictEqual(X.estUnJeuXbox1(['Halo.iso']), true);
  assert.strictEqual(X.estUnJeuXbox1(['readme.txt']), false);
});

test('xbox1 : sans partition, on s arrete la et on nomme le correctif', () => {
  // Sans HddX, tout le reste est sans objet. Parler des paquets ferait chercher
  // une solution qui ne peut pas marcher.
  const d = X.diagnostic({ partitionExiste: false });
  assert.strictEqual(d.etat, 'sans-partition');
  assert.strictEqual(d.emulateurInstalle, false);
  assert.strictEqual(d.correctif.nom, 'HDD Compatibility Partition Fixer');
  // Et on dit qu'il se lance SUR LA CONSOLE : c'est le point bloquant.
  assert.match(d.correctif.ou, /SUR LA CONSOLE/);
  assert.match(d.conseils.join(' '), /HddX/);
});

test('xbox1 : une installation INCOMPLETE se distingue d une installation absente', () => {
  // Un jeu qui echoue sans raison apparente vient souvent de la : quelques
  // fichiers manquants, et rien ne le signale.
  const vide = X.diagnostic({ partitionExiste: true, fichiers: [] });
  assert.strictEqual(vide.etat, 'vide');
  assert.strictEqual(vide.emulateurInstalle, false);
  assert.match(vide.conseils.join(' '), /hacked/, 'on nomme le paquet a prendre');

  const partiel = X.diagnostic({ partitionExiste: true, fichiers: new Array(10).fill('x') });
  assert.strictEqual(partiel.etat, 'incomplete');
  assert.strictEqual(partiel.emulateurInstalle, true);
  assert.strictEqual(partiel.complet, false);
  assert.match(partiel.conseils.join(' '), /10 fichier\(s\) sur les 23/);
  assert.match(partiel.conseils.join(' '), /INCOMPLETE/);
});

test('xbox1 : emulateur et jeux manquants sont DISTINGUES', () => {
  // « Il manque l'emulateur » et « il n'y a pas de jeux » ne se reparent pas
  // pareil : confondre les deux enverrait chercher au mauvais endroit.
  const sansJeux = X.diagnostic({ partitionExiste: true, fichiers: new Array(23).fill('x'), dossiersJeux: [] });
  assert.strictEqual(sansJeux.etat, 'prete');
  assert.strictEqual(sansJeux.jeux, 0);
  assert.match(sansJeux.conseils.join(' '), /aucun jeu Xbox 1/i);

  const sansEmu = X.diagnostic({ partitionExiste: true, fichiers: [], dossiersJeux: ['Halo', 'Conker'] });
  assert.strictEqual(sansEmu.etat, 'emulateur-manquant');
  assert.strictEqual(sansEmu.jeux, 2);
  assert.match(sansEmu.conseils.join(' '), /ne se lanceront pas/);
});

test('xbox1 : les deux pieges sont toujours donnes', () => {
  // Un jeu Xbox 1 qui ne demarre pas n'a AUCUN message d'erreur. Sans ces deux
  // pistes, on croit le fichier casse.
  const d = X.diagnostic({ partitionExiste: true, fichiers: new Array(23).fill('x'), dossiersJeux: ['Halo'] });
  assert.strictEqual(d.pieges.length, 2);
  const t = d.pieges.map(p => p.texte).join(' ');
  assert.match(t, /stealth/i, 'les plugins de stealth empechent le demarrage');
  assert.match(t, /480p/, 'certains titres tournent mieux en 480p');
});

test('xbox1 : l etat « prete » ne promet pas que tout marchera', () => {
  // Dire « pret » sans nuance laisserait croire qu'aucun jeu ne peut echouer.
  const d = X.diagnostic({ partitionExiste: true, fichiers: new Array(23).fill('x'), dossiersJeux: ['Halo'] });
  assert.strictEqual(d.etat, 'prete');
  assert.match(d.conseils.join(' '), /piege/i);
});

test('xbox1 : les conseils ne se CONTREDISENT pas', () => {
  // Une installation incomplete affichait « l'installation est INCOMPLETE » ET
  // « tout est en place » dans la meme liste. Deux phrases qui se contredisent,
  // et l'utilisateur ne sait plus laquelle croire.
  const incomplet = X.diagnostic({ partitionExiste: true, fichiers: new Array(7).fill('x'), dossiersJeux: ['Halo'] });
  const t = incomplet.conseils.join(' ').toLowerCase();
  assert.match(t, /incomplete/, 'on doit dire que c est incomplet');
  assert.ok(!/tout est en place/.test(t), 'et surtout PAS dire que tout est en place : ' + t);

  // Et la phrase « tout est en place » n'apparait que quand c'est vrai.
  const complet = X.diagnostic({ partitionExiste: true, fichiers: new Array(23).fill('x'), dossiersJeux: ['Halo'] });
  assert.match(complet.conseils.join(' '), /en place/);
});

test('xbox1 : le texte du correctif ne se repete pas', () => {
  // « il se lance il se lance sur la console » : le conseil concatenait une phrase
  // qui commencait deja par la meme chose.
  const d = X.diagnostic({ partitionExiste: false });
  const t = d.conseils.join(' ');
  assert.ok(!/il se lance il se lance/i.test(t), 'repetition : ' + t);
  assert.match(t, /SUR LA CONSOLE/);
});
