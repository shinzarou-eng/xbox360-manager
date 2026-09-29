// Tests du scoreur de pertinence.
//
// C'est la fonction qui decide de ce qui est MONTRÉ. Une regression ici ne casse
// rien de visible : elle remplit simplement la liste de resultats hors sujet, et
// personne ne s'en apercoit avant de perdre du temps a faire defiler.
//
// Le scoreur vit dans public/app.js (script navigateur) mais il est PUR : on
// l'extrait et on l'evalue ici, sans DOM. Les cas testes sont des cas REELS,
// releves dans l'application :
//   - « halo » remontait « Dragon Age: Nachalo » (sous-chaine)
//   - « Halo 3 » ne se distinguait pas de « Halo 4 » (mot de 1 lettre jete)
//   - 53 collections Redump de 700 Go passaient devant les vrais resultats
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const inline = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

// Le bloc va du repere « Pertinence » jusqu'a la fonction suivante. On evalue ce
// texte tel quel : il ne depend de rien d'autre.
const debut = inline.indexOf('// ---------- Pertinence');
const fin = inline.indexOf('function gameQuery()');
assert.ok(debut > 0 && fin > debut, 'le bloc de pertinence doit etre trouvable dans app.js');
const bloc = inline.slice(debut, fin);
const { relScore, noteResultat } = new Function(bloc + '\nreturn { relScore, noteResultat };')();

test('un mot ne se trouve pas a l interieur d un autre', () => {
  // le bug reel : « halo » dans « Nac-halo »
  assert.strictEqual(relScore('Dragon Age: Nachalo', 'halo'), 0);
  assert.ok(relScore('Halo 3', 'halo') > 0);
  // et l'inverse : le mot de la recherche est bien un mot du titre
  assert.ok(relScore('Halo: Combat Evolved', 'halo') > 0);
});

test('un numero de titre distingue les episodes', () => {
  // « Halo 3 » et « Halo 4 » obtenaient le meme score : le « 3 » etait jete
  // parce que le scoreur ne gardait que les mots de trois lettres et plus.
  assert.ok(relScore('Halo 3', 'halo 3') > relScore('Halo 4', 'halo 3'),
    'chercher « halo 3 » doit placer Halo 3 devant Halo 4');
  assert.ok(relScore('Halo 4', 'halo 3') < relScore('Halo 4', 'halo 4'),
    'Halo 4 doit mieux repondre a « halo 4 » qu a « halo 3 »');
});

test('tous les mots valent mieux qu une partie', () => {
  assert.ok(relScore('Halo 3 ODST', 'halo 3 odst') > relScore('Halo 3', 'halo 3 odst'));
  assert.ok(relScore('Halo 3', 'halo 3 odst') > 0, 'une partie suffit a etre pertinent');
});

test('les mots dans l ordre valent mieux que disperses', () => {
  assert.ok(relScore('Halo 3', 'halo 3') > relScore('3 Halo', 'halo 3'));
});

test('un titre qui commence par la recherche passe devant', () => {
  assert.ok(relScore('Halo', 'halo') > relScore('Combat Evolved Halo', 'halo'));
});

test('un titre court passe devant un titre long', () => {
  // pour « halo », « Halo » est une meilleure reponse que la novelle bonus
  assert.ok(relScore('Halo', 'halo') > relScore('Halo 3 Limited Edition Bonus Disc', 'halo'));
});

test('une recherche faite uniquement de mots vides reste utilisable', () => {
  // « the game » n'a aucun mot « utile ». Sans repli, la recherche ne trouverait
  // jamais rien : on garde alors les mots tels quels.
  assert.ok(relScore('The Game', 'the game') > 0);
  // En revanche « xbox » et « 360 » ne sont PAS des mots vides : un titre qui ne
  // les contient pas ne doit pas marquer de points pour autant.
  assert.strictEqual(relScore('Halo 3', 'xbox 360'), 0);
});

test('une recherche vide ne vaut aucun point', () => {
  assert.strictEqual(relScore('Halo 3', ''), 0);
  assert.strictEqual(relScore('', 'halo'), 0);
  assert.strictEqual(relScore('   ', 'halo'), 0);
});

test('un hors-sujet ne peut pas etre sauve par le contexte Xbox', () => {
  // Le malus et le bonus s'appliquaient autrefois dans le desordre : une
  // collection « Microsoft Xbox 360 - R - Redump.info » de 700 Go passait devant
  // les vrais resultats.
  assert.strictEqual(noteResultat('Microsoft Xbox 360 - R - Redump.info', 'halo', 'Microsoft Xbox 360 - R - Redump.info'), 0);
  assert.strictEqual(noteResultat('Wolfenstein 3D', 'halo', 'Wolfenstein 3D'), 0);
});

test('ce qui n est jamais le jeu est ecarte', () => {
  // Une correspondance de nom FORTE ne doit pas suffire a faire remonter une
  // bande-son : c'est le cas reel qui a montre qu'un malus de quelques points
  // etait trop faible. « Halo Audio CD » marquait 11.
  for (const jamais of ['Halo Audio CD', 'Halo 3 Original Soundtrack', 'Halo Artbook', 'Halo 3 Trailer', 'Halo (Part 1)', 'Halo - Making of']) {
    assert.strictEqual(noteResultat(jamais, 'halo', jamais), 0, jamais + ' ne doit pas etre retenu');
  }
});

test('une collection est penalisee, pas jetee', () => {
  // « The Master Chief Collection » est un vrai jeu : ecarter le mot
  // « collection » aveuglement ferait perdre de vrais resultats.
  const coll = noteResultat('Halo Collection', 'halo', 'Halo Collection');
  assert.ok(coll > 0, 'une collection reste un resultat possible');
  assert.ok(coll < noteResultat('Halo', 'halo', 'Halo'), 'mais elle passe apres le jeu lui-meme');
});

test('un vrai resultat reste retenu', () => {
  for (const bon of ['Halo 3', 'Halo 3 ODST (Europe)', 'Halo 3.iso', 'Halo Wars (USA)']) {
    assert.ok(noteResultat(bon, 'halo 3', bon) > 0, bon + ' doit etre retenu');
  }
});

test('le contexte aide sans jamais rendre pertinent', () => {
  const avecContexte = noteResultat('Halo', 'halo', 'Halo Xbox 360 USA');
  const sansContexte = noteResultat('Halo', 'halo', 'Halo');
  assert.ok(avecContexte > sansContexte, 'le contexte Xbox/region doit ajouter des points');
});

test('le TitleID est reconnu comme la recherche', () => {
  assert.ok(relScore('4D5307E6', '4d5307e6') > 0);
  assert.strictEqual(relScore('4D5307E6', '4d5307e7'), 0);
});
