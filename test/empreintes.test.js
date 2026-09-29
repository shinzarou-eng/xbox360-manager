// test/empreintes.test.js
//
// LES SEULS FAITS QUE L'APPLICATION PEUT PROUVER. Ce fichier fixe ce que le
// module d'empreintes calcule, et surtout ce qu'il REFUSE de calculer : une
// empreinte partielle n'est pas une identite, et un fichier vide a une empreinte
// parfaitement valide (SHA1("") = da39a3ee…).
//
// Les vecteurs de reference sont des MESURES du 2026-09-24 sous Node v26.5.1,
// pas une memoire recopiee.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const E = require('../lib/empreintes');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'empreintes-'));
const nettoie = d => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} };

test('vecteurs de reference SHA-1 et MD5', () => {
  assert.strictEqual(E.sha1Tampon(Buffer.from('')), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
  assert.strictEqual(E.md5Tampon(Buffer.from('')), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.strictEqual(E.sha1Tampon(Buffer.from('abc')), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.strictEqual(E.md5Tampon(Buffer.from('abc')), '900150983cd24fb0d6963f7d28e17f72');
  assert.strictEqual(E.sha1Tampon(Buffer.from('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
    '84983e441c3bd26ebaae4aa1f95129e5e54670f1');
  // Le million de « a » : le vecteur long, celui qui exerce le remplissage des
  // blocs. La valeur est celle publiee, pas une valeur produite par ce module.
  assert.strictEqual(E.sha1Tampon(Buffer.alloc(1000000, 0x61)), '34aa973cd4c4daa4f61eeb2bdbad27316534016f');
});

test('md5 est fourni par ce moteur (mesure, pas memoire)', () => {
  // En mode FIPS, `createHash('md5')` est REFUSE. Node v26.5.1 le fournit : c'est
  // mesure ici, et `verdict()` traite l'indisponibilite comme `inconnu` — une
  // capacite manquante n'est pas une divergence.
  assert.strictEqual(E.md5Disponible(), true);
});

test('hachage en flux = hachage d un coup, et `complet` dit vrai sur le fichier entier', async () => {
  const d = tmp();
  try {
    const f = path.join(d, 'temoin.bin');
    const buf = crypto.randomBytes(3 * 1024 * 1024 + 7);   // ni un multiple du morceau, ni petit
    fs.writeFileSync(f, buf);
    const r = await E.sha1Flux(f, { tailleMorceau: 512 * 1024 });
    assert.strictEqual(r.valeur, E.sha1Tampon(buf), 'le calcul par morceaux doit etre identique');
    assert.strictEqual(r.octets, buf.length);
    assert.strictEqual(r.taille, buf.length);
    assert.strictEqual(r.debut, 0);
    assert.strictEqual(r.complet, true, 'debut 0 + fin du fichier = le fichier entier');
  } finally { nettoie(d); }
});

test('un fichier vide a une empreinte VALIDE et `complet` FAUX', async () => {
  const d = tmp();
  try {
    const f = path.join(d, 'vide.bin');
    fs.writeFileSync(f, Buffer.alloc(0));
    const r = await E.sha1Flux(f);
    assert.strictEqual(r.valeur, 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
    assert.strictEqual(r.octets, 0);
    assert.strictEqual(r.complet, false, 'le SHA-1 d un fichier vide est valide : seul `total > 0` l attrape');
  } finally { nettoie(d); }
});

test('l intervalle compte : un flux repris ne rend jamais `complet`', async () => {
  const d = tmp();
  try {
    const f = path.join(d, 'partiel.bin');
    fs.writeFileSync(f, Buffer.alloc(4096, 9));
    const r = await E.sha1Flux(f, { debut: 1024 });
    assert.strictEqual(r.octets, 3072, 'on ne relit pas le debut');
    assert.strictEqual(r.complet, false, 'un intervalle [1024, fin) n est pas le fichier');
    assert.strictEqual(r.valeur, E.sha1Tampon(Buffer.alloc(3072, 9)), 'l empreinte couvre l intervalle, pas le fichier');
  } finally { nettoie(d); }
});

test('la progression est monotone et finit a la taille', async () => {
  const d = tmp();
  try {
    const f = path.join(d, 'prog.bin');
    fs.writeFileSync(f, Buffer.alloc(4096, 1));
    const vus = [];
    await E.sha1Flux(f, { tailleMorceau: 256, onProgress: p => vus.push(p.octets) });
    assert.ok(vus.length > 1, 'une progression qui ne rend qu un point ne mesure rien');
    for (let i = 1; i < vus.length; i++) assert.ok(vus[i] >= vus[i - 1], 'la progression ne recule pas');
    assert.strictEqual(vus[vus.length - 1], 4096, 'elle finit a la taille');
  } finally { nettoie(d); }
});

test('l annulation rend la main et ne rend PAS de valeur', async () => {
  const d = tmp();
  try {
    const f = path.join(d, 'gros.bin');
    fs.writeFileSync(f, Buffer.alloc(4 * 1024 * 1024, 3));
    const ac = new AbortController();
    const p = E.sha1Flux(f, { tailleMorceau: 64 * 1024, signal: ac.signal, onProgress: () => ac.abort() });
    await assert.rejects(() => p, e => e.code === 'ANNULE',
      'une tache annulee ne produit pas d empreinte utilisable');
  } finally { nettoie(d); }
});
