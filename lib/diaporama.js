'use strict';
// QUELS JEUX ENTRENT DANS LE DIAPORAMA.
//
// `/api/games` rend la bibliotheque, mais ne dit PAS quels jeux ont une
// jaquette : c'est le serveur qui teste `covers/<tid>.jpg`. Faire ce test dans
// la page supposerait un appel par jeu, et le faire dans le tableau pollé toutes
// les huit secondes ferait un `stat` par jeu a chaque sondage. D'ou cette route
// dediee, appelee une fois, a l'ouverture.
//
// Ce module est PUR : il ne touche au disque que par l'`io` qu'on lui passe, et
// ne connait ni le reseau ni l'interface. Ses tests s'executent donc sans
// dossier `covers`, et sans qu'aucune jaquette existe.

// `_custom` est une jaquette CHOISIE par l'utilisateur : elle compte, et c'est
// meme celle qui doit gagner. `_sm` est la vignette de liste — la garder ferait
// entrer des jeux dont la seule image est une miniature.
const JAQUETTE = /^([0-9A-Fa-f]{8})(?:_custom)?\.jpg$/;

function avecJaquette(jeux, jaquettes) {
  const dispo = jaquettes instanceof Set ? jaquettes : new Set(jaquettes || []);
  const out = [];
  for (const g of jeux || []) {
    const tid = String((g && g.tid) || '').toUpperCase();
    // Un tid absent ou « - » designe un jeu sans identifiant : il ne peut pas
    // avoir de jaquette, et une jaquette nommee « -.jpg » ne doit pas l'y faire
    // entrer.
    if (!/^[0-9A-F]{8}$/.test(tid)) continue;
    if (!dispo.has(tid)) continue;
    out.push({ tid, name: g.name, size: g.size });
  }
  return out;
}

// La cle de cache : la DATE du dossier, seule. C'est le signal que le systeme de
// fichiers met a jour des qu'une entree apparait ou disparait, et c'est le SEUL
// qu'on puisse lire SANS relire le dossier — or relire est exactement ce que ce
// cache doit eviter. Y joindre le nombre d'entrees rendait la comparaison vaine :
// compter les entrees demande le `readdir` que le cache existe pour economiser.
function listeJaquettes(io, dossier, cache) {
  let st;
  try {
    st = io.statSync(dossier);
  } catch {
    // Pas de dossier `covers` : l'application continue, le diaporama sera vide
    // et le dira. Lever ici ferait echouer la route pour une histoire d'images.
    return { tids: new Set(), cle: 'absent' };
  }
  const cle = String(Math.round(st.mtimeMs));
  if (cache && cache.cle === cle) return cache;
  let noms;
  try {
    noms = io.readdirSync(dossier);
  } catch {
    // Le dossier a disparu entre le `stat` et la lecture, ou n'est pas lisible :
    // meme reponse que s'il n'avait jamais existe.
    return { tids: new Set(), cle: 'absent' };
  }
  const tids = new Set();
  for (const n of noms) {
    const m = JAQUETTE.exec(n);
    if (m) tids.add(m[1].toUpperCase());
  }
  return { tids, cle };
}

module.exports = { avecJaquette, listeJaquettes };
