// Garde-fou d'IMPORT : sur le TEXTE REEL de server.js, tout nom exporte par un
// module local et utilise NU doit etre LIE (importe, ou declare sur place).
//
// LE DEFAUT, REEL, ET POURQUOI LA SUITE RESTAIT VERTE.
// server.js appelait `isGameSub(...)` nu (lignes 1021 et 1204) alors que son
// destructurage de ./lib/pkg (lignes 38-44) ne l'importait pas : ReferenceError a
// l'execution, des qu'un disque d'add-on passait -- juste apres une conversion
// ISO->GOD reussie. La suite ne voyait rien, parce que
// test/pack-extension.test.js INJECTE isGameSub dans le banc d'essai qu'il
// evalue : le banc fournissait ce que server.js avait oublie d'importer.
// C'est exactement le defaut que ce depot traque -- un instrument qui approuve
// ce qu'il n'a pas regarde.
//
// METHODO. Pour chaque module local requis par le fichier (decouvert en LISANT le
// fichier, jamais devine), on prend la liste des noms que ce module EXPORTE
// reellement (`require()` du module ; et un test verifie que l'extracteur de
// texte, lui, lit la MEME liste), puis on cherche dans le texte du fichier les
// occurrences NUES de ces noms -- c'est-a-dire non precedees d'un point et non
// suivies d'un `:`. Un nom nu qui n'est lie par rien est une ReferenceError qui
// attend son tour.
//
// POURQUOI « LIE » ET PAS « DANS LE DESTRUCTURAGE DE CE require ».
// Le critere qui compte est celui de l'execution : le nom est-il lie dans le
// fichier ? Exiger qu'il vienne du destructurage du module qui l'exporte
// refuserait un nom importe d'un AUTRE module local qui le reexporte -- un faux
// defaut, et un garde-fou qui crie a tort finit par etre desactive. Mesure : sur
// les 141 fichiers du depot, les deux criteres rendent le meme verdict.
//
// LES PIEGES, tous deja mordus ailleurs dans ce depot :
//   * le commentaire qui EXPLIQUE le defaut cite `isGameSub` : un motif naif lit
//     la prose. `sansCommentaires()` retire les commentaires en preservant la
//     longueur, donc les numeros de ligne signales restent exacts. Ce fichier-ci
//     cite isGameSub partout -- c'est le premier client du garde-fou.
//   * la liste des exports peut etre MULTILIGNE (lib/pkg.js : la ligne 234 n'est
//     qu'une continuation de la ligne 232) ; le destructurage aussi.
//   * `require('../lib/pertinence-dlc').affiner(...)` lie le RESULTAT, pas le
//     module : le considerer comme un import de module fabriquerait de faux
//     defauts (`r.mots`, `lips.some`).
//   * les identifiants peuvent porter des ACCENTS (lib/aurora-asset.js exporte
//     ENTREES) : un motif `\w` coupe le nom en deux.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server.js');

// Un identifiant JavaScript, accents compris.
const ID = '[\\p{L}_$][\\p{L}\\p{N}_$]*';
const RE_ID = new RegExp('^' + ID + '$', 'u');
const reID = (motif, drapeaux) => new RegExp(motif, drapeaux === undefined ? 'u' : drapeaux + 'u');
// Hoistes : ces motifs tournent une fois par occurrence, pas une fois par fichier.
const RE_ID_FIN = reID('(' + ID + ')$');
const RE_FONCTION_AVANT = reID('function\\s+$');
const RE_DECL_AVANT = reID('(?:^|[^\\p{L}\\p{N}_$])(?:const|let|var)\\s+$');
const RE_ESPACE = /\s/;
const RE_MOT = /[\p{L}\p{N}_$]/u;
const RE_AFFECTATION = /[=!<>+\-*/%&|^]/;
// Fenetre de lecture en arriere : on ne tranche JAMAIS sur un `slice(0, i)`, qui
// copie tout le fichier a chaque parenthese (3 819 x 320 Ko = la sonde ne rendait
// plus la main).
const FENETRE = 80;

// --- lecture du source, sans la prose ---------------------------------------

