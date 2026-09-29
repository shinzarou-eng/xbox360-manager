// Disques multiples.
//
// Un jeu sur plusieurs galettes partage UN SEUL TitleID. Sans le reconnaitre,
// l'application les prenait pour des doublons : badge « ×2 » dans la
// bibliotheque, et surtout un conseil DOUBLONS dans l'assistant — c'est-a-dire
// une invitation a supprimer une galette.
//
// La distinction est simple mais elle doit etre juste dans les deux sens : deux
// copies du MEME disque restent un doublon, et deux galettes differentes n'en
// sont pas un.
const test = require('node:test');
const assert = require('node:assert');
const fsApp = require('node:fs');
const path = require('node:path');

const { numeroDisque, sansNumeroDisque, sontDesDisques, MOTS_DISQUE } = require('../lib/pkg');

test('le numero de disque est reconnu sous ses differentes ecritures', () => {
  const cas = [
    ["Assassin's Creed IV Disc 2", 2],
    ['Halo 3', 0],
    ['Fable II (Disc 1)', 1],
    ['Jeu - Disk 3', 3],
    ['Jeu DVD-2', 2],
    ['Jeu CD1', 1],
    ['Jeu cd 4', 4],
    ['Sans numero', 0],
  ];
  for (const [nom, attendu] of cas) {
    assert.strictEqual(numeroDisque(nom), attendu, nom + ' -> ' + attendu);
  }
});

test('un nom se debarrasse proprement de son suffixe de disque', () => {
  assert.strictEqual(sansNumeroDisque("Assassin's Creed IV Disc 2"), "Assassin's Creed IV");
  assert.strictEqual(sansNumeroDisque('Fable II (Disc 1)'), 'Fable II');
  assert.strictEqual(sansNumeroDisque('Truc DVD-3'), 'Truc');
  assert.strictEqual(sansNumeroDisque('Sans suffixe'), 'Sans suffixe');
  // la parenthese porte aussi autre chose : elle ne doit pas rester ouverte
  const h = sansNumeroDisque('Halo 3 Multiplayer (ODST Disc 2)');
  assert.ok(!/[()]/.test(h), 'aucune parenthese orpheline : ' + h);
  assert.ok(/odst/i.test(h), 'le reste du nom est conserve : ' + h);
});

test('galettes differentes != doublon, meme disque = doublon', () => {
  // deux galettes du meme jeu : ce n'est PAS un doublon
  assert.strictEqual(sontDesDisques(["Assassin's Creed IV Disc 1", "Assassin's Creed IV Disc 2"]), true);
  assert.strictEqual(sontDesDisques(['Fable II', 'Fable II (Disc 2)']), true);
  // deux fois le meme disque : c'est un doublon
  assert.strictEqual(sontDesDisques(['Fable II', 'Fable II']), false);
  assert.strictEqual(sontDesDisques(['Fable II Disc 2', 'Fable II Disc 2']), false);
  assert.strictEqual(sontDesDisques(['Fable II']), false);
  assert.strictEqual(sontDesDisques([]), false);
});

test('« disc » est bien un mot de support, pas un mot du titre', () => {
  for (const m of ['disc', 'disk', 'cd', 'dvd', 'disque']) {
    assert.ok(MOTS_DISQUE.has(m), m + ' doit etre reconnu comme marqueur de disque');
  }
});

test('CRC32 : conforme au standard, donc comparable a celui de la console', () => {
  // FtpDll renvoie un CRC32 IEEE via XCRC. S'il ne correspondait pas au notre,
  // la verification des envois signalerait des fichiers corrompus qui ne le sont
  // pas — pire que pas de verification du tout.
  const { crc32, crc32Fichier } = require('../lib/fsutil');
  const crypto = require('crypto');
  const fs2 = require('fs');
  const os2 = require('os');
  const path2 = require('path');
  // valeurs de reference du CRC32 IEEE
  assert.strictEqual(crc32(Buffer.from('')) >>> 0, 0x00000000);
  assert.strictEqual(crc32(Buffer.from('a')) >>> 0, 0xE8B7BE43);
  assert.strictEqual(crc32(Buffer.from('123456789')) >>> 0, 0xCBF43926);
  // la version par morceaux doit donner le meme resultat que d'un bloc : c'est
  // tout l'enjeu, puisqu'un fichier de 8 Go ne tient pas en memoire
  const gros = crypto.randomBytes(3 * 1024 * 1024 + 7);
  const attendu = crc32(gros).toString(16).toUpperCase().padStart(8, '0');
  const f = path2.join(os2.tmpdir(), 'x360-crc-' + process.pid + '.bin');
  fs2.writeFileSync(f, gros);
  return crc32Fichier(f, 512 * 1024).then(v => {
    assert.strictEqual(v, attendu, 'le calcul par morceaux doit etre identique');
    fs2.rmSync(f, { force: true });
  });
});

