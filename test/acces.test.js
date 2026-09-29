// Tests de lib/acces.js — la porte d'entree du reseau.
//
// Ce module decide qui peut piloter l'application depuis le reseau. Les cas qu'il
// faut eprouver sont ceux qu'on ne peut PAS provoquer a la main : le verrouillage
// apres cinq essais, l'expiration d'une session, et une adresse absente — qui doit
// echouer FERME, parce que c'est exactement la situation d'une requete dont on ne
// sait rien.
const test = require('node:test');
const assert = require('node:assert');

const A = require('../lib/acces');

test('acces : la boucle locale est de confiance, tout le reste est distant', () => {
  for (const a of ['127.0.0.1', '127.0.0.5', '::1', '::ffff:127.0.0.1']) {
    assert.ok(A.estLocal(a), a + ' doit etre la machine locale');
  }
  // CE QUI COMPTE : echouer FERME. Une adresse absente ou vide est le cas d'une
  // requete dont on ne sait rien — la traiter comme locale ouvrirait la porte a
  // tout ce qui n'a pas d'adresse.
  for (const a of ['192.168.1.30', '::ffff:192.168.1.30', '10.0.0.1', '', null, undefined, 'localhost']) {
    assert.ok(!A.estLocal(a), String(a) + ' doit etre DISTANT');
  }
});

test('acces : le code fait six chiffres, et deux tirages different', () => {
  const vus = new Set();
  for (let i = 0; i < 200; i++) {
    const c = A.nouveauCode();
    assert.match(c, /^\d{6}$/, 'code invalide : ' + c);
    vus.add(c);
  }
  // 200 tirages qui ne donnent qu'une poignee de valeurs signeraient un generateur
  // casse — ou un `padStart` oublie sur les petits nombres, qui rendrait « 42 » au
  // lieu de « 000042 » et reduirait l'espace a 10^5.
  assert.ok(vus.size > 180, 'trop peu de valeurs distinctes : ' + vus.size + '/200');
});

test('acces : la comparaison ne s arrete pas au premier caractere', () => {
  // On ne mesure pas le temps (trop instable en test) : on verifie le COMPORTEMENT
  // qui rend le temps constant possible — deux longueurs differentes ne LEVENT pas.
  // `timingSafeEqual` seul lever sur des longueurs differentes, et lever est une
  // reponse plus rapide que comparer.
  assert.doesNotThrow(() => A.memeSecret('123456', '12345'));
  assert.strictEqual(A.memeSecret('123456', '12345'), false);
  assert.strictEqual(A.memeSecret('123456', '123456'), true);
  assert.strictEqual(A.memeSecret('123456', '123457'), false);
  assert.strictEqual(A.memeSecret(null, undefined), true);
  assert.strictEqual(A.memeSecret('000042', '42'), false);
});

test('acces : cinq essais, puis on attend', () => {
  let t = 1000;
  const L = A.creerLimiteur({ maintenant: () => t });
  for (let i = 0; i < A.MAX_ESSAIS; i++) {
    assert.ok(L.autorise('10.0.0.9'), 'essai ' + (i + 1) + ' doit passer');
    L.echec('10.0.0.9');
  }
  assert.ok(!L.autorise('10.0.0.9'), 'le 6e essai doit etre refuse');
  assert.ok(L.attente('10.0.0.9') > 0, 'il doit rester un temps d attente a annoncer');
  // Une autre adresse n'est PAS punie pour celle-la : sinon un appareil du reseau
  // pourrait bloquer l'acces de tous les autres en essayant cinq fois.
  assert.ok(L.autorise('10.0.0.10'), 'une autre adresse garde ses essais');
  // Et la fenetre se vide toute seule.
  t += A.FENETRE_MS + 1;
  assert.ok(L.autorise('10.0.0.9'), 'apres la fenetre, l acces revient');
});

test('acces : une reussite efface les essais rates', () => {
  const L = A.creerLimiteur();
  L.echec('10.0.0.9'); L.echec('10.0.0.9'); L.echec('10.0.0.9');
  assert.strictEqual(L.reste('10.0.0.9'), A.MAX_ESSAIS - 3);
  L.reussite('10.0.0.9');
  assert.strictEqual(L.reste('10.0.0.9'), A.MAX_ESSAIS,
    'apres une reussite, le compteur doit repartir de zero');
});