// Une SEULE passe sur le texte, qui rend deux formes de meme longueur que la
// source (les numeros de ligne signales restent donc exacts) :
//   * `code` : les commentaires retires, les litteraux INTACTS ;
//   * `nu`   : les commentaires retires ET le CONTENU des litteraux -- chaines,
//              gabarits, et MOTIFS (expressions regulieres) -- mis en espaces.
//
// POURQUOI UNE SEULE PASSE, ET PAS DES `replace()` EN CHAINE. Le helper du depot
// (`test/ui-quality.test.js`) retire les blocs `/* ... */` AVANT les `//`. Or la
// ligne 331 de server.js est un commentaire de ligne qui cite `sources/*.js` :
// son `/*` ouvrait un FAUX bloc, referme au premier `*/` venu, 850 lignes plus
// loin. Tout le code entre les deux partait en espaces -- dont l'appel nu a
// isGameSub de la ligne 1060, que le garde-fou ne voyait plus. L'instrument
// approuvait ce qu'il n'avait pas regarde, et il le faisait en silence.
//
// POURQUOI LES LITTERAUX SONT RETIRES. Un nom cite dans un message, ou ecrit dans
// un motif, ne doit pas passer pour un appel. Deux faux defauts REELS pendant
// l'ecriture de ce fichier :
//   * test/zapteam.test.js : `assert.match(e.message, /<item>\/<nom/)` faisait
//     apparaitre `nom` comme un nom nu, jamais importe ;
//   * un motif portant une apostrophe non appariee (`/[^']/`) faisait apparaitre
//     la chaine SUIVANTE, des centaines de lignes plus loin, comme du code : une
//     seule apostrophe avalait un appel a isGameSub.
//
// L'ORDRE DES TESTS EST LE FOND DU SUJET, et chacun a un cas reel :
//   1. chaine ou gabarit, sinon `'http://x'` ouvre un commentaire ;
//   2. `//` ou `/*`, sinon `f(/* note */ x)` serait pris pour un motif ;
//   3. motif, seulement quand ce qui precede attend une expression ;
//   4. le reste est du code.
function depouiller(src) {
  const code = [], nu = [];
  let attente = ''; // la queue de `nu` : debutDeMotif n'a besoin que d'elle
  const pousse = (c, n) => {
    code.push(c);
    nu.push(n);
    attente = n.length >= 24 ? n.slice(-24) : (attente + n).slice(-24);
  };
  const blanc = t => t.replace(/[^\n]/g, ' ');
  let i = 0;
  while (i < src.length) {
    const c = src[i];

    // 1. chaine ou gabarit : dans `code` tel quel, dans `nu` vide de son contenu
    if (c === '`' || c === "'" || c === '"') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) break;
        if (c !== '`' && src[j] === '\n') break; // une chaine ne traverse pas une ligne
        j++;
      }
      const ferme = j < src.length && src[j] === c;
      const brut = src.slice(i, ferme ? j + 1 : j);
      pousse(brut, c + blanc(src.slice(i + 1, j)) + (ferme ? c : ''));
      i = ferme ? j + 1 : j;
      continue;
    }

    // 2. commentaires -- AVANT les motifs, car `//` et `/*` n'en sont pas
    if (c === '/' && src[i + 1] === '/') {
      let j = i;
      while (j < src.length && src[j] !== '\n') j++;
      pousse(blanc(src.slice(i, j)), blanc(src.slice(i, j)));
      i = j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const k = src.indexOf('*/', i + 2);
      const j = k === -1 ? src.length : k + 2;
      pousse(blanc(src.slice(i, j)), blanc(src.slice(i, j)));
      i = j;
      continue;
    }

    // 3. motif (expression reguliere)
    if (c === '/' && debutDeMotif(attente)) {
      let j = i + 1, classe = false, ferme = -1;
      while (j < src.length && src[j] !== '\n') {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') classe = true;
        else if (d === ']') classe = false;
        else if (d === '/' && !classe) { ferme = j; break; }
        j++;
      }
      if (ferme !== -1) {
        pousse(src.slice(i, ferme + 1), '/' + blanc(src.slice(i + 1, ferme)) + '/');
        i = ferme + 1;
        continue;
      }
    }

    // 4. du code
    pousse(c, c);
    i++;
  }
  return { code: code.join(''), nu: nu.join('') };
}

const sansCommentaires = src => depouiller(src).code;
const sansLitteraux = src => depouiller(src).nu;

// Un `/` ouvre un MOTIF quand ce qui precede n'est pas une valeur : ni un
// identifiant, ni `)`, `]`, `}` (division), mais un operateur, une ponctuation
// ou un mot cle qui attend une expression.
const MOTS_AVANT_MOTIF = new Set(['return', 'typeof', 'case', 'in', 'of', 'do', 'else',
  'yield', 'await', 'delete', 'void', 'instanceof', 'new', 'throw']);
const RE_ID_AVANT = reID('(' + ID + ')\\s*$');
function debutDeMotif(avant) {
  // On ne regarde QUE la queue : examiner tout le texte deja lu a chaque `/`
  // ferait un balayage quadratique (320 Ko de fichier -> la sonde ne rendait plus
  // la main). Meme piege que les `slice(0, i)`.
  const queue = avant.slice(-24);
  const mot = RE_ID_AVANT.exec(queue);
  if (mot) return MOTS_AVANT_MOTIF.has(mot[1]);
  const car = queue.replace(/\s+$/, '').slice(-1);
  return car === '' || '([{,;:=!&|?+-*%^<>~'.includes(car);
}

