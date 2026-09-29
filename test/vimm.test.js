// Tests de lib/vimm.js — les DEUX vaults Xbox 360 de Vimm, et l'URL de recherche
// qui va avec.
//
// Mesure du 2026-09-20 : `X360-D` est un SECOND vault Xbox 360, intitule « Xbox
// 360 (Digital) » (No-Intro, 17109 media). Le vault `Xbox360` ne contient que des
// disques ; `X360-D` contient les DLC, les Title Updates, les XBLA et les XBLIG.
// Meme HTML, meme page d'item : seul le code systeme change.
//
// Ce module ne fait AUCUN reseau — il construit une URL. Les tests s'executent
// donc sans toucher a vimm.net, et c'est voulu : la mesure reseau, elle, a ete
// faite a la main et est datee dans le rapport, pas ici.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const V = require('../lib/vimm');

// Sans parametre, on doit retomber sur le vault des DISQUES : c'est ce que les
// appelants existants envoient (le client appelle `/api/vimm?q=...`), et leur
// reponse ne doit pas changer d'un caractere.
test('vimm : sans systeme, on garde le vault des DISQUES', () => {
  assert.strictEqual(V.systeme(null), 'Xbox360', 'parametre absent');
  assert.strictEqual(V.systeme(undefined), 'Xbox360', 'parametre non fourni');
  assert.strictEqual(V.systeme(''), 'Xbox360', 'parametre vide');
  assert.strictEqual(V.systeme('   '), 'Xbox360', 'parametre blanc');
});

test('vimm : la requete par defaut est EXACTEMENT celle d avant le parametre', () => {
  // Comparaison au caractere pres avec l'URL qui etait ecrite en dur dans la
  // route. Si cette egalite casse, la recherche du vault des disques change de
  // forme (ordre des parametres, encodage) sans que personne ne l'ait demande.
  assert.strictEqual(V.urlListe(V.systeme(null), 'halo'),
    'https://vimm.net/vault/?p=list&system=Xbox360&q=halo');
});

test('vimm : X360-D est le vault digital, et son URL n est PAS celle des disques', () => {
  assert.strictEqual(V.systeme('X360-D'), 'X360-D');
  const d = V.urlListe(V.systeme('X360-D'), 'halo');
  const x = V.urlListe(V.systeme(null), 'halo');
  assert.match(d, /system=X360-D&q=halo$/);
  assert.notStrictEqual(d, x, 'les deux vaults ne doivent pas rendre la meme URL');
});

test('vimm : la casse du code ne compte pas, la forme rendue est celle du SITE', () => {
  // `x360-d` est le meme vault que `X360-D` : comparer a la lettre le raterait.
  // Mais c'est la forme du site qui doit sortir — c'est elle qui part dans l'URL.
  assert.strictEqual(V.systeme('x360-d'), 'X360-D');
  assert.strictEqual(V.systeme('XBOX360'), 'Xbox360');
  assert.strictEqual(V.systeme('  X360-d  '), 'X360-D');
  assert.match(V.urlListe(V.systeme('x360-d'), 'x'), /system=X360-D/);
});

test('vimm : un code INCONNU est refuse, jamais remplace par le defaut', () => {
  // Le defaut silencieux est le vrai danger : quelqu'un qui demande le vault
  // digital et recoit celui des disques ne peut pas s'en apercevoir, et un code
  // que le site ignore rend une page 404 dont le parseur ne tire aucune ligne —
  // donc une liste vide, qu'on confondrait avec « ce DLC n'existe pas ».
  //
  // Les espaces AUTOUR sont toleres (ils sont retires, cf. le test de casse) :
  // une valeur arrive d'une barre d'adresse ou d'un champ, pas d'une constante.
  // C'est l'interieur du code qui doit etre exact — « Xbox 360 » n'est pas
  // « Xbox360 », et c'est le genre d'a-peu-pres qui ferait scraper une 404.
  for (const faux of ['X360D', 'Xbox 360', 'Nintendo', 'x360', '0', '../../etc', 'X360-D&q=halo', 'X360-D/x']) {
    assert.strictEqual(V.systeme(faux), null, 'code a refuser : ' + JSON.stringify(faux));
  }
});

test('vimm : la recherche est ENCODEE, jamais collee dans l URL', () => {
  const u = V.urlListe('X360-D', 'Tom & Jerry  \u00e9');
  assert.strictEqual(u, 'https://vimm.net/vault/?p=list&system=X360-D&q=Tom%20%26%20Jerry%20%20%C3%A9');
  assert.ok(u.indexOf(' ') === -1, 'aucun espace brut ne doit rester dans l URL');
  // une recherche absente ne doit pas casser l'URL (la route passe `''`)
  assert.match(V.urlListe('Xbox360', ''), /&q=$/);
  assert.match(V.urlListe('Xbox360'), /&q=$/);
});

