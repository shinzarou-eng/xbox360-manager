// Garde-fous des traductions.
//
// Une traduction se degrade en silence : on ajoute un appel T(), on oublie le
// dictionnaire, et la chaine reste en francais pour tout le monde — y compris en
// anglais, ou personne ne le remarque si on ne teste que la langue par defaut.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');

const { DICT_ES, DICT_PT, DICT_FR_ES, DICT_FR_PT } = require('../public/i18n.js');
const app = lire('public/app.js');
const i18n = lire('public/i18n.js');
const html = lire('public/index.html');
const css = lire('public/style.css');

// Toutes les chaines anglaises passees a T().
//
// ON EVALUE la chaine extraite. L'extracteur lit la forme BRUTE du source, ou `\n`
// vaut DEUX caracteres ; le dictionnaire charge par Node porte la forme EVALUEE, un
// vrai retour a la ligne — et c'est celle-la que `T()` passe a l'execution
// (`DICT_ES[en]`). Comparer les deux formes revenait a valider une clef que le
// produit n'utilisait jamais : `"\n(Console connected: the script will be sent
// there.)"` etait rangee avec un backslash LITTERAL, donc cette phrase restait en
// anglais en espagnol comme en portugais, et le test la declarait traduite.
function evaluer(s) {
  try { return new Function('return "' + s.replace(/"/g, '\\"') + '";')(); }
  catch (e) { return s; }
}
function vocabulaire() {
  const re = /\bT\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3\s*(?:,|\))/g;
  const en = new Set();
  // LES FICHIERS QUI AFFICHENT. `lib/xbox1-local.js` en fait partie depuis qu'il
  // porte la carte du docteur : ses libelles passent par le `T` qu'on lui donne en
  // parametre, et si ce fichier n'etait pas lu ici, ses chaines anglaises
  // n'auraient NI espagnol NI portugais — et ses entrees de dictionnaire
  // seraient declarees orphelines, donc refusees. Un fichier a oublier ici, c'est
  // une langue entiere qui retombe en anglais sans que rien ne le dise.
  for (const f of ['public/app.js', 'server.js', 'lib/xbox1-local.js']) {
    for (const m of lire(f).matchAll(re)) if (m[4]) en.add(evaluer(m[4].replace(/\\'/g, "'")));
  }
  return [...en];
}

test('i18n : chaque chaine anglaise a son espagnol et son portugais', () => {
  const cles = vocabulaire();
  assert.ok(cles.length > 400, 'le vocabulaire doit etre large : ' + cles.length);
  const sansEs = cles.filter(k => !DICT_ES[k]);
  const sansPt = cles.filter(k => !DICT_PT[k]);
  assert.deepStrictEqual(sansEs, [], 'sans espagnol (' + sansEs.length + ') :\n  ' + sansEs.join('\n  '));
  assert.deepStrictEqual(sansPt, [], 'sans portugais (' + sansPt.length + ') :\n  ' + sansPt.join('\n  '));
});

test('i18n : aucune traduction orpheline', () => {
  // Une cle qui ne correspond a aucun appel est du vocabulaire mort : elle
  // survit aux renommages et finit par tromper celui qui la lit.
  const vivantes = new Set(vocabulaire());
  const frStatique = /const FR_EN_STATIQUE=(\{[\s\S]*?\});/.exec(app);
  if (frStatique) for (const k of Object.keys(eval('(' + frStatique[1] + ')'))) vivantes.add('STATIQUE:' + k);
  const mortes = [...Object.keys(DICT_ES), ...Object.keys(DICT_PT)]
    .filter(k => !vivantes.has(k) && !vivantes.has('STATIQUE:' + k) && !DICT_FR_ES[k] && !DICT_FR_PT[k]);
  assert.deepStrictEqual([...new Set(mortes)], [],
    'traductions qui ne servent a rien :\n  ' + [...new Set(mortes)].join('\n  '));
});

test('i18n : les quatre langues sont annoncees partout', () => {
  // Une langue ajoutee au selecteur mais oubliee dans le bouton du bandeau
  // resterait inatteignable. Les trois listes doivent dire la meme chose.
  assert.match(app, /const LANGS=\['fr','en','es','pt'\]/, 'la liste des langues');
  for (const l of ['fr', 'en', 'es', 'pt']) {
    assert.ok(html.includes("setLang('" + l + "')"), 'le selecteur doit proposer ' + l);
  }
  assert.match(app, /function basculeLang\(\)/, 'le bouton doit ouvrir le menu des langues');
  // Le serveur doit accepter exactement les memes.
  assert.match(lire('server.js'), /\['fr', 'en', 'es', 'pt'\]\.includes\(b\.lang\)/,
    'le serveur doit valider la langue recue');
});

test('i18n : les paragraphes d introduction existent en quatre langues', () => {
  const bloc = /const LEADS=(\{[\s\S]*?\n\});/.exec(app);
  assert.ok(bloc, 'LEADS doit exister');
  const leads = eval('(' + bloc[1] + ')');
  const ids = ['asLead', 'catLead', 'dlLead', 'conLead'];
  for (const l of ['fr', 'en', 'es', 'pt']) {
    assert.ok(leads[l], 'langue absente de LEADS : ' + l);
    for (const id of ids) {
      assert.ok(leads[l][id], 'paragraphe manquant : ' + l + '.' + id);
      assert.ok(leads[l][id].length > 40, 'paragraphe trop court : ' + l + '.' + id);
    }
  }
  // Chaque identifiant doit exister dans le HTML, sinon on ecrit dans le vide.
  for (const id of ids) assert.ok(html.includes('id="' + id + '"'), 'identifiant absent du HTML : ' + id);
});

test('i18n : le HTML statique ne reste pas en francais', () => {
  // Le HTML n'appelle pas T() : il est traduit par trDom() via DICT et
  // FR_EN_STATIQUE. Un libelle oublie la reste en francais DANS TOUTES LES
  // LANGUES, anglais compris — le defaut le plus difficile a voir.
  const blocD = /const DICT=(\{[\s\S]*?\});/.exec(app);
  const blocS = /const FR_EN_STATIQUE=(\{[\s\S]*?\});/.exec(app);
  assert.ok(blocD && blocS, 'les deux tables doivent exister');
  const table = Object.assign({}, eval('(' + blocD[1] + ')'), eval('(' + blocS[1] + ')'));
  // Les paragraphes longs et le corps de la fenetre cookie sont remplaces EN
  // BLOC par LEADS et CK_LANG : on ne les compte pas ici.
  const enBloc = /(asLead|catLead|dlLead|conLead|ckBody)/;
  // NOMS PROPRES ET CODE : ils ne se traduisent pas. Les traduire rendrait
  // intraduisible ce que l'utilisateur lit ailleurs — forums, Aurora, tutoriels.
  const jamais = new Set([
    'Xbox 360 Manager', 'XBOX', 'LIBRARY MANAGER', 'MANAGER', 'XboxUnity', 'XBLA', 'Indie',
    'TitleID', 'Title Updates', "Vimm's Vault", 'Archive.org', 'archive.org', 'DLC', 'DLC / XBLA',
    'GOD/DLC', 'USB', 'CSV', 'HOMEBREW', 'Homebrew', 'Scripts', 'Console', 'Type', 'DLC &amp; TU',
    'Game:\\User\\Scripts\\', 'secrets.json', 'xboxftp', 'logged-in-sig', 'logged-in-user', 'F12',
    'Application', 'Cookies', 'https://archive.org',
    'logged-in-sig=XXX...; logged-in-user=ton%40email.com',
    'logged-in-sig=XXX...; logged-in-user=you%40email.com',
    '🌐 EN', '🌐 FR', '🌐 ES', '🌐 PT',
    '🇫🇷 Français', '🇬🇧 English', '🇪🇸 Español', '🇵🇹 Português',
    'Choose your language · Choisis ta langue · Elige tu idioma · Escolha o seu idioma',
    'scripts LUA', 'dépôts officiels XboxUnity',
    // Une infobulle d'aide qui contient deja le chemin des outils de developpement.
    "connecte-toi > F12 > Application > Cookies > copie 'logged-in-sig' + 'logged-in-user' (format : logged-in-sig=XXX; logged-in-user=YYY)\">COOKIE ARCHIVE.ORG"
  ]);
  const fragments = html
    // Les paragraphes d'introduction sont remplaces EN BLOC par LEADS, et le
    // corps de la fenetre cookie par CK_LANG : leur contenu francais n'a pas a
    // figurer dans une table de fragments. On les retire AVANT de decouper,
    // sinon on mesure des morceaux de phrase que personne ne traduit un par un.
    .replace(/<p class="lead" id="(asLead|catLead|dlLead|conLead)">[\s\S]*?<\/p>/g, ' ')
    .replace(/<div id="ckBody">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, '\n')
    .split('\n').map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 2 && /[A-Za-zÀ-ÿ]/.test(s));
  const manquants = [...new Set(fragments)]
    .filter(s => !table[s] && !enBloc.test(s) && !jamais.has(s));
  assert.deepStrictEqual(manquants, [],
    'libelles statiques sans traduction (' + manquants.length + ') :\n  ' + manquants.join('\n  '));
});

test('i18n : chaque infobulle du HTML a sa traduction', () => {
  // LE TROU QUE PERSONNE NE POUVAIT VOIR. `trDom` traduit les `[title]`
  // (`app.js:141`), mais des infobulles FRANCAISES vivaient dans `index.html` sans
  // aucune entree dans les tables : elles restaient donc en francais en anglais, en
  // espagnol ET en portugais — la langue par defaut masque exactement ce defaut.
  // `scripts/audit-html-i18n.js` ne pouvait pas les voir : il retire les balises par
  // `/<[^>]+>/g`, donc TOUTE valeur d'attribut lui est invisible par construction.
  // C'est pour cela que le trou a pu grandir : 12 infobulles distinctes, 11 sans
  // traduction, dont une seule de la branche diaporama.
  const blocD = /const DICT=(\{[\s\S]*?\});/.exec(app);
  const blocS = /const FR_EN_STATIQUE=(\{[\s\S]*?\});/.exec(app);
  assert.ok(blocD && blocS, 'les deux tables doivent exister');
  const table = Object.assign({}, eval('(' + blocD[1] + ')'), eval('(' + blocS[1] + ')'));
  // La meme chaine de repli que `trDom` : le francais passe par `DICT` vers
  // l'anglais, puis l'anglais vers la langue visee. Verifier le seul `DICT` ne
  // dirait rien de l'espagnol ni du portugais.
  const titres = [...new Set([...html.matchAll(/title="([^"]*)"/g)].map(m => m[1]))]
    // Une valeur VIDE n'est pas une chaine a traduire (le repere de la barre de
    // disque en porte une) : la compter comme un manque ferait echouer la suite sur
    // une absence de texte.
    .filter(t => t.length > 0);
  assert.ok(titres.length >= 10, 'les infobulles doivent etre lues : ' + titres.length);
  // DETTE ANCIENNE, MESUREE, ET NOMMEE. Ces NEUF infobulles etaient deja la avant la
  // branche diaporama et n'ont jamais eu de traduction — mesure au merge-base de la
  // branche (11 infobulles distinctes, une seule traduite). On ne les corrige pas ici
  // (ce serait neuf chaines a ecrire dans trois langues dans une passe de correction)
  // mais on les NOMME, pour qu'une NOUVELLE infobulle non traduite fasse echouer la
  // suite. C'est le motif du `jamais` plus haut : une dette ancienne ne doit pas
  // empecher de garder la porte fermee aux nouvelles.
  const dette = new Set([
    'Parcourir',
    "Ordre d'affichage",
    'Dossier parent',
    'Rafraîchir',
    'Nouveau dossier sur la console',
    'Où la console range ses fichiers',
    'Comparer avec la console',
    // La longue infobulle du cookie, qui contient deja le chemin des outils de
    // developpement — elle est citee dans le `jamais` du test du HTML statique.
    "archive.org > connecte-toi > F12 > Application > Cookies > copie 'logged-in-sig' + 'logged-in-user' (format : logged-in-sig=XXX; logged-in-user=YYY)",
    // Le libelle du bouton de langue : les quatre noms de langue ne se traduisent
    // pas, et le titre les enumere.
    'Français · English · Español · Português'
  ]);
  const manquants = titres.filter(t => !table[t] && !dette.has(t));
  assert.deepStrictEqual(manquants, [],
    'infobulles sans traduction (' + manquants.length + ') :\n  ' + manquants.join('\n  '));
  // Et celles de la branche diaporama doivent VRAIMENT avoir les quatre langues :
  // c'est la seule qui soit de nous, et c'est celle qui a motive ce garde-fou. Le
  // francais passe par DICT_FR_ES / DICT_FR_PT (indexees sur le FRANCAIS) ou, a
  // defaut, par l'anglais via DICT_ES / DICT_PT — c'est exactement la chaine de
  // repli de `trDom`, et verifier le seul DICT ne dirait rien des deux autres.
  const notre = 'Lance le diaporama après 5 minutes sans activité';
  assert.ok(html.includes('title="' + notre + '"'), 'l infobulle du diaporama doit exister');
  const en = table[notre];
  assert.ok(en, 'l infobulle du diaporama doit avoir son anglais');
  const es = DICT_FR_ES[notre] || DICT_ES[en];
  const pt = DICT_FR_PT[notre] || DICT_PT[en];
  assert.ok(es, 'l infobulle du diaporama manque en espagnol');
  assert.ok(pt, 'l infobulle du diaporama manque en portugais');
});

test('i18n : chaque titre de vue existe en quatre langues', () => {
  // Ces chaines vivaient dans un tableau [fr, en] HORS de tout appel T() : mon
  // extracteur de vocabulaire ne les voyait pas, et le sous-titre de l'accueil
  // restait en anglais en espagnol. Une paire figee est un piege des qu'on
  // ajoute une langue.
  const bloc = /const VTITLE=(\{[\s\S]*?\n\});/.exec(app);
  assert.ok(bloc, 'VTITLE doit exister');
  const vt = eval('(' + bloc[1] + ')');
  for (const [vue, t] of Object.entries(vt)) {
    for (const champ of ['nom', 'sub']) {
      assert.ok(Array.isArray(t[champ]), vue + '.' + champ + ' doit etre un tableau');
      assert.strictEqual(t[champ].length, 4, vue + '.' + champ + ' doit avoir 4 langues');
      for (const s of t[champ]) assert.ok(s && s.length > 1, vue + '.' + champ + ' : entree vide');
    }
    // Le francais et l'anglais ne doivent pas etre identiques sur le sous-titre,
    // sinon c'est qu'on a recopie au lieu de traduire.
    assert.notStrictEqual(t.sub[0], t.sub[1], vue + ' : sous-titre FR et EN identiques');
  }
  // Et l'index de langue doit suivre la liste des langues.
  assert.match(app, /function langIdx\(\)\{const i=LANGS\.indexOf\(LANG\)/,
    'la lecture doit passer par LANGS, pas par un index en dur');
});

test('i18n : le menu de langues propose les quatre, et marque l active', () => {
  // Un menu qui ne marquerait pas la langue courante laisserait deviner d'ou
  // l'on part. Et il doit s'ouvrir au FOCUS autant qu'au survol : a la manette,
  // il n'y a pas de survol — c'est le seul chemin vers le menu.
  assert.match(css, /\.langwrap:hover \.langmenu,\.langwrap:focus-within \.langmenu/,
    'le menu doit s ouvrir au survol ET au focus');
  assert.match(app, /function basculeLang\(\)/, 'le clic sert au tactile');
  assert.match(app, /function majLangMenu\(\)/, 'la langue active doit etre marquee');
  assert.match(app, /b\.dataset\.l===\(LANG\|\|'fr'\)/, 'le marquage compare a la langue courante');
  for (const l of ['fr', 'en', 'es', 'pt']) {
    assert.ok(html.includes('data-l="' + l + '"'), 'le menu doit contenir ' + l);
  }
});