// --- petits outils de lecture de texte --------------------------------------

// Decoupe sur les virgules de PREMIER niveau, en ignorant ce qui est entre
// guillemets (une valeur par defaut peut contenir une virgule).
function decouper(texte) {
  const out = [];
  let d = 0, q = null, cur = '';
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (q) {
      cur += c;
      if (c === '\\') { cur += texte[++i] || ''; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
    if (c === ',' && d === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

// Index de la fermeture qui equilibre l'ouvrante a `debut` (-1 si aucune).
function finGroupe(t, debut) {
  const ouv = t[debut], fer = { '{': '}', '[': ']', '(': ')' }[ouv];
  let d = 0, q = null;
  for (let i = debut; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === ouv) d++;
    else if (c === fer) { d--; if (!d) return i; }
  }
  return -1;
}

// Index du `=` de premier niveau dans un morceau de motif (-1 si absent).
function indiceEgal(t) {
  let d = 0, q = null;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    else if (c === '=' && d === 0) {
      if (t[i + 1] === '=' || t[i - 1] === '=' || t[i - 1] === '!' || t[i + 1] === '>') continue;
      return i;
    }
  }
  return -1;
}

// Index du `:` de premier niveau dans un morceau de motif (-1 si absent).
function indiceColon(t) {
  let d = 0, q = null;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    else if (c === ':' && d === 0) return i;
  }
  return -1;
}

// Les noms LIES par un motif (destructurage ou liste de parametres), en
// descendant dans les motifs imbriques : `{ a, b: c, d = 1, e: { f } }` lie
// a, c, d et f.
function nomsLies(motif) {
  let t = (motif || '').trim();
  if (!t) return [];
  while (t.startsWith('...')) t = t.slice(3).trim();
  const j = indiceEgal(t); // `a = defaut` : la valeur par defaut n'est pas liee
  if (j !== -1) t = t.slice(0, j).trim();
  if (!t) return [];
  if (t.startsWith('{') || t.startsWith('[')) {
    const fin = finGroupe(t, 0);
    const corps = fin === -1 ? t.slice(1) : t.slice(1, fin);
    return decouper(corps).flatMap(e => {
      const s = e.trim();
      if (!s) return [];
      const k = indiceColon(s);
      // `cle: motif` : seul le cote DROIT est lie
      if (k !== -1) return nomsLies(s.slice(k + 1));
      return nomsLies(s);
    });
  }
  return RE_ID.test(t) ? [t] : [];
}

// --- les require du fichier -------------------------------------------------

// Motif lie par un `= require(...)` : on remonte depuis le `=` (index `fin`) pour
// retrouver soit un destructurage, soit un simple nom (require NAMESPACE). Lecture
// par INDICES : aucune tranche du fichier entier n'est copiee.
function motifLie(code, fin) {
  let i = fin - 1;
  while (i >= 0 && RE_ESPACE.test(code[i])) i--;
  if (i < 1 || code[i] !== '=') return null;
  if (RE_AFFECTATION.test(code[i - 1])) return null; // == =, <=, +=, ...
  i--;
  while (i >= 0 && RE_ESPACE.test(code[i])) i--;
  if (i < 0) return null;
  let motif = null;
  if (code[i] === '}' || code[i] === ']') {
    const ferme = i;
    const pile = [];
    let debut = -1;
    for (; i >= 0; i--) {
      const c = code[i];
      if ('}])'.includes(c)) pile.push(c);
      else if ('{[('.includes(c)) {
        if (!pile.length) return null;
        pile.pop();
        if (!pile.length) { debut = i; break; }
      }
    }
    if (debut === -1) return null;
    motif = code.slice(debut, ferme + 1);
    i = debut - 1;
  } else {
    const m = RE_ID_FIN.exec(code.slice(Math.max(0, i - FENETRE), i + 1));
    if (!m) return null;
    motif = m[1];
    i -= motif.length;
  }
  // il faut une DECLARATION : `const { a } = ...`, jamais `f({ a }) = ...`
  if (!RE_DECL_AVANT.test(code.slice(Math.max(0, i - 12), i + 1))) return null;
  return motif;
}

// Tous les require du texte, avec le motif lie et les noms qu'il lie.
function requiresDe(code) {
  const out = [];
  const re = /require\(\s*'([^']+)'\s*\)/g;
  let m;
  while ((m = re.exec(code))) {
    // `require('...').membre(...)` lie le RESULTAT, pas le module
    if (code.slice(re.lastIndex, re.lastIndex + 8).replace(/^[ \t]*/, '').startsWith('.')) continue;
    const motif = motifLie(code, m.index);
    if (motif === null) continue;
    const destructure = motif.startsWith('{') || motif.startsWith('[');
    const noms = destructure
      ? nomsLies(motif).map(local => ({ local, distant: distantDe(motif, local) }))
      : [{ local: motif, distant: null }];
    out.push({ chemin: m[1], motif, destructure, noms, index: m.index });
  }
  return out;
}