test('ecraser le dossier d un TitleID ne doit pas detruire une autre galette', () => {
  // Toutes les galettes d'un jeu partagent `Games\<TID>`. Ecraser ce dossier pour
  // installer le disque 2 DETRUISAIT le disque 1, sans un mot.
  const { galettesEnConflit } = require('../lib/pkg');
  // conflits : deux galettes differentes
  assert.strictEqual(galettesEnConflit('Assassin\u2019s Creed IV Disc 1', 'Assassin\u2019s Creed IV Disc 2'), true);
  assert.strictEqual(galettesEnConflit('Halo 3 Multiplayer (ODST Disc 2)', 'Halo 3'), true);
  assert.strictEqual(galettesEnConflit('Halo 3', 'Halo 3 Multiplayer (ODST Disc 2)'), true);
  // pas de conflit : meme galette, donc remplacement legitime
  assert.strictEqual(galettesEnConflit('Fable II', 'Fable II'), false);
  assert.strictEqual(galettesEnConflit('Fable II', 'fable_ii.iso'), false);
  assert.strictEqual(galettesEnConflit('Jeu Disc 1', 'Jeu'), false);
  assert.strictEqual(galettesEnConflit('Jeu Disc 2', 'Jeu (Disc 2)'), false);
});

// ---------------------------------------------------------------------------
// COMBIEN DE GALETTES, ET LESQUELLES SONT LA.
//
// Le bloc vit dans `public/app.js` (script navigateur) mais il est PUR : on
// l'extrait et on l'evalue ici, sans DOM, comme `test/pertinence.test.js` le fait
// pour le scoreur. Ce qui est mesure ici decide de ce que l'utilisateur LIT :
// « 1 disque sur 2 installe » ou « 1 disque installe ». Se tromper d'un cote
// invente un total, de l'autre cache la moitie du jeu.
//
// Les noms des cas sont REELS : ceux du vault (media 74497 / 74496 pour
// Castlevania: Lords of Shadow) et ceux des fichiers du depot.
const inlineApp = fsApp.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const debutGal = inlineApp.indexOf('// ---------- Disques');
const finGal = inlineApp.indexOf('// ---------- Fin disques');
assert.ok(debutGal > 0 && finGal > debutGal,
  'le bloc « Disques » doit etre trouvable dans app.js (reperes // ---------- Disques / Fin disques)');
const blocGal = inlineApp.slice(debutGal, finGal);
// Le bloc appelle `T()` (toute chaine visible passe par la). On evalue avec une
// doublure qui rend le FRANCAIS : c'est la langue des phrases mesurees ci-dessous,
// et c'est aussi celle que le bloc emploie, donc la seule qui puisse dire si la
// phrase est celle qu'on veut.
const GAL = new Function('T', blocGal + '\nreturn { disqueDuNom, disquesDisponibles, resumeDisques, ligneDisques, resumeBiblio };')((fr) => fr);

test('un nom de fichier de galette donne SON numero, et zero sans marqueur', () => {
  // Les noms reels du vault.
  assert.strictEqual(GAL.disqueDuNom('Castlevania - Lords of Shadow (USA, Europe) (En,Fr,De,Es,It) (Disc 1).iso'), 1);
  assert.strictEqual(GAL.disqueDuNom('Castlevania - Lords of Shadow (USA, Europe) (En,Fr,De,Es,It) (Disc 2).iso'), 2);
  assert.strictEqual(GAL.disqueDuNom("Assassin's Creed IV Disc 2"), 2);
  assert.strictEqual(GAL.disqueDuNom('Jeu DVD-3'), 3);
  assert.strictEqual(GAL.disqueDuNom('Jeu CD1'), 1);
  // « Blue Dragon » n'a AUCUN marqueur : ne rien inventer.
  assert.strictEqual(GAL.disqueDuNom('Blue Dragon (Europe) (En,Fr,De,Es,It).iso'), 0);
  assert.strictEqual(GAL.disqueDuNom('Disc 1.rar'), 1);
  assert.strictEqual(GAL.disqueDuNom(''), 0);
  assert.strictEqual(GAL.disqueDuNom(null), 0);
});

