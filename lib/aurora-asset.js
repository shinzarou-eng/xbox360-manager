// Format des fichiers .asset d'Aurora — jaquettes, fonds d'ecran, icones,
// bannieres et captures.
//
// Source : le modele binaire 010 Editor du depot officiel XboxUnity,
// AuroraAssetEditor/AuroraAssetTemplate.bt (MasterRowen & Swizzy). Aucune
// supposition : chaque champ, chaque taille et chaque decalage vient de la.
//
//   en-tete      12 octets   magic, version, taille des donnees
//   table        1608 octets 8 + 25 entrees de 64 octets
//   remplissage  jusqu'a 2048
//   donnees      une image par entree presente, a son propre decalage
//
// Les 25 entrees sont FIXES et dans cet ordre — c'est ce qui permet a Aurora de
// trouver la jaquette sans chercher :
//   0 icone · 1 banniere · 2 jaquette · 3 slot · 4 fond · 5..24 captures 1..20
'use strict';

const ENTETE = 12;
const ENTRÉES = 25;
const TAILLE_ENTREE = 64;          // decalage(4) + taille(4) + info(4) + entete de texture(52)
const TABLE = 8 + ENTRÉES * TAILLE_ENTREE;   // 1608
const BLOC = 2048;                 // les donnees commencent au premier bloc suivant la table

const TYPES = ['ICONE', 'BANNIERE', 'JAQUETTE', 'SLOT', 'FOND'];
for (let i = 1; i <= 20; i++) TYPES.push('CAPTURE_' + i);

// Formats de texture du GPU Xenon (GPUTEXTUREFORMAT). Les valeurs viennent de
// l'enumeration publique de la Xbox 360 ; seules les plus courantes sont nommees.
const FORMATS = {
  0x00: 'DXT1', 0x01: 'DXT2', 0x02: 'DXT3', 0x03: 'DXT4', 0x04: 'DXT5',
  0x06: 'ARGB', 0x07: 'RGBA', 0x08: 'BGRA', 0x0C: 'R5G6B5', 0x0E: 'RGBA',
  0x12: 'X8R8G8B8', 0x13: 'A8R8G8B8', 0x19: 'RGBA16F', 0x20: 'DXN'
};

// Le modele attend 0x52584541. Lu en petit-boutiste, cela correspond aux octets
// « AEXR », alors que le commentaire du modele dit « RXEA » — les deux lectures
// d'une meme constante. On accepte les deux et on DIT laquelle on a vue, au lieu
// de trancher sans preuve : aucun fichier reel n'a encore ete examine.
const MAGICS = { 0x52584541: 'RXEA (modele)', 0x41455852: 'RXEA (texte)' };

function lireAsset(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < ENTETE + TABLE) {
    return { error: 'Fichier trop court pour un .asset : ' + (buf ? buf.length : 0) + ' octets, ' + (ENTETE + TABLE) + ' au minimum' };
  }
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const dataSize = buf.readUInt32LE(8);
  if (!MAGICS[magic]) return { error: 'Magic inattendu 0x' + magic.toString(16).padStart(8, '0') + ' — ce n\'est pas un fichier .asset Aurora', magic: magic.toString(16) };

  const flags = buf.readUInt32LE(12);
  const captures = buf.readUInt32LE(16);
  const entrees = [];
  for (let i = 0; i < ENTRÉES; i++) {
    const p = 20 + i * TAILLE_ENTREE;
    const offset = buf.readUInt32LE(p);
    const size = buf.readUInt32LE(p + 4);
    const extended = buf.readUInt32LE(p + 8);
    // GPU_FETCH_CONSTANT_1 : adresse(20) · politique(1) · pile(1) · taille(2) ·
    // boutisme(2) · format(6). On lit les 6 derniers bits.
    const c1 = buf.readUInt32LE(p + 12 + 28 + 4);
    const dataFormat = (c1 >>> 26) & 0x3f;
    // Size.TwoD : Height sur 13 bits a partir du 6e, puis Width sur 13.
    const c2 = buf.readUInt32LE(p + 12 + 28 + 8);
    const hauteur = (c2 >>> 6) & 0x1fff;
    const largeur = (c2 >>> 19) & 0x1fff;
    entrees.push({
      index: i, type: TYPES[i] || ('TYPE_' + i),
      offset, size, extended,
      largeur, hauteur,
      format: FORMATS[dataFormat] || ('0x' + dataFormat.toString(16)),
      dataFormat,
      // Une entree n'est « presente » que si elle porte des octets ET tombe dans
      // le fichier : un decalage hors bornes signalerait un fichier tronque.
      presente: size > 0 && offset + size <= buf.length
    });
  }
  const declarees = entrees.filter(e => e.size > 0);
  const horsBornes = declarees.filter(e => !e.presente);
  return {
    magic: MAGICS[magic], version, dataSize, flags, screenshotCount: captures,
    entrees,
    presentes: declarees.filter(e => e.presente),
    total: buf.length,
    // Ce qui manque se DIT : un fichier tronque produirait sinon des images
    // silencieusement vides.
    tronque: horsBornes.map(e => e.type)
  };
}

