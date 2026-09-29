// Tests de lib/wallpaper.js — le fond d'ecran de Windows, source de la couche Mica.
//
// Ce module ne touche au disque que par l'`io` qu'on lui passe : ces tests
// s'executent donc sans Windows, sans dossier `Themes`, et sans qu'un fond
// d'ecran existe. C'est ce qui permet d'exercer les cas qu'on ne peut PAS
// provoquer sur une machine de developpement : fichier absent, fichier
// verrouille, fichier qui n'est pas une image.
const test = require('node:test');
const assert = require('node:assert');

const W = require('../lib/wallpaper');

// Un JPEG minimal : juste de quoi lire la signature.
const jpeg = (n = 64) => { const b = Buffer.alloc(n); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return b; };

// Un faux systeme de fichiers : on compte les lectures pour pouvoir verifier
// qu'un cache sert vraiment a quelque chose.
function fauxIo(fichiers) {
  const lus = [];
  return {
    lus,
    statSync(f) { const e = fichiers[f]; if (!e) throw new Error('ENOENT'); return { isFile: () => e.isFile !== false, size: e.buf.length, mtimeMs: e.mtimeMs || 1000 }; },
    readFileSync(f) { const e = fichiers[f]; if (!e || e.illisible) throw new Error('EBUSY'); lus.push(f); return e.buf; }
  };
}
const ENV = { APPDATA: 'C:\\Users\\x\\AppData\\Roaming' };
const CHEMIN = W.cheminFond(ENV);

test('wallpaper : le type se lit dans les OCTETS, pas dans le nom', () => {
  // `TranscodedWallpaper` n'a AUCUNE extension : un module qui se fierait au nom
  // ne saurait pas quoi annoncer, et le navigateur refuserait l'image.
  assert.strictEqual(W.typeImage(jpeg()), 'image/jpeg');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
  assert.strictEqual(W.typeImage(png), 'image/png');
  const riff = Buffer.alloc(16); riff.write('RIFF', 0, 'latin1'); riff.write('WEBP', 8, 'latin1');
  assert.strictEqual(W.typeImage(riff), 'image/webp');
  assert.strictEqual(W.typeImage(Buffer.concat([Buffer.from('GIF8'), Buffer.alloc(12)])), 'image/gif');
});

test('wallpaper : des octets inconnus ou tronques ne sont pas une image', () => {
  // La mutation qui compte : accepter n'importe quoi ferait servir 400 Ko de
  // n'importe quoi avec un en-tete `image/jpeg`, et le navigateur afficherait une
  // image cassee SANS que rien ne le signale.
  assert.strictEqual(W.typeImage(Buffer.from('ceci nest pas une image du tout')), null);
  assert.strictEqual(W.typeImage(Buffer.alloc(4)), null);
  assert.strictEqual(W.typeImage(null), null);
});

test('wallpaper : sans APPDATA il n y a pas de fond, et ce n est pas une erreur', () => {
  // Cas Linux, et cas d'un environnement ou APPDATA a ete vide : on rend `null`,
  // l'application retombe sur sa couleur de base. Lever ici ferait planter le
  // serveur au demarrage pour une histoire de fond d'ecran.
  assert.strictEqual(W.cheminFond({}), null);
  assert.strictEqual(W.cheminFond(null), null);
  assert.match(W.cheminFond({ APPDATA: '/home/x/.config' }), /Themes[\\/]TranscodedWallpaper$/);
});

test('wallpaper : le chemin suit celui que Windows compose', () => {
  assert.match(CHEMIN, /Microsoft[\\/]Windows[\\/]Themes[\\/]TranscodedWallpaper$/);
});

test('wallpaper : un fond absent rend null au lieu de lever', () => {
  assert.strictEqual(W.lire(fauxIo({}), ENV, null), null);
});

test('wallpaper : le fond n est relu que s il a change', () => {
  const io = fauxIo({ [CHEMIN]: { buf: jpeg() } });
  const un = W.lire(io, ENV, null);
  assert.strictEqual(un.type, 'image/jpeg');
  assert.strictEqual(un.taille, 64);
  const deux = W.lire(io, ENV, un);
  assert.strictEqual(deux, un, 'la meme cle doit rendre le meme objet, sans relire');
  assert.strictEqual(io.lus.length, 1, 'le fichier a ete relu alors qu il n avait pas bouge');

  // Le fond change (diaporama, « image suivante ») : la DATE bouge, donc on relit.
  const io2 = fauxIo({ [CHEMIN]: { buf: jpeg(80), mtimeMs: 2000 } });
  const trois = W.lire(io2, ENV, un);
  assert.notStrictEqual(trois, un);
  assert.strictEqual(trois.taille, 80, 'un fond plus recent doit etre relu');
});

test('wallpaper : la taille ET la date comptent dans la cle de cache', () => {
  // Une cle qui ne regarderait que l'un des deux servirait l'ancien fond quand
  // deux images de meme taille se succedent, ou l'inverse.
  assert.notStrictEqual(W.cleCache({ size: 10, mtimeMs: 1000 }), W.cleCache({ size: 11, mtimeMs: 1000 }));
  assert.notStrictEqual(W.cleCache({ size: 10, mtimeMs: 1000 }), W.cleCache({ size: 10, mtimeMs: 2000 }));
});

test('wallpaper : un fichier illisible garde le dernier fond connu', () => {
  // Windows verrouille le fichier quelques millisecondes pendant un changement de
  // fond. Rendre `null` ferait disparaitre la couche Mica pour toute la session,
  // alors que le fond precedent etait bon.
  const bon = W.lire(fauxIo({ [CHEMIN]: { buf: jpeg() } }), ENV, null);
  const io = fauxIo({ [CHEMIN]: { buf: jpeg(), mtimeMs: 5000, illisible: true } });
  assert.strictEqual(W.lire(io, ENV, bon), bon);
  // Mais sans fond precedent, il n'y a rien a garder.
  assert.strictEqual(W.lire(io, ENV, null), null);
});

test('wallpaper : un fichier vide ou non reconnu ne se sert pas', () => {
  assert.strictEqual(W.lire(fauxIo({ [CHEMIN]: { buf: Buffer.alloc(0) } }), ENV, null), null);
  assert.strictEqual(W.lire(fauxIo({ [CHEMIN]: { buf: Buffer.from('pas une image, mais 12 octets ou plus') } }), ENV, null), null);
});
