// Empaquette des PNG en un seul fichier .ico, sans aucune dependance.
//
// POURQUOI CE SCRIPT EXISTE. Windows demande une icone pour la fenetre, la barre
// des taches, la zone de notification et le raccourci. Le format `.ico` accepte
// des images PNG telles quelles depuis Windows Vista : il suffit donc d'un
// en-tete et d'une entree par taille, sans encodeur d'image.
//
// POURQUOI PLUSIEURS TAILLES. Une seule image de 256 px, reduite par Windows,
// donne une icone molle a 16 px (barre des taches) et illisible a 20 px (menu
// Demarrer). Six tailles donnent a Windows l'image qu'il faut, a la taille qu'il
// faut.
//
// Usage :
//   node desktop/assets/ico.js <sortie.ico> <image.png> [<image.png> ...]
// La taille de chaque PNG est LUE DANS SON EN-TETE (IHDR), jamais devinee d'un
// nom de fichier.
'use strict';
const fs = require('fs');
const path = require('path');

function taillePng(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error('ce n\'est pas un PNG');
  }
  return { largeur: buf.readUInt32BE(16), hauteur: buf.readUInt32BE(20) };
}

function empaqueter(sortie, chemins) {
  const images = chemins.map(c => {
    const buf = fs.readFileSync(c);
    const { largeur, hauteur } = taillePng(buf);
    return { buf, largeur, hauteur, nom: path.basename(c) };
  });
  // Les plus petites d'abord : c'est l'ordre que produisent les outils usuels, et
  // un lecteur qui prend la premiere entree trouve alors la plus lisible.
  images.sort((a, b) => a.largeur - b.largeur);

  const entete = Buffer.alloc(6 + 16 * images.length);
  entete.writeUInt16LE(0, 0);              // reserve
  entete.writeUInt16LE(1, 2);              // type 1 = icone
  entete.writeUInt16LE(images.length, 4);

  let decalage = entete.length;
  images.forEach((im, i) => {
    const e = 6 + 16 * i;
    // 0 veut dire 256 : la largeur tient sur UN OCTET, et 256 n'y entre pas.
    entete.writeUInt8(im.largeur >= 256 ? 0 : im.largeur, e);
    entete.writeUInt8(im.hauteur >= 256 ? 0 : im.hauteur, e + 1);
    entete.writeUInt8(0, e + 2);           // nombre de couleurs (0 = vrai couleur)
    entete.writeUInt8(0, e + 3);           // reserve
    entete.writeUInt16LE(1, e + 4);        // plans
    entete.writeUInt16LE(32, e + 6);       // bits par pixel
    entete.writeUInt32LE(im.buf.length, e + 8);
    entete.writeUInt32LE(decalage, e + 12);
    decalage += im.buf.length;
    console.log('  ' + im.largeur + 'x' + im.hauteur + '  ' + im.nom + '  (' + im.buf.length + ' octets)');
  });

  fs.writeFileSync(sortie, Buffer.concat([entete, ...images.map(i => i.buf)]));
  console.log('ecrit : ' + sortie + ' (' + fs.statSync(sortie).size + ' octets, ' + images.length + ' tailles)');
}

const [sortie, ...entrees] = process.argv.slice(2);
if (!sortie || !entrees.length) {
  console.error('Usage : node desktop/assets/ico.js <sortie.ico> <image.png> ...');
  process.exit(1);
}
empaqueter(sortie, entrees);
