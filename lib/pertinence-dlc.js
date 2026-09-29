'use strict';
// Pertinence des DLC — logique pure, partagee et testable.
//
// Un DLC se cherche a partir du NOM DU JEU, et la correspondance doit etre
// stricte. L'ancienne regle cherchait en SOUS-CHAINE et exigeait tous les mots du
// nom complet, ce qui donnait les DEUX erreurs a la fois :
//
//   - « Alan Wake » ramenait « Alan Wakes American Nightmare » : ce n'est pas un
//     DLC, c'est un autre jeu, et « wake » suffisait a le faire passer ;
//   - « Fable II: Game of the Year Edition » ne ramenait RIEN, alors que ses DLC
//     sont dans les collections : « game », « of », « the », « year » et
//     « edition » ne figurent dans aucun nom de fichier.
//
// Trois regles, verifiees sur les 9162 fichiers des collections reelles :
//
//   1. MOTS ENTIERS, chiffres compris. « Halo 3 » passe de 26 a 7 resultats, et
//      les 7 sont bien du 3 (avant : Halo 1, 4, Wars, Reach).
//   2. Chiffres et chiffres romains confondus. « Fable II » et « Fable.2 »
//      designent le meme jeu, et les collections n'ecrivent pas pareil.
//   3. TOUS les mots, PUIS relachement. Un nom a prefixe de studio
//      (« Tom Clancy's Rainbow Six Vegas 2 ») ne doit pas tout perdre : on retire
//      les mots de tete un par un, et on s'arrete des que ca rend quelque chose.
//      C'est ce qui permet d'etre strict sans devenir muet.

const { MOTS_DISQUE } = require('./pkg');

// Mots qui ne decident rien dans un nom de fichier de collection. Plus large que
// la liste du client : les noms de FICHIERS portent « DLC », « Addon », « Pack »
// et les suffixes de la scene (« RF », « ZTM »), qu'un titre de jeu n'a pas.
const MOTS_LIES = new Set([
  'the', 'of', 'and', 'for', 'with', 'edition', 'version', 'complete',
  'game', 'year', 'goty', 'dlc', 'addon', 'content', 'pack',
  'le', 'la', 'les', 'des', 'du', 'une', 'aux', 'pour', 'avec', 'jeu',
  'xbox', '360', 'rf', 'ztm', 'world',
]);

// Un chiffre romain et un chiffre arabe sont le meme episode. Le X est ambigu
// (« Mega Man X »), mais les collections ecrivent les suites en romain.
const ROMAIN = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };

// Les mots qui decident, dans l'ordre du nom. Les nombres sont gardes meme s'ils
// ne font qu'un caractere : c'est eux qui distinguent Halo 3 de Halo 4.
//
// « Disc 2 » est retire AVEC son numero : c'est un SUPPORT, pas le jeu. Sans cela,
// un jeu multi-disque ne trouvait plus aucun DLC — aucun nom de pack ne contient
// « disc » — alors que le meme nom sans le suffixe en trouvait.
function motsSignificatifs(s) {
  const brut = String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    .map(w => ROMAIN[w] || w);
  const out = [];
  for (let i = 0; i < brut.length; i++) {
    const w = brut[i];
    // « Disc 2 » : le mot ET le numero qui suit.
    if (MOTS_DISQUE.has(w)) { i++; continue; }
    // « CD1 » : mot et numero colles, il n'y a rien a sauter apres.
    if (/^(?:disc|disk|cd|dvd|disque)\d+$/.test(w)) continue;
    if ((!MOTS_LIES.has(w) && w.length > 1) || /^\d+$/.test(w)) out.push(w);
  }
  return out;
}

function tokensDe(s) {
  return new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(w => ROMAIN[w] || w));
}

function contientTous(nom, mots) {
  const t = tokensDe(nom);
  for (const w of mots) if (!t.has(w)) return false;
  return true;
}