// Ecrit un .asset. La mise en page suit le modele a la lettre, mais ELLE N'A PAS
// ENCORE ETE CONFRONTEE A UN FICHIER REEL : aucun .asset n'a pu etre examine.
// Aucune route ne l'expose tant que ce n'est pas verifie — ecrire un format
// binaire de travers, c'est Aurora qui plante, pas nous.
function ecrireAsset(images) {
  const parts = [];
  const entrees = [];
  let curseur = Math.ceil((ENTETE + TABLE) / BLOC) * BLOC;
  for (let i = 0; i < ENTRÉES; i++) {
    const img = images[i];
    if (!img || !img.data || !img.data.length) { entrees.push({ offset: 0, size: 0 }); continue; }
    entrees.push({ offset: curseur, size: img.data.length, largeur: img.largeur, hauteur: img.hauteur, format: img.format || 0x13 });
    parts.push({ offset: curseur, data: img.data });
    curseur += img.data.length;
  }
  const entete = Buffer.alloc(ENTETE);
  entete.writeUInt32LE(0x52584541, 0);   // la constante du modele
  entete.writeUInt32LE(1, 4);
  entete.writeUInt32LE(curseur, 8);
  const table = Buffer.alloc(TABLE);
  table.writeUInt32LE(0, 0);
  table.writeUInt32LE(0, 4);
  for (let i = 0; i < ENTRÉES; i++) {
    const e = entrees[i], p = 8 + i * TAILLE_ENTREE;
    table.writeUInt32LE(e.offset, p);
    table.writeUInt32LE(e.size, p + 4);
    table.writeUInt32LE(0, p + 8);       // ExtendedInfo : « pointeur, mettre 0 »
    if (!e.size) continue;
    const t = p + 12;
    table.writeUInt32LE(0, t);           // Common
    table.writeUInt32LE(0, t + 4);       // ReferenceCount
    table.writeUInt32LE(0, t + 8);       // Fence
    table.writeUInt32LE(0, t + 12);      // ReadFence
    table.writeUInt32LE(0, t + 16);      // Identifier
    table.writeUInt32LE(0xffff0000, t + 20);  // BaseFlush
    table.writeUInt32LE(0xffff0000, t + 24);  // MipFlush
    // GPU_FETCH_CONSTANT_1 : le format sur les 6 derniers bits.
    table.writeUInt32LE(((e.format & 0x3f) << 26) >>> 0, t + 28 + 4);
    // Size.TwoD : hauteur a partir du 6e bit, largeur a partir du 19e.
    table.writeUInt32LE((((e.largeur & 0x1fff) << 19) | ((e.hauteur & 0x1fff) << 6)) >>> 0, t + 28 + 8);
  }
  const remplissage = Buffer.alloc(Math.ceil((ENTETE + TABLE) / BLOC) * BLOC - (ENTETE + TABLE));
  const morceaux = [entete, table, remplissage];
  for (const p of parts) morceaux.push(p.data);
  return Buffer.concat(morceaux, curseur);
}

module.exports = {
  lireAsset, ecrireAsset,
  TYPES, FORMATS, ENTETE, ENTRÉES, TAILLE_ENTREE, TABLE, BLOC
};
