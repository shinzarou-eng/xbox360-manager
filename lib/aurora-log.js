// Lecture du journal d'Aurora — <Aurora>/Logs/Aurora.log
//
// Source des faits : « Guide Aurora FR 2026 », page Diagnostic
// (https://elmajor9.github.io/xbox360-aurora-guide/diagnostic/).
//
// Le guide conseille, mot pour mot : « Telecharge Aurora.log sur ton PC, ouvre-le
// avec un editeur de texte et cherche les lignes contenant ERROR ou CRITICAL. »
// L'application a deja une session FTP ouverte : elle peut le faire elle-meme et
// dire directement ce qui ne va pas, au lieu d'envoyer l'utilisateur chercher un
// fichier sur une console.
//
// On ne se contente pas de FILTRER : on REGROUPE les messages repetes. Un journal
// qui repete la meme erreur 400 fois n'apprend rien de plus que la meme erreur
// une fois — ce qui compte, c'est le nombre de problemes DIFFERENTS.

// Les causes connues du guide, associees a ce qu'on peut lire dans un journal.
// Servent a transformer une ligne technique en piste concrete.
const PISTES = [
  { cle: /plugin/i, quoi: 'plugin',
    conseil: 'Desactive les plugins un par un pour trouver le coupable, puis supprime son dossier dans Aurora/Plugins.' },
  { cle: /settings\.?db|sqlite|database/i, quoi: 'base de reglages',
    conseil: 'settings.db est peut-etre corrompu : supprime-le et recree-le (tu perdras tes reglages Aurora).' },
  { cle: /cache/i, quoi: 'cache',
    conseil: 'Supprime Aurora/Data/cache/ : c\'est la premiere chose a tenter quand Aurora plante ou n\'affiche plus les jaquettes.' },
  { cle: /artwork|cover|unity|metadata/i, quoi: 'jaquettes',
    conseil: 'Les jaquettes viennent d\'Unity : verifie que la console est bien connectee au reseau.' },
  { cle: /default\.?xex|xex/i, quoi: 'executable',
    conseil: 'Un default.xex est absent ou vide : le jeu ne peut pas se lancer.' },
  { cle: /ftp|socket|reseau|network|timeout|connection/i, quoi: 'reseau',
    conseil: 'Verifie le cable (le Wi-Fi coupe les gros transferts) et que le plugin FTP est actif dans Aurora : Parametres > Plugins.' },
  { cle: /disk|disque|read|write|i\/o|sector/i, quoi: 'disque',
    conseil: 'Le disque dur est peut-etre defaillant : teste avec un autre jeu, et verifie la temperature.' },
  { cle: /source|scan|library|bibliotheque/i, quoi: 'sources',
    conseil: 'Verifie les chemins dans Aurora : Parametres > Gestion des sources, puis lance un scan manuel.' },
  { cle: /temperature|thermal|fan|overheat/i, quoi: 'chaleur',
    conseil: 'Surchauffe : degage les grilles, ne mets pas la console dans un meuble ferme.' }
];

// Une ligne de journal : « [12/03/2026 14:22:31] ERROR: ... », « 2026-03-12
// 14:22:31 [ERROR] ... », « ERROR ... ». On reste TOLERANT : le format depend de
// la version d'Aurora et on ne veut pas rater une erreur faute d'avoir reconnu
// une date.
const NIVEAUX = /(CRITICAL|FATAL|ERROR|ERREUR|WARNING|WARN|AVERTISSEMENT)/i;

function niveauDe(ligne) {
  const m = NIVEAUX.exec(ligne);
  if (!m) return null;
  const n = m[1].toUpperCase();
  if (n === 'CRITICAL' || n === 'FATAL') return 'critique';
  if (n === 'ERROR' || n === 'ERREUR') return 'erreur';
  return 'avertissement';
}

// Le message sans sa date ni son niveau : deux erreurs identiques a deux heures
// d'ecart sont LE MEME probleme.
function normaliser(ligne) {
  return ligne
    .replace(/^[\s[\]()]*\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}[ T]\d{1,2}:\d{2}(:\d{2})?[\s\]()]*/, '')
    .replace(/^[\s[\]()]*(CRITICAL|FATAL|ERROR|ERREUR|WARNING|WARN|AVERTISSEMENT)[\s:\]]*/i, '')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, 'HH:MM')
    .replace(/\b[0-9A-Fa-f]{8,}\b/g, '<id>')     // TitleID, adresses
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim();
}

function pistePour(texte) {
  for (const p of PISTES) if (p.cle.test(texte)) return p;
  return null;
}

/**
 * Analyse un journal Aurora.
 *
 * @param {string} texte  le contenu du fichier
 * @param {number} [maxLignes]  borne le nombre de lignes conservees (un journal
 *   peut faire plusieurs Mo : on ne garde que ce qui pose probleme)
 */
function analyser(texte, maxLignes) {
  const lignes = String(texte || '').split(/\r?\n/);
  const gardees = [];
  const parMotif = new Map();
  let erreurs = 0, critiques = 0, avertissements = 0, lues = 0;

  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    if (!l.trim()) continue;
    lues++;
    const niveau = niveauDe(l);
    if (!niveau) continue;
    if (niveau === 'critique') critiques++;
    else if (niveau === 'erreur') erreurs++;
    else avertissements++;

    const motif = normaliser(l);
    const p = parMotif.get(motif) || { motif, niveau, compte: 0, premiere: i + 1, exemple: l.trim(), piste: null };
    p.compte++;
    // Le niveau le plus grave l'emporte : un avertissement devenu erreur doit se
    // lire comme une erreur.
    if (niveau === 'critique' || (niveau === 'erreur' && p.niveau === 'avertissement')) p.niveau = niveau;
    parMotif.set(motif, p);

    if (gardees.length < (maxLignes || 200)) gardees.push({ n: i + 1, niveau, texte: l.trim(), motif });
  }

  const motifs = [...parMotif.values()].sort((a, b) => {
    const rang = { critique: 0, erreur: 1, avertissement: 2 };
    return rang[a.niveau] - rang[b.niveau] || b.compte - a.compte;
  });
  for (const m of motifs) m.piste = pistePour(m.exemple);

  // Les pistes se dedoublonnent : cinq erreurs differentes du meme plugin ne
  // donnent qu'un seul conseil — et `combien` est le TOTAL des lignes concernees,
  // pas le compte du premier motif rencontre. Prendre le premier annoncait « 1 »
  // pour quatre erreurs.
  const parQuoi = new Map();
  for (const m of motifs) {
    if (!m.piste) continue;
    const e = parQuoi.get(m.piste.quoi) || { quoi: m.piste.quoi, conseil: m.piste.conseil, combien: 0 };
    e.combien += m.compte;
    parQuoi.set(m.piste.quoi, e);
  }
  const conseils = [...parQuoi.values()];

  return {
    lues, erreurs, critiques, avertissements,
    total: erreurs + critiques + avertissements,
    lignes: gardees, motifs, conseils,
    // Un journal SANS erreur est une bonne nouvelle, et il faut le dire : rendre
    // une liste vide laisserait croire que la lecture a echoue.
    verdict: (erreurs + critiques) === 0
      ? (avertissements ? 'avertissements' : 'propre')
      : (critiques ? 'critique' : 'erreurs')
  };
}

module.exports = { analyser, niveauDe, normaliser, pistePour, PISTES };