// Le nom lu dans le module pour un nom lie donne : `diagnose: diagnoseTu` importe
// `diagnose` sous le nom local `diagnoseTu`.
function distantDe(motif, local) {
  for (const e of decouper(motif.replace(/^\{/, '').replace(/\}$/, ''))) {
    const j = indiceEgal(e);
    const s = (j === -1 ? e : e.slice(0, j)).trim();
    const k = indiceColon(s);
    if (k === -1) { if (s.trim() === local) return local; continue; }
    const gauche = s.slice(0, k).trim(), droite = s.slice(k + 1).trim();
    if (droite === local || nomsLies(droite).includes(local)) return gauche;
  }
  return local;
}

// --- ce que le module exporte vraiment --------------------------------------

// La liste des exports, lue sur le module CHARGE (la reference).
function exportsCharges(chemin) {
  try {
    const mod = require(chemin);
    if (!mod || typeof mod !== 'object') return null;
    return Object.keys(mod);
  } catch (e) {
    return null;
  }
}

// La meme liste, lue sur le TEXTE de `module.exports = { ... }`. Le motif doit
// traverser les lignes, les commentaires deja retires, et les accolades
// imbriquees. Sert aux modules qu'on ne peut pas charger -- et sert de controle
// croise : s'il deraille, le test le dit.
function exportsTexte(src) {
  const code = sansCommentaires(src);
  const i = code.lastIndexOf('module.exports');
  if (i === -1) return null;
  const j = code.indexOf('{', i);
  if (j === -1) return null;
  const k = finGroupe(code, j);
  if (k === -1) return null;
  const noms = [];
  for (const brut of decouper(code.slice(j + 1, k))) {
    const s = brut.trim();
    if (!s || s.startsWith('...')) continue;
    const m = reID('^(' + ID + ')\\s*(?::|$)').exec(s);
    if (m) noms.push(m[1]);
  }
  return noms;
}

// --- les occurrences nues ---------------------------------------------------

const MOTS_CLES = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof',
  'function', 'require', 'new', 'do', 'else', 'in', 'of', 'case', 'delete', 'void',
  'await', 'yield', 'throw', 'instanceof', 'with', 'class', 'const', 'let', 'var',
  'try', 'finally', 'break', 'continue', 'this', 'super', 'null', 'true', 'false',
  'undefined', 'default', 'export', 'import', 'async']);

// Les occurrences d'identifiants qui exigent une LIAISON : ni `obj.nom`, ni une
// clef d'objet (`nom:` apres `{` ou `,`, qui est une etiquette de propriete).
function occurrencesNues(nu) {
  const out = [];
  const re = reID('(?:^|[^\\p{L}\\p{N}_$.])(' + ID + ')', 'g');
  let m;
  while ((m = re.exec(nu))) {
    const nom = m[1];
    if (MOTS_CLES.has(nom)) continue;
    const at = m.index + m[0].length - nom.length;
    if (RE_FONCTION_AVANT.test(nu.slice(Math.max(0, at - 12), at))) continue; // declaration
    if (nu[at + nom.length] === ':') {
      const avant = nu.slice(Math.max(0, at - FENETRE), at).replace(/\s+$/, '');
      if (/[{,]$/.test(avant)) continue; // clef d'objet
    }
    out.push({ nom, index: at, appel: /^\s*\(/.test(nu.slice(at + nom.length, at + nom.length + 16)) });
  }
  return out;
}

// --- liaisons disponibles dans le fichier -----------------------------------

// Tout destructurage lie ses noms, meme hors require : `const { movePath } = F;`
// lie movePath autant que `const { movePath } = require('./lib/fsutil');`.
function destructuragesDe(code) {
  const out = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] !== '{') continue;
    const j = finGroupe(code, i);
    if (j === -1) { i = code.length; break; }
    if (/^\s*=(?!=|>)/.test(code.slice(j + 1))) out.push(code.slice(i, j + 1));
  }
  return out;
}

