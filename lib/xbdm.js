// Client XBDM (Xbox Debug Monitor) — TCP 730, protocole texte.
//
// POURQUOI UNE CONNEXION PAR OPERATION. xbdm.xex est un PLUGIN : il disparait
// des que la console lance un titre ou redemarre — exactement le moment ou
// l'on s'en sert (« magicboot »). Garder une socket ouverte produirait un
// etat « connecte » mensonger au premier lancement. Une connexion coute ~10 ms
// en LAN ; on paie ce prix a chaque commande et il n'y a plus d'etat a faire
// mentir.
//
// PROTOCOLE MESURE : la console envoie une banniere « 201- connected », puis
// chaque commande recoit une ligne « NNN- ... ». Les reponses 202/203 sont
// multi-lignes et se terminent par une ligne « . » — lire une seule ligne
// desynchroniserait la suite, exactement le piege corrige dans lib/ftp.js.
const net = require('net');
const zlib = require('zlib');

const PORT = 730;
const TIMEOUT = 8000;

// Execute `commandes` (une ou un tableau) sur une connexion neuve.
// cb(err, [{ commande, code, lignes }]) — `code` = le numero de statut (200..5xx).
function session(hote, commandes, cb) {
  const liste = Array.isArray(commandes) ? commandes : [commandes];
  const s = net.createConnection({ host: hote, port: PORT });
  let tampon = '';
  let etape = 'banniere';           // banniere -> attente status -> attente multiligne
  let idx = 0;
  const resultats = [];
  let courant = null;
  let fini = false;

  const fin = (e, r) => { if (fini) return; fini = true; try { s.destroy(); } catch {} cb(e, r); };
  const minuteur = setTimeout(() => fin(new Error('XBDM : delai depasse')), TIMEOUT);
  const fin2 = (e, r) => { clearTimeout(minuteur); fin(e, r); };

  const envoyer = () => {
    courant = { commande: liste[idx], code: 0, lignes: [] };
    etape = 'status';
    s.write(liste[idx] + '\r\n');
  };

  s.on('error', e => fin2(new Error('XBDM injoignable : ' + (e.code || e.message))));
  s.on('close', () => fin2(null, resultats));
  s.on('data', d => {
    tampon += d.toString('latin1');
    let p;
    while ((p = tampon.indexOf('\r\n')) >= 0) {
      const ligne = tampon.slice(0, p);
      tampon = tampon.slice(p + 2);
      if (etape === 'banniere') {
        // « 201- connected » : la banniere n'est pas une reponse de commande.
        if (!/^201\b/.test(ligne)) return fin2(new Error('XBDM : banniere inattendue « ' + ligne + ' »'));
        etape = 'idle';
        envoyer();
        continue;
      }
      if (etape === 'status') {
        const m = ligne.match(/^(\d{3})[- ](.*)$/);
        if (!m) return fin2(new Error('XBDM : reponse inattendue « ' + ligne + ' »'));
        courant.code = +m[1];
        courant.lignes.push(m[2]);
        if (courant.code === 202 || courant.code === 203) { etape = 'multi'; continue; }
        resultats.push(courant);
        if (++idx >= liste.length) return fin2(null, resultats);
        envoyer();
        continue;
      }
      // etape === 'multi' : lignes jusqu'au point seul.
      if (ligne === '.') {
        resultats.push(courant);
        if (++idx >= liste.length) return fin2(null, resultats);
        envoyer();
      } else courant.lignes.push(ligne);
    }
  });
}

// Disponibilite : la banniere seule suffit a repondre.
function disponible(hote, cb) {
  session(hote, ['dbgname'], (e, r) => {
    if (e) return cb(null, { disponible: false });
    cb(null, { disponible: true });
  });
}

// Nom de debug + titre en cours + version du moniteur, en une session.
function statut(hote, cb) {
  session(hote, ['dbgname', 'xbeinfo running', 'dmversion'], (e, r) => {
    if (e) return cb(e);
    // Reponses multi-lignes (202/203) : lignes[0] est la mention
    // « multiline response follows », pas une donnee — la premiere ligne utile
    // est celle qui porte un champ.
    const champ = (rep, cle) => {
      const l = (rep.lignes || []).find(x => new RegExp('^' + cle + '=', 'i').test(x));
      return l ? l.slice(cle.length + 1).trim() : '';
    };
    const nom = champ(r[0], 'name') || (r[0].lignes[0] || '').trim();
    // « "\Device\Harddisk0\Partition1\Aurora\Aurora.xex" » — le titre en cours est
    // un chemin NT entre guillemets ; personne ne veut lire ca, le nom du fichier
    // suffit.
    const brut = champ(r[1], 'name').replace(/^"|"$/g, '');
    const titre = brut.split(/[\\/]/).pop().replace(/\.(xex|xbe)$/i, '');
    const version = (r[2].lignes[0] || '').trim();
    cb(null, {
      disponible: true,
      nom: nom || 'Xbox 360',
      titre: titre || '',
      version
    });
  });
}

