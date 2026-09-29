// lib/empreintes.js
//
// LES EMPREINTES : ce que l'application peut PROUVER d'un fichier, et contre quoi.
//
// Le probleme que ce module resout : l'application comparait des TAILLES, jamais
// un octet a une reference. Un fichier substitue, une archive alteree, un
// transfert qui a « reussi » sur les mauvais octets passaient sans un mot.
//
// Trois couches, JAMAIS confondues :
//   1. conforme-redump  : une empreinte du catalogue Redump (les bits du disque)
//   2. conforme-source  : l'empreinte annoncee par la source du telechargement
//   3. propre-calcule   : une empreinte calculee par l'app a un instant anterieur
// Un quatrieme niveau dit ce qu'on ne sait pas (`inconnu`), un cinquieme dit
// qu'une attendue CONNUE differe (`ecart`).
//
// ZERO DEPENDANCE : node:crypto pour hacher, node:zlib pour lire une archive.
// Le module ne connait ni `cfg`, ni la file, ni la bibliotheque : il recoit un
// chemin et rend des faits.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

// Le MEME highWaterMark que `crc32Fichier` (lib/fsutil.js:130) : une archive de
// 8 Go ne tient pas en memoire, et la hacher ne doit pas faire tomber le serveur.
const MORCEAU = 4 * 1024 * 1024;

function sha1Tampon(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }
function md5Tampon(buf) { return crypto.createHash('md5').update(buf).digest('hex'); }

let _md5 = null;
// `createHash('md5')` peut etre REFUSE par une construction de Node en mode FIPS :
// on le mesure UNE fois, et le verdict en tire `inconnu`, jamais `ecart`.
function md5Disponible() {
  if (_md5 === null) {
    try { crypto.createHash('md5').update('x').digest(); _md5 = true; }
    catch (e) { _md5 = false; }
  }
  return _md5;
}

function erreurAnnule() { const e = new Error('Verification annulee'); e.code = 'ANNULE'; return e; }

// Le debit, calcule la ou il est mesure : une barre qui recule est un mensonge de
// plus, et une vitesse figee sur un disque USB lent fait croire a une panne.
function debit(octets, t0) { return Math.round(octets / Math.max(0.001, (Date.now() - t0) / 1000)); }

// LE MOTIF DE `crc32Fichier` (lib/fsutil.js:127), ligne pour ligne : un
// createReadStream avec un highWaterMark explicite, un etat accumule entre les
// morceaux, une promesse, l'erreur propagee. Ce qui change est l'algorithme :
// `createHash` est incremental par nature, donc le repli manuel de
// `crc32(buf, depart)` n'a pas lieu d'etre.
//
// `debut`/`fin` existent parce qu'un transfert REPRIS ne relit pas le debut : son
// empreinte couvre [have, total), et `complet` est le seul endroit qui le dit.
function flux(algo, chemin, opts) {
  const o = opts || {};
  return new Promise((resoudre, rejeter) => {
    let taille;
    try { taille = fs.statSync(chemin).size; } catch (e) { return rejeter(e); }
    let h;
    try { h = crypto.createHash(algo); }
    catch (e) { e.code = e.code || 'ALGO_INDISPONIBLE'; return rejeter(e); }
    const debut = o.debut || 0;
    const fin = (o.fin === undefined || o.fin === null) ? taille - 1 : o.fin;
    const vise = Math.max(0, fin - debut + 1);
    const t0 = Date.now();
    let octets = 0, termine = false, lecture = null;
    const acheve = (err, val) => {
      if (termine) return;
      termine = true;
      if (o.signal && lecture) o.signal.removeEventListener('abort', surAnnulation);
      if (err) rejeter(err); else resoudre(val);
    };
    function surAnnulation() {
      try { if (lecture) lecture.destroy(); } catch (e) {}
      acheve(erreurAnnule());
    }
    if (o.signal && o.signal.aborted) return acheve(erreurAnnule());
    if (taille === 0) {
      return acheve(null, { valeur: h.digest('hex'), octets: 0, taille: 0, debut: 0, fin: -1, complet: false });
    }
    lecture = fs.createReadStream(chemin, { start: debut, end: fin, highWaterMark: o.tailleMorceau || MORCEAU });
    if (o.signal) o.signal.addEventListener('abort', surAnnulation);
    lecture.on('data', d => {
      if (termine) return;
      h.update(d); octets += d.length;
      if (o.onProgress) o.onProgress({ octets: octets, total: vise, debit: debit(octets, t0) });
    });
    lecture.on('error', e => acheve(e));
    lecture.on('end', () => acheve(null, {
      valeur: h.digest('hex'), octets: octets, taille: taille, debut: debut, fin: fin,
      // `complet` est un FAIT, pas une convention : le flux part de l'octet 0,
      // l'intervalle va jusqu'a la fin du fichier, et le fichier n'est pas vide.
      complet: debut === 0 && fin === taille - 1 && octets === taille && taille > 0
    }));
  });
}

function sha1Flux(chemin, opts) { return flux('sha1', chemin, opts); }
function md5Flux(chemin, opts) { return flux('md5', chemin, opts); }

module.exports = { sha1Flux, md5Flux, sha1Tampon, md5Tampon, md5Disponible, MORCEAU };