// Les listes de parametres : `function f(a, b)`, `(a, b) =>`, `nom(a, b) {`.
// On ecarte les parentheses des MOTS CLES (`if (x) {`, `for (x of y) {`) : les
// prendre pour des parametres lierait `x` et masquerait un vrai defaut.
function listesParams(nu) {
  const out = [];
  for (let i = 0; i < nu.length; i++) {
    if (nu[i] !== '(') continue;
    const j = finGroupe(nu, i);
    if (j === -1) continue;
    const avant = nu.slice(Math.max(0, i - FENETRE), i).replace(/\s+$/, '');
    const apres = nu.slice(j + 1, j + 4).replace(/^\s*/, '');
    const motAvant = RE_ID_FIN.exec(avant);
    const nomAvant = motAvant ? motAvant[1] : null;
    const estFleche = apres.startsWith('=>');
    const estCorps = apres.startsWith('{');
    const anon = RE_FONCTION_AVANT.test(avant);
    const cle = nomAvant && MOTS_CLES.has(nomAvant) && nomAvant !== 'catch';
    if (anon || estFleche || (estCorps && !cle)) out.push(nu.slice(i + 1, j));
  }
  return out;
}

// Tous les noms lies par une declaration du fichier.
function declarationsDe(nu) {
  const lies = new Set();
  const re = reID('(?:^|[^\\p{L}\\p{N}_$.])(?:function|class|const|let|var)\\s+(' + ID + ')', 'g');
  let m;
  while ((m = re.exec(nu))) lies.add(m[1]);
  const reCatch = reID('catch\\s*\\(([^)]*)\\)', 'g');
  while ((m = reCatch.exec(nu))) for (const n of nomsLies(m[1])) lies.add(n);
  for (const liste of listesParams(nu))
    for (const brut of decouper(liste)) for (const n of nomsLies(brut)) lies.add(n);
  return lies;
}

// --- l'analyse --------------------------------------------------------------

// Table des debuts de ligne : un `slice(0, index)` par defaut signalerait la ligne
// en recopiant tout le fichier.
function tableDeLignes(code) {
  const debuts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') debuts.push(i + 1);
  return index => {
    let bas = 0, haut = debuts.length - 1;
    while (bas < haut) {
      const milieu = Math.ceil((bas + haut) / 2);
      if (debuts[milieu] <= index) bas = milieu; else haut = milieu - 1;
    }
    return bas + 1;
  };
}

// Analyse un fichier (ou un TEXTE, pour la mutation) et rend les defauts.
function analyse(fichier, texte) {
  const src = texte === undefined ? fs.readFileSync(fichier, 'utf8') : texte;
  const { code, nu } = depouiller(src);
  const dossier = path.dirname(fichier);
  const ligneDe = tableDeLignes(code);

  const requires = requiresDe(code);
  const liees = new Set();
  for (const motif of destructuragesDe(code)) for (const n of nomsLies(motif)) liees.add(n);
  for (const n of declarationsDe(nu)) liees.add(n);

  const occ = occurrencesNues(nu);
  const parNom = new Map();
  for (const o of occ) {
    if (!parNom.has(o.nom)) parNom.set(o.nom, []);
    parNom.get(o.nom).push(o);
  }

  const modules = [];
  for (const r of requires) {
    if (!r.chemin.startsWith('.')) continue;
    const abs = path.resolve(dossier, r.chemin);
    let exports = null;
    if (abs.startsWith(path.join(ROOT, 'lib') + path.sep)) exports = exportsCharges(abs);
    if (!exports) {
      // module qu'on ne peut pas charger (un script qui demarre un serveur, une
      // doublure de test) : on lit sa liste dans son TEXTE
      const fichier2 = abs.endsWith('.js') ? abs : abs + '.js';
      if (fs.existsSync(fichier2)) exports = exportsTexte(fs.readFileSync(fichier2, 'utf8'));
    }
    if (!exports) { r.ignore = 'module illisible'; continue; }
    modules.push(Object.assign({}, r, { abs, exports }));
  }

  const defauts = [];
  for (const r of modules) {
    for (const e of r.exports) {
      if (liees.has(e)) continue;
      const sites = parNom.get(e);
      if (!sites || !sites.length) continue;
      defauts.push({
        nom: e, chemin: r.chemin,
        ligneRequire: ligneDe(r.index),
        sites: sites.map(s => ligneDe(s.index) + (s.appel ? '' : ' (lecture)'))
      });
    }
  }

  const absents = [];
  for (const r of modules) {
    for (const n of r.noms) {
      if (n.distant && !r.exports.includes(n.distant)) {
        absents.push({ nom: n.distant, local: n.local, chemin: r.chemin, ligne: ligneDe(r.index) });
      }
    }
  }

  return { defauts, absents, modules, liees, occ };
}

const messageDefauts = (fichier, r) => r.defauts.map(d =>
  `  ${d.nom} : exporte par ${d.chemin} (require ligne ${d.ligneRequire}), ` +
  `utilise nu ligne(s) ${d.sites.join(', ')} -- absent de tout destructurage ` +
  `et d'aucune declaration de ${path.basename(fichier)}`).join('\n');

