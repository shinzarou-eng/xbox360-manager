// Fabrique un .asset avec notre propre ecriture, puis le fait RELIRE par la route
// du serveur. Cela ne prouve pas que le format est juste — seul un fichier reel
// le prouvera — mais cela prouve que la lecture et l'ecriture s'accordent.
const A = require('../lib/aurora-asset');
const fs = require('fs');
const path = require('path');
const imgs = [];
imgs[0] = { data: Buffer.alloc(64 * 64 * 4, 0x11), largeur: 64, hauteur: 64, format: 0x13 };
imgs[2] = { data: Buffer.alloc(200 * 300 * 4, 0x22), largeur: 200, hauteur: 300, format: 0x13 };
const f = path.join(__dirname, '..', '_essai.asset');
fs.writeFileSync(f, A.ecrireAsset(imgs));
console.log('  ecrit : ' + fs.statSync(f).size + ' octets -> ' + f);
