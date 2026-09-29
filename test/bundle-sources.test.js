'use strict';
// LE BUNDLE "jeu+DLC" NE DOIT PAS SE RECLAMER D'UNE SOURCE QU'IL N'UTILISE PAS.
//
// Mesure du 2026-09-20 sur la vraie API archive.org (requetes et `numFound`
// recopies dans `.superpowers/sdd/2026-09-20-telephone/archive-org-bundle-report.md`) :
//
//   - `uploader:aitus95` -> `numFound: 0`. Ce zero est une VRAIE absence, pas un
//     champ inexistant : le champ `uploader:` est interrogeable, et un uploader
//     connu rend 1 sur le meme champ. Le nom ne survit que dans la DESCRIPTION
//     de 55 items uploades par d'autres.
//   - `collection:clearancebin` -> `numFound: 27397`, items heterogenes.
//   - Ajoutee a la requete Bundle, `collection:clearancebin` fait tomber
//     « Halo 3 » de 5 a 0 resultats : ce n'est donc PAS un remplacant.
//
// La requete reelle ne filtre par AUCUNE source nommee. Ce fichier empeche qu'une
// « source d'apparence » y revienne : un filtre qui ne filtre rien donne
// l'illusion d'une provenance verifiee, et c'est precisement ce qui a fait
// documenter une source morte comme si elle etait vivante.
//
// CE QUE CE FICHIER NE FAIT PAS : il ne juge pas la qualite des resultats, et il
// ne touche pas au reseau — la suite doit rester hors ligne.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Pertinence = require('../lib/pertinence-dlc');

const ROOT = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
// AGENTS.md n'est pas publie : les tests `doc :` sautent sur un clone public.
const agentsPath = path.join(ROOT, 'AGENTS.md');
const doc = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : null;

// Un garde-fou qui lit du texte brut se retourne contre son propre commentaire.
// C'est arrive TROIS fois dans ce depot, et le commentaire ajoute a cote de la
// requete Bundle cite lui-meme `uploader:` et `collection:` pour expliquer
// pourquoi ils n'y sont plus. On retire donc les commentaires AVANT de chercher,
// en preservant la longueur (les numeros de ligne signales restent exacts).
function sansCommentaires(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[ \t])\/\/[^\n]*/gm, m => m.replace(/[^\n]/g, ' '));
}

// La ligne qui construit la requete Bundle porte TOUS ses filtres : c'est elle
// qu'on lit, plutot que de chercher des mots dans tout le fichier.
function ligneRequeteBundle(src) {
  const l = sansCommentaires(src).split('\n').find(x => x.includes('const bq = encodeURIComponent('));
  assert.ok(l, 'la construction de la requete Bundle doit rester trouvable dans server.js');
  return l;
}

test('bundle : la requete garde ses trois filtres, ceux qui filtrent vraiment', () => {
  const q = ligneRequeteBundle(server);
  // Mesure sur « Halo 3 » : sans `mediatype:software` 5 -> 8, sans le bloc
  // mots-cles 5 -> 35, sans le bloc plateforme 5 -> 5 mais 5 -> 1 sur
  // « Dead Island » (il ecarte un portage Mac). Aucun n'est decoratif.
  assert.match(q, /mediatype:software/, 'le filtre de type doit rester');
  assert.match(q, /dlc OR alldlc OR goty/, 'le bloc mots-cles doit rester');
  assert.match(q, /xbox OR 360 OR freeboot OR jtag OR rgh/, 'le bloc plateforme doit rester');
});

test('bundle : la requete ne filtre par AUCUNE source nommee', () => {
  const q = ligneRequeteBundle(server);
  assert.ok(!q.includes('uploader:'),
    'un filtre `uploader:` est reapparu dans la requete Bundle : s\'il est verifie par une mesure, ' +
    'citer la requete dans la note du depot ; sinon le retirer — il ne filtre rien et fait croire a une source');
  assert.ok(!q.includes('collection:'),
    'un filtre `collection:` est reapparu dans la requete Bundle : mesure du 2026-09-20, ' +
    '`collection:clearancebin` fait tomber « Halo 3 » de 5 a 0 resultats, ce n\'est pas un remplacant');
});

test('bundle : la regle de nom de fichier est bien celle qui est documentee', () => {
  // La limite connue (un AUTRE episode passe) vient de cette regle : « au moins
  // deux mots de la recherche ». Si elle change, la note du depot devient fausse.
  assert.match(sansCommentaires(server),
    /Pertinence\.nbMots\(f\.name, motsQ\) < Math\.min\(2, motsQ\.length\)/,
    'la regle « au moins 2 mots » doit rester celle que la note du depot decrit');
  const mots = Pertinence.motsSignificatifs('Halo 3');
  // Le build Halo 4 ramene par la requete porte « halo » ET « 3 » : il passe donc
  // le filtre. C'est la limite mesuree, decrite dans la note — pas une approbation.
  assert.strictEqual(Pertinence.nbMots('Halo 4 (Aug 25 2012) (Unknown Build) (Test DLC 3).zip', mots), 2,
    'la raison de la limite connue a change : remesurer et mettre la note a jour');
});