// --- 1. les extracteurs, eprouves sur des textes fabriques -------------------

test('les extracteurs : un destructurage multiligne livre tous ses noms', () => {
  const motif = '{\n  isGodFile, godTid, godName, contentType, ctSub, ctLabel,\n' +
    '  isHex8, isGameSub, magicKind, CT_LABELS, GAME_SUBS,\n  estIsoXbox,\n' +
    '  detecte: autreNom, imbrique: { profond }\n}';
  const noms = nomsLies(motif);
  for (const attendu of ['isGodFile', 'ctLabel', 'isGameSub', 'GAME_SUBS', 'estIsoXbox', 'autreNom', 'profond'])
    assert.ok(noms.includes(attendu), attendu + ' doit etre lu dans le destructurage');
  assert.ok(!noms.includes('detecte'), 'un nom renomme n est PAS lie sous son nom d origine');
  assert.ok(!noms.includes('imbrique'), 'une clef de motif imbrique n est pas liee');
  // un element se lit un par un : `a = defaut` lie a, `...reste` lie reste
  assert.strictEqual(nomsLies('a = 1').join(','), 'a', 'une valeur par defaut n est pas liee');
  assert.strictEqual(nomsLies('...reste').join(','), 'reste');
  assert.strictEqual(nomsLies("[premier, { second }]").join(','), 'premier,second');
  assert.strictEqual(nomsLies('sansRien()').join(','), '', 'un appel n est pas un motif de liaison');
});

test('les extracteurs : une liste d exports multiligne est lue en entier', () => {
  // Le piege exact de lib/pkg.js : la ligne 234 n'est qu'une continuation.
  const src = 'module.exports = {\n  readAt, hex8, isGodFile,\n  isGameSub, isHex8,\n' +
    '  // un commentaire au milieu\n  estIsoXbox, OFFSETS_XBOX,\n  trouverXexJeu\n};\n';
  const noms = exportsTexte(src);
  for (const attendu of ['readAt', 'isGodFile', 'isGameSub', 'estIsoXbox', 'trouverXexJeu'])
    assert.ok(noms.includes(attendu), attendu + ' doit etre lu dans module.exports');
  assert.ok(!noms.includes('un'), 'un commentaire ne doit pas entrer dans la liste');
});

test('les extracteurs : un commentaire qui cite un nom ne compte pas', () => {
  const src = '// isGameSub(...) est appele nu ici, et c est le defaut explique\n' +
    '/* isGameSub( encore, dans un bloc */\n' +
    'const x = 1; // isGameSub(x)\n';
  const occ = occurrencesNues(sansLitteraux(sansCommentaires(src)));
  assert.deepStrictEqual(occ.filter(o => o.nom === 'isGameSub'), [],
    'la prose qui explique le defaut ne doit pas passer pour un appel');
  assert.deepStrictEqual(occ.map(o => o.nom), ['x'], 'le code reel, lui, reste lu');
  assert.strictEqual(sansCommentaires(src).length, src.length, 'la longueur doit etre preservee');
});

test('les extracteurs : un motif (expression reguliere) n est pas du code', () => {
  // Faux defaut rencontre pour de vrai : `assert.match(e.message, /<item>\/<nom/)`
  // faisait de `nom` un nom nu, jamais importe (test/zapteam.test.js).
  const src = "assert.match(e.message, /<item>\\/<nom/);\nlet t = 'a';\n";
  const noms = occurrencesNues(sansLitteraux(sansCommentaires(src))).map(o => o.nom);
  assert.ok(!noms.includes('nom'), 'un nom ecrit dans un motif ne doit pas compter');
  assert.ok(noms.includes('t'), 'la division et le code autour restent lus');
  assert.strictEqual(sansLitteraux(src).length, src.length, 'la longueur doit etre preservee');
});

test('les extracteurs : un /* cite dans un commentaire de ligne n ouvre pas un bloc', () => {
  // LE PIEGE QUI A RENDU CE GARDE-FOU MUET, mesure sur server.js : sa ligne 331 est
  // un commentaire de ligne citant `sources/*.js`. Un depouilleur qui retire les
  // blocs AVANT les lignes ouvrait un faux bloc la, et le refermait au premier
  // `*/` venu 850 lignes plus loin : tout le code entre les deux devenait des
  // espaces, et un appel nu a isGameSub disparaissait du regard du garde-fou.
  const src = '// les sources (sources/*.js) sont citees ici\n' +
    'const { isGameSub } = require(\'./lib/pkg\');\n' +
    '/* un vrai bloc, plus loin */\n' +
    'const x = isGameSub(1);\n';
  const { code, nu } = depouiller(src);
  assert.ok(code.includes('isGameSub'), 'un `/*` dans un commentaire de ligne ne doit rien avaler');
  assert.ok(nu.includes('isGameSub'), 'le code entre le faux bloc et le vrai doit rester lisible');
  assert.strictEqual(code.length, src.length);
  assert.strictEqual(nu.length, src.length);
  assert.ok(!code.includes('un vrai bloc'), 'le vrai bloc, lui, doit bien partir');
  assert.deepStrictEqual(occurrencesNues(nu).filter(o => o.nom === 'isGameSub').length, 2,
    'le destructurage et l appel doivent etre vus tous les deux');
});