test('acces : une session ouverte vaut, une expiree ne vaut plus', () => {
  let t = 10000;
  const S = A.creerSessions({ maintenant: () => t });
  const j = S.ouvrir();
  assert.ok(S.valide(j), 'la session qui vient d etre ouverte doit valoir');
  assert.ok(!S.valide('autre-chose'), 'un jeton invente ne vaut rien');
  assert.ok(!S.valide(''), 'un jeton vide ne vaut rien');
  assert.ok(!S.valide(null), 'un jeton absent ne vaut rien');
  t += A.SESSION_MS + 1;
  assert.ok(!S.valide(j), 'la session doit expirer');
  assert.strictEqual(S.nombre(), 0, 'et elle doit etre oubliee, pas seulement refusee');
});

test('acces : regenerer le code ferme toutes les sessions', () => {
  const S = A.creerSessions();
  const j1 = S.ouvrir();
  const j2 = S.ouvrir();
  assert.strictEqual(S.nombre(), 2);
  S.fermerTout();
  assert.ok(!S.valide(j1) && !S.valide(j2),
    'regenerer le code doit DECONNECTER les appareils appaires, sinon il ne sert a rien');
});

test('acces : le nombre de sessions est borne, et on oublie la plus ancienne', () => {
  const S = A.creerSessions();
  const jetons = [];
  for (let i = 0; i < 8; i++) jetons.push(S.ouvrir());
  assert.strictEqual(S.nombre(), 5, 'le nombre de sessions doit rester borne');
  assert.ok(!S.valide(jetons[0]), 'la plus ANCIENNE doit etre oubliee');
  assert.ok(S.valide(jetons[7]), 'la plus recente doit valoir — on n oublie pas l appareil qu on vient d appairer');
});

test('acces : on annonce les adresses ou l on peut vraiment aller', () => {
  // « 0.0.0.0 » n'est pas une destination. Sans cette liste, l'utilisateur ne peut
  // pas deviner quoi taper sur son telephone.
  const fausses = {
    'Wi-Fi': [
      { family: 'IPv4', address: '192.168.1.177', internal: false },
      { family: 'IPv6', address: 'fe80::1234', internal: false },
      { family: 'IPv4', address: '127.0.0.1', internal: true }
    ],
    'Ethernet': [{ family: 'IPv4', address: '10.0.0.4', internal: false }],
    'Loopback': [{ family: 'IPv4', address: '127.0.0.1', internal: true }]
  };
  assert.deepStrictEqual(A.adressesLocales(fausses), ['10.0.0.4', '192.168.1.177'],
    'IPv6 et boucle locale doivent etre ecartees, et le resultat trie');
  assert.deepStrictEqual(A.adressesLocales({}), []);
  assert.deepStrictEqual(A.adressesLocales(null), []);
  // Une meme adresse sur deux cartes ne doit pas etre annoncee deux fois.
  assert.deepStrictEqual(
    A.adressesLocales({ a: [{ family: 'IPv4', address: '10.0.0.4', internal: false }],
                        b: [{ family: 'IPv4', address: '10.0.0.4', internal: false }] }),
    ['10.0.0.4']);
});

test('acces : les sessions se rechargent depuis le disque et se purgent', () => {
  let t = 50000;
  const S = A.creerSessions({ maintenant: () => t });
  const j = S.ouvrir();
  const sauv = S.pourSauver();
  assert.strictEqual(sauv.length, 1);
  // Un redemarrage du serveur ne doit PAS demander de retaper le code.
  t += 1000;
  const S2 = A.creerSessions({ maintenant: () => t });
  S2.charger(sauv);
  assert.ok(S2.valide(j), 'la session doit survivre a un redemarrage');
  // Mais une session perimee rangee sur le disque ne doit pas ressusciter.
  t += A.SESSION_MS + 1;
  const S3 = A.creerSessions({ maintenant: () => t });
  assert.strictEqual(S3.charger(sauv), 0, 'une session perimee doit etre purge a la lecture');
  // Et une valeur absente ou abimee ne doit pas faire lever.
  assert.strictEqual(S3.charger(null), 0);
  assert.strictEqual(S3.charger('pas un tableau'), 0);
  assert.strictEqual(S3.charger([{ j: 'x' }, null, 42]), 0, 'les entrees sans expiration sont oubliees');
});