// Combien de mots de la recherche le nom porte-t-il ? Sert aux bundles, dont les
// fichiers n'ont pas toujours un nom exploitable (« Disc 1.rar », une empreinte).
function nbMots(nom, mots) {
  const t = tokensDe(nom);
  let n = 0;
  for (const w of mots) if (t.has(w)) n++;
  return n;
}

// Paliers de recherche, du plus strict au plus large. Un TitleID ne se relache
// pas : ce n'est pas un nom, on ne va pas en essayer des fragments.
//
// On retire les mots UN PAR UN en commencant par la FIN : les descripteurs de
// version sont en fin de nom (« Multiplayer », « Bonus Disc », « Limited
// Edition »), pas au debut. Deux mots retires au maximum — au-dela, on ne
// cherche plus le meme jeu.
function paliers(q, relaxable) {
  const mots = motsSignificatifs(q);
  if (!mots.length) return [];
  if (relaxable === false || /^[0-9a-f]{8}$/.test(String(q).trim().toLowerCase())) return [mots];
  const n = mots.length;
  const out = [mots];
  for (let i = n - 1; i >= 0; i--) out.push(mots.filter((_, k) => k !== i));
  for (let i = n - 1; i > 0; i--) for (let j = i - 1; j >= 0; j--) out.push(mots.filter((_, k) => k !== i && k !== j));
  return out;
}

// Le meilleur palier pour une liste de noms : le plus strict qui rend quelque
// chose, APRES affinage. Renvoie les mots gagnants (vides si rien ne passe) et
// les noms retenus.
function meilleurPalier(noms, q, relaxable) {
  for (const mots of paliers(q, relaxable)) {
    const gardes = noms.filter(n => contientTous(n, mots));
    if (!gardes.length) continue;
    const affines = affiner(q, gardes);
    // Un palier dont l'affinage ne laisse RIEN n'est pas une reponse : on essaie
    // le suivant. Et si aucun ne passe, on rend une liste vide — c'est la
    // reponse honnete, et l'interface sait le dire. Rendre la liste brute « pour
    // ne pas faire vide » est exactement ce qui remontait Gal Gun pour « Gun ».
    if (affines.length) return { mots, noms: affines };
  }
  return { mots: [], noms: [] };
}

// Deux affinages, mesures sur les 9162 noms reels des collections.
//
// 1. UN NOM « <Autre Jeu> - <Pack> » APPARTIENT AU JEU DU PREFIXE.
//    « Dante's Inferno - Isaac Clarke Dead Space Rig Costume » est un DLC de
//    Dante's Inferno, pas de Dead Space. « Rock Band - ... - Our Lips Are
//    Sealed » est une chanson de Rock Band, pas de Lips. Verifie sur 41 jeux :
//    9 noms retires, 9 vrais hors-sujets, aucune perte.
//
// 2. QUAND LA RECHERCHE N'A QU'UN MOT, IL DOIT OUVRIR LE NOM.
//    « gun » ramenait Gal Gun, Top Gun, Rail Gun, Tail Gun, Radial Gun — tous
//    d'autres jeux. Le nom du jeu cherché commence par son propre nom. Les jeux
//    d'un seul mot y perdent rien : « Lips » garde ses 337 chansons, toutes
//    nommees « Lips - ... », et « Minecraft » ses 28.
function affiner(q, noms) {
  const mots = motsSignificatifs(q);
  if (!mots.length) return noms;
  const ens = new Set(mots);
  let out = noms.filter(n => {
    const m = /^(.{2,60}?)\s+-\s+/.exec(n);
    if (!m) return true;
    return String(m[1]).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
      .map(w => ROMAIN[w] || w).some(x => ens.has(x));
  });
  if (mots.length === 1) {
    out = out.filter(n => {
      const t = String(n).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(w => ROMAIN[w] || w);
      return t[0] === mots[0];
    });
  }
  return out;
}

module.exports = { MOTS_LIES, ROMAIN, motsSignificatifs, tokensDe, contientTous, nbMots, paliers, affiner, meilleurPalier };