// magicboot : lance un xex/xbe. `froid` = reboot complet de la console.
// SANS `debug` par defaut : le lancement debogueur attache le moniteur au
// titre, ce qui est fait pour une session de debug — mesure sur console, le
// framebuffer capture reste noir sous ce mode. « Lancer » = un lancement
// normal, `debug:true` reste dispo pour qui veut le moniteur attache.
function magicboot(hote, chemin, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  const cmd = opts.froid ? 'magicboot cold'
    : 'magicboot title="' + chemin + '"' + (opts.debug ? ' debug' : '');
  session(hote, [cmd], (e, r) => {
    if (e) return cb(e);
    // 200 = le titre part ; la connexion meurt ensuite puisque xbdm quitte.
    if (r[0].code >= 400) {
      // Repli classique : certains titres refusent le lancement simple, on
      // tente alors en mode debug attache.
      if (opts.debug !== true && !opts.froid) return magicboot(hote, chemin, { debug: true }, cb);
      return cb(new Error(r[0].lignes.join(' ') || 'magicboot refuse (' + r[0].code + ')'));
    }
    cb(null, r[0]);
  });
}

// screenshot name="Hdd1:\x.bmp" ecrit le BMP SUR LA CONSOLE — le rapatriement
// est l'affaire de l'appelant (FTP), pas du protocole.
function screenshot(hote, cheminConsole, cb) {
  session(hote, ['screenshot name="' + cheminConsole + '"'], (e, r) => {
    if (e) return cb(e);
    if (r[0].code >= 400) return cb(new Error(r[0].lignes.join(' ') || 'screenshot refuse (' + r[0].code + ')'));
    cb(null, r[0]);
  });
}

// ======================================================================
// CAPTURE D'ECRAN — la variante sans `name=` ne touche PAS le disque :
//   « 203- binary response follows »
//   « pitch=0x1400 width=0x500 height=0x2d0 format=.. framebuffersize=0x3c0000 sw=.. sh=.. »
//   <framebuffersize octets BRUTS>
// Le flux est le framebuffer GPU, tile Xenos en blocs de 32x32 px — illisible
// tel quel (bandes). On recoit donc en BINAIRE (pas en latin1 : un pixel
// peut contenir CR/LF), puis on detile.
// ======================================================================
const TIMEOUT_SHOT = 20000; // ~4 Mo en LAN, mais la console peut etre occupee.

function captureEcran(hote, cb) {
  const s = net.createConnection({ host: hote, port: PORT });
  let buf = Buffer.alloc(0);
  let etape = 'banniere'; // banniere -> status -> meta -> pixels
  let meta = null;
  let fini = false;
  let minuteur;
  const fin = (e, r) => { if (fini) return; fini = true; clearTimeout(minuteur); try { s.destroy(); } catch {} cb(e, r); };
  const armer = () => { clearTimeout(minuteur); minuteur = setTimeout(() => fin(new Error('XBDM : delai depasse (capture)')), TIMEOUT_SHOT); };
  armer();
  s.on('error', e => fin(new Error('XBDM injoignable : ' + (e.code || e.message))));
  s.on('close', () => fin(new Error('XBDM : connexion fermee pendant la capture')));
  s.on('data', d => {
    armer(); // chaque trame prouve que la console repond — le flux est vivant.
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (etape === 'pixels') {
        if (buf.length < meta.taille) return;
        return fin(null, { meta, framebuffer: buf.slice(0, meta.taille) });
      }
      const p = buf.indexOf('\r\n');
      if (p < 0) return;
      const ligne = buf.slice(0, p).toString('latin1');
      buf = buf.slice(p + 2);
      if (etape === 'banniere') {
        if (!/^201\b/.test(ligne)) return fin(new Error('XBDM : banniere inattendue « ' + ligne + ' »'));
        etape = 'status';
        s.write('screenshot\r\n');
      } else if (etape === 'status') {
        const m = ligne.match(/^(\d{3})[- ](.*)$/);
        if (!m) return fin(new Error('XBDM : reponse inattendue « ' + ligne + ' »'));
        if (+m[1] !== 203) return fin(new Error('screenshot refuse (' + m[1] + ') ' + m[2]));
        etape = 'meta';
      } else if (etape === 'meta') {
        const hex = k => { const mm = ligne.match(new RegExp(k + '=0x([0-9a-fA-F]+)')); return mm ? parseInt(mm[1], 16) : 0; };
        meta = {
          pitch: hex('pitch'), largeur: hex('width'), hauteur: hex('height'),
          taille: hex('framebuffersize'), sw: hex('sw') || hex('width'),
          sh: hex('sh') || hex('height')
        };
        if (!meta.taille || !meta.pitch || !meta.hauteur) return fin(new Error('XBDM : metadonnees screenshot incompletes'));
        etape = 'pixels';
      }
    }
  });
}