// La ligne qui porte les MOTS de la recherche : c'est elle qui distingue la
// conjonction de jetons (`title:halo AND title:3`) de la phrase citee
// (`title:("halo 3")`).
function ligneMotsBundle(src) {
  const l = sansCommentaires(src).split('\n')
    .find(x => x.includes("motsQ.map(w => 'title:' + w).join(' AND ')"));
  assert.ok(l, 'la construction des mots de la requete Bundle doit rester trouvable dans server.js');
  return l;
}

test('bundle : la phrase citee reste REFUSEE, avec sa mesure', () => {
  // Mesure du 2026-09-20 sur 17 jeux temoins (requetes et tableau par jeu dans
  // `.superpowers/sdd/2026-09-20-telephone/bundle-phrase-report.md`) :
  //
  //   la phrase citee `title:("halo 3")` fait bien DISPARAITRE le faux positif —
  //   Halo 3 passe de 5 items a 4, l'item « Halo 4 ... (Test DLC 3) » est ecarte,
  //   aucun autre item perdu. MAIS elle coute des bundles REELS ailleurs :
  //   « Army of Two » 19 bundles -> 0, « Call of Duty: Black Ops » 1 -> 0
  //   (le pack Annihilation), « Gears of War 2 » 2 items -> 0.
  //
  // La regle posee d'avance etait : adopter la phrase SEULEMENT si elle ne fait
  // perdre de bundle a AUCUN jeu temoin. Elle en fait perdre. Donc on garde la
  // conjonction. Si vous voulez la phrase citee, REMESUREZ la serie avant de
  // toucher a cette ligne : la raison du refus est dans la note du depot.
  const mots = ligneMotsBundle(server);
  assert.match(mots, /motsQ\.map\(w => 'title:' \+ w\)\.join\(' AND '\)/,
    'la requete Bundle n\'est plus la conjonction de jetons mesuree : la phrase citee coute 19 bundles '
    + 'a « Army of Two » et 1 a « Call of Duty: Black Ops » (mesure du 2026-09-20) — remesurer la serie temoin');
  assert.ok(!sansCommentaires(server).includes('title:("'),
    'la requete Bundle est passee en PHRASE CITEE alors que la mesure l\'a refusee');
});

test('doc : la note du depot garde la mesure qui justifie le refus', () => {
  if (doc === null) return;
  // Un refus mesure vaut une decision : si la mesure disparait de la note, le
  // refus redevient une impression, et la phrase citee reviendra « puisque ca a
  // l'air mieux ».
  assert.match(doc, /phrases? citee/i,
    'la note du depot doit dire que la phrase citee a ete MESUREE, et non seulement envisagee');
  assert.match(doc, /Army of Two/,
    'la note du depot doit citer le jeu qui perd ses bundles (mesure : 19 -> 0)');
  assert.match(doc, /19 bundles/, 'le chiffre de la perte doit figurer dans la note');
});

test('doc : AGENTS.md ne presente plus les deux noms comme des sources vivantes', () => {
  if (doc === null) return;
  assert.ok(!/uploader @aitus95/.test(doc),
    'la note du depot affirme encore une source par uploader qui rend numFound: 0');
  assert.ok(!/clearancebin` = public/.test(doc),
    'la note du depot affirme encore que clearancebin est public et sans cookie');
  assert.ok(!/PAS de cookie requis/.test(doc),
    'la note du depot affirme encore un acces sans cookie pour cette recherche');
});

test('doc : la connaissance est conservee, pas effacee', () => {
  if (doc === null) return;
  // Retirer la phrase fausse ne doit pas effacer le fait : les deux noms sont
  // cites COMME MORTS, avec leur mesure. Sans cela, quelqu'un les remettrait.
  assert.ok(doc.includes('aitus95'), 'le nom doit rester cite, avec sa mesure');
  assert.ok(doc.includes('clearancebin'), 'la collection doit rester citee, avec sa mesure');
  assert.match(doc, /uploader:aitus95/, 'la requete mesuree doit figurer dans la note');
  assert.match(doc, /numFound: 0/, 'le resultat mesure doit figurer dans la note');
  assert.match(doc, /27 397/, 'le numFound de clearancebin doit figurer dans la note');
});
