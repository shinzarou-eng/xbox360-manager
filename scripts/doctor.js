#!/usr/bin/env node
// Diagnostic d'environnement en ligne de commande.
//   npm run doctor
// Sortie lisible + code de sortie non nul si un point BLOQUANT est detecte
// (utilisable tel quel dans une CI ou un script d'installation).
const fs = require('fs');
const path = require('path');
const { runDoctor } = require('../lib/doctor');

const ROOT = path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'config.json');

const cfgs = [
  { drop: path.join(ROOT, '_A_TRIER'), games: path.join(ROOT, 'Games'), content: path.join(ROOT, 'Content', '0000000000000000') }
];
try { cfgs[cfgs.length - 1] = Object.assign(cfgs[0], JSON.parse(fs.readFileSync(CONFIG, 'utf8'))); } catch {}

const r = runDoctor(cfgs[0], ROOT);

// ✓ present · ✗ bloquant · ! a corriger · · sans objet sur cette plateforme
const V = c => c.indisponible ? '\u00b7' : (c.ok ? '\u2713' : (c.requis || c.id === 'node' ? '\u2717' : '!'));
const ligne = c => '  ' + V(c) + ' ' + c.nom.padEnd(18) + ' ' + (c.detail || (c.chemin ? 'trouve' : '')) + (c.hint ? '\n      -> ' + c.hint : '');

console.log('\nXbox 360 Manager \u2014 diagnostic (' + r.plateforme + ')\n');
for (const c of r.checks) console.log(ligne(c));

console.log('\n' + (r.resume === 'ok'
  ? 'Tout est pret.'
  : r.resume === 'degrade'
    ? r.degradants + ' point(s) a corriger : des fonctionnalites seront indisponibles, mais l\'app demarre.'
    : 'BLOQUE : ' + r.bloquants + ' point(s) empechent le demarrage.'));
if (r.resume === 'ok') console.log('Lancer : npm start   puis http://localhost:4360');
console.log('');

process.exit(r.bloquants ? 1 : 0);