// Detile Xenos (algorithme de Xenia — texture_address::Tiled2D).
// Adresse d'un pixel = bits entrelaces : macro-tuile 32x32, intra-tuile en
// y[3:1]·x[2:0], entrelacement banque/pipe memoire, LSB de y en bit 4.
// `pitchPx` = pitch en PIXELS (octets/4) ; la surface est cadree sur cette
// largeur, pas sur la largeur visible.
function detileXenos(fb, pitchPx, hauteur) {
  const aw = (pitchPx + 31) & ~31;
  const mtr = aw >> 5;
  const brut = new Uint32Array(fb.buffer, fb.byteOffset, fb.length >> 2);
  const nbSrc = brut.length;
  const out = Buffer.alloc(pitchPx * hauteur * 4);
  const dst = new Uint32Array(out.buffer);
  for (let y = 0; y < hauteur; y++) {
    const ylsb = y & 1, banque = (y >> 4) & 1;
    const yb = (y >> 5) * mtr;
    const yl = ((y >> 1) & 7) << 3;
    const base = y * pitchPx;
    for (let x = 0; x < pitchPx; x++) {
      const oib = (((yb + (x >> 5)) << 6) | (yl | (x & 7))) << 2;
      const pipe = ((x >> 3) & 3) ^ (((y >> 3) & 1) << 1);
      const octet = (oib & 0xF) | (ylsb << 4) | (((oib >> 4) & 1) << 5) |
        (pipe << 6) | (((oib >> 5) & 7) << 8) | (banque << 11) | ((oib >> 8) << 12);
      const si = octet >> 2;
      dst[base + x] = si < nbSrc ? brut[si] : 0;
    }
  }
  return out;
}

// ---- PNG minimal : zlib natif + CRC32 maison, RGB 8 bits, filtre 0. ----
let crcTab;
function crc32(buf) {
  if (!crcTab) {
    crcTab = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      crcTab[n] = c;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTab[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function morceauPng(type, data) {
  const t = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  t.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return out;
}
// bgra = pixels BGRA lineaires ; on jette l'alpha, la console rend opaque.
function versPng(bgra, w, h) {
  const pas = w * 3 + 1;
  const brut = Buffer.alloc(pas * h);
  for (let y = 0; y < h; y++) {
    const lo = y * pas;
    brut[lo] = 0;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = lo + 1 + x * 3;
      brut[d] = bgra[s]; brut[d + 1] = bgra[s + 1]; brut[d + 2] = bgra[s + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    morceauPng('IHDR', ihdr),
    morceauPng('IDAT', zlib.deflateSync(brut, { level: 6 })),
    morceauPng('IEND', Buffer.alloc(0))
  ]);
}

// Capture complete : framebuffer tile -> image PNG aux dimensions d'affichage.
// Le framebuffer peut etre plus petit que l'ecran (1280x720 sur une sortie
// 1080p) : l'agrandissement nearest-neighbour reproduit ce que fait la
// console. cb(err, { png, largeur, hauteur }).
function photoEcran(hote, cb) {
  captureEcran(hote, (e, r) => {
    if (e) return cb(e);
    try {
      const m = r.meta;
      const pitchPx = m.pitch >> 2;
      const lin = detileXenos(r.framebuffer, pitchPx, m.hauteur);
      const sw = m.sw || m.largeur, sh = m.sh || m.hauteur;
      // Decoupe la largeur visible (pitch >= largeur) puis redimensionne.
      const vis = Buffer.alloc(sw * sh * 4);
      for (let y = 0; y < sh; y++) {
        const sy = Math.min(m.hauteur - 1, (y * m.hauteur / sh) | 0);
        for (let x = 0; x < sw; x++) {
          const sx = Math.min(m.largeur - 1, (x * m.largeur / sw) | 0);
          lin.copy(vis, (y * sw + x) * 4, (sy * pitchPx + sx) * 4, (sy * pitchPx + sx) * 4 + 4);
        }
      }
      cb(null, { png: versPng(vis, sw, sh), largeur: sw, hauteur: sh });
    } catch (e2) { cb(e2); }
  });
}

module.exports = { session, disponible, statut, magicboot, screenshot, captureEcran, detileXenos, versPng, photoEcran, PORT };