test('les extracteurs : une chaine qui contient // ou /* ne cache pas le code', () => {
  const src = "const u = 'http://127.0.0.1:4360/'; // la vraie adresse\n" +
    "const g = 'sources/*.js';\nconst y = isGameSub(2);\n";
  const { code, nu } = depouiller(src);
  assert.ok(code.includes('isGameSub('), 'une adresse http dans une chaine n ouvre pas un commentaire');
  assert.ok(nu.includes('isGameSub('));
  assert.ok(!code.includes('la vraie adresse'), 'le commentaire de ligne, lui, part bien');
});

test('les extracteurs : require(...).membre(...) ne lie pas le module', () => {
  const src = "const lips = require('../lib/pertinence-dlc').affiner('Lips', noms);\n" +
    "const P = require('../lib/pertinence-dlc');\n" +
    "const { movePath } = require('../lib/fsutil');\n";
  const rs = requiresDe(sansCommentaires(src));
  assert.strictEqual(rs.length, 2, 'seuls les deux vrais require lient quelque chose');
  assert.deepStrictEqual(rs.map(r => r.chemin), ['../lib/pertinence-dlc', '../lib/fsutil']);
  assert.strictEqual(rs[0].noms[0].local, 'P');
  assert.deepStrictEqual(rs[1].noms.map(n => n.local), ['movePath']);
});

test('les extracteurs : les identifiants accentues sont lus en entier', () => {
  const src = "const A = require('../lib/aurora-asset');\nconst { ENTREES } = A;\nA.ENTREES;\n";
  const liees = new Set();
  for (const motif of destructuragesDe(sansCommentaires(src)))
    for (const n of nomsLies(motif)) liees.add(n);
  assert.ok(liees.has('ENTREES'));
  const noms = occurrencesNues(sansLitteraux(sansCommentaires(src))).map(o => o.nom);
  assert.ok(noms.includes('ENTREES'), 'ENTREES en entier, pas ENTR');
});

// --- 2. l'extracteur de texte et le module charge disent la meme chose --------

test('l extracteur de texte lit la meme liste que le module charge', () => {
  const lib = path.join(ROOT, 'lib');
  const fichiers = fs.readdirSync(lib).filter(f => f.endsWith('.js'));
  assert.ok(fichiers.length >= 20, 'la liste des modules doit etre lue, pas devinee');
  let compares = 0;
  for (const f of fichiers) {
    const abs = path.join(lib, f);
    const charges = exportsCharges(abs);
    const texte = exportsTexte(fs.readFileSync(abs, 'utf8'));
    if (texte === null) continue; // module sans `module.exports = { ... }`
    assert.ok(charges, 'lib/' + f + ' doit se charger');
    assert.deepStrictEqual([...texte].sort(), [...charges].sort(),
      'lib/' + f + ' : l extracteur de texte et le module charge ne disent pas la meme liste ' +
      '(une liste multiligne mal lue, ou un export ecrit autrement)');
    compares++;
  }
  assert.ok(compares >= 20, 'au moins 20 modules compares, sinon la comparaison ne prouve rien');
});

// --- 3. le garde-fou sur le TEXTE REEL de server.js --------------------------

test('server.js n utilise nu aucun nom exporte par un module local sans l importer', () => {
  const r = analyse(SERVER);
  assert.deepStrictEqual(r.modules.length >= 20, true,
    'server.js doit requerir au moins 20 modules locaux lus (lu : ' + r.modules.length + ')');
  // garde-fou anti-vacuite : les listes lues sont bien celles des modules reels
  const tous = new Set(r.modules.flatMap(m => m.exports));
  for (const nom of ['isGameSub', 'isHex8', 'cleanName', 'messageLisible', 'trouverXexJeu'])
    assert.ok(tous.has(nom), nom + ' doit figurer dans les exports lus -- sinon on ne lit rien');
  assert.strictEqual(r.defauts.length, 0,
    'des noms exportes sont utilises nus sans etre importes (ReferenceError a l execution) :\n' +
    messageDefauts(SERVER, r));
});