// GARDE-FOU DE SOURCE (mutation verifiee) : la route doit passer par ce module.
// Sans lui, une modification future pourrait remettre le code systeme en dur
// dans server.js et le parametre deviendrait un decor — deux vaults annonces,
// un seul interroge.
test('vimm : la route /api/vimm passe bien par ce module', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const debut = src.indexOf("u.pathname === '/api/vimm'");
  assert.ok(debut > 0, 'la route /api/vimm doit exister dans server.js');
  const bloc = src.slice(debut, src.indexOf("u.pathname === '/api/vimmfiles'", debut));
  // On compare du CODE, pas de la prose : les commentaires de ligne entiere sont
  // retires AVANT la comparaison. Sinon le commentaire qui explique la route
  // ferait passer le garde-fou a lui tout seul (le piege est deja arrive trois
  // fois dans ce depot).
  const code = bloc.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  // Retirer les commentaires ne suffit pas a cacher l'URL : elle est dans une
  // chaine, et `//` y apparait. C'est justement ce qu'on veut voir disparaitre.
  assert.ok(code.indexOf('system=Xbox360') === -1,
    'le code systeme est de nouveau ecrit en dur dans la route');
  assert.match(code, /Vimm\.systeme\(u\.searchParams\.get\('system'\)\)/, 'le parametre doit passer par Vimm.systeme');
  assert.match(code, /vimmFetch\(Vimm\.urlListe\(/, 'l URL doit etre construite par Vimm.urlListe');
});

// ---------------------------------------------------------------------------
// LES DEUX BADGES DE LA LIGNE : type et disponibilite
// ---------------------------------------------------------------------------
//
// Les deux lignes ci-dessous sont RECOPIEES VERBATIM d'une page de resultats
// telechargee le 2026-09-20 (`?p=list&system=X360-D&q=Tiger Woods PGA Tour 12`).
// Elles ne sont pas ecrites a la main : c'est la seule facon de verifier un
// parseur HTML sans inventer la forme qu'on pretend lire. Le contenu de chaque
// `<tr>` est conserve d'un bout a l'autre (aucun « … »), pour que les cellules
// `regions` / `ver` / `langs` soient mesurees elles aussi.
const LIGNE_TU = '<tr><td style="width:auto"><a href="/vault/999999" style="display:  none">9</a><a href= "/vault/126614">Tiger Woods PGA Tour 12: The Masters</a>&nbsp; <b class="redBorder" style="cursor:default" title="Title Update">TU</b></td><td style="width:65px; text-align:center"><div style="display:flex; flex-wrap:wrap; justify-content:center; gap:3px"><img src="/images/flags/world.png" class="flag" title="World"></div></td><td style="width:85px; text-align:center">1.0</td><td style="width:110px; text-align:center; font-size:10pt" class="responsive">-</td><td style="width:50px; text-align:center" class="responsive"><a href="/vault/?p=rating&amp;id=126614">none</a></td></tr>';
const LIGNE_DLC_MORTE = '<tr><td style="width:auto"><a href="/vault/999999" style="display:  none">9</a><a href= "/vault/126615">Tiger Woods PGA Tour 12: The Masters - Birdie Pack</a>&nbsp; <b class="redBorder" style="cursor:default" title="DLC">DLC</b> &nbsp;<span class="redBorder" style="cursor:default" title="Download unavailable - Please upload it!">&#x26a0;</span></td><td style="width:65px; text-align:center"><div style="display:flex; flex-wrap:wrap; justify-content:center; gap:3px"><img src="/images/flags/world.png" class="flag" title="World"></div></td><td style="width:85px; text-align:center">1.0</td><td style="width:110px; text-align:center; font-size:10pt" class="responsive">-</td><td style="width:50px; text-align:center" class="responsive"><a href="/vault/?p=rating&amp;id=126615">none</a></td></tr>';

test('vimm : le TYPE de la ligne est lu dans le badge, pas dans le nom', () => {
  // Le badge porte l'information dans `title` ; il n'AFFICHE qu'une
  // abbreviation (« TU », « DLC »). Lire le texte de l'ancre ne la donne donc
  // jamais : c'est ce que la premiere integration avait manque.
  const l = V.parseListe(LIGNE_TU + LIGNE_DLC_MORTE);
  assert.strictEqual(l.length, 2, 'les deux lignes doivent etre lues');
  assert.strictEqual(l[0].type, 'Title Update');
  assert.strictEqual(l[1].type, 'DLC');
  assert.strictEqual(l[0].name, 'Tiger Woods PGA Tour 12: The Masters',
    'le nom ne doit pas etre pollue par le badge');
});

test('vimm : une ligne CATALOGUEE mais non hebergee se distingue d une ligne telechargeable', () => {
  // La mesure qui a motive ce champ : 5 lignes sur 6 pour « WWE 2K17 », 2 sur 5
  // pour « Tiger Woods PGA Tour 12 », 0 sur 46 pour « halo ». Un item catalogue
  // n'est pas forcement heberge (« 17109 of 17434 known media » = indexe par
  // No-Intro), et sa fiche annonce « 0 KB ». Sans ce champ, l'utilisateur ne
  // l'apprend qu'apres deux clics.
  const l = V.parseListe(LIGNE_TU + LIGNE_DLC_MORTE);
  assert.strictEqual(l[0].available, true, 'un Title Update heberge reste disponible');
  assert.strictEqual(l[1].available, false, 'l avertissement « Download unavailable » = non heberge');
});

test('vimm : les cinq champs d origine sont INTACTS, les deux nouveaux viennent en plus', () => {
  // C'est la promesse « additif » : la reponse du vault des disques ne perd rien.
  // La comparaison est faite sur l'objet ENTIER, pas champ par champ, pour qu'un
  // champ disparu ou renomme fasse tomber le test.
  const l = V.parseListe(LIGNE_TU);
  assert.deepStrictEqual(l[0], {
    id: '126614',
    name: 'Tiger Woods PGA Tour 12: The Masters',
    regions: 'World',
    ver: '1.0',
    langs: '-',
    type: 'Title Update',
    available: true
  });
  assert.deepStrictEqual(Object.keys(l[0]),
    ['id', 'name', 'regions', 'ver', 'langs', 'type', 'available'],
    'les deux nouveaux champs doivent etre AJOUTES a la fin');
});

test('vimm : le vocabulaire des types n est pas fige dans le code', () => {
  // Le site emploie Addon, DLC, Title Update, Prototype, Demo, Translated,
  // Unlicensed, Bonus Disc, Xbox Live Arcade, Xbox Live Indie Games — et il en
  // ajoutera. Une liste blanche de types ferait disparaitre en silence tout ce
  // qui n'y figure pas : on recopie donc le `title` tel quel.
  const ligne = LIGNE_TU.replace('title="Title Update">TU', 'title="Bonus disc">B');
  assert.strictEqual(V.parseListe(ligne)[0].type, 'Bonus disc');
  // Et l'ORDRE des attributs ne doit pas compter (aujourd'hui `class` precede
  // `title`, rien ne le garantit demain).
  const inverse = LIGNE_DLC_MORTE.replace('class="redBorder" style="cursor:default" title="DLC"',
    'title="DLC" class="redBorder"');
  assert.strictEqual(V.parseListe(inverse)[0].type, 'DLC');
});

test('vimm : une ligne SANS badge reste disponible et sans type', () => {
  // Le cas majoritaire du vault des disques : 49 lignes sur « halo », une seule
  // portant un badge. Le badge est retire ici de la ligne verbatim ci-dessus —
  // c'est la seule mutation, et elle reproduit exactement cette forme.
  const sansBadge = LIGNE_TU.replace(/\s*<b class="redBorder"[^>]*>TU<\/b>/, '');
  const l = V.parseListe(sansBadge);
  assert.strictEqual(l[0].type, '');
  assert.strictEqual(l[0].available, true);
  assert.strictEqual(l[0].name, 'Tiger Woods PGA Tour 12: The Masters');
});

test('vimm : le parseur de liste n est pas recopie dans server.js', () => {
  // Garde-fou de source, mutation verifiee : le parseur lit desormais les badges
  // et vit dans le module PUR (testable sans reseau). Recopier son corps dans
  // server.js remettrait deux lectures du meme HTML — la seconde perdrait le
  // type et la disponibilite sans que rien ne le dise.
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const debut = src.indexOf('function vimmParseList(');
  assert.ok(debut > 0, 'vimmParseList doit exister dans server.js');
  const corps = src.slice(debut, src.indexOf('\n}', debut));
  assert.match(corps, /Vimm\.parseListe\(html\)/, 'server.js doit deleguer a lib/vimm.js');
  assert.ok(corps.indexOf('<tr>') === -1, 'le corps du parseur ne doit pas etre recopie ici');
  assert.ok(corps.indexOf('redBorder') === -1, 'la lecture des badges ne doit pas etre recopiee ici');
});

