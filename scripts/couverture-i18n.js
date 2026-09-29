// Couverture des traductions : quelles chaines anglaises n'ont PAS d'espagnol ni
// de portugais ? Une couverture annoncee sans mesure ne veut rien dire.
//
// Le vocabulaire est EXTRAIT DU CODE a chaque execution. Lire un fichier
// intermediaire donnait un chiffre faux des qu'on ajoutait un appel T() sans
// relancer l'extracteur — et un outil de mesure qui lit un cache est pire
// qu'inutile : il rassure.
const fs = require('fs');
const { DICT_ES, DICT_PT, DICT_FR_ES, DICT_FR_PT } = require('../public/i18n.js');

const norm = s => s.replace(/\\'/g, "'");
const RE = /\bT\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3\s*(?:,|\))/g;

// ON EVALUE la chaine extraite. L'extracteur lit la forme BRUTE du source, ou `\n`
// vaut DEUX caracteres ; le dictionnaire charge par Node porte la forme EVALUEE, un
// vrai retour a la ligne — et c'est celle-la que `T()` passe a l'execution. Comparer
// les deux formes rendait l'outil INCAPABLE de verifier une chaine contenant un
// echappement, et lui faisait meme approuver une clef inutilisable : rangee avec un
// backslash LITTERAL, elle ne pouvait jamais correspondre, donc la phrase restait en
// anglais en espagnol et en portugais sans que rien ne le signale.
function evaluer(s) {
  try { return new Function('return "' + s.replace(/"/g, '\\"') + '";')(); }
  catch (e) { return s; }
}

// Nombre total d'APPELS T(), et non de chaines distinctes : c'est le cout qu'on
// payerait en modifiant chaque site d'appel, celui que la table indexee sur
// l'anglais supprime. Deux chiffres differents, souvent confondus.
//
// Deux motifs, parce qu'ils ne mesurent PAS la meme chose. Le motif strict exige
// deux litteraux adjacents : cinq appels passent un premier argument CONCATENE
// (`T('Disque ' + a.volume + ' non connecte', ...)`) et lui echappent. Compter les
// sites d'appel avec le motif strict rendrait 660 au lieu de 665 — un chiffre faux
// lu de bonne foi, et c'est exactement le genre d'ecart qu'on ne voit pas.
const RE_APPEL = /(^|[^A-Za-z0-9_$.])T\(\s*['"`]/g;
let appels = 0, litteraux = 0;
const parFichier = [];
// LES FICHIERS QUI AFFICHENT. `lib/xbox1-local.js` en fait partie depuis qu'il
// porte la carte du docteur : ses libelles passent par le `T` qu'on lui donne en
// parametre. Tant qu'il n'etait pas lu ici, cet outil comptait ses huit chaines
// comme du vocabulaire MORT et sortait en 1 — un faux positif qui apprend a ignorer
// l'outil. Meme liste que `test/i18n.test.js`, qui garde la meme porte.
const FICHIERS = ['public/app.js', 'server.js', 'lib/xbox1-local.js'];
function vocabulaire() {
  const en = new Set();
  for (const f of FICHIERS) {
    const s = fs.readFileSync(f, 'utf8');
    const nAppels = [...s.matchAll(RE_APPEL)].length;
    appels += nAppels;
    litteraux += [...s.matchAll(RE)].length;
    parFichier.push(f.replace(/^public\//, '') + ' ' + nAppels);
    for (const m of s.matchAll(RE)) if (m[4]) en.add(evaluer(norm(m[4])));
  }
  return [...en];
}
// Les libelles du HTML statique, traduits par une table indexee sur le FRANCAIS.
function statique() {
  const app = fs.readFileSync('public/app.js', 'utf8');
  const b = /const FR_EN_STATIQUE=(\{[\s\S]*?\});/.exec(app);
  return b ? Object.keys(eval('(' + b[1] + ')')) : [];
}

const cles = vocabulaire();
const stat = statique();
const pct = n => Math.round((cles.length - n) / cles.length * 100);
const sansEs = cles.filter(k => !DICT_ES[k]);
const sansPt = cles.filter(k => !DICT_PT[k]);

console.log('sites d\'appel T()       : ' + appels + '  (' + parFichier.join(', ') + ')');
console.log('  vus par l\'extracteur   : ' + litteraux + '  (' + (appels - litteraux) + ' au 1er argument concatene)');
console.log('chaines anglaises (T)    : ' + cles.length);
console.log('  espagnol   : ' + (cles.length - sansEs.length) + '  (' + pct(sansEs.length) + ' %)');
console.log('  portugais  : ' + (cles.length - sansPt.length) + '  (' + pct(sansPt.length) + ' %)');
console.log('libelles statiques (HTML): ' + stat.length
  + '  ·  ES ' + stat.filter(k => DICT_FR_ES[k]).length
  + '  ·  PT ' + stat.filter(k => DICT_FR_PT[k]).length);

const manque = [...new Set([...sansEs, ...sansPt])];
if (manque.length) {
  console.log('\n--- ' + manque.length + ' chaine(s) SANS traduction ---');
  for (const k of manque.slice(0, 60)) {
    console.log('  ' + (DICT_ES[k] ? 'ES ok  ' : 'ES MANQUE ') + (DICT_PT[k] ? 'PT ok  ' : 'PT MANQUE ') + JSON.stringify(k).slice(0, 90));
  }
  if (manque.length > 60) console.log('  ... et ' + (manque.length - 60) + ' autre(s)');
}
// Une cle qui ne correspond a AUCUN usage est du vocabulaire mort : elle survit
// aux renommages et finit par tromper celui qui la relit.
const vivantes = new Set([...cles, ...stat]);
const orphelines = [...new Set([...Object.keys(DICT_ES), ...Object.keys(DICT_PT)])]
  .filter(k => !vivantes.has(k) && !DICT_FR_ES[k] && !DICT_FR_PT[k]);
if (orphelines.length) {
  console.log('\n--- ' + orphelines.length + ' cle(s) sans usage ---');
  for (const k of orphelines.slice(0, 25)) console.log('  ' + JSON.stringify(k).slice(0, 90));
  if (orphelines.length > 25) console.log('  ... et ' + (orphelines.length - 25) + ' autre(s)');
}
process.exitCode = (manque.length || orphelines.length) ? 1 : 0;