test('server.js : tout nom destructure d un module local est bien exporte par lui', () => {
  const r = analyse(SERVER);
  assert.strictEqual(r.absents.length, 0,
    'des noms sont destructures de modules qui ne les exportent pas (undefined a l execution) :\n' +
    r.absents.map(a => `  ${a.chemin} ligne ${a.ligne} : "${a.nom}" n est pas exporte (lie sous ${a.local})`).join('\n'));
});

// --- 4. la mutation qui a cause le defaut, rejouee ---------------------------
//
// Un garde-fou qu'on n'a pas vu echouer ne prouve rien. On rejoue donc ICI, a
// chaque execution de la suite, la mutation qui a produit la ReferenceError :
// on retire isGameSub du destructurage de ./lib/pkg, sur une COPIE du texte (le
// fichier sur disque n'est jamais touche), et on exige que le garde-fou le voie.
test('le garde-fou se declenche sur la mutation qui a cause le defaut', () => {
  const texte = fs.readFileSync(SERVER, 'utf8');
  // On retire isGameSub du destructurage REEL de ./lib/pkg, en le lisant plutot
  // qu'en le supposant : la liste peut etre reformatee sans que ce test mente.
  const bloc = /\{([^}]*)\}\s*=\s*require\('\.\/lib\/pkg'\)/.exec(texte);
  assert.ok(bloc, 'server.js doit destructurer ./lib/pkg');
  const corps = bloc[1];
  assert.ok(nomsLies('{' + corps + '}').includes('isGameSub'),
    'isGameSub doit etre importe de ./lib/pkg, sinon il n y a rien a muter');
  const ampute = decouper(corps).filter(e => e.trim() !== 'isGameSub').join(',');
  assert.notStrictEqual(ampute, corps, 'la mutation doit avoir eu lieu, sinon ce test ne prouve rien');
  const mute = texte.slice(0, bloc.index + 1) + ampute + texte.slice(bloc.index + 1 + corps.length);

  const r = analyse(SERVER, mute);
  assert.strictEqual(r.defauts.length, 1,
    'retirer isGameSub du destructurage de ./lib/pkg doit lever EXACTEMENT un defaut, pas ' +
    r.defauts.length + ' :\n' + messageDefauts(SERVER, r));
  assert.strictEqual(r.defauts[0].nom, 'isGameSub');
  assert.strictEqual(r.defauts[0].chemin, './lib/pkg');
  assert.ok(r.defauts[0].sites.length >= 1, 'au moins un appel nu doit etre signale');
  // les lignes signalees doivent porter un VRAI appel nu dans le texte d'origine
  const lignes = texte.split('\n');
  for (const site of r.defauts[0].sites) {
    const n = parseInt(site, 10);
    assert.match(lignes[n - 1] || '', /isGameSub\s*\(/,
      'la ligne ' + n + ' signalee doit porter un appel nu a isGameSub');
  }
  // et tous les appels nus du fichier doivent etre signales, pas seulement un
  const attendus = occurrencesNues(depouiller(texte).nu)
    .filter(o => o.nom === 'isGameSub' && o.appel).length;
  assert.ok(attendus >= 1, 'le fichier doit contenir au moins un appel nu a isGameSub');
  assert.strictEqual(r.defauts[0].sites.length, attendus,
    'les ' + attendus + ' appels nus du fichier doivent tous etre signales');
});

// --- 5. le meme invariant, partout ailleurs ---------------------------------

test('les autres fichiers qui importent lib/ tiennent le meme invariant', () => {
  const fichiers = [];
  for (const d of ['', 'lib', 'public', 'scripts', 'test']) {
    const base = path.join(ROOT, d);
    if (!fs.existsSync(base)) continue;
    for (const e of fs.readdirSync(base, { withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.js')) continue;
      if (d === 'test' && !e.name.endsWith('.test.js')) continue;
      fichiers.push(path.join(base, e.name));
    }
  }
  assert.ok(fichiers.length >= 30, 'le balayage doit couvrir le depot (lu : ' + fichiers.length + ')');
  let inspectes = 0;
  const lignes = [];
  for (const f of fichiers) {
    let r;
    try { r = analyse(f); } catch (e) { continue; }
    if (!r.modules.length) continue; // ce fichier n'importe aucun module local
    inspectes++;
    if (r.defauts.length) lignes.push(path.relative(ROOT, f) + '\n' + messageDefauts(f, r));
    if (r.absents.length) lignes.push(path.relative(ROOT, f) + '\n' + r.absents.map(a =>
      `  ${a.chemin} : "${a.nom}" n est pas exporte (lie sous ${a.local})`).join('\n'));
  }
  assert.ok(inspectes >= 30, 'au moins 30 fichiers importent lib/ (inspectes : ' + inspectes + ')');
  assert.strictEqual(lignes.length, 0, 'defauts de la meme famille ailleurs dans le depot :\n' + lignes.join('\n'));
});
