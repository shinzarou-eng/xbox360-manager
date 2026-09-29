// Test de CHARGEMENT de server.js.
//
// Pourquoi ce test existe : `node --check` ne valide que la SYNTAXE. Une erreur
// qui survient a l'execution du module — variable utilisee avant sa declaration
// (zone morte temporelle d'un `const`), dependance circulaire, fichier de donnees
// illisible — passe le controle de syntaxe et ne se voit qu'au demarrage.
// C'est arrive en pratique : un bloc de code place avant `const ROOT` faisait
// echouer le serveur au chargement, avec un `node --check` parfaitement vert.
//
// Les tests unitaires n'attrapaient pas ce cas, puisque aucun n'importait
// server.js (l'importer ouvrirait le port 4360). D'ou le mode `--selftest`, qui
// charge tout puis sort sans ecouter.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// stdio 'pipe' est refuse dans certains environnements restreints : on passe par
// un fichier temporaire pour recuperer la sortie sans dependre du pipe.
const os = require('os');
const fs = require('fs');

test('server.js se charge entierement (--selftest)', () => {
  const f = path.join(os.tmpdir(), 'x360-selftest-' + process.pid + '.txt');
  const out = fs.openSync(f, 'w');
  let r;
  try {
    r = spawnSync(process.execPath, ['server.js', '--selftest'], {
      cwd: ROOT, stdio: ['ignore', out, out], timeout: 60000
    });
  } finally {
    fs.closeSync(out);
  }
  const texte = fs.readFileSync(f, 'utf8');
  fs.rmSync(f, { force: true });

  assert.strictEqual(r.status, 0,
    'server.js a echoue au chargement (code ' + r.status + ') :\n' + texte);
  assert.match(texte, /^Xbox 360 Manager/m, 'le rapport d\'autotest doit s\'afficher');
  assert.match(texte, /\n {2}OK\n?$/, 'l\'autotest doit se terminer par OK :\n' + texte);
});

test('--selftest n ouvre PAS le port 4360', () => {
  // le mode doit sortir avant listen() : sinon la CI entrerait en conflit avec
  // une instance deja lancee, ou resterait bloquee
  const r = spawnSync(process.execPath, ['server.js', '--selftest'], {
    cwd: ROOT, stdio: 'ignore', timeout: 60000
  });
  assert.strictEqual(r.status, 0, 'le mode autotest doit se terminer de lui-meme');
  assert.strictEqual(r.signal, null, 'le mode autotest ne doit pas etre tue (donc pas bloque sur le port)');
});