test('le numero de galette d app.js et celui du serveur ne doivent pas diverger', () => {
  // DEUX implementations du meme motif existent — une par terrain (le client ne
  // peut pas require un module du serveur). Deux copies d'une meme intention
  // divergent toujours : on les epingle l'une a l'autre sur des cas reels ET sur
  // des pieges, pour que la divergence echoue ICI plutot qu'a l'ecran.
  const cas = [
    'Castlevania - Lords of Shadow (USA, Europe) (En,Fr,De,Es,It) (Disc 1).iso',
    'Castlevania - Lords of Shadow (USA, Europe) (En,Fr,De,Es,It) (Disc 2).iso',
    "Assassin's Creed IV Disc 2", 'Halo 3', 'Fable II (Disc 1)', 'Jeu - Disk 3',
    'Jeu DVD-2', 'Jeu CD1', 'Jeu cd 4', 'Sans numero', 'Disc 1.rar',
    'Halo 3 Multiplayer (ODST Disc 2)', ''
  ];
  for (const nom of cas) {
    assert.strictEqual(GAL.disqueDuNom(nom), numeroDisque(nom),
      'les deux numeros de galette divergent sur : ' + JSON.stringify(nom));
  }
});

test('combien de galettes la source annonce, et lesquelles', () => {
  const deux = [
    { id: '74497', file: 'Castlevania - Lords of Shadow (USA, Europe) (En,Fr,De,Es,It) (Disc 1).iso' },
    { id: '74496', file: 'Castlevania - Lords of Shadow (USA, Europe) (En,Fr,De,Es,It) (Disc 2).iso' }
  ];
  assert.deepStrictEqual(GAL.disquesDisponibles(deux), [1, 2]);
  // L'ORDRE DES MEDIAS N'EST PAS L'ORDRE DES DISQUES : ici le Disc 2 porte l'id
  // le PLUS PETIT. Trier par id donnerait « le disque 2 d'abord ».
  assert.deepStrictEqual(GAL.disquesDisponibles([deux[1], deux[0]]), [1, 2]);
  // Un media sans marqueur n'est PAS une galette : compter dessus inventerait un
  // total de 2 la ou la source n'en annonce qu'un.
  assert.deepStrictEqual(GAL.disquesDisponibles([{ file: 'Blue Dragon (Europe).iso' }]), []);
  assert.deepStrictEqual(GAL.disquesDisponibles([]), []);
  assert.deepStrictEqual(GAL.disquesDisponibles(null), []);
});

test('resume de la source : le total n existe que si la source l a dit', () => {
  const deux = [{ file: 'Gun (Disc 1).iso' }, { file: 'Gun (Disc 2).iso' }];
  const r = GAL.resumeDisques(deux, 'url1');
  assert.strictEqual(r.total, 2);
  assert.deepStrictEqual(r.manquantsNums, [1, 2]);
  // L'ADRESSE de chaque galette doit rester portee par la ligne : c'est elle qui
  // rend le disque 2 prenable en UN clic.
  assert.strictEqual(r.parNum[2].url, 'url1');

  // Une source qui ne dit RIEN du nombre total : on ne fabrique pas de « sur 2 ».
  // Un media SANS marqueur de galette n'est meme pas une galette : `dispo` est
  // vide, et c'est ce vide qui interdit d'ecrire un total.
  const un = GAL.resumeDisques([{ file: 'Blue Dragon (Europe).iso' }], 'url2');
  assert.strictEqual(un.total, 0);
  assert.deepStrictEqual(un.dispo, []);
  assert.strictEqual(un.solo, null);

  // UNE SEULE galette annoncee : la source dit « ce media », pas « combien de
  // galettes a ce jeu ». `solo` porte donc la LIGNE a prendre en un clic.
  const s = GAL.resumeDisques([{ file: 'Gun (Disc 1).iso' }], 'url3');
  assert.strictEqual(s.total, 0, 'une seule galette ne fait pas un total de 1');
  assert.deepStrictEqual(s.dispo, [1]);
  assert.strictEqual(s.solo.n, 1);
  assert.strictEqual(s.solo.url, 'url3');
});

