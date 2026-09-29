// LA LIGNE QUI SUIT UNE INSTALLATION — et ce qu'elle a cache.
//
// Mesure du 2026-09-20 : un ISO du jeu PC (Dark Messiah of Might and Magic, 7,11 Go)
// telecharge par erreur est reste dans le depot avec la mention « Aucun package
// trouve — fichier garde dans le depot ». La cause etait pourtant CONNUE : iso2god
// avait ecrit « invalid ISO format ». Le message ne disait donc rien d'actionnable,
// et 7,11 Go dormaient la sans explication.
//
// `noteApresInstall` vit dans server.js (elle compose une phrase traduite) : on
// l'extrait et on l'evalue avec un `T` de doublure, comme test/pertinence.test.js.
// Ce qu'on teste est le CHOIX entre les formulations, pas les traductions.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const D = "// ---------- Note de fin d'installation (fonction PURE, testee) ----------";
const F = "// ---------- fin note de fin d'installation ----------";
const d = srv.indexOf(D), f = srv.indexOf(F);
assert.ok(d > 0 && f > d, 'le bloc de la note doit etre trouvable dans server.js');
const bloc = srv.slice(d, f);
// Doublure de T() : elle rend l'anglais, pour que les assertions portent sur le
// texte qu'on controle et pas sur la langue de la machine.
const T = (fr, en) => (en || fr);
const { noteApresInstall } = new Function('T', bloc + '\nreturn { noteApresInstall };')(T);

test('installation reussie : la ligne dit combien de paquets', () => {
  assert.strictEqual(noteApresInstall(1, 0, ''), 'Installed — 1 pkg');
});

test('installation partielle : la ligne dit que la source est conservee', () => {
  const n = noteApresInstall(2, 1, '');
  assert.match(n, /Installed — 2 pkg/);
  assert.match(n, /source kept/, 'un contenu non pris en charge doit se dire');
});

test('ECHEC DE CONVERSION : la RAISON de l outil doit etre dans la ligne', () => {
  // Le cas reel : iso2god refuse un ISO qui n'est pas un jeu Xbox 360.
  const n = noteApresInstall(0, 1, 'invalid ISO format');
  assert.match(n, /GOD conversion failed/, 'la ligne doit dire que la CONVERSION a echoue');
  assert.match(n, /invalid ISO format/, 'et reprendre la raison donnee par l outil');
  assert.match(n, /file kept/, 'et dire ce qu il advient du fichier');
  // l'ancien message ne doit PAS etre celui-la : il ne nommait aucune cause
  assert.ok(!/No package found/.test(n), 'l ancien message generique ne doit pas revenir ici');
});

test('echec sans raison connue : le message generique reste', () => {
  // On ne fabrique pas de cause : quand il n'y en a pas, on le dit comme avant.
  assert.strictEqual(noteApresInstall(0, 1, ''), 'No package found — file kept in the drop folder');
});

test('un refus du garde-fou de galette remonte aussi sa raison', () => {
  const n = noteApresInstall(0, 1, 'this disc would replace Halo 3 (same TitleID, different disc)');
  assert.match(n, /Halo 3/, 'la galette en place doit etre nommee');
});