test('un jeu a UNE galette ne doit RIEN afficher de nouveau', () => {
  // Le bruit est un defaut : « 1 disque sur 1 » sur chacun des 41 jeux installes
  // serait une ligne que personne n'a demandee.
  assert.strictEqual(GAL.resumeDisques([{ file: 'Gun (USA, Europe).iso' }], 'u').total, 0);
  assert.strictEqual(GAL.ligneDisques({ total: 0, dispo: [] }), null);
  assert.strictEqual(GAL.ligneDisques({ total: 1, dispo: [1] }), null);
  // Une seule galette annoncee et disponible : aucun manque, aucun bruit.
  assert.strictEqual(GAL.ligneDisques({ total: 1, dispo: [1], manquantsNums: [] }), null);
});

test('la ligne dit combien de galettes, et lesquelles manquent', () => {
  const l = GAL.ligneDisques({ total: 3, dispo: [1, 3], manquantsNums: [1, 3] });
  assert.ok(l, 'une ligne est due des que le total depasse 1');
  assert.match(l.txt, /3/);
  // Les galettes presentes ET les manquantes doivent etre nommees : « il en
  // manque une » ne dit pas laquelle prendre.
  assert.match(l.txt, /1/);
  assert.match(l.txt, /3/);
  const l2 = GAL.ligneDisques({ total: 2, dispo: [2], manquantsNums: [2] });
  assert.ok(l2.txt.length > 0);
});

// ---------------------------------------------------------------------------
// LA FICHE DU JEU : « N disque(s) sur M installe(s) »
// ---------------------------------------------------------------------------
test('la fiche ne dit « sur M » que si M est connu, et rien pour une seule galette', () => {
  // Total connu par la source : le cas Castlevania, ou l on a la moitie du jeu.
  // L'ACCORD EST CELUI DU NOMBRE INSTALLE, pas du total : « 1 disque sur 2
  // installe » — l'adjectif qualifie les disques qui sont la.
  assert.strictEqual(GAL.resumeBiblio({ discs: 1 }, { total: 2 }), '1 disque installé sur 2');
  assert.strictEqual(GAL.resumeBiblio({ discs: 2 }, { total: 2 }), '2 disques installés sur 2');
  // Total INCONNU : on dit ce qu'on sait, et on dit qu'on ne sait pas le reste.
  assert.strictEqual(GAL.resumeBiblio({ discs: 2 }, { total: 0 }),
    '2 disques installés — le nombre total n\'est pas connu de cette source');
  // UNE SEULE GALETTE : bruit interdit, dans les deux sens.
  assert.strictEqual(GAL.resumeBiblio({ discs: 1 }, { total: 0 }), null);
  assert.strictEqual(GAL.resumeBiblio({ discs: 1 }, { total: 1 }), null);
  // Le nombre installe est ce qu'on lit sur le disque, le total vient de la source.
  assert.strictEqual(GAL.resumeBiblio({ discs: 2 }, { total: 3 }), '2 disques installés sur 3');
});

test('cleTitre : un fichier du depot et le jeu installe donnent la meme clef', () => {
  // C'est ce qui permet de reconnaitre un RESIDU — un fichier laisse dans le
  // depot alors que le jeu est deja installe. Cas reel : « Gun (USA, Europe)
  // (En,Fr,Es,It).iso » (6 Go) dans D:\_A_TRIER, et Gun (415607D3) installe.
  const { cleTitre } = require('../lib/pkg');
  assert.strictEqual(cleTitre('Gun (USA, Europe) (En,Fr,Es,It).iso'), 'gun');
  assert.strictEqual(cleTitre('Gun'), 'gun');
  assert.strictEqual(cleTitre('gun.iso'), 'gun');
  assert.strictEqual(cleTitre('Halo 3 (Europe) (Disc 1).iso'), 'halo3');
  assert.strictEqual(cleTitre('Halo 3: ODST Campaign Edition'), 'halo3odstcampaignedition');
  // Deux jeux differents ne doivent JAMAIS se confondre : mieux vaut manquer un
  // residu que d'annoncer « deja installe » a tort, ce qui ferait supprimer le
  // mauvais fichier.
  assert.notStrictEqual(cleTitre('Halo'), cleTitre('Halo 3'));
  assert.notStrictEqual(cleTitre('Fable II'), cleTitre('Fable III'));
  assert.strictEqual(cleTitre(''), '');
});
