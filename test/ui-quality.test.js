// Garde-fous de qualite visuelle sur public/index.html.
//
// Une revue de design est un instantane : ce qu'elle corrige se reperd a la
// modification suivante si rien ne le verrouille. Ces tests transforment les
// exigences en contrats verifiables — contraste WCAG, mouvement reduit, repli
// sur fenetre etroite, acces au clavier, echelle typographique.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { paddingsLitteraux, sansCommentaires: sansCommentairesCss } = require('../lib/audit-css');

const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(PUB, 'style.css'), 'utf8');
const inline = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');

// Retire les commentaires (JS, bloc, et HTML) en remplacant leur contenu par des
// ESPACES de meme longueur : les numeros de ligne signales restent exacts.
//
// Un garde-fou qui lit du texte brut se retourne contre son propre commentaire.
// C'est arrive trois fois dans ce depot : `server.listen(PORT)` expliquait le
// defaut en citant l'appel interdit ; puis le commentaire de la boite de dialogue
// citait `confirm()` et `prompt()` ; puis la documentation des helpers montrait
// `confirmer({titre, ...})`, ce qui faisait compter deux appels de trop. Un
// garde-fou doit lire le CODE, pas la prose qui l'explique.
function sansCommentaires(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[ \t])\/\/[^\n]*/gm, m => m.replace(/[^\n]/g, ' '));
}

// --- contraste WCAG ---------------------------------------------------------
// Compose une couleur (eventuellement translucide) sur un fond opaque avant de
// mesurer : #ffffffc5 sur #1a1a1a ne se lit pas comme du blanc pur.
const versRGB = (couleur, fond) => {
  const h = couleur.replace('#', '').trim();
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const rgb = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16));
  if (n.length < 8) return rgb;
  const a = parseInt(n.slice(6, 8), 16) / 255;
  const base = fond ? versRGB(fond) : [0, 0, 0];
  return rgb.map((v, i) => Math.round(v * a + base[i] * (1 - a)));
};
const luminance = (couleur, fond) => {
  const [r, g, b] = versRGB(couleur, fond).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  // b est le fond : on y compose a avant de mesurer
  const [l1, l2] = [luminance(a, b), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const token = nom => {
  const m = new RegExp('--' + nom + '\\s*:\\s*(#[0-9a-fA-F]{3,8})').exec(css);
  return m ? m[1] : null;
};

test('contraste : le texte courant atteint WCAG AA sur le fond', () => {
  const fond = token('bg-base');
  assert.ok(fond, 'la variable --bg doit etre definie');
  const c = contraste(token('text-1'), fond);
  assert.ok(c >= 4.5, 'texte principal a ' + c.toFixed(2) + ':1 — AA exige 4,5:1');
});

test('contraste : le texte secondaire atteint WCAG AA', () => {
  // --dim2 valait #6e7681, soit 4,12:1 : SOUS le seuil, alors qu'il porte du
  // texte reel a 10-11 px (identifiants, pastilles, libelles de section)
  const fond = token('bg-base');
  for (const nom of ['text-2', 'text-3']) {
    const c = contraste(token(nom), fond);
    assert.ok(c >= 4.5,
      '--' + nom + ' (' + token(nom) + ') est a ' + c.toFixed(2) + ':1 sur ' + fond +
      ' — insuffisant pour du texte. AA exige 4,5:1.');
  }
});

test('contraste : le texte des boutons principaux reste lisible', () => {
  // les boutons principaux portent une encre sombre sur l'accent : c'est ce
  // couple qu'il faut verifier, pas du blanc sur vert
  const c = contraste('#04140b', token('ac'));
  assert.ok(c >= 4.5, 'encre sur --ac : ' + c.toFixed(2) + ':1');
});

test('contraste : la hierarchie entre --dim et --dim2 est preservee', () => {
  // les deux doivent passer AA, mais rester visuellement distincts
  const a = contraste(token('text-2'), token('bg-base'));
  const b = contraste(token('text-3'), token('bg-base'));
  assert.ok(a > b + 0.8, '--text-2 (' + a.toFixed(2) + ') doit etre nettement plus lisible que --text-3 (' + b.toFixed(2) + ')');
});

// --- echelle typographique --------------------------------------------------
test('typographie : aucune taille en dessous de 10 px', () => {
  // 8 px et 9 px etaient utilises : illisibles, et hors de toute echelle.
  // On scanne AUSSI les styles inline de index.html — un libelle y etait reste
  // a 8 px alors que la feuille de style, elle, etait propre.
  const dansCss = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map(m => Number(m[1]));
  const dansHtml = [...html.matchAll(/font-size:\s*([\d.]+)px/g)].map(m => Number(m[1]));
  // ET les gabarits de app.js : un badge y est reste a 9 px, invisible pour ce
  // test qui ne regardait que la feuille et le HTML. C'est la sonde de rendu qui
  // l'a trouve, en mesurant la taille REELLEMENT rendue.
  const dansJs = [...inline.matchAll(/font-size:\s*([\d.]+)px/g)].map(m => Number(m[1]));
  const trop = [...dansCss, ...dansHtml, ...dansJs].filter(t => t < 10);
  assert.deepStrictEqual(trop, [], 'tailles trop petites : ' + trop.join(', ') + ' px');
});

test('typographie : les tailles de la feuille viennent de l echelle', () => {
  // une taille ecrite en dur echappe a l'echelle et recree la dispersion
  const brutes = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map(m => Number(m[1]));
  const echelle = new Set([12, 14, 20, 28, 40]);
  const hors = brutes.filter(v => !echelle.has(v));
  assert.deepStrictEqual(hors, [], 'tailles hors echelle : ' + hors.join(', ') + ' px');
});

test('typographie : une echelle de tailles est definie', () => {
  for (const t of ['fs-caption', 'fs-body', 'fs-subtitle', 'fs-title', 'fs-title-lg']) {
    assert.ok(new RegExp('--' + t + '\\s*:\\s*\\d+px').test(css), 'la taille --' + t + ' doit exister');
  }
});

test('typographie : une hauteur de ligne globale est definie', () => {
  // sans elle, le texte courant heritait du ~1.2 du navigateur, trop serre a 13 px
  assert.match(css, /--lh-body\s*:\s*[\d.]+/);
  assert.match(css, /body\{[^}]*line-height:var\(--lh-body\)/);
});

// --- mouvement --------------------------------------------------------------
test('mouvement : prefers-reduced-motion est respecte', () => {
  // l'interface bouge beaucoup (fanart floute, reflexions, survols, panneau
  // lateral) : ignorer cette preference peut provoquer un malaise
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('mouvement : les transitions nomment leurs proprietes, jamais `all`', () => {
  // `transition:all` anime aussi la mise en page et coute cher pour rien
  const mauvais = [...css.matchAll(/transition:\s*all\b/g)];
  assert.deepStrictEqual(mauvais.map(m => m[0]), [], 'transition:all introduit une animation de mise en page');
});

test('mouvement : les transitions d\'interface restent sous 300 ms', () => {
  const durees = [...css.matchAll(/transition:[^;}]*?(\d+)ms/g)].map(m => Number(m[1]));
  const longues = durees.filter(d => d > 300);
  assert.deepStrictEqual(longues, [], 'transitions trop longues (ms) : ' + longues.join(', '));
});

// --- repli sur fenetre etroite ---------------------------------------------
test('responsive : au moins un repli est prevu pour fenetre etroite', () => {
  // le CSS ne contenait AUCUNE requete de media : sous ~1080 px, la barre
  // d'onglets et les controles se chevauchaient sans repli possible
  const medias = [...css.matchAll(/@media[^{]*max-width:\s*(\d+)px/g)].map(m => Number(m[1]));
  assert.ok(medias.length >= 1, 'aucune requete de media sur la largeur');
  assert.ok(Math.max(...medias) >= 1000, 'la plus large coupure doit couvrir les fenetres etroites');
});

// --- acces au clavier -------------------------------------------------------
test('clavier : tout element cliquable non natif est atteignable au Tab', () => {
  // un <div onclick> sans tabindex est invisible au clavier : l'interface
  // etait inutilisable sans souris
  const sources = html;
  const fautifs = [];
  for (const m of sources.matchAll(/<(div|tr)\b([^>]*\bonclick=[^>]*)>/g)) {
    const tag = m[0];
    // les gabarits passent par des litteraux : on ignore ceux qui sont des
    // conteneurs sans interaction reelle (pas de onclick dans la balise)
    if (!/\bonclick=/.test(tag)) continue;
    if (!/tabindex=/.test(tag)) fautifs.push(tag.slice(0, 70));
  }
  assert.deepStrictEqual(fautifs, [],
    'elements cliquables inaccessibles au clavier :\n  ' + fautifs.join('\n  '));
});

test('clavier : Entree et Espace activent ces elements', () => {
  assert.match(inline, /addEventListener\('keydown'/);
  assert.match(inline, /Enter/);
});

test('clavier : une ligne de tableau garde sa semantique', () => {
  // role="button" sur un <tr> le sortirait de la structure du tableau et un
  // lecteur d'ecran ne saurait plus qu'il lit des lignes
  const mauvais = [...html.matchAll(/<tr[^>]*role="button"/g)];
  assert.deepStrictEqual(mauvais.map(m => m[0]), [], 'role="button" ne doit pas etre pose sur une ligne de tableau');
});

test('variables CSS : aucune reference orpheline', () => {
  // C'est le garde-fou qui manquait. En renommant tout le vocabulaire de la
  // feuille, 136 references dans les styles en ligne de index.html et dans les
  // gabarits de app.js sont devenues orphelines : `var(--panel)` ne resout plus
  // rien, donc l'element perd son fond, sa bordure ou sa couleur — en silence,
  // sans erreur console. Rien ne l'avait vu.
  const declarees = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  const orphelines = [];
  for (const [nom, src] of [['style.css', css], ['index.html', html], ['app.js', inline]]) {
    for (const m of src.matchAll(/var\((--[\w-]+)/g)) {
      if (!declarees.has(m[1])) orphelines.push(nom + ' : ' + m[1]);
    }
  }
  assert.deepStrictEqual([...new Set(orphelines)], [],
    'variable utilisee mais jamais declaree :\n  ' + [...new Set(orphelines)].join('\n  '));
});

test('variables CSS : tout ce qui est declare est utilise', () => {
  // un token declare et jamais employe est un reste de refonte : soit il sert,
  // soit il encombre l'echelle
  const declarees = [...new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]))];
  const tout = css + html + inline;
  const inutilisees = declarees.filter(v => (tout.match(new RegExp('var\\(\\' + v + '(?![\\w-])', 'g')) || []).length === 0);
  assert.deepStrictEqual(inutilisees, [],
    'token declare mais jamais utilise : ' + inutilisees.join(', '));
});

test('aucune classe utilisee sans style defini', () => {
  // Une classe absente de la feuille ne se voit pas : l'element s'affiche sans
  // mise en forme, sans erreur. C'est ainsi que `btn sm` (classe inexistante)
  // donnait des boutons INSTALLER au mauvais format.
  const definies = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
  // `catf` est un crochet de selection JS, pas une classe de style
  const CROCHETS = new Set(['catf']);
  const manquantes = [];
  for (const [nom, src] of [['index.html', html], ['app.js', inline]]) {
    for (const m of src.matchAll(/class="([^"]*)"/g)) {
      for (const c of m[1].split(/\s+/)) {
        if (!c || !/^[a-zA-Z][\w-]*$/.test(c)) continue;
        if (!definies.has(c) && !CROCHETS.has(c)) manquantes.push(nom + ' : ' + c);
      }
    }
  }
  assert.deepStrictEqual([...new Set(manquantes)], [],
    'classe utilisee mais non definie : ' + [...new Set(manquantes)].join(', '));
});

test('l\'anglais ne recoit pas les accents du francais', () => {
  // Les passes de correction d'accents ont deborde sur la deuxieme chaine de T() :
  // « TitleID copiéd », « No détails », « Move between éléments ». L'interface
  // anglaise est un livrable au meme titre que la francaise.
  const re = /T\(\s*'(?:[^'\\]|\\.)*'\s*,\s*'((?:[^'\\]|\\.)*)'/g;
  const fautives = [];
  for (const m of inline.matchAll(re)) {
    const accents = m[1].match(/[àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/g);
    if (accents) fautives.push('[' + [...new Set(accents)].join('') + '] ' + m[1].slice(0, 60));
  }
  assert.deepStrictEqual(fautives, [],
    'chaine anglaise accentuee :\n  ' + fautives.join('\n  '));
});

// --- langue : accents et integrite des identifiants -------------------------
test('aucun nom de propriete accentue (le code n\'est pas du texte)', () => {
  // Ce garde-fou manquait, et son absence a coute cher : en corrigeant les
  // accents du francais affiche, `it.detail` est devenu `it.détail`. Le mot
  // etait francais a l'ecran mais c'etait un NOM DE CHAMP JSON — le renommer
  // casse l'affichage en silence : aucune erreur, juste du vide.
  const fautifs = [];
  for (const [nom, src] of [['app.js', inline], ['index.html', html]]) {
    for (const m of src.matchAll(/\.([A-Za-z_$][\w$]*[À-ÿ][\w$]*)/g)) fautifs.push(nom + ' : .' + m[1]);
    for (const m of src.matchAll(/\b(const|let|var|function)\s+([A-Za-z_$][\w$]*[À-ÿ][\w$]*)/g)) fautifs.push(nom + ' : ' + m[2]);
  }
  assert.deepStrictEqual([...new Set(fautifs)], [],
    'identifiant de code accentue :\n  ' + [...new Set(fautifs)].join('\n  '));
});

test('les champs lus depuis le serveur gardent leur nom d\'origine', () => {
  // liste EXPLICITE des formes accentuees fautives : generer l'accentuation par
  // une regex donnait « tid » pour « tid » et le test se declenchait sur du vide.
  const ACCENTUES = ['.détail', '.détails', '.médias', '.média', '.titré', '.taille', '.erreur'];
  const fautifs = [];
  for (const [nom, src] of [['app.js', inline], ['index.html', html]]) {
    for (const a of ACCENTUES) {
      // Un champ ne doit pas etre suivi d'une LETTRE : `.erreur` ne doit pas
      // matcher `.erreurs`, qui n'est PAS accentue. Sans cette borne, le
      // garde-fou accuse un nom de champ parfaitement valide — et un garde-fou
      // qui crie au loup finit par etre ignore.
      // On cherche par indexOf plutot qu'avec une regex : echapper le motif
      // (points, parentheses) demandait une couche d'echappement de plus, et
      // c'est exactement ce qui a casse ce fichier.
      let n = 0, i = -1;
      while ((i = src.indexOf(a, i + 1)) >= 0) {
        const suite = src[i + a.length];
        if (suite && /[A-Za-z]/.test(suite)) continue;
        n++;
      }
      if (n) fautifs.push(nom + ' : ' + a + ' x' + n);
    }
  }
  assert.deepStrictEqual(fautifs, [],
    'un nom de champ JSON a ete accentue :\n  ' + fautifs.join('\n  '));
});

test('le francais affiche ne perd pas ses accents', () => {
  // On ne surveille QUE des formes non ambigues : noms, adverbes et infinitifs.
  // Les formes verbales (« la commande installe », « il supprime ») sont
  // correctes sans accent, et un garde-fou qui crie a tort finit par etre ignore.
  const MOTS = /\b(bibliotheque|telechargement|telechargements|telecharger|telechargeable|depot|resultat|resultats|element|elements|probleme|problemes|operation|operations|detail|details|fenetre|fenetres|repertoire|memoire|securite|numerique|definitivement|derniere|premiere|deja|pret|media|medias|personnalisee|referencee|verifier|reessayer|selectionnee|selectionnes|installee|installees|installes|supprimee|supprimees|supprimes|affichee|affichees)\b/;
  const fautives = [];
  for (const m of inline.matchAll(/T\(\s*'((?:[^'\\]|\\.)*)'\s*,/g)) {
    if (MOTS.test(m[1].toLowerCase())) fautives.push(m[1].slice(0, 70));
  }
  assert.deepStrictEqual([...new Set(fautives)], [],
    'chaine francaise sans accent :\n  ' + [...new Set(fautives)].join('\n  '));
});

test('les libelles du HTML ne perdent pas leurs accents non plus', () => {
  const MOTS = /\b(BIBLIOTHEQUE|TELECHARGER|DEPOT|SANTE|EMULATEURS|EXECUTABLE|ELEMENT|DEPLACER|SECURITE)\b/;
  const fautifs = [];
  for (const m of html.matchAll(/>([^<>{}]{2,60})</g)) {
    if (MOTS.test(m[1])) fautifs.push(m[1].trim().slice(0, 50));
  }
  assert.deepStrictEqual([...new Set(fautifs)], [],
    'libelle HTML sans accent : ' + [...new Set(fautifs)].join(' | '));
});

test('barres d\'outils : une seule action mise en avant', () => {
  // trois boutons de couleurs vives cote a cote = aucune action principale.
  // Le controle porte sur CHAQUE barre d'outils, pas sur la page entiere : dans
  // une modale de confirmation, un bouton rouge est legitime.
  assert.match(css, /button\.btn\.quiet/, 'le style discret doit exister');
  assert.match(css, /\.tb-tools/, 'les outils doivent pouvoir etre groupes');
  const barres = [...html.matchAll(/<div class="toolbar">([\s\S]*?)<\/div>\s*(?=<)/g)].map(m => m[1]);
  assert.ok(barres.length >= 3, 'les barres d\'outils doivent etre detectees');
  for (const b of barres) {
    const vives = (b.match(/class="btn (red|blue|orange)"/g) || []).length;
    assert.ok(vives <= 1, vives + ' boutons de couleur vive dans une meme barre d\'outils :\n  ' + b.replace(/\s+/g, ' ').slice(0, 160));
  }
});

test('etats actifs : des classes, pas des couleurs en ligne', () => {
  // poser style.background='var(--ac)' oblige a connaitre le theme dans le JS
  // et rend l'etat actif impossible a styler proprement
  assert.ok(!/\.style\.background\s*=/.test(inline),
    'une couleur est posee en style inline depuis le JS : utiliser une classe');
});

test('tableaux : pas d\'en-tete sans ligne', () => {
  // un <thead> au-dessus d'un corps vide donne l'impression d'une page inachevee
  assert.match(css, /table:has\(tbody:empty\)\s*thead/, 'un tableau vide doit masquer son en-tete');
});

test('tout identifiant recherche par le JS existe', () => {
  // Un $('x') qui ne trouve rien leve une TypeError : la fonction s'arrete au
  // milieu et l'ecran reste a moitie construit. C'est le symptome « c'est
  // bugue » par excellence, et il ne se voit pas dans le code.
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  for (const m of inline.matchAll(/id="([^"$`]+)"/g)) ids.add(m[1]); // ids crees par un gabarit
  const recherches = new Set();
  for (const m of inline.matchAll(/\$\('([^']+)'\)/g)) recherches.add(m[1]);
  for (const m of inline.matchAll(/getElementById\('([^']+)'\)/g)) recherches.add(m[1]);
  const manquants = [...recherches].filter(id => !ids.has(id) && !/[$`{}]/.test(id));
  assert.deepStrictEqual(manquants, [],
    'identifiant recherche mais inexistant : ' + manquants.join(', '));
});

test('toute fonction appelee depuis un attribut on* est definie', () => {
  const definies = new Set();
  for (const m of inline.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) definies.add(m[1]);
  for (const m of inline.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) definies.add(m[1]);
  const appelees = new Set();
  for (const m of (html + inline).matchAll(/\bon\w+="([^"]*)"/g)) {
    for (const f of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) appelees.add(f[1]);
  }
  // methodes et globales : ce ne sont pas des fonctions de l'application
  const METHODES = /^(forEach|getElementById|indexOf|querySelectorAll|querySelector|replace|toUpperCase|toLowerCase|writeText|map|filter|join|split|slice|some|every|find|includes|focus|click|push|trim|test|match|toString|padStart|startsWith|endsWith|add|remove|toggle|contains|reload|assign|setItem|getItem|open|close|confirm|alert|parseInt|fetch|setTimeout|clearTimeout|setInterval|clearInterval|String|Number|Boolean|Array|Object|JSON|Math|Date|stopPropagation|preventDefault)$/;
  const GLOBALES = /^(if|for|while|return|typeof|new|function|catch|switch|throw|delete|void|document|window|console|this)$/;
  const inconnues = [...appelees].filter(f => !definies.has(f) && !METHODES.test(f) && !GLOBALES.test(f));
  assert.deepStrictEqual(inconnues, [],
    'fonction appelee depuis un attribut mais non definie : ' + inconnues.join(', '));
});

test('aucun nom de classe ou d\'identifiant accentue', () => {
  // C'est le garde-fou qui manquait, et son absence a coute un bug visible a
  // l'ecran : en corrigeant les accents du francais affiche, `class="detail"` et
  // `id="detail"` sont devenus `détail` DANS LE HTML. Le CSS continuait de dire
  // `.detail` : plus aucune regle ne s'appliquait, et le panneau de detail
  // s'affichait comme un bloc ordinaire en bas de page.
  // Le test d'identifiants ne l'avait pas vu, parce que HTML et JS avaient ete
  // renommes de facon COHERENTE — seul le CSS ne suivait pas.
  const ACCENT = /[À-ÿ]/;
  const fautifs = [];
  for (const m of html.matchAll(/(class|id)="([^"]*)"/g)) {
    for (const v of m[2].split(/\s+/)) if (v && ACCENT.test(v)) fautifs.push(m[1] + '="' + v + '"');
  }
  for (const m of css.matchAll(/[.#]([A-Za-z][\w-]*[À-ÿ][\w-]*)/g)) fautifs.push('selecteur ' + m[0]);
  // ET dans les chaines de selecteur du JS : `querySelector('#détail')` ne
  // correspond a rien, rend null, et l'appel suivant leve une TypeError. C'est
  // arrive, et ce test ne le voyait pas : il ne regardait que HTML et CSS.
  for (const m of inline.matchAll(/querySelector(?:All)?\(\s*'([^']+)'/g)) {
    if (ACCENT.test(m[1])) fautifs.push('app.js selecteur ' + m[1]);
  }
  assert.deepStrictEqual([...new Set(fautifs)], [],
    'nom de code accentue :\n  ' + [...new Set(fautifs)].join('\n  '));
});

test('tout identifiant cite dans un selecteur #id du JS existe', () => {
  // `querySelector('#détail .dscroll')` ne matchait rien : null, puis TypeError,
  // et le panneau de detail restait bloque sur ses squelettes. Le test
  // « tout identifiant recherche par le JS existe » ne regardait que $('x') et
  // getElementById — pas les selecteurs.
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  for (const m of inline.matchAll(/id="([^"$`]+)"/g)) ids.add(m[1]);
  const manquants = [];
  for (const m of inline.matchAll(/querySelector(?:All)?\(\s*'([^']+)'/g)) {
    const sel = m[1];
    if (sel.includes('${')) continue;            // gabarit : verifie a l'execution
    for (const idm of sel.matchAll(/#([^\s>,.[:]+)/g)) {
      if (!ids.has(idm[1])) manquants.push('#' + idm[1] + '  (dans ' + sel + ')');
    }
  }
  assert.deepStrictEqual([...new Set(manquants)], [],
    'selecteur #id sans element correspondant : ' + [...new Set(manquants)].join(', '));
});

test('toute classe definie dans la feuille est citee quelque part', () => {
  // Une regle CSS dont le selecteur ne correspond a rien est du code mort qui
  // masque un bug : c'est exactement ainsi que `.detail` a cesse de s'appliquer.
  const definies = [...new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]))];
  const tout = html + inline;
  const jamais = definies.filter(c => !tout.includes(c));
  assert.deepStrictEqual(jamais, [],
    'classe definie mais citee nulle part : ' + jamais.join(', '));
});

test('la colonne de lecture est bornee, et la regle reste la derniere', () => {
  // Elle a d'abord ete posee au milieu de la feuille et n'a JAMAIS fonctionne :
  // les `padding:...` de #topbar et .view, declares plus bas, reinitialisent
  // `padding-inline`. Le contenu restait etire sur toute la largeur.
  assert.match(css, /--w-max:\s*\d+px/, 'la largeur de lecture doit etre definie');
  const lignes = css.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('/*') && !l.startsWith('*'));
  const derniere = lignes[lignes.length - 1] || '';
  assert.match(derniere, /^#topbar,#ctlbar,#vtitle,\.view\{padding-inline:/,
    'la regle de centrage doit rester la DERNIERE (actuelle : ' + derniere.slice(0, 60) + ')');
});

// --- integrite de la structure ---------------------------------------------
// Ce garde-fou manquait, et c'est le seul defaut qu'aucun autre test ne peut
// voir : un <div> non ferme. Le navigateur, lui, ne se plaint pas — il referme
// l'element a sa facon et la suite du document se retrouve imbriquee au mauvais
// endroit. La page s'affiche, simplement pas comme prevu : c'est exactement le
// symptome « on voit pas tout, c'est pas propre ».
const BALISES_VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// Decoupe en balises en respectant les guillemets : un attribut peut contenir
// « > » (title="archive.org > F12 > Application"), un regex naif s'y trompe.
function balises(html) {
  const out = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] !== '<') { i++; continue; }
    if (html.startsWith('<!--', i)) { const f = html.indexOf('-->', i); i = f < 0 ? html.length : f + 3; continue; }
    if (!/[a-zA-Z/]/.test(html[i + 1] || '')) { i++; continue; }
    let j = i + 1, q = null;
    while (j < html.length) {
      const ch = html[j];
      if (q) { if (ch === q) q = null; }
      else if (ch === '"' || ch === "'") q = ch;
      else if (ch === '>') break;
      j++;
    }
    const brut = html.slice(i, j + 1);
    const m = /^<(\/?)([a-zA-Z][\w-]*)/.exec(brut);
    if (m) out.push({ ferme: !!m[1], nom: m[2].toLowerCase(), auto: /\/>$/.test(brut) });
    i = j + 1;
  }
  return out;
}

test('index.html : toutes les balises sont fermees et correctement imbriquees', () => {
  const pile = [];
  const fautes = [];
  for (const b of balises(html)) {
    if (BALISES_VIDES.has(b.nom) || b.auto) continue;
    if (!b.ferme) { pile.push(b); continue; }
    const haut = pile[pile.length - 1];
    if (!haut) { fautes.push('</' + b.nom + '> sans ouverture'); continue; }
    if (haut.nom !== b.nom) { fautes.push('</' + b.nom + '> ferme <' + haut.nom + '> (non imbrique)'); continue; }
    pile.pop();
  }
  for (const reste of pile) fautes.push('<' + reste.nom + '> jamais ferme');
  assert.deepStrictEqual(fautes, [], 'structure HTML invalide :\n  ' + fautes.join('\n  '));
});

// CONSTRUCTEUR DE LIGNES -> IDENTIFIANT DU <tbody> QU'IL REMPLIT.
//
// On ne devine pas a quelle table appartient une ligne : on associe
// explicitement le constructeur a son <tbody>. Une heuristique par mot-cle
// produisait des faux positifs, et un garde-fou qui crie a tort finit par etre
// ignore.
//
// IL VIT HORS DES TESTS parce que DEUX garde-fous s'en servent : « chaque ligne
// a autant de cellules que son en-tete » (le compte des colonnes) et « chaque
// cellule de donnee porte le libelle de sa colonne » (le `data-l` des fiches du
// telephone). Deux copies auraient derive, et la seconde serait devenue fausse
// sans que rien ne le dise.
const LIGNES = {
  catRow: 'catBody',
  // LA SECTION DES SOURCES TIERCES du catalogue a sa propre table (Jeu, Type,
  // Region, Taille, Action) : sans cette ligne, ses cellules n'etaient comptees
  // par personne — ni le nombre de colonnes, ni le `data-l` des fiches.
  tiersRow: 'catTiersBody',
  searchDl: 'dlResults', searchVimm: 'dlResults', searchStore: 'dlResults',
  // La ligne Vimm a UN SEUL gabarit (`vimmRow`) depuis qu'elle porte le type et
  // la disponibilite : la recherche « Vimm » et la recherche « toutes »
  // l'affichent, et une reponse ancienne ne doit rien casser. Sans cette ligne
  // dans la table, le garde-fou ne compterait plus les cellules des lignes Vimm
  // — il ne trouverait plus de `<tr>` dans `searchVimm` et se tairait, ce qui est
  // exactement le « vert sur ce qu'il n'a pas regarde ».
  vimmRow: 'dlResults',
  loadFiles: 'dlFiles', vimmFiles: 'dlFiles', searchDlcTab: 'dlFiles',
  // LES CINQ TABLES QUE CETTE TABLE NE COUVRAIT PAS. Leurs lignes n'etaient
  // comptees par personne : une cellule de trop y serait passee inapercue, et le
  // `data-l` des fiches n'y etait verifie nulle part. Memes constructeurs, memes
  // deux garde-fous.
  loadHomebrew: 'hbBody',
  openOrganize: 'orgBody',
  dlmSearch: 'dlmResults', renderDlmFiles: 'dlmFiles', dlmFileRow: 'dlmFiles',
  scanFolderGo: 'scanBody',
  // ET LES DEUX PORTES DE SORTIE, qui ecrivent des lignes sans etre des
  // « constructeurs » : le resultat archive.org de #dlResults et les fichiers
  // archive.org de #dlFiles — le chemin le plus emprunte de la vue.
  dlResRender: 'dlResults', dlVimmGroups: 'dlResults', dlFilesRender: 'dlFiles'
};

test('tableaux : chaque ligne a autant de cellules que son en-tete', () => {
  // Un <td> de trop ne provoque aucune erreur : le navigateur ajoute une colonne
  // fantome, les donnees se decalent d'une case et l'en-tete ne correspond plus.
  // C'est arrive en ajoutant une colonne « Détail » a la vue Telechargements sans
  // retirer la cellule « vimm.net » des lignes Vimm.
  const entetes = {};
  for (const m of html.matchAll(/<thead>([\s\S]*?)<\/thead>\s*<tbody id="([^"]+)"/g)) {
    entetes[m[2]] = (m[1].match(/<th\b/g) || []).length;
  }
  const fautes = [];
  for (const [fn, id] of Object.entries(LIGNES)) {
    const corps = corpsDeFonction(inline, fn);
    if (!corps) { fautes.push('fonction ' + fn + ' introuvable'); continue; }
    const attendu = entetes[id];
    if (!attendu) { fautes.push('table #' + id + ' introuvable'); continue; }
    for (const tr of corps.match(/<tr\b(?:(?!<\/tr>)[\s\S])*<\/tr>/g) || []) {
      // une ligne de remplissage (squelette, etat vide) couvre les colonnes par
      // `colspan` : c'est le nombre de colonnes couvertes qui doit correspondre
      const n = [...tr.matchAll(/<td\b[^>]*>/g)]
        .reduce((s, t) => s + Number((/colspan="(\d+)"/.exec(t[0]) || [])[1] || 1), 0);
      if (n && n !== attendu) fautes.push(fn + ' -> #' + id + ' : ' + n + ' cellules pour ' + attendu + ' colonnes');
    }
  }
  assert.deepStrictEqual([...new Set(fautes)], []);
});

test('tableaux : chaque cellule de donnee porte le libelle de sa colonne (data-l)', () => {
  // SOUS 560 px, L'EN-TETE DISPARAIT ET CHAQUE CELLULE DEVIENT UNE LIGNE
  // « libelle : valeur » (la « fiche »). Le libelle est pose en `data-l` par le
  // constructeur de lignes et lu par la feuille (`content:attr(data-l)`) : sans
  // lui, la fiche montre « 584109B7 » sans dire que c'est un TitleID, et
  // « 2,3 Go » sans dire que c'est une taille. Le nom de la colonne n'est plus
  // ecrit nulle part a l'ecran — il n'existe QUE la.
  //
  // On ne verifie donc PAS que `enTete(` est appele : ce serait lire le
  // mecanisme. On verifie ce que la feuille lira, c'est-a-dire l'ATTRIBUT sur
  // chaque cellule de donnee. Et la source du libelle est verrouillee par
  // ailleurs : les en-tetes sont traduits par `trDom()` au demarrage, donc un
  // libelle recopie en dur serait faux en espagnol et en portugais.
  //
  // Les lignes de REMPLISSAGE (squelette, etat vide, erreur) portent un
  // `colspan` : elles couvrent N colonnes et n'en sont aucune, donc pas de
  // `data-l` — et la feuille rend leur `::before` nul.
  //
  // LE LIBELLE DOIT VENIR DE LA BONNE TABLE, ET NE PAS POUVOIR ETRE VIDE. La
  // presence de `data-l=` ne suffisait pas : `enTete` rend la chaine VIDE quand le
  // `<tbody>` demande n'existe pas, donc un identifiant mistyped
  // (`enTete('catBoddy',0)`) affichait toutes les fiches du telephone SANS leur
  // libelle — « 4D5307E6 » sans dire que c'est un TitleID — et le garde-fou
  // restait vert, puisque l'attribut etait la. Deux invariants le ferment :
  //   1. l'identifiant passe a `enTete()` est CELUI DU `<tbody>` QUE CE
  //      CONSTRUCTEUR REMPLIT — la table `LIGNES` le dit, et une seule fois ;
  //   2. l'en-tete vise EXISTE et porte un intitule : `enTete` ne peut donc pas
  //      rendre la chaine vide.
  const entetes = {};
  for (const m of html.matchAll(/<thead>([\s\S]*?)<\/thead>\s*<tbody id="([^"]+)"/g)) {
    entetes[m[2]] = [...m[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)]
      .map(x => x[1].replace(/<[^>]*>/g, '').trim());
  }
  const fautes = [];
  for (const [fn, id] of Object.entries(LIGNES)) {
    const corps = corpsDeFonction(inline, fn);
    if (!corps) { fautes.push('fonction ' + fn + ' introuvable'); continue; }
    for (const tr of corps.match(/<tr\b(?:(?!<\/tr>)[\s\S])*<\/tr>/g) || []) {
      for (const td of tr.match(/<td\b[^>]*>/g) || []) {
        if (/colspan=/.test(td)) continue;      // ligne de remplissage : aucune colonne
        if (!/data-l=/.test(td)) { fautes.push('sans libelle : ' + fn + ' -> #' + id + ' : ' + td.slice(0, 70)); continue; }
        const lu = /enTete\(\s*'([^']+)'\s*,\s*(\d+)\s*\)/.exec(td);
        if (!lu) { fautes.push('libelle qui ne vient pas d un en-tete : ' + fn + ' -> #' + id + ' : ' + td.slice(0, 70)); continue; }
        if (lu[1] !== id) {
          fautes.push('libelle lu dans #' + lu[1] + ' alors que ' + fn + ' remplit #' + id + ' : ' + td.slice(0, 70));
        } else if (!(entetes[id] || [])[Number(lu[2])]) {
          fautes.push('#' + id + ' n a pas d en-tete ' + lu[2] + ' : le libelle serait VIDE (' + fn + ')');
        }
      }
    }
  }
  assert.deepStrictEqual([...new Set(fautes)], [],
    'libelle de colonne absent ou faux : ' + [...new Set(fautes)].join(' | '));
});

// Retire d'une cellule la VALEUR (`<span class="v">…</span>`) et rend ce qui
// reste. On suit la PROFONDEUR des `<span>` : la valeur de `orgBody` contient
// elle-meme un `<span class="dim">` et le titre peut en porter un autre.
// S'arreter au premier `</span>` laisserait la fin de la valeur visible, donc un
// faux positif sur le `<br>` qui y est LEGITIME — dans la valeur un `<br>` saute
// bien la ligne, puisqu'elle est un bloc et non une rangee flex.
function sansValeur(html) {
  let out = '', i = 0;
  for (;;) {
    const d = html.indexOf('<span class="v">', i);
    if (d < 0) return out + html.slice(i);
    out += html.slice(i, d);
    let j = html.indexOf('>', d) + 1, prof = 1;
    while (prof > 0) {
      const s = html.indexOf('<span', j), e = html.indexOf('</span>', j);
      if (e < 0) break;                       // desequilibre : on s'arrete la
      if (s >= 0 && s < e) { prof++; j = s + 5; }
      else { prof--; j = e + 7; }
    }
    i = j;
  }
}

test('tableaux : la valeur d une cellule est UN seul element (jamais un <br> ni un bloc en enfant direct)', () => {
  // LA CELLULE EST UNE RANGEE FLEX : `::before` (le nom du champ) + la valeur.
  // Tout enfant DIRECT de plus devient une AUTRE case de cette rangee, et deux
  // d'entre eux sont muets a l'oeil :
  //   - un `<br>` NE SAUTE PLUS DE LIGNE : dans un conteneur flex c'est une case
  //     VIDE. `orgBody` et `scanBody` portent une sous-ligne « → … » sous le
  //     titre, et `dlmFileRow` un `<div>` de source : les deux se retrouvaient
  //     cote a cote avec le titre, sur la meme ligne ;
  //   - ce `<div>` se comprimait en lamelle au lieu de passer a la ligne.
  // D'ou l'invariant : une fois la valeur (`<span class="v">`) retiree, il ne
  // doit RIEN rester dans la cellule. On lit ce que la feuille lira — on ne
  // cherche pas `class="v"` ecrit dans le constructeur, on retire l'element et
  // on regarde ce qui reste.
  const fautes = [];
  for (const [fn, id] of Object.entries(LIGNES)) {
    const corps = corpsDeFonction(inline, fn);
    if (!corps) { fautes.push('fonction ' + fn + ' introuvable'); continue; }
    for (const tr of corps.match(/<tr\b(?:(?!<\/tr>)[\s\S])*<\/tr>/g) || []) {
      for (const td of tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/g) || []) {
        if (/colspan=/.test(td)) continue;      // ligne de remplissage : aucune colonne
        const dedans = td.slice(td.indexOf('>') + 1, td.lastIndexOf('</td>'));
        const reste = sansValeur(dedans).trim();
        if (!reste) continue;
        const bloc = /(<br\b|<(?:div|p|ul|ol|li|section|table|h[1-6])\b)/.exec(reste);
        fautes.push(fn + ' -> #' + id + ' : '
          + (bloc ? 'enfant direct ' + bloc[1] : 'contenu hors de la valeur')
          + ' — ' + reste.replace(/\s+/g, ' ').slice(0, 60));
      }
    }
  }
  assert.deepStrictEqual([...new Set(fautes)], [],
    'enfant direct dans une cellule de donnee : ' + [...new Set(fautes)].join(' | '));
});

test('la sonde d interface est autonome et n active pas le domaine Page', () => {
  // scripts/uicheck.js mesure le RENDU (debordements, egalite des marges,
  // colonnes, contraste compose) la ou les autres tests ne lisent que le code.
  // Il doit rester sans dependance et ne JAMAIS appeler `Page.enable` : c'est cet
  // appel qui fait planter le moteur de rendu. `Page.captureScreenshot`, lui, est
  // sans danger et reste autorise — c'est le seul moyen de juger la mise en page.
  const sonde = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'uicheck.js'), 'utf8');
  // le fichier doit PARSER : l'expression envoyee au navigateur est un template
  // literal, donc un simple backtick dans un commentaire termine la chaine et le
  // script ne demarre plus du tout — erreur deja commise. On retire la ligne
  // shebang, que `new Function` refuse.
  // Le shebang doit etre retire QUEL QUE SOIT le format de fin de ligne. En
    // JavaScript, `.` ne matche PAS `\r` : sur un fichier en CRLF — ce qu'un clone
    // Windows produit — `.*` s'arrete avant le \r, le \n attendu n'est pas la, le
    // shebang RESTE et `new Function` refuse `#!`. Le CI Windows echouait la.
    assert.doesNotThrow(() => new Function(sonde.replace(/^#!.*\r?\n/, '')), 'scripts/uicheck.js ne compile pas');
    // Et on verifie le cas qui a casse, au lieu d'attendre qu'il revienne :
    assert.doesNotThrow(() => new Function(sonde.replace(/\r?\n/g, '\r\n').replace(/^#!.*\r?\n/, '')),
      'scripts/uicheck.js doit compiler aussi en CRLF (clone Windows)');
  // on retire les commentaires avant d'inspecter : le fichier EXPLIQUE le piege
  const code = sonde.replace(/^\s*\/\/.*$/gm, '');
  const externes = [...code.matchAll(/require\('([^']+)'\)/g)].map(m => m[1])
    .filter(m => !['child_process', 'fs', 'os', 'path', 'http'].includes(m));
  assert.deepStrictEqual(externes, [], 'dependance externe dans la sonde : ' + externes.join(', '));
  assert.ok(!/['"]Page\.enable['"]/.test(code), '`Page.enable` fait planter le moteur : ne pas l\'appeler');
  assert.match(code, /Runtime\.evaluate/, 'la sonde doit mesurer via Runtime.evaluate');
});

// Extrait le corps d'une fonction par comptage d'accolades, en respectant les
// chaines et les commentaires : un `{` dans une chaine ne doit pas compter.
function corpsDeFonction(src, nom) {
  const depart = src.indexOf('function ' + nom + '(');
  if (depart < 0) return null;
  let i = src.indexOf('{', depart);
  if (i < 0) return null;
  let prof = 0, q = null, bloc = null;
  for (; i < src.length; i++) {
    const c = src[i], suiv = src[i + 1];
    if (bloc) { if (c === '*' && suiv === '/') { bloc = null; i++; } continue; }
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '/' && suiv === '/') { const f = src.indexOf('\n', i); i = f < 0 ? src.length : f; continue; }
    if (c === '/' && suiv === '*') { bloc = 1; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') prof++;
    else if (c === '}') { prof--; if (!prof) return src.slice(src.indexOf('{', depart), i + 1); }
  }
  return null;
}

test('la coque borne la hauteur des vues : sinon rien ne peut defiler', () => {
  // C'est le defaut qui a echappe le plus longtemps, et il expliquait « on voit
  // pas tout » : `#wrap` n'avait AUCUNE regle. Son parent etant un simple bloc,
  // `main{flex:1}` ne s'appliquait a rien, donc la vue n'avait pas de hauteur
  // bornee, donc son `overflow:auto` ne declenchait aucune barre de defilement.
  // Le contenu depassait le bas de la fenetre et `overflow:hidden` sur body le
  // coupait : ni la molette ni la barre ne pouvaient l'atteindre.
  //
  // Trois proprietes sont indispensables, et l'absence de n'importe laquelle
  // ramene le bug : le conteneur doit etre flex, prendre la place restante, et
  // pouvoir devenir plus petit que son contenu (`min-height:0`).
  // On retire les COMMENTAIRES avant de chercher une regle : ils citent le code
  // (c'est leur role), et un commentaire qui contient `main{flex:1}` se faisait
  // passer pour la regle elle-meme.
  const cssNu = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Le selecteur est echappe proprement : un simple prefixe `\` transformait
  // `body` en `\body`, ou le moteur lit une limite de mot — la regle n'etait
  // jamais trouvee.
  const regle = sel => (new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}').exec(cssNu) || [])[1] || '';
  const wrap = regle('#wrap');
  assert.ok(wrap, '#wrap doit avoir une regle : sans elle la vue ne defile pas');
  assert.match(wrap, /display:flex/, '#wrap doit etre un conteneur flex');
  assert.match(wrap, /flex:1/, '#wrap doit prendre la hauteur restante');
  assert.match(wrap, /min-height:0/, '#wrap doit pouvoir etre plus petit que son contenu');
  assert.match(regle('main'), /min-height:0/, 'main doit pouvoir etre plus petit que son contenu');
  assert.match(regle('body'), /height:100vh/, 'body doit borner la hauteur de la coque');
  assert.match(regle('body'), /overflow:hidden/, 'body ne doit pas defiler lui-meme : c\'est la vue qui defile');
  // et la vue doit rester defilante
  const view = /\.view\{([^}]*)\}/.exec(cssNu)[1];
  assert.match(view, /overflow:auto/, 'la vue doit defiler');
  assert.match(view, /flex:1/, 'la vue doit occuper la hauteur disponible');
});

// --- etats : chargement, vide, aide -----------------------------------------
test('etats de chargement : des squelettes, pas du texte nu', () => {
  // une attente doit avoir la FORME de ce qui va s'afficher
  assert.match(css, /\.skel-card/, 'le squelette de carte doit exister');
  assert.match(css, /\.skel-row/, 'le squelette de ligne doit exister');
  assert.match(inline, /skelCards|skelRows/, 'les squelettes doivent etre utilises');
  assert.match(css, /@keyframes skel/, 'le balayage de chargement doit etre defini');
});

test('etats vides : un titre, une explication, une issue', () => {
  // "Aucun resultat" sans suite est une impasse, pas un etat
  assert.match(css, /\.empty\b/, 'le composant d\'etat vide doit exister');
  assert.match(inline, /function etatVide/);
  assert.match(inline, /empty-t/, 'l\'etat vide doit porter un titre');
  assert.match(inline, /empty-h/, 'l\'etat vide doit expliquer');
});

test('modales : le focus ne s echappe pas derriere', () => {
  // sans piege a focus, Tab sortait de la modale et se perdait sur la page
  assert.match(inline, /function ouvrirSurcouche/);
  assert.match(inline, /function fermerSurcouche/);
  assert.match(inline, /aria-modal/, 'la surcouche doit etre annoncee comme modale');
  // on accepte les deux formes : `!==` pour sortir tot, `===` pour entrer
  assert.match(inline, /e\.key\s*[!=]==?\s*'Tab'/, 'le piege a focus doit intercepter Tab');
  assert.match(inline, /_focusAvant/, 'le focus doit etre rendu a la fermeture');
});

test('aide clavier : consultable, pas a deviner', () => {
  assert.match(html, /id="helpModal"/, 'la surcouche d\'aide doit exister');
  assert.match(inline, /function ouvrirAide/);
  assert.match(css, /\.kbd\b/, 'une touche doit avoir la forme d\'une touche');
});
test('fluidite : la grille n\'est pas reconstruite quand rien ne change', () => {
  // renderGames remplacait tout le innerHTML a chaque sondage (8 s) : les
  // jaquettes etaient recreees en boucle et la bibliotheque scintillait
  assert.match(inline, /_renderSig/, 'aucune signature de rendu : la grille sera reconstruite a chaque sondage');
  assert.match(inline, /if\s*\(\s*sig\s*===\s*_renderSig\s*\)\s*\{\s*majStatut\(\);\s*return;\s*\}/);
});

test('fluidite : les couches de flou restent limitees', () => {
  // chaque backdrop-filter coute une passe de composition ; sur un fond deja
  // floute, la couche supplementaire est invisible
  const n = [...css.matchAll(/backdrop-filter:/g)].length;
  assert.ok(n <= 12, n + ' couches de flou : au-dela, le flou se paie sans se voir');
});

test('fluidite : le fanart de fond ne depasse pas 50 px de flou', () => {
  const m = /#appbg\{[^}]*filter:blur\((\d+)px\)/.exec(css);
  assert.ok(m, 'regle #appbg introuvable');
  assert.ok(Number(m[1]) <= 50, 'flou de fond a ' + m[1] + ' px : trop cher en peinture');
});

// --- manette -----------------------------------------------------------------
test('la table des boutons suit la disposition standard W3C', () => {
  // Ces numeros ne sont pas arbitraires : c'est l'ordre impose par la norme
  // Gamepad. Se tromper d'un rang fait qu'une touche en declenche une autre.
  const pad = /const PAD=(\{[^}]*\})/.exec(inline);
  assert.ok(pad, 'la table PAD doit exister');
  const t = pad[1];
  const attendu = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  for (const [k, n] of Object.entries(attendu)) {
    assert.ok(new RegExp('\\b' + k + ':' + n + '\\b').test(t), k + ' doit valoir ' + n + ' (norme Gamepad)');
  }
});

test('le bandeau ne promet aucune touche que le code n ecoute pas', () => {
  // Le bandeau annoncait « LB RB NAVIGUER » et les actions rapides portaient des
  // pastilles A / X / B / Y, alors qu'AUCUNE manette n'etait geree. Ce test rend
  // la promesse verifiable : toute touche annoncee doit etre lue dans la boucle.
  const fn = /function majCtlLegende\(\)\{([\s\S]*?)\n\}/.exec(inline);
  assert.ok(fn, 'majCtlLegende doit exister');
  const annoncees = [...fn[1].matchAll(/touche\('([^']+)'/g)].map(m => m[1]);
  assert.ok(annoncees.length >= 4, 'le bandeau doit annoncer les commandes : ' + annoncees.join(','));
  const boucle = /function padBoucle\(\)\{([\s\S]*?)\n\}/.exec(inline);
  assert.ok(boucle, 'padBoucle doit exister');
  for (const k of annoncees) {
    if (k === '◀▶') { assert.match(boucle[1], /padDeplacer\(/, 'la croix doit deplacer le focus'); continue; }
    if (k === 'LB/RB') {
      assert.match(boucle[1], /PAD\.LB/, 'LB doit etre ecoute');
      assert.match(boucle[1], /PAD\.RB/, 'RB doit etre ecoute');
      continue;
    }
    assert.ok(new RegExp('PAD\\.' + k + '\\b').test(boucle[1]), 'la touche ' + k + ' est annoncee mais jamais ecoutee');
  }
});

test('les pastilles de raccourci menties ont disparu', () => {
  // « A OUVRIR », « B SUPPRIMER » : ces pastilles promettaient des raccourcis
  // inexistants. B sur SUPPRIMER aurait en plus ete dangereux — et une boite
  // « confirm » du navigateur ne se pilote pas a la manette.
  const bar = /<div class="actionbar"[\s\S]*?<\/div>/.exec(html);
  assert.ok(bar, 'la barre d actions doit exister');
  assert.ok(!/class="gh/.test(bar[0]), 'les pastilles de raccourci ne doivent pas revenir dans la barre d actions');
});

// --- catalogue : pagination --------------------------------------------------
test('le catalogue charge la suite au lieu de renvoyer a la recherche', () => {
  // Le serveur tronquait a 300 et l'interface disait « affine la recherche pour
  // voir le reste » : un catalogue XBLA de 661 titres etait inaccessible au-dela
  // du 300e, sans aucun moyen de continuer.
  // On vise l'APPEL de traduction, pas le commentaire qui raconte l'ancien
  // message : le commentaire, lui, doit rester.
  assert.ok(!/T\('affine la recherche/.test(inline),
    'le message ne doit plus renvoyer l utilisateur a une recherche plus fine');
  assert.match(inline, /function catPlus\(/, 'catPlus doit exister');
  assert.match(inline, /loadCatalog\(true\)/, 'le bouton doit charger la page suivante');
  assert.match(inline, /catTotal-catItems\.length/, 'le reste a charger doit etre calcule, pas devine');
});

test('le serveur pagine au lieu de tronquer', () => {
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const bloc = /u\.pathname === '\/api\/catalog'[\s\S]*?\n    \}/.exec(srv);
  assert.ok(bloc, 'la route /api/catalog doit exister');
  assert.match(bloc[0], /searchParams\.get\('offset'\)/, 'la route doit accepter un decalage');
  assert.match(bloc[0], /searchParams\.get\('limit'\)/, 'la route doit accepter une taille de page');
  assert.match(bloc[0], /slice\(offset, offset \+ limit\)/, 'la page doit etre decoupee, pas tronquee en tete');
  // `total` reste le compte COMPLET : c'est lui qui dit combien il reste.
  assert.match(bloc[0], /total: tous\.length/, 'le total doit rester le compte complet');
});

// --- scripts Aurora ----------------------------------------------------------
test('les chemins d installation sont ceux d Aurora, pas des notres', () => {
  // AuroraRepo/Repos.ini, dans le depot officiel XboxUnity, donne ces quatre
  // chemins. C'est la source autoritaire : les inventer enverrait les scripts
  // dans un dossier qu'Aurora ne lit pas.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  for (const p of ['/Game/User/Scripts/Utility', '/Game/User/Scripts/Content/Filters',
    '/Game/User/Scripts/Content/Sorts', '/Game/User/Scripts/Content/Subtitles']) {
    assert.ok(srv.includes(p), p + ' doit etre un chemin d installation');
  }
  // ...et la source des catalogues doit etre le depot officiel.
  assert.match(srv, /xboxunity\.net\/as\//, 'les catalogues viennent de xboxunity.net/as/');
});

test('l installation d un script n accepte que les depots officiels', () => {
  // Cette route ECRIT un fichier sur le disque et l'ENVOIE a la console. Une URL
  // libre en ferait un moyen de recuperer n'importe quoi depuis n'importe ou.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const bloc = /u\.pathname === '\/api\/ascripts\/install'[\s\S]*?\n    \}\);/.exec(srv);
  assert.ok(bloc, 'la route d installation doit exister');
  assert.match(bloc[0], /\\\.net\\\/as\\\//, 'seuls les depots officiels doivent etre acceptes');
  assert.match(bloc[0], /Source refuse/, 'le refus doit etre explicite');
  assert.match(bloc[0], /AS_REPOS\.find/, 'la categorie doit venir de la liste connue, jamais du client');
});

// --- README ------------------------------------------------------------------
test('le README ne reference que des captures qui existent', () => {
  // Le README pointait `docs/screenshot-home.png`, une capture d'avant la refonte
  // visuelle : sur GitHub, une image absente est un cadre vide, et personne ne le
  // signale. Une capture presente mais inutilisee est du meme acabit — du poids
  // dans le depot pour rien.
  const racine = path.join(__dirname, '..');
  const md = fs.readFileSync(path.join(racine, 'README.md'), 'utf8');
  const refs = [...md.matchAll(/!\[[^\]]*\]\((docs\/[^)\s]+)\)/g)].map(m => m[1]);
  assert.ok(refs.length >= 5, 'le README doit montrer l application : ' + refs.length + ' capture(s)');
  for (const r of refs) {
    assert.ok(fs.existsSync(path.join(racine, r)), r + ' est reference mais absent du depot');
  }
  const docs = path.join(racine, 'docs');
  for (const f of fs.readdirSync(docs).filter(n => /^screen-.*\.png$/.test(n))) {
    assert.ok(md.includes(f), 'docs/' + f + ' n est utilisee nulle part');
  }
});

// --- coherence du style ------------------------------------------------------
test('aucun style en ligne n est ecrit plus de deux fois', () => {
  // `color:var(--text-3);font-size:var(--fs-caption)` etait ecrit NEUF fois a la
  // main dans app.js, et le meme petit bouton portait six paddings differents.
  // Une intention qui s'ecrit de neuf facons ne peut pas avoir l'air d'une seule
  // application. La regle est simple et executable : a la troisieme repetition,
  // on en fait une classe.
  const compte = new Map();
  for (const src of [inline, html]) {
    for (const m of src.matchAll(/style="([^"]*)"/g)) {
      const v = m[1].trim();
      // `display:none` est un ETAT, pas une intention de style : le JS le bascule
      // par `element.style.display=''`, donc il doit rester en ligne. Une classe
      // serait aussitot ecrasee et l'element ne se remontrerait jamais. C'est la
      // seule exception, et elle est explicite.
      if (v === 'display:none') continue;
      compte.set(v, (compte.get(v) || 0) + 1);
    }
  }
  const trop = [...compte].filter(([, n]) => n > 2).sort((a, b) => b[1] - a[1]);
  assert.deepStrictEqual(trop, [],
    'styles en ligne repetes plus de deux fois (fais-en une classe) :\n' +
    trop.map(([v, n]) => '  ' + n + ' x  ' + v).join('\n'));
});

// LE COMPTEUR NE DOIT PAS LIRE LA PROSE. Un garde-fou qui cherche `padding:` dans
// le texte brut compte le commentaire qui EXPLIQUE le defaut. C'est arrive : la
// note de l'en-tete dit « cette regle ajoutait `padding:8px` », et le compte est
// passe de 13 a 14 sans que la feuille change d'une ligne. Le meme piege avait
// deja frappe trois fois cote JavaScript ; cote CSS, `lib/audit-css.js` le
// referme, et ce test empeche qu'on revienne en arriere.
test('le compteur de paddings ignore ce qui est ecrit dans un commentaire', () => {
  const avec = 'a{padding:1px}\n/* cette regle ajoutait `padding:8px` en haut */\nb{padding:2px}';
  const vus = [...paddingsLitteraux(avec).keys()].sort();
  assert.deepStrictEqual(vus, ['1px', '2px'],
    'un padding cite dans un commentaire a ete compte comme une declaration : ' + vus.join(' | '));
  // Et la ligne du commentaire ne doit pas avoir disparu : le volume annonce par
  // l'outil d'audit se lit sur le texte sans commentaires.
  assert.strictEqual(sansCommentairesCss(avec).split('\n').length, 3,
    'le retrait des commentaires a ecrase des retours a la ligne');
});

test('contraste : chaque variante de bouton tient AA, au repos COMME a l appui', () => {
  // LES BOUTONS N'ETAIENT COUVERTS PAR AUCUNE MESURE. La sonde regarde `.status`,
  // `h2`, `.lead`, `.srcnote`, `.c-nm` et `.badge` ; les tests de jetons regardent
  // `--text-1`, `--text-2`, `--text-3`. Personne ne regardait l'element qu'on
  // clique le plus. C'est pour cela qu'un bouton d'accent pouvait porter du blanc
  // a 77 % sur son propre vert VERT — 1,8:1 — sans qu'aucun garde-fou ne bronche.
  //
  // La cascade est REPRODUITE, pas devinee : une regle `button.btn.accent:active`
  // (0,3,1) l'emporte sur `button.btn:active` (0,2,1), donc l'appui d'une variante
  // se lit d'abord chez elle, et a defaut chez la regle generique.
  const feuille = sansCommentairesCss(css);
  const corps = sel => {
    const m = new RegExp(sel.replace(/[.():]/g, '\\$&') + '\\{([^}]*)\\}').exec(feuille);
    return m ? m[1] : null;
  };
  const decl = (c, prop) => {
    if (!c) return null;
    const m = new RegExp('(?:^|;)\\s*' + prop + ':([^;]+)').exec(c);
    return m ? m[1].trim() : null;
  };
  const jeton = v => {
    if (!v) return null;
    const m = /var\(--([a-z0-9-]+)\)/.exec(v);
    return m ? token(m[1]) : v;
  };
  const base = token('bg-base');
  const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  // Un remplissage translucide se compose sur le FOND, pas sur du noir : composer
  // sur du noir rendrait le fond plus sombre qu'il n'est, donc le contraste plus
  // flatteur qu'il n'est.
  const pose = c => (c === 'transparent' || !c ? base : hex(versRGB(c, base)));

  const generique = corps('button.btn:active');
  const variantes = ['', '.accent', '.gray', '.red', '.blue', '.orange', '.quiet', '.quiet.on'];
  for (const v of variantes) {
    const nom = v || 'defaut';
    const repos = corps('button.btn' + v);
    assert.ok(repos, 'la variante ' + nom + ' doit exister');
    const appui = corps('button.btn' + v + ':active') || generique;
    const fondRepos = jeton(decl(repos, 'background'));
    const encreRepos = jeton(decl(repos, 'color'));
    const fondAppui = jeton(decl(appui, 'background')) || fondRepos;
    const encreAppui = jeton(decl(appui, 'color')) || encreRepos;
    for (const [etat, encre, fond] of [['repos', encreRepos, fondRepos], ['appui', encreAppui, fondAppui]]) {
      assert.ok(encre && fond, nom + ' / ' + etat + ' : encre ou fond introuvable');
      const c = contraste(encre, pose(fond));
      assert.ok(c >= 4.5, nom + ' / ' + etat + ' : ' + c.toFixed(2) + ':1 — AA exige 4,5:1 ('
        + encre + ' sur ' + fond + ')');
    }
  }
  // La variante d'accent garde son encre SOMBRE a l'appui : c'est un controle
  // direct du defaut mesure (l'encre passait a --text-2, soit 1,8:1 sur le vert).
  assert.ok(!decl(corps('button.btn.accent:active'), 'color'),
    'l appui du bouton d accent ne doit pas changer son encre');
});

test('la sonde envoie une expression qui COMPILE dans le navigateur', () => {
  // Le garde-fou existant ne verifie qu'une chose : que le GABARIT compile cote
  // Node. Or un antislash est MANGE par le template literal — `/url\(/` ecrit dans
  // la sonde arrive dans la page sous la forme `/url(/`, que le moteur refuse
  // (« Unterminated group »). La sonde ne renvoyait alors PLUS RIEN, avec pour
  // seul message « La page n'a rien renvoye », qui n'oriente pas vers la cause.
  // C'est le piege du backtick en moins visible : il fallait le mesurer aussi.
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'uicheck.js'), 'utf8');
  const i = src.indexOf('const SONDE =');
  const j = src.indexOf('\n})()`;', i);
  assert.ok(i > 0 && j > i, 'la sonde doit etre extractible de scripts/uicheck.js');
  const SONDE = eval(src.slice(i, j + 6) + '\nSONDE');   // eslint-disable-line no-eval
  assert.strictEqual(typeof SONDE, 'function');
  const expr = SONDE('.view.active', true);
  assert.ok(expr.length > 1000, 'l expression generee est suspicieusement courte');
  assert.doesNotThrow(() => new Function(expr),
    'l expression envoyee au navigateur ne compile pas : la sonde ne mesurera plus rien');

  // CE QUE CE GARDE-FOU NE PEUT PAS VOIR, et il faut le dire : un antislash mange
  // peut aussi produire un motif qui COMPILE tout en etant FAUX. Mesure faite :
  // /blur\(([\d.]+)px\)/ degrade devient /blur(([d.]+)px)/ — des parentheses
  // equilibrees, donc aucune erreur de syntaxe, et un motif qui ne mesure plus la
  // bonne chose. Aucun controle de syntaxe ne peut distinguer ca d'un motif juste.
  // Le garde-fou attrape la classe qui a REELLEMENT casse la sonde (le groupe non
  // ferme) ; le reste se voit a l'execution, quand la sonde rend un chiffre absurde.
});

test('la sonde peut mesurer n importe quelle surcouche, pas seulement une', () => {
  // `--modal` etait cable sur `#dlModal` : la seule surcouche mesurable etait
  // celle-la. Chaque nouvelle surcouche demandait donc de toucher la sonde, et
  // celles qu'on oubliait n'etaient jamais mesurees.
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'uicheck.js'), 'utf8');
  assert.match(src, /UICHECK_OVL/, 'la sonde doit accepter un selecteur de surcouche');
  assert.match(src, /const RACINE = .*UICHECK_OVL/, 'et s en servir pour choisir la racine');
  // LE DRAPEAU `estVue` AUSSI, et c'est le point qu'on oublie : il commande la
  // regle de la colonne de lecture, ecrite pour une VUE. Une surcouche occupe
  // toute la largeur : la lui appliquer inventait « contenu large de 1600 px >
  // --w-max 1280 px » sur #diaModal, qui n'a aucun padding. Une sonde qui
  // fabrique un defaut est pire qu'une sonde muette.
  assert.match(src, /SONDE\(RACINE, !MODAL && !process\.env\.UICHECK_OVL\)/,
    'la regle de la vue ne doit pas s appliquer a une surcouche choisie');
});

test('la sonde dit quand l expression qu elle envoie leve', () => {
  // `Runtime.evaluate` ne met pas de `value` dans sa reponse quand l'expression
  // leve : `m.result.result.value` vaut `undefined`, la ligne « eval : … » ne
  // s'imprime pas, et la sonde se tait en sortant avec un code de succes. Une
  // exception silencieuse est indiscernable d'une action qui n'a rien fait —
  // exactement ce que le commentaire du fichier promet d'eviter.
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'uicheck.js'), 'utf8');
  assert.match(src, /exceptionDetails/, 'la sonde doit lire les details de l exception');
  assert.match(src, /eval ECHEC/, 'et le dire, en clair, au lieu de se taire');
});

test('les paddings de controle tiennent sur une rampe courte', () => {
  // Vingt-deux paddings litteraux, la plupart employes une seule fois :
  // 2px 9px, 2px 10px, 3px 10px, 4px 12px, 5px 12px, 6px 11px... Autant de
  // facons d'ecrire « un petit bouton ». Trois tailles suffisent :
  //   pastille 2px 8px · petit 4px 10px · normal 6px 14px
  // Les autres valeurs admises sont des cas uniques et intentionnels (un
  // centrage, un seul axe, la marge d'une notification).
  const RAMPE = new Set(['2px 8px', '4px 10px', '4px 8px', '6px 14px', '0 6px', '8px 14px', '5px 0', '26px 10px 10px',
    // Cas uniques et intentionnels : la marge d'une notification, et l'en-tete
    // et le corps d'une surcouche.
    '14px 18px', '0 14px']);
  // Le compte vient de `lib/audit-css.js`, qui RETIRE LES COMMENTAIRES et
  // s'arrete sur `}` autant que sur `;` : sans cela, un commentaire citant
  // « `padding:8px` » etait compte comme une declaration, et ca a deja fait
  // passer le compte de 13 a 14 sans que la feuille change d'une ligne.
  const litteraux = paddingsLitteraux(css);
  const hors = [...litteraux.keys()].filter(v => !RAMPE.has(v) && !v.includes('calc(') && !/^(\d+px( 0)?|0)$/.test(v));
  assert.deepStrictEqual(hors, [], 'paddings hors rampe : ' + hors.join(' | '));
  // 22 au depart, 13 apres : trois valeurs de rampe, et dix cas uniques et
  // intentionnels. Le plafond n'est pas une cible a atteindre, c'est un cliquet :
  // il empeche de revenir en arriere en ajoutant « juste un » padding de plus.
  assert.ok(litteraux.size <= 15,
    'trop de paddings litteraux distincts : ' + litteraux.size + ' -> ' + [...litteraux.keys()].join(', '));
});

// --- file de transferts FTP --------------------------------------------------
test('les transferts FTP passent par une file, un seul a la fois', () => {
  // Deux envois lances en meme temps ECRASENT tout : le client a une file de
  // reponses FIFO partagee et stocke la connexion passive dans un champ
  // d'instance, donc le second PASV remplace la cible du premier. Mesure avant
  // correction : A/f0.bin CORROMPU, neuf fichiers MANQUANTS, zero intact.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const t = /function ftpTransfert\(genre, local, distant\)\s*\{([\s\S]*?)\n\}/.exec(srv);
  assert.ok(t, 'ftpTransfert doit exister');
  assert.match(t[1], /FTP_FILE\.push/, 'le transfert doit etre MIS EN FILE');
  assert.match(t[1], /j\.etat = 'attente'/, 'il attend son tour, il ne part pas aussitot');
  assert.ok(!/\bawait\b|\(async \(\) =>/.test(t[1]),
    'ftpTransfert ne doit RIEN lancer lui-meme : c est ftpPomper qui decide');

  const p = /function ftpPomper\(\)\s*\{([\s\S]*?)\n\}/.exec(srv);
  assert.ok(p, 'ftpPomper doit exister');
  assert.match(p[1], /if \(FTP_ACTIF \|\| !FTP_FILE\.length\) return/,
    'on ne demarre rien si un transfert tourne deja');
  assert.match(p[1], /FTP_ACTIF = null/, 'le slot doit se liberer, sinon la file se bloque a vie');
  assert.match(p[1], /setImmediate\(ftpPomper\)/, 'le suivant enchaine, sans tenir la boucle d evenements');
});

test('la sonde mesure la taille RENDUE des icones', () => {
  // Un <svg> sans dimension prend celle de son conteneur. Le garde-fou sur la
  // feuille ne voit qu'une regle INCOMPLETE : une regle absente ne le declenche
  // pas, et c'est exactement le cas rencontre (l'icone d'une ligne de transfert
  // faisait 200 px de haut). Seule une mesure sur la page rendue le voit.
  const sonde = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'uicheck.js'), 'utf8');
  assert.match(sonde, /querySelectorAll\('\$\{racine\} svg'\)/, 'la sonde doit mesurer les svg rendus');
  assert.match(sonde, /r\.width > 48 \|\| r\.height > 48/, 'avec une limite explicite');
  assert.match(sonde, /icone surdimensionnee/, 'et signaler le defaut');
});



test('toute icone referencee existe dans le sprite', () => {
  // `<use href="#i-check"/>` vers un symbole absent ne produit AUCUNE erreur : le
  // navigateur dessine un carre vide. Le defaut est visible a l'oeil, jamais dans
  // la console — et `<use>` sur une reference cassee ne leve rien.
  const dispo = new Set([...html.matchAll(/id="(i-[a-z-]+)"/g)].map(m => m[1]));
  assert.ok(dispo.size > 10, 'le sprite doit contenir des symboles');
  const utilises = new Set();
  for (const src of [html, css, inline]) {
    for (const m of src.matchAll(/href="#(i-[a-z-]+)"/g)) utilises.add(m[1]);
  }
  const manquants = [...utilises].filter(i => !dispo.has(i));
  assert.deepStrictEqual(manquants, [],
    'icones referencees mais absentes du sprite : ' + manquants.join(', '));
});

test('aucune balise ne porte deux fois le meme attribut', () => {
  // `<button class="btn" class="ck-auto">` : le navigateur ignore le SECOND
  // attribut en silence, et `.ck-auto` ne s'appliquait donc jamais. Le defaut
  // n'est visible qu'a l'oeil, sur le style — aucune erreur nulle part.
  // On cherche le motif precis « class="..." class=" » : une detection plus large
  // prendrait les expressions JS (`g.format==='GOD'?g.format:...`) pour des
  // attributs et crierait au loup.
  const motifs = [/class="[^"]*"\s+class="/g, /id="[^"]*"\s+id="/g, /style="[^"]*"\s+style="/g];
  const trouves = [];
  for (const [nom, src] of [['index.html', html], ['app.js', inline]]) {
    for (const re of motifs) for (const m of src.matchAll(re)) {
      trouves.push(nom + ' : ' + m[0].slice(0, 70));
    }
  }
  assert.deepStrictEqual(trouves, [], 'attribut en double (le second est ignore) :\n  ' + trouves.join('\n  '));
});

test('/api/drives : les deux lecteurs normalisent la reponse', () => {
  // L'API rend { disques, absents }, pas un tableau. Lire la reponse comme un
  // tableau a fait echouer loadDash() en silence (« ds.find is not a function »),
  // ce qui vidait les CIBLES et le DEPOT — et la sonde ne le voyait que comme une
  // « section vide », donc comme un probleme de mise en page.
  //
  // Deux endroits lisent cette route : ils doivent TOUS LES DEUX normaliser.
  const lectures = [...inline.matchAll(/api\('\/api\/drives'\)/g)].length;
  assert.ok(lectures >= 1, 'on doit lire la route au moins une fois');
  const normalisations = [...inline.matchAll(/Array\.isArray\((?:rep|repDrives)\)/g)].length;
  assert.strictEqual(normalisations, lectures,
    'chaque lecture de /api/drives doit normaliser : ' + lectures + ' lecture(s), ' + normalisations + ' normalisation(s)');
  // Et aucun consommateur ne doit appeler une methode de tableau sur la reponse
  // brute sans passer par la variable normalisee.
  assert.ok(!/const \[[^\]]*\bds\b[^\]]*\]=\s*await Promise\.all\([^)]*api\('\/api\/drives'\)/.test(inline),
    'la reponse brute ne doit pas etre nommee ds directement');
});

test('le serveur n ecoute QUE la machine locale, sauf reglage explicite', () => {
  // L'application expose la suppression de fichiers, la lecture du disque, les
  // identifiants de la console et un parcours de dossiers : la rendre joignable
  // depuis le reseau local est une DECISION, jamais un defaut.
  //
  // CE GARDE-FOU VERIFIAIT L'EXPRESSION EXACTE (`process.env.X360_HOST || '127.0.0.1'`).
  // Il a donc refuse le jour ou l'ecoute est devenue reglable — alors que
  // l'invariant, lui, n'avait pas bouge. Meme lecon que le z-index de la boite de
  // dialogue : on verifie ce qui compte, pas la facon de l'ecrire.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  // On lit le CODE, pas les commentaires : le commentaire qui explique le defaut
  // contient lui-meme \`server.listen(PORT)\`, et le garde-fou s'y trompait.
  const code = srv.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  // 1. Aucun `listen` sans hote explicite.
  const sansHote = [...code.matchAll(/server\.listen\(([^)]*)\)/g)]
    .filter(m => !/HOTE/.test(m[1]));
  assert.deepStrictEqual(sansHote.map(m => m[0]), [],
    'aucun listen sans hote explicite : ' + sansHote.map(m => m[0]).join(' | '));
  // 2. L'ouverture au reseau exige un reglage EXPLICITE : un config.json absent
  //    ou sans la clef doit laisser l'ecoute fermee.
  const ligne = /const HOTE =([^;]+);/.exec(code);
  assert.ok(ligne, 'la constante HOTE doit exister');
  const expr = ligne[1].trim();
  assert.match(expr, /cfg\.reseau && cfg\.reseau\.actif/,
    'l ouverture au reseau doit exiger cfg.reseau.actif, obtenu : ' + expr);
  // 3. Et le REPLI de la chaine est la boucle locale, quoi qu'il arrive. On ne
  //    cherche pas un `||` : le repli peut etre la branche `else` d'un ternaire.
  //    Ce qui compte, c'est que l'expression FINISSE par 127.0.0.1 — le dernier
  //    recours, celui qui s'applique quand rien n'est reglé.
  assert.match(expr, /'127\.0\.0\.1'\s*\)?\s*$/,
    'le dernier repli de HOTE doit etre 127.0.0.1, obtenu : ' + expr);
});

test('la porte du reseau precede TOUTES les routes', () => {
  // Le controle d'acces doit etre un FILTRE, place avant la premiere route. Place
  // apres, il laisserait cette route ouverte et personne ne s'en apercevrait :
  // c'est l'oubli qui ne se voit qu'une fois qu'il a servi.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const dedans = srv.slice(srv.indexOf('http.createServer'), srv.indexOf('server.listen('));
  const porte = dedans.indexOf('Acces.estLocal(');
  const premiereRoute = dedans.search(/u\.pathname === '\/api\//);
  assert.ok(porte > 0, 'la porte du reseau doit exister dans le gestionnaire');
  assert.ok(premiereRoute > 0, 'aucune route /api/ trouvee');
  assert.ok(porte < premiereRoute,
    'la porte doit precede la premiere route /api/ (porte a ' + porte + ', route a ' + premiereRoute + ')');
  // Les fichiers de l'interface passent SANS session : sinon la page qui demande
  // le code ne pourrait pas s'afficher, et l'acces serait impossible a debloquer.
  const avantPremiereRoute = dedans.slice(0, premiereRoute);
  assert.match(avantPremiereRoute, /startsWith\('\/api\/'\)/,
    'le filtre doit ne viser que /api/, en laissant passer l interface');
  assert.match(avantPremiereRoute, /u\.pathname !== '\/api\/acces'/,
    'la route du code doit rester ouverte, sinon on ne peut jamais s appairer');
});

test('le code d acces n est jamais journalise ni renvoye', () => {
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  // Un `slog` qui afficherait le code le mettrait dans un fichier de journal, et
  // un code lu dans un journal n'est plus un secret.
  for (const m of srv.matchAll(/slog\([^)]*\)/g)) {
    assert.ok(!/accesCode/.test(m[0]), 'le code d acces ne doit pas etre journalise : ' + m[0]);
  }
  // `publicCfg()` est ce que le navigateur recoit : il ne doit porter ni le code
  // ni les sessions. La ligne entiere est courte et se relit d'un coup d'oeil.
  const pub = /const publicCfg = \(\) => \(\{[^}]*\}\)/.exec(srv);
  assert.ok(pub, 'publicCfg doit exister');
  assert.ok(!/accesCode|sessions/.test(pub[0]),
    'publicCfg ne doit exposer ni le code ni les sessions : ' + pub[0]);
});

test('le build inclut docs/ : le README y montre ses captures', () => {
  // L'archive 1.4.0 est sortie SANS docs/ : le README livrait neuf images
  // cassees. Le test « le README ne reference que des captures qui existent »
  // l'a attrape sur la copie EXTRAITE — pas dans le depot, ou les captures sont
  // la. C'est exactement ce qu'un test de build doit couvrir.
  const ps = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build-release.ps1'), 'utf8');
  const dossiers = /\$dossiers\s*=\s*@\(([^)]*)\)/.exec(ps);
  assert.ok(dossiers, 'le script doit lister les dossiers a embarquer');
  assert.match(dossiers[1], /'docs'/, 'docs/ doit etre embarque : le README y montre ses captures');
  for (const d of ['lib', 'public', 'sources']) {
    assert.match(dossiers[1], new RegExp("'" + d + "'"), d + '/ doit etre embarque');
  }
  // Et le garde-fou anti-fuite doit rester en place.
  assert.match(ps, /interdits\s*=\s*@\(/, 'la liste des fichiers interdits doit exister');
  assert.match(ps, /config\.json/, 'config.json doit etre interdit');
  assert.match(ps, /secrets\.json/, 'secrets.json doit etre interdit');
  assert.match(ps, /donnees personnelles detectees/, 'et l archive doit etre REFUSEE en cas de fuite');
});

test('scan : le meme dossier n est jamais parcouru deux fois', () => {
  // `H:\Games` est a la fois le dossier configure ET une racine detectee a chaud :
  // il etait parcouru DEUX fois. Le dedoublement par chemin supprimait les doublons
  // du RESULTAT, pas le TRAVAIL — mesure : 163 ms au premier scan, 89 % du temps de
  // chargement de la page.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const i = srv.indexOf('function scanDrive()');
  assert.ok(i > 0, 'scanDrive doit exister');
  const corps = srv.slice(i, i + 2600);
  // UN SEUL appel a scanDirForGames : celui qui vit DANS \`scanner()\`. Tout scan
  // doit passer par la, sinon le dedoublement est contourne sans que rien ne le dise.
  const appels = [...corps.matchAll(/scanDirForGames\(/g)].length;
  assert.strictEqual(appels, 1,
    'scanDirForGames ne doit etre appele qu\'une fois, dans scanner() — trouve : ' + appels);
  assert.match(corps, /dejaVu/, 'le dedoublement doit exister');
  assert.match(corps, /const scanner = /, 'et passer par scanner()');
  // La clef doit ignorer la casse ET les separateurs : Windows ne distingue pas
  // `H:\Games` de `h:/games`, et les deux venaient de sources differentes.
  assert.match(corps, /toLowerCase\(\)/, 'la clef doit ignorer la casse');
  // Les separateurs aussi : \`H:\\Games\` et \`H:/Games\` viennent de sources
  // differentes et doivent compter pour le meme dossier.
  const clef = /const cleScan = [^\n]*/.exec(corps);
  assert.ok(clef, 'cleScan doit exister');
  assert.ok((clef[0].match(/replace\(/g) || []).length >= 1, 'la clef doit normaliser les separateurs : ' + clef[0]);
});

test('tailles : le cache survit au redemarrage et a l invalidation', () => {
  // `sizeCache` est une Map en memoire et `invalidateScan()` la vide : chaque
  // redemarrage ET chaque installation relancaient un parcours complet des dossiers
  // de jeux — 24 ms mesures sur 17 jeux, davantage sur un disque FAT32 charge.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(srv, /const SIZE_CACHE = path\.join\(DATA, 'tailles\.json'\)/, 'le cache disque doit exister');
  assert.match(srv, /function signatureTaille/, 'la signature doit exister');
  const i = srv.indexOf('function dirSizeCached');
  const corps = srv.slice(i, i + 700);
  assert.match(corps, /signatureTaille\(p\)/, 'dirSizeCached doit interroger la signature');
  assert.match(corps, /tailles\[p\]/, 'et le cache disque');
  // Une signature doit inclure les ENFANTS : un DLC installe cree un dossier DANS
  // le <TID>, ce qui ne change pas le mtime du <TID> lui-meme.
  const j = srv.indexOf('function signatureTaille');
  const sig = srv.slice(j, j + 700);
  assert.match(sig, /readdirSync\(p, \{ withFileTypes: true \}\)/, 'la signature doit lire les enfants');
  assert.match(sig, /st\.mtimeMs/, 'et le dossier lui-meme');
  // Et le fichier ne doit pas etre versionne : c'est un cache.
  const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.match(gi, /tailles\.json/, 'tailles.json doit etre ignore par git');
});

test('routes destructives : aucun chemin hors des dossiers de l application', () => {
  // AUDIT. `/api/delete`, `/api/move` et `/api/rename` prenaient le chemin du corps
  // de la requete et l'appliquaient tel quel. Verifie a la main : un POST sur
  // `/api/delete` avec un fichier de %TEMP% l'a supprime, sans erreur, avec un « ok ».
  //
  // Le modele de menaces du projet est explicite : un titre d'item archive.org est
  // controlable par n'importe qui, et la page a acces a l'API locale. Un XSS pouvait
  // donc effacer n'importe quoi. `/api/content/delete` et `/api/ftp/download`
  // etaient deja gardes : l'incoherence etait le defaut.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const routes = ['/api/delete', '/api/move', '/api/rename'];

  for (const r of routes) {
    const i = srv.indexOf("u.pathname === '" + r + "'");
    assert.ok(i > 0, r + ' doit exister');
    // Le corps de la route va jusqu'a la route suivante.
    const suite = srv.indexOf("if (u.pathname ===", i + 10);
    const corps = srv.slice(i, suite > 0 ? suite : i + 2600);
    assert.match(corps, /cheminLocalAutorise\(/, r + ' doit passer par cheminLocalAutorise()');
  }

  // Et le garde-fou doit rester celui qui borne aux dossiers de l'application.
  const g = srv.indexOf('function cheminLocalAutorise');
  const corpsG = srv.slice(g, g + 600);
  for (const base of ['cfg.drop', 'cfg.games', 'cfg.content', 'cfg.homebrew', 'cfg.emulators']) {
    assert.match(corpsG, new RegExp(base.replace('.', '\\.')), base + ' doit etre une base autorisee');
  }
  // Et il doit comparer des chemins RESOLUS avec un separateur, sinon
  // « H:\Games_backup » passerait pour « H:\Games ».
  assert.match(corpsG, /path\.resolve/, 'les chemins doivent etre resolus');
  assert.match(corpsG, /b \+ path\.sep/, 'et compares avec un separateur');
});

test('import : un dossier est mesure avant d etre copie', () => {
  // AUDIT. `fs.statSync(src).size` vaut 0 pour un DOSSIER : le controle d'espace
  // libre etait entierement contourne en important un dossier, et
  // `cpSync(..., {recursive:true})` n'a aucune borne. Un chemin comme
  // `C:\Users\...` aurait rempli le disque sans un mot.
  const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const i = srv.indexOf("u.pathname === '/api/import'");
  assert.ok(i > 0, 'la route doit exister');
  const corps = srv.slice(i, i + 1400);
  // La taille doit etre demandee pour un dossier, pas seulement pour un fichier.
  assert.match(corps, /isDirectory\(\)/, 'il faut distinguer dossier et fichier');
  assert.match(corps, /dirSizeCached\(/, 'un dossier doit etre mesure');
  assert.ok(!/\.isFile\(\) \? fs\.statSync\(src\)\.size : 0/.test(corps),
    'l ancienne forme rendait 0 pour un dossier');
  // Et un dossier vide ne doit pas partir en copie.
  assert.match(corps, /Dossier vide/, 'un dossier vide doit etre refuse');
});

test('la boite de dialogue passe AU-DESSUS de toutes les autres surcouches', () => {
  // Deux defauts mesures a la sonde, pas supposes.
  // 1. A `z-index:98`, la confirmation s'affichait DERRIERE `helpModal` et
  //    `langModal` (99) : une confirmation qu'on ne voit pas vaut moins que rien.
  // 2. `surcoucheOuverte()` rendait la PREMIERE ouverte dans l'ordre du tableau.
  //    Le choix de langue etant ouvert d'office au premier lancement, Echap fermait
  //    LUI et laissait la confirmation en place, sa promesse NON RESOLUE — et comme
  //    le bouton B de la manette passe par Echap, B ne refusait plus rien.
  // Le z-index vit maintenant dans la FEUILLE (`#dialogModal{z-index:100}`), pas
  // en ligne : les neuf voiles partagent la classe `.ovl`. Ce garde-fou lisait la
  // valeur EN LIGNE — il verifiait donc le MECANISME plutot que l'invariant, et il
  // refusait un deplacement qui ne change rien au resultat. Il lit desormais
  // l'endroit ou la valeur est reellement decidee, et il exige toujours ce qui
  // compte : la boite de dialogue passe au-dessus de TOUTES les autres.
  // On lit la feuille SANS SES COMMENTAIRES : ce commentaire-ci cite
  // `#dialogModal{z-index:100}` pour expliquer l'empilement, et un motif naif
  // lirait la PROSE au lieu de la regle — le piege deja referme trois fois ici.
  // Et le selecteur peut etre GROUPE (`#dlModal,#scanModal{z-index:91}`) : on
  // cherche donc `#id` dans la LISTE de selecteurs, pas colle a l'accolade.
  const feuille = sansCommentairesCss(css);
  const zDe = (src, id) => {
    for (const m of src.matchAll(/([^{}]*)\{([^}]*)\}/g)) {
      const sels = m[1].split(',').map(s => s.trim());
      if (!sels.includes('#' + id)) continue;
      const z = /z-index:(\d+)/.exec(m[2]);
      if (z) return Number(z[1]);
    }
    return null;
  };
  const mien = zDe(feuille, 'dialogModal');
  assert.ok(mien, 'dialogModal doit declarer un z-index dans la feuille');
  const autres = ['orgModal', 'dlModal', 'scanModal', 'cookieModal', 'helpModal', 'healthModal', 'langModal', 'pickModal'];
  for (const id of autres) {
    const z = zDe(feuille, id);
    assert.ok(z, id + ' doit declarer un z-index dans la feuille');
    assert.ok(mien > z, 'dialogModal (' + mien + ') doit passer au-dessus de ' + id + ' (' + z + ')');
  }
  // Aucun voile ne doit reprendre un z-index EN LIGNE : ce serait deux endroits ou
  // l'empilement se decide, et le second gagnerait en silence.
  for (const id of autres.concat(['dialogModal'])) {
    assert.ok(!new RegExp('id="' + id + '"[^>]*z-index').test(html),
      id + ' redeclare son z-index en ligne : l empilement se deciderait a deux endroits');
  }
  // La surcouche ouverte est la PLUS HAUTE, jamais la premiere de la liste.
  const app = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
  const i = app.indexOf('const surcoucheOuverte');
  assert.ok(i > 0, 'surcoucheOuverte doit exister');
  const corps = app.slice(i, i + 420);
  assert.match(corps, /zIndexDe|zIndex/, 'la surcouche ouverte doit se choisir par z-index');
  assert.ok(!/\.find\(/.test(corps),
    'un `.find()` rend la premiere ouverte, pas celle qu on VOIT');
});

test('le diaporama est une surcouche SOUS la boite de dialogue', () => {
  // Elle doit etre dans SURCOUCHES : sans cela Echap, Tab, le piege a focus et
  // le bouton B de la manette ne la voient pas, et on s'y enferme.
  //
  // SANS LES COMMENTAIRES, comme ses voisins. Ce garde-fou lisait le fichier brut,
  // et un commentaire citant la liste l'aurait satisfait : c'est la faute que ce
  // depot a deja commise TROIS fois (`server.listen(PORT)`, le commentaire de la
  // boite citant `confirm()`, la documentation des helpers montrant
  // `confirmer({titre, …})`). `sansCommentaires` preserve la longueur, donc les
  // numeros de ligne signales restent exacts.
  const app = sansCommentaires(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8'));
  const liste = /const SURCOUCHES = \[([^\]]*)\]/.exec(app);
  assert.ok(liste, 'SURCOUCHES doit exister');
  assert.ok(liste[1].includes("'diaModal'"), 'diaModal doit figurer dans SURCOUCHES');
  // Et SOUS la boite de dialogue : une confirmation doit pouvoir s'afficher
  // par-dessus un diaporama, pas l'inverse.
  const feuille = sansCommentairesCss(css);
  // L'ORDRE D'EMPILEMENT DU DIAPORAMA PASSE PAR UN JETON (`--z-diaporama:98` dans
  // `:root`), pour qu'il se lise avec les autres au meme endroit. Un `var(--x)` ne
  // contient aucun chiffre : le motif litteral `/z-index:(\d+)/` rendait `null`, et
  // ce garde-fou accusait la feuille d'un defaut qui n'existe pas. On resout donc
  // les jetons AVANT de lire, et l'invariant verifie reste le meme : le diaporama
  // declare un z-index, et il est SOUS celui de la boite de dialogue.
  const jetons = new Map([...feuille.matchAll(/(--[\w-]+)\s*:\s*(\d+)\s*;/g)].map(m => [m[1], m[2]]));
  const resolue = feuille.replace(/var\((--[\w-]+)\)/g, (m, n) => jetons.get(n) || m);
  const zDe = (id) => {
    for (const m of resolue.matchAll(/([^{}]*)\{([^}]*)\}/g)) {
      if (!m[1].split(',').map(s => s.trim()).includes('#' + id)) continue;
      const z = /z-index:(\d+)/.exec(m[2]);
      if (z) return Number(z[1]);
    }
    return null;
  };
  const dia = zDe('diaModal');
  const dlg = zDe('dialogModal');
  const aide = zDe('helpModal');
  assert.ok(dia, 'diaModal doit declarer un z-index dans la feuille');
  assert.ok(dia < dlg, 'le diaporama (' + dia + ') doit passer SOUS la boite de dialogue (' + dlg + ')');
  // ET SOUS L'AIDE. Ce n'etait exige par RIEN, alors que le document l'affirme :
  // « z-index 98, SOUS l'aide (99) et SOUS les boites de dialogue (100), et un
  // garde-fou l'exige ». Le garde-fou ne comparait que 98 a 100 : un
  // `--z-diaporama:99.5` passait donc le test tout en repassant AU-DESSUS de l'aide
  // — exactement le defaut documente plus haut dans cette feuille, ou une
  // confirmation s'affichait DERRIERE `helpModal` et `langModal`. Un invariant qui
  // ne tient que par la VALEUR du jour n'est pas garde.
  assert.ok(aide, 'helpModal doit declarer un z-index dans la feuille');
  assert.ok(dia < aide, 'le diaporama (' + dia + ') doit passer SOUS l\'aide (' + aide + ')');
});

test('la sonde mesure le contraste de la legende du diaporama', () => {
  // `#diaNom` et `#diaMeta` ne portent aucune classe : ils etaient donc absents de
  // la liste de selecteurs du controle de contraste, et la sonde rendait « Aucun
  // defaut mesure » sur un diaporama dont la legende tombait a 2,05:1 sur une
  // jaquette claire. Un controle qui ne regarde pas ne dit pas « tout va bien »,
  // il ne dit rien — et ici il le disait quand meme.
  //
  // `#diaVide` est ajoute au quatuor du plan : c'est le MEME defaut (meme couleur
  // sur le meme fond, jamais mesure), et l'oublier laisserait le trou ouvert sur
  // l'ecran qui s'affiche justement quand il n'y a aucune image derriere.
  //
  // SANS LES COMMENTAIRES, comme ses voisins : le commentaire qui explique ce
  // defaut nomme `#diaModal` a quatre lignes de la liste, et un garde-fou lisant
  // la prose se satisferait d'un selecteur supprime du code.
  const src = sansCommentaires(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'uicheck.js'), 'utf8'));
  for (const sel of ['#diaNom', '#diaMeta', '#diaCompteur', '#diaPause', '#diaVide']) {
    assert.ok(src.includes(sel), 'le controle de contraste doit mesurer ' + sel);
  }
});

test('la sonde additionne les colspan des lignes de tableau', () => {
  // Un tableau d'etat VIDE est LEGITIME : une ligne de remplissage couvre ses
  // colonnes par `colspan` et il n'y a rien a aligner puisqu'il n'y a rien.
  // La sonde comptait les ENFANTS de la ligne, donc cette ligne correcte passait
  // pour une ligne a UNE cellule et elle annoncait « aucune ligne n'a 3 cellules »
  // sur un tableau juste. Mesure : `tableau dlResults : 3 en-tetes, 1 lignes,
  // cellules {"1":1}`, exit 1, sur l'etat vide de la recherche Vimm — et le faux
  // positif vaut pour TOUT etat vide de TOUT tableau.
  // Le modele existe juste a cote : ce fichier additionne deja les `colspan`
  // (voir le garde-fou « cellules = en-tetes »), et un motif naif sur
  // `children.length` ne l'aurait pas vu.
  const src = sansCommentaires(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'uicheck.js'), 'utf8'));
  assert.match(src, /getAttribute\('colspan'\)/, 'la sonde doit lire le colspan de chaque cellule');
  assert.match(src, /Math\.max\(1,/, 'et compter AU MOINS une colonne par cellule (colspan absent ou nul)');
});

test('la sonde emule un TELEPHONE et mesure ce qu un doigt doit atteindre', () => {
  // SANS CETTE MESURE, la sonde rendait « Aucun defaut mesure » a 390 px en ne
  // regardant NI les cibles, NI ce qui depasse l'ecran, NI les troncatures : un
  // vert sur ce qu'elle n'avait jamais regarde. C'est le pire resultat possible
  // pour un instrument, et c'est ce que ce chantier devait fermer d'abord.
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'uicheck.js'), 'utf8');
  // SANS LES COMMENTAIRES pour les controles de PRESENCE : le fichier EXPLIQUE
  // longuement pourquoi il emule le tactile, et un motif qui lit la prose se
  // satisferait d'un appel retire du code. Le piege est arrive trois fois ici.
  const code = sansCommentaires(src);

  // `mobile:true` EST LA CONDITION DE TOUT LE RESTE : c'est lui qui rend vrais
  // `pointer: coarse` et `hover: none` dans la page. Sans lui, une regle ecrite
  // sous ces media features n'a AUCUN effet mesurable, et la sonde approuverait
  // un telephone qu'elle n'a jamais simule.
  assert.match(code, /mobile:\s*PHONE/, 'la sonde doit emuler un appareil mobile quand UICHECK_PHONE est demande');
  assert.match(code, /deviceScaleFactor:\s*PHONE\s*\?\s*3\s*:\s*1/,
    'et un ecran de telephone (facteur 3), sans toucher au rendu de bureau');
  assert.match(code, /Emulation\.setTouchEmulationEnabled/, 'et un ecran TACTILE');
  assert.match(code, /maxTouchPoints/, 'avec un nombre de points de contact reel');

  // LES QUATRE MESURES. Chacune POUSSE DANS R.defauts : c'est ce qui fait sortir
  // la sonde en 1 des qu'un defaut de telephone existe. L'interface de sortie ne
  // change pas — un code de sortie nouveau serait un piege pour les appelants.
  assert.match(code, /SEUIL\s*=\s*44/, 'le seuil du doigt doit etre explicite (44 px)');
  assert.match(code, /cibles tactiles sous/, 'la mesure des cibles doit exister');
  assert.match(code, /hors de l ecran/, 'la mesure d atteignabilite doit exister');
  // LE BORD DE L'ECRAN N'EST PAS `innerWidth`, ET C'EST MESURE : sur une page
  // mobile qui deborde, Chrome elargit `innerWidth` a la largeur du CONTENU
  // (1041 px releves pour un ecran de 390), alors que
  // `document.documentElement.clientWidth` reste a 390. Comparer les bords a
  // `innerWidth` rendait « tout est dans la fenetre » sur une page qui deborde
  // de 651 px — la mesure se taisait sur le defaut qu'elle doit attraper.
  assert.match(code, /document\.documentElement\.clientWidth/,
    'l atteignabilite doit se mesurer contre l ECRAN, pas contre innerWidth');
  assert.match(code, /tronques sans ellipse/, 'la mesure des troncatures doit exister');
  assert.match(code, /R\.inventaire/, 'l inventaire des cibles doit etre rendu');
  assert.match(code, /R\.defauts\.push/, 'et ces mesures doivent peser sur le verdict');

  // ET L'EXPRESSION ENVOYEE DOIT COMPILER EN MODE TELEPHONE AUSSI. Le garde-fou
  // voisin ne la compile QUE sans le drapeau : un antislash mange ou un backtick
  // glisse dans le bloc telephone ne se verrait qu'a l'execution, sous la forme
  // d'un « la page n'a rien renvoye » qui n'oriente vers aucune cause.
  const i = src.indexOf('const SONDE =');
  const j = src.indexOf('\n})()`;', i);
  assert.ok(i > 0 && j > i, 'la sonde doit etre extractible de scripts/uicheck.js');
  const SONDE = eval(src.slice(i, j + 6) + '\nSONDE');   // eslint-disable-line no-eval
  const avant = process.env.UICHECK_PHONE;
  let expr = '';
  try {
    process.env.UICHECK_PHONE = '1';
    expr = SONDE('.view.active', true);
  } finally {
    if (avant === undefined) delete process.env.UICHECK_PHONE; else process.env.UICHECK_PHONE = avant;
  }
  assert.ok(expr.includes('matchMedia'), 'le mode telephone doit rapporter les media features de la page');
  assert.ok(/demande:\s*true/.test(expr), 'le drapeau doit atteindre l expression envoyee');
  assert.doesNotThrow(() => new Function(expr),
    'l expression de telephone ne compile pas : la sonde ne mesurerait plus rien en mode telephone');
});

test('le diaporama automatique ne s impose ni sur un telephone ni sur une surcouche', () => {
  // SANS LES COMMENTAIRES : un garde-fou qui lit de la prose se retourne contre
  // son propre commentaire, et c'est arrive trois fois dans ce depot.
  const app = sansCommentaires(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8'));
  // Trois conditions, et chacune protege d'un cas reel :
  //   - sous 780 px : une surcouche qui surgit sur un ecran qui s'eteint de
  //     toute facon ne sert a rien ;
  //   - une surcouche ouverte : pas de diaporama par-dessus une confirmation de
  //     suppression ;
  //   - le reglage coupe.
  const i = app.indexOf('function diaAutoPeut');
  assert.ok(i > 0, 'diaAutoPeut doit exister');
  const corps = app.slice(i, i + 400);
  assert.match(corps, /DIA_AUTO/, 'la fonction doit lire le reglage');
  assert.match(corps, /DIA_LARGEUR_MIN/, 'elle doit refuser les petits ecrans');
  assert.match(corps, /surcoucheOuverte\(\)/, 'elle doit refuser si une surcouche est ouverte');
  // LA VALEUR SE VERIFIE SUR LA CONSTANTE, PAS DANS LA FENETRE. Le motif
  // d'origine cherchait le litteral `780` dans les 400 caracteres qui suivent la
  // fonction, alors que la constante est declaree 44 caracteres AVANT elle.
  // Mesure : `/780/` rendait `false` sur cette fenetre — le test n'aurait JAMAIS
  // pu passer, et l'implementeur aurait cherche le defaut dans son code.
  assert.match(app, /const DIA_LARGEUR_MIN=780;/, 'la largeur minimale doit valoir 780');
});

test('le client ne recolle JAMAIS un chemin avec un antislash en dur', () => {
  // `src.split(/[\\/]/)...join('\\')` : juste sous Windows, FAUX sous Linux, ou
  // `/media/usb/Games/Halo` devient `/media/usb/Games\Halo` — un chemin qui n'existe
  // pas. Le selecteur de destination s'ouvrait alors au mauvais endroit, et le
  // panneau ORGANISER affichait un dossier faux. C'est la meme faute que les
  // antislashs de `CATEGORIES[].rel` restes litteraux sous Linux.
  const app = sansCommentaires(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8'));
  const fautifs = [];
  for (const m of app.matchAll(/[^\n]*\.join\('\\\\'\)[^\n]*/g)) {
    fautifs.push(m[0].trim().slice(0, 90));
  }
  assert.deepStrictEqual(fautifs, [],
    'chemins recolles avec un antislash en dur :\n  ' + fautifs.join('\n  '));
});

test('dossierParent : juste sous Windows ET sous Linux', () => {
  // Le bloc est EXTRAIT de app.js et evalue : le client n'a pas de DOM de test, mais
  // cette fonction est pure. On la verifie sur les deux plateformes depuis n'importe
  // laquelle — c'est ainsi qu'un bug de separateur se fait prendre sur la CI Windows.
  const app = sansCommentaires(fs.readFileSync(path.join(PUB, 'app.js'), 'utf8'));
  const i = app.indexOf('function dossierParent(');
  assert.ok(i > 0, 'dossierParent doit exister dans app.js');
  const fin = app.indexOf('\n}', i);
  const dossierParent = new Function(app.slice(i, fin + 2) + '; return dossierParent;')();

  // Windows : le chemin garde ses antislashs
  assert.strictEqual(dossierParent('C:\\Games\\Halo'), 'C:\\Games');
  assert.strictEqual(dossierParent('H:\\_A_TRIER\\jeu.7z'), 'H:\\_A_TRIER');
  // `C:` seul designe le dossier COURANT du disque, pas sa racine : il faut `C:\`.
  assert.strictEqual(dossierParent('C:\\Halo'), 'C:\\');
  assert.strictEqual(dossierParent('C:\\'), 'C:\\');
  // Linux : le chemin garde ses slashs
  assert.strictEqual(dossierParent('/media/usb/Games/Halo'), '/media/usb/Games');
  assert.strictEqual(dossierParent('/run/media/user/XBOX360/Games'), '/run/media/user/XBOX360');
  assert.strictEqual(dossierParent('/Halo'), '/');
  assert.strictEqual(dossierParent('/'), '/');
});

// --- dialogues : jamais de boite native ------------------------------------
//
// `confirm()` et `prompt()` GELLENT le fil JavaScript : pendant qu'une
// confirmation est ouverte, `pollDl` (600 ms), `pollEvents` (4 s), le journal et
// l'horloge s'arretent — l'ecran montre un etat perime au milieu d'un transfert.
// Et ils ne se pilotent pas a la manette, alors que l'application est faite pour
// une tele et une manette : `majCtlLegende()` avait du RETIRER la pastille
// « B SUPPRIMER » pour cette seule raison. Les boites maison les remplacent.

test('aucun dialogue NATIF ne subsiste (confirm / prompt / alert)', () => {
  // Le motif exige le `(` juste apres : `confirmText` ou `renderAlert` ne sont pas
  // des dialogues. Et `\b` refuse `monconfirm(`.
  const RE = /\b(confirm|prompt|alert)\s*\(/g;
  for (const f of ['public/app.js', 'public/index.html']) {
    const s = sansCommentaires(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
    const trouve = [];
    for (const m of s.matchAll(RE)) {
      const ligne = s.slice(0, m.index).split('\n').length;
      trouve.push(f + ':' + ligne + ' ' + m[0].trim());
    }
    assert.deepStrictEqual(trouve, [],
      'dialogues natifs restants (ils gelent l UI et ignorent la manette) :\n  '
      + trouve.join('\n  '));
  }
});

test('la surcouche de dialogue est connue des mecanismes de fermeture', () => {
  // Echap, Tab, et le bouton B de la manette passent tous par la liste
  // SURCOUCHES. Une boite absente de cette liste s'ouvre puis s'ENFERME : on ne
  // peut plus l'annuler, donc on ne peut plus refuser une suppression.
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(html, /id="dialogModal"/, 'la surcouche doit exister dans index.html');
  const liste = /const SURCOUCHES = \[([^\]]*)\]/.exec(app);
  assert.ok(liste, 'SURCOUCHES doit exister');
  assert.match(liste[1], /'dialogModal'/,
    'dialogModal doit figurer dans SURCOUCHES, sinon Echap et B ne la ferment pas');
});

test('le corps du dialogue est ECHAPPE (les noms viennent du disque et du reseau)', () => {
  // `confirm()` prenait une chaine brute. Passer a innerHTML sans echapper
  // INTRODURAIT une XSS : les messages portent des noms de jeux du disque et des
  // titres d'items archive.org, controlables par n'importe qui. `textContent` est
  // la bonne reponse : aucun HTML n'est analyse, donc il n'y a rien a echapper.
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const i = app.indexOf('function confirmer(');
  assert.ok(i > 0, 'le helper confirmer() doit exister');
  const corps = app.slice(i, i + 1800);
  assert.match(corps, /dlgCorps'\)\.textContent\s*=/, 'le corps doit etre pose en textContent');
  assert.ok(!/dlgCorps'\)\.innerHTML/.test(corps),
    'jamais innerHTML pour le corps : les noms viennent du disque et du reseau');
});

test('chaque appel a confirmer() / saisir() est ATTENDU', () => {
  // LE PIRE BUG POSSIBLE ICI. `confirmer()` rend une promesse, donc toujours
  // VRAIE. Un `await` oublie donne `if (!promesse) return;` -> jamais vrai -> on
  // ne s'arrete jamais -> la suppression part SANS confirmation. Meme lecon que
  // le passage en async du pipeline, ou cinq appelants etaient devenus muets.
  const app = sansCommentaires(fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8'));
  const appels = [...app.matchAll(/(?<![A-Za-z0-9_.$])(confirmer|saisir)\s*\(/g)].length;
  const defs = [...app.matchAll(/function\s+(confirmer|saisir)\s*\(/g)].length;
  const attendus = [...app.matchAll(/await\s+(confirmer|saisir)\s*\(/g)].length;
  assert.ok(appels > defs, 'les helpers doivent avoir des appelants');
  assert.strictEqual(attendus, appels - defs,
    'chaque appel doit etre precede de await : ' + attendus + ' awaits pour '
    + (appels - defs) + ' appels');
});

test('saisir() distingue ANNULER (null) de VIDE ("")', () => {
  // `dpCover` depend de cette distinction : une chaine vide veut dire « recharge
  // la jaquette officielle », `null` veut dire « ne fais rien ». Un helper qui
  // rendrait "" dans les deux cas relancerait un telechargement de jaquette que
  // personne n'a demande.
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const i = app.indexOf('async function dpCover(');
  assert.ok(i > 0, 'dpCover doit exister');
  const corps = app.slice(i, i + 400);
  assert.match(corps, /===\s*null/, 'dpCover doit tester null explicitement');
});

test('open : n ouvre jamais un FICHIER, seulement son dossier', () => {
  // `/api/open` accepte un chemin du client. `openPath` retombe sur `path.dirname`
  // quand la cible est un fichier : il ouvre donc un EXPLORATEUR sur le dossier
  // parent, jamais le fichier lui-meme. C'est ce qui empeche d'executer quelque
  // chose — on verifie que ce garde-fou reste, parce que le retirer changerait la
  // nature de la route.
  const plat = fs.readFileSync(path.join(__dirname, '..', 'lib', 'platform.js'), 'utf8');
  const i = plat.indexOf('function openPath');
  assert.ok(i > 0, 'openPath doit exister');
  const corps = plat.slice(i, i + 500);
  assert.match(corps, /isDirectory\(\)/, 'le type de la cible doit etre teste');
  assert.match(corps, /path\.dirname\(p\)/, 'un fichier doit etre ramene a son dossier');
  assert.match(corps, /explorer\.exe/, 'et ouvert par l explorateur, pas execute');
});

// --- LE DOIGT : les regles tactiles, et ce qu'elles protegent ----------------
// Un test sur la feuille ne voit qu'une regle INCOMPLETE, jamais une regle
// ABSENTE : c'est pourquoi c'est la sonde qui MESURE les cibles (UICHECK_PHONE=1,
// seuil de 44 px). Ici on verifie seulement que les regles sont LA, et qu'elles
// ne vivent pas dans un palier de LARGEUR : une fenetre etroite sur un PC ne doit
// pas s'epaissir parce qu'un telephone existe.
// ON LIT LA FEUILLE SANS SES COMMENTAIRES, et c'est le piege qui a deja frappe
// trois fois dans ce depot : ces regles expliquent le defaut en citant
// « pointer: coarse », « langwrap:hover » et « min-height:44px », donc un motif
// naif compterait la prose qui les decrit.
test('le doigt : 44 px de cible et un menu de langues qui se referme, hors des paliers de largeur', () => {
  const nu = sansCommentaires(css);
  const bloc = (motif, quoi) => {
    const m = new RegExp('@media\\s*\\(' + motif + '\\)\\s*\\{([\\s\\S]*?)\\n\\}').exec(nu);
    assert.ok(m, quoi + ' : le bloc @media (' + motif + ') doit exister');
    return m[1];
  };

  const grossier = bloc('pointer:\\s*coarse', 'pointeur grossier');
  assert.match(grossier, /--h-control:\s*44px/, 'en pointeur grossier, --h-control vaut 44 px');
  assert.match(grossier, /min-height:\s*44px/, 'et les controles montent a 44 px de haut');
  assert.match(grossier, /min-width:\s*44px/, 'les boutons d icone aussi, en largeur');

  const sansSurvol = bloc('hover:\\s*none', 'survol absent');
  assert.match(sansSurvol, /\.langwrap:hover[^{]*\{[^}]*display:\s*none/,
    'au doigt, le survol ne doit plus ouvrir le menu de langues');
  assert.match(sansSurvol, /\.langwrap\.ouvert[^{]*\{[^}]*display:\s*none/,
    'ni la classe posee par basculeLang, que rien ne retire au doigt');
  assert.match(sansSurvol, /\.langwrap:focus-within[^{]*\{[^}]*display:\s*block/,
    'c est le focus qui l ouvre — donc un tap ailleurs le referme');

  // LA BANDE D'ONGLETS AU TELEPHONE. Huit cibles de 44 px font 352 px : elles ne
  // tiennent dans 342 px (390 - 2 x 24) que si la bande annule la marge laterale
  // de l'en-tete. Retirer l'une des deux regles remet un onglet hors d'atteinte.
  const tel = bloc('max-width:\\s*560px', 'palier telephone');
  assert.match(tel, /\.ttab\{[^}]*min-width:\s*44px/, 'chaque onglet fait au moins 44 px de large');
  assert.match(tel, /\.tb-tabs\{[^}]*margin-inline:\s*calc\(-1\s*\*\s*var\(--sp-5\)\)/,
    'et la bande annule la marge laterale pour tenir a l ecran');
});

// LA FENETRE BASSE : UNE RANGEE, SANS RETIRER UN CONTROLE.
// Mesure a 844x390 en pointeur grossier (`t6b-phone-lib-844x390.txt`) : l'en-tete
// faisait 89 px, soit 23 % d'une fenetre de 390, quand la sonde plafonne le RATIO
// a 12 % — 46,8 px ici. Deux rangees de cibles de 44 px n'y tiennent pas, une
// seule tient (44 + 1 px de filet = 45 px). La regle qui l'y met est une regle de
// DISPOSITION, et c'est ce qui rend le raccourci tentant : retirer la place libre
// du disque, le selecteur de disque ou un onglet ferait tenir la rangee en
// supprimant ce qu'elle sert a atteindre — un pire defaut qu'un en-tete haut.
// Ce test pinte donc l'INVARIANT (les huit onglets a 44 px, le selecteur et le
// bouton de langue presents, les libelles toujours dans le DOM) et surtout PAS la
// forme a deux rangees d'avant, qui est precisement ce qu'on corrige.
test('la fenetre basse : une rangee, et le doigt garde ses 44 px', () => {
  const nu = sansCommentaires(css);
  const m = /@media\s*\(pointer:\s*coarse\)\s*and\s*\(max-height:\s*500px\)\s*and\s*\(min-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/.exec(nu);
  assert.ok(m, 'le palier « pointeur grossier + fenetre basse » doit exister');
  const bloc = m[2];
  // LE SEUIL DE LARGEUR N'EST PAS UN GOUT. 826 px est la largeur ou la rangee
  // cesse de tenir : 443 px de bloc d'identite (26 de logo + 16 d'ecart + 210 de
  // selecteur + 8 + 130 de place libre + 8 + 45 de langue) + 359 px pour les huit
  // onglets + les 24 px de marge de la colonne que la bande ne rend pas. En
  // dessous, l'en-tete garde ses deux rangees plutot que de perdre un controle.
  assert.ok(Number(m[1]) >= 826,
    'le seuil doit couvrir la largeur ou la rangee tient (826 px mesures) : ' + m[1]);
  // LA CIBLE DU DOIGT D'ABORD : un onglet sous 44 px echangerait un defaut contre
  // un autre, et c'est la premiere regle que la sonde mesure.
  assert.match(bloc, /\.ttab\{[^}]*min-width:\s*44px/,
    'les onglets gardent 44 px de large dans la rangee unique');
  // AUCUN CONTROLE NE DISPARAIT POUR GAGNER LA HAUTEUR.
  assert.doesNotMatch(bloc, /#drive\b[^{]*\{[^}]*display:\s*none/,
    'le selecteur de disque reste a l ecran');
  assert.doesNotMatch(bloc, /\.ttab[^{,]*\{[^}]*display:\s*none/,
    'les onglets restent a l ecran');
  assert.doesNotMatch(bloc, /\.ttab \.txt\{[^}]*display:\s*none/,
    'un libelle retire par display:none n a plus de nom accessible');
  // LE SEUL RETRAIT ASSUME EST LE TEXTE DE MARQUE (197 px a lui seul), et c'est
  // deja celui du palier 560 sur le meme appareil : le logo reste.
  assert.match(bloc, /\.brand \.bn,\.brand \.bs\{display:\s*none\}/,
    'le texte de marque est le seul retrait, comme au palier 560');
});

test('au telephone, les tableaux deviennent des fiches et perdent leur plancher de 620 px', () => {
  // LE DEFAUT MESURE, celui que cette tache supprime : a 390 px la vue Catalogue
  // rendait un tableau de 620 px dans une colonne de 330 (« tablewrap 620>330 »,
  // releve before-phone-cat.txt), soit trois cents lignes poussees hors de
  // l'ecran, lisibles seulement en faisant defiler lateralement. La fiche
  // supprime le defilement : chaque cellule prend la largeur de la colonne de
  // lecture et porte le nom de son champ devant sa valeur.
  //
  // LA FEUILLE EST LUE SANS SES COMMENTAIRES : ce commentaire-ci cite les
  // selecteurs qu'il exige, et un motif naif les prendrait pour la regle.
  const nu = sansCommentaires(css);
  const bloc = (motif, quoi) => {
    const m = new RegExp('@media\\s*\\(' + motif + '\\)\\s*\\{([\\s\\S]*?)\\n\\}').exec(nu);
    assert.ok(m, quoi + ' : le bloc @media (' + motif + ') doit exister');
    return m[1];
  };
  const tel = bloc('max-width:\\s*560px', 'palier telephone');

  // 1. LA FICHE ELLE-MEME : la ligne est un bloc, la cellule empile libelle et
  //    valeur, et le libelle vient de l'ATTRIBUT — pas d'une chaine recopiee.
  assert.match(tel, /\.tbl tr\{[^}]*display:\s*block/,
    'au telephone une ligne est une fiche (bloc), plus une rangee de colonnes');
  assert.match(tel, /\.tbl td\{[^}]*display:\s*flex/,
    'et sa cellule met le nom du champ devant la valeur');
  assert.match(tel, /\.tbl td::before\{[^}]*content:\s*attr\(data-l\)/,
    'le nom du champ est l attribut data-l, donc il suit la langue des en-tetes');
  // Le libelle ne descend pas sous --fs-caption : la sonde refuse tout texte
  // rendu sous 12 px, et elle ne mesure PAS les pseudo-elements — ce texte-la
  // n'aurait donc aucun autre garde-fou.
  assert.match(tel, /\.tbl td::before\{[^}]*font-size:\s*var\(--fs-caption\)/,
    'le nom du champ reste a --fs-caption (12 px)');

  // 2. LE `<tbody>` DEVIENT UN BLOC, LUI AUSSI, ET CE N'EST PAS UNE PAIRE DE PLUS.
  //    Une table dont seules la table et les lignes passent en bloc garde un
  //    `<tbody>` en `table-row-group` : le navigateur fabrique alors autour de
  //    chaque `<tr>` une LIGNE et une CELLULE anonymes, dimensionnees en
  //    « shrink-to-fit ». Mesure a 390 px : une fiche courte de `#dlResults`
  //    faisait 117 px dans une colonne de 330 et ses trois cellules 182 px. Le
  //    catalogue ne paraissait juste que parce que ses lignes atteignaient deja
  //    la largeur de la colonne toutes seules — le defaut etait masque par le
  //    contenu, pas absent.
  assert.match(tel, /\.tbl tbody\{[^}]*display:\s*block/,
    'le tbody doit passer en bloc, sinon une fiche courte se retrecit sur son contenu');

  // 3. LES LIGNES DE REMPLISSAGE N'ONT PAS DE COLONNE. Un `colspan="4"` couvre
  //    quatre colonnes sans en etre aucune : sans cette regle, le squelette et
  //    l'etat vide porteraient un libelle vide devant leur contenu.
  assert.match(tel, /\.tbl td:not\(\[data-l\]\)::before\{[^}]*content:\s*none/,
    'une cellule de remplissage (colspan) ne doit fabriquer aucun libelle');

  // 4. LE PLANCHER DE 620 px TOMBE. C'est l'invariant central de la tache :
  //    sans lui la fiche mesure 620 px dans un ecran de 390 et le defaut est
  //    intact, seulement decore.
  assert.match(tel, /\.tbl\{[^}]*min-width:\s*0/,
    'le palier telephone doit annuler le min-width:620px des tableaux');
  // ET LA REGLE DOIT POUVOIR GAGNER. `.tablewrap table{min-width:620px}` est
  // PLUS SPECIFIQUE que `.tbl` seul — (0,0,1,1) contre (0,0,1,0) — et une media
  // query n'ajoute AUCUNE specificite : un `.tbl{min-width:0}` ecrit a cet
  // endroit ne s'appliquerait jamais. Le selecteur du palier doit donc nommer
  // aussi le conteneur. Verifie par mutation : retirer `.tablewrap ` remet la
  // mesure a 620 px sans qu'aucune ligne de la feuille ait disparu.
  assert.match(tel, /\.tablewrap\s+\.tbl\{[^}]*min-width:\s*0/,
    'la regle qui annule le plancher doit battre `.tablewrap table`, sinon elle ne s applique a rien');

  // 5. LES LARGEURS DE COLONNE NE S'APPLIQUENT PLUS DANS UNE FICHE, et c'est
  //    l'autre piege : elles sont ID-SCOPED (`#v-cat table td:nth-child(1)` vaut
  //    (0,1,1,2) et bat tout selecteur sans identifiant), et `dlmFileRow` en pose
  //    meme cinq EN LIGNE (`width:80px`, `width:180px`) — qu'aucune regle de
  //    feuille ne peut battre sans `!important`, interdit ici. La cellule prend
  //    donc sa largeur par `min-width:100%` : `min-width` GAGNE sur `width` dans
  //    le calcul de la largeur utilisee, quelle que soit l'origine de la
  //    declaration. Sans elle, la cellule du titre resterait large de 58 %, la
  //    taille de 90 px et l'action de 180 px DANS la fiche.
  assert.match(tel, /\.tbl td\{[^}]*min-width:\s*100%/,
    'la cellule doit prendre toute la largeur de la fiche (min-width gagne sur width)');

  // 6. LE TITLEID SE REPLIE. `.c-tid` porte `white-space:nowrap` : en fiche il
  //    deborderait au lieu de se replier, et rien d'autre ne le neutralise.
  assert.match(tel, /\.tbl \.c-tid\{[^}]*white-space:\s*normal/,
    'un TitleID ne doit plus etre colle en une seule ligne dans une fiche');
});

// --- LES SURCOUCHES DEVIENNENT DES FEUILLES (tache 4) ------------------------
// Mesure a 390x844 avant correction (`t4-before-phone-ovl-*.txt`) : les sept
// panneaux de dialogue faisaient 367 a 371 px de large dans une fenetre de 390,
// et ils etaient CENTRES VERTICALEMENT — les actions tombaient donc au milieu de
// l'ecran, hors de portee du pouce, avec 10 px de marge perdue de chaque cote.
//
// CE QUI EMPECHAIT LE PALIER 560 DE S'APPLIQUER : la coque etait ecrite EN LIGNE
// sur le `div` direct de chaque voile (`style="...width:min(940px,95vw);
// max-height:85vh..."`), et l'en-ligne bat la feuille — il n'y avait que
// `!important` pour passer, ce que cette feuille interdit (arbitrage A4) et ce
// que le depot avait deja refuse pour `z-index`, deplace en ligne -> feuille
// pour exactement la meme raison : une decision qui se lit en un endroit.
//
// CE GARDE-FOU PROUVE L'INVARIANT, PAS LE MECANISME. Il ne regarde pas OU la
// coque est ecrite, seulement qu'aucun panneau ne la porte plus en ligne — c'est
// ce qui empeche quelqu'un de rajouter « juste un width » sur un dixieme
// panneau, et donc de rendre le palier 560 impotent sans que rien ne le dise.
//
// LES TROIS EXCEPTIONS SONT VOULUES, pas oubliees : `#diaModal` n'est pas un
// panneau mais un diaporama (six `div` directs), et `#langModal` / `#helpModal`
// gardent leur boite centree — un choix de quatre langues ou une boite de
// lecture etires sur tout l'ecran seraient pires que la boite centree, et les
// deux tiennent deja a 390 px (`min(560px,92vw)` = 359 px). Les exclure du
// balayage vaut mieux que de les exclure au cas par cas : le test tomberait
// aussi si quelqu'un leur donnait la classe `.panel`, donc si l'une des deux
// devenait une feuille sans que personne ne l'ait decide.
// LA LISTE DES INTERDITS EST UNE LISTE DE MOTIFS, PAS DE SOUS-CHAÎNES. Ecrite en
// litteraux, elle ne voyait que la forme EXACTE : `width:min(` laissait passer
// `width: min(` (une espace, et la declaration est equivalente) et `width:760px`
// — c'est-a-dire n'importe quelle largeur en dur, exactement ce que le palier 560
// doit pouvoir reprendre. Un motif tolere l'espace et N'IMPORTE QUELLE valeur.
// `(?:^|[;\s])` evite d'attraper une propriete dont le nom se termine pareil
// (`min-width` est bien vise, `--w-max` non) tout en restant insensible au fait
// que la declaration ouvre ou suive un `;`.
const COQUE_EN_LIGNE = [
  ['background', /(?:^|[;\s])background(?:-color|-image)?\s*:/],
  ['box-shadow', /(?:^|[;\s])box-shadow\s*:/],
  ['width', /(?:^|[;\s])(?:max-|min-)?width\s*:/],
  ['max-height', /(?:^|[;\s])max-height\s*:/]
];
const SURCOUCHES_HORS_PANNEAU = ['diaModal', 'langModal', 'helpModal'];

// LES VOILES DU DOCUMENT, QUEL QUE SOIT L'ORDRE DE LEURS ATTRIBUTS. Le motif
// precedent exigeait `id=` AVANT `class="ovl"` : un dixieme panneau ecrit
// `<div class="ovl x" id="yModal">` echappait donc au balayage, et le plancher
// `voiles.length >= 9` ne le voyait pas non plus puisque `index.html` en compte
// DIX. On separe les deux questions, au lieu de les melanger dans un seul motif :
//   1. quels `<div>` portent la classe `ovl` (jeton de classe, ordre libre) ?
//   2. quel est le `div` DIRECT qui suit chacun — c'est lui, le panneau ?
function voilesDuDocument(source) {
  const voiles = [];
  for (const m of source.matchAll(/<div\b([^>]*)>/g)) {
    const cls = (/class="([^"]*)"/.exec(m[1]) || [])[1];
    if (!cls || !cls.split(/\s+/).includes('ovl')) continue;
    const suite = source.slice(m.index + m[0].length);
    const panneau = /^\s*<div\b([^>]*)>/.exec(suite);
    voiles.push({ id: (/id="([^"]+)"/.exec(m[1]) || [])[1] || null, panneau: panneau ? panneau[1] : null });
  }
  return voiles;
}

test('aucun panneau de surcouche ne porte plus sa coque en ligne', () => {
  // ON BALAIE LES VOILES DU DOCUMENT, pas une liste ecrite ici : un dixieme
  // panneau doit tomber sous la meme regle sans que personne ne pense a
  // l'ajouter a un tableau. Le panneau d'un voile est son `div` DIRECT — c'est
  // la structure dont dependent deja l'acrylique (`[id$="Modal"]>div`) et
  // l'animation d'entree (`#orgModal>div,...`), et elle ne bouge pas.
  //
  // ET LE BALAYAGE NE DOIT PERDRE AUCUN VOILE. On compare les voiles TROUVES a
  // TOUTES les occurrences de `class="ovl` du fichier : si l'une des deux listes
  // est plus courte, c'est qu'un voile a echappe au motif, et un panneau qui
  // echappe au motif peut garder sa coque en ligne sans que rien ne le dise.
  const voiles = voilesDuDocument(html);
  const attendus = (html.match(/class="ovl[\s"]/g) || []).length;
  assert.strictEqual(voiles.length, attendus,
    'des voiles echappent au balayage : ' + voiles.length + ' trouve(s) pour ' + attendus + ' `class="ovl` dans index.html');
  assert.ok(voiles.length >= 10,
    'les surcouches doivent etre trouvees dans index.html (trouve ' + voiles.length + ')');
  for (const { id, panneau: attrs } of voiles) {
    assert.ok(id, 'chaque voile doit porter un identifiant (l ordre des attributs ne doit pas le cacher)');
    assert.ok(attrs !== null, id + ' : le voile doit avoir un `div` DIRECT pour panneau');
    if (SURCOUCHES_HORS_PANNEAU.includes(id)) {
      assert.ok(!/class="[^"]*\bpanel\b/.test(attrs),
        id + ' n est pas un panneau a actions : il garde sa boite centree, donc pas la classe .panel');
      continue;
    }
    assert.match(attrs, /class="[^"]*\bpanel\b/,
      id + ' : le panneau direct du voile doit porter la classe .panel');
    const style = /style="([^"]*)"/.exec(attrs);
    const restes = COQUE_EN_LIGNE.filter(([, motif]) => motif.test(style ? style[1] : '')).map(([nom]) => nom);
    assert.deepStrictEqual(restes, [],
      id + ' porte encore sa coque en ligne (' + restes.join(', ') + ') : l en-ligne bat la feuille, '
      + 'donc le palier 560 ne peut plus en faire une feuille sans !important');
  }
});

test('la coque des panneaux vit dans la feuille, et le palier 560 en fait des feuilles', () => {
  // CE TEST-LA NE LIT PAS LE HTML : il verrouille le mecanisme qui rend le
  // palier 560 possible, et c'est le meme raisonnement que pour `z-index`
  // (section 13) — une decision de mise en page se lit en UN endroit.
  const nu = sansCommentairesCss(css);
  const coque = /\.panel\{([^}]*)\}/.exec(nu);
  assert.ok(coque, 'la feuille doit porter la coque des panneaux, une seule fois, en classe .panel');
  for (const prop of ['background:', 'border:', 'border-radius:', 'width:min(', 'max-height:',
                      'display:flex', 'flex-direction:column', 'box-shadow:']) {
    assert.ok(coque[1].includes(prop),
      'la coque doit porter ' + prop + ' — elle le portait en ligne, sept fois');
  }

  // LE PALIER 560 EXISTE DEJA (Task 3) : on ajoute dedans, on n'en cree pas un
  // second — deux paliers de meme seuil se liraient dans l'ordre du fichier.
  const bloc = /@media\s*\(max-width:\s*560px\)\s*\{([\s\S]*?)\n\}/.exec(nu);
  assert.ok(bloc, 'le palier 560 doit exister');
  // On prend la REGLE (selecteur ET corps), pas une occurrence quelque part dans
  // le palier : un identifiant cite dans un selecteur voisin ne fait pas gagner
  // la regle qui, elle, doit gagner.
  const feuille = /([^{}]*\.panel[^{}]*)\{([^}]*)\}/.exec(bloc[1]);
  assert.ok(feuille, 'le palier 560 doit faire une feuille du panneau');
  const sels = feuille[1];
  for (const prop of ['width:100%', 'height:100%', 'max-height:100%', 'border:0', 'border-radius:0']) {
    assert.ok(feuille[2].includes(prop), 'une feuille pleine hauteur demande ' + prop);
  }

  // ET LA REGLE DOIT POUVOIR GAGNER, sinon tout ce qui precede est decoratif.
  // Les largeurs qui different d'un panneau a l'autre sont ID-SCOPED :
  // `#orgModal>.panel` vaut (0,1,1,0) contre (0,0,1,0) pour `.panel` seul, et
  // une media query n'ajoute AUCUNE specificite. Sans les identifiants dans le
  // MEME selecteur, la feuille pleine hauteur ne s'appliquerait PAS a ces cinq
  // panneaux — mesure : le panneau restait a 367-371 px dans une fenetre de 390.
  // C'est le piege deja referme a la Task 3 sur `.tablewrap table{min-width:620px}`,
  // et la meme reponse : c'est la declaration perdante qui se deplace, ici en
  // nommant les conteneurs.
  const exceptions = [...nu.matchAll(/#([A-Za-z]+Modal)>\s*\.panel\s*\{([^}]*)\}/g)]
    .filter(([, , corps]) => /(width|max-height):/.test(corps));
  assert.ok(exceptions.length >= 4,
    'les largeurs propres a un panneau doivent exister (trouve ' + exceptions.length + ')');
  for (const [, id] of exceptions) {
    assert.ok(new RegExp('#' + id + '>\\s*\\.panel').test(sels),
      'le palier 560 doit nommer #' + id + ' dans le selecteur de sa regle de feuille : '
      + 'un `.panel` seul (0,0,1,0) ne bat pas `#' + id + '>.panel` (0,1,1,0), '
      + 'donc ce panneau-la ne serait pas une feuille');
  }
});

test('surcouche : le contenu est UN element de grille, sinon un titre se detache de sa table', () => {
  // LA CLASSE DE DEFAUT QUE CE GARDE-FOU FERME, ET ELLE A ETE MESUREE. Une grille
  // range ses elements PAR RANGEE : avec la fiche en colonne 1 et les quatre blocs
  // de contenu en colonne 2, le titre « SOURCES » (28 px) partageait la rangee 1
  // avec la fiche (547 px mesuree) et sa PROPRE table partait en rangee 2. Le
  // titre flottait donc seul, et la colonne de droite restait vide sous lui.
  // Mesure a 1600x1000 : `dlmSec1` de y209 a y237, `dlmT1` a y732 — 495 px de
  // vide la ou la marge d'un titre vaut 12 px. Le meme trou a 900x900 (495 px),
  // et aucun des releves precedents ne l'avait vu : le palier 899 empile les deux
  // colonnes, les captures du telephone etaient propres, et la verification de la
  // fiche avait controle des LARGEURS — le defaut est une RELATION.
  //
  // L'INVARIANT, PAS LA DECLARATION. Deux formes le respectent, et le test accepte
  // les deux :
  //   - les quatre blocs de contenu forment UN SEUL element de grille (celle qui
  //     est en place : un conteneur, donc le flux normal a l'interieur) ;
  //   - ou la fiche COUVRE les rangees qu'ils occupent (`grid-row:span n`).
  // La seconde a ete mesuree avant d'etre ecartee : un element qui couvre des
  // rangees leur REPARTIT l'exces de sa hauteur, donc des que la colonne de
  // contenu est plus courte que la fiche — cas reel, une recherche sans resultat —
  // le trou revient (74 px et 73 px au lieu de 12, mesures). C'est pourquoi la
  // forme retenue est la premiere ; le test ne l'impose pas, il impose le resultat.
  const nu = sansCommentairesCss(css);
  const corps = /\.dlm-body\{([^}]*)\}/.exec(nu);
  assert.ok(corps, 'la feuille doit poser la grille du corps de la surcouche (.dlm-body)');
  assert.match(corps[1], /grid-template-columns:\s*200px/,
    'deux colonnes : la fiche a gauche, le contenu a droite');
  const regleFiche = /\.dlm-body>\.fiche\{([^}]*)\}/.exec(nu);
  assert.ok(regleFiche, 'la feuille doit placer la fiche (.dlm-body>.fiche)');
  assert.match(regleFiche[1], /grid-column:\s*1/, 'la fiche occupe la colonne 1');

  // LES ENFANTS DIRECTS DU CORPS, tels qu'ils sont ECRITS : c'est le HTML qui
  // decide de la pose, pas la feuille. On lit l'indentation du document pour les
  // compter — un element imbrique d'un cran de plus n'est pas un element de la
  // grille.
  const identifiants = ['dlmSec1', 'dlmT1', 'dlmSec2', 'dlmT2'];
  const zone = /<div class="ov-body dlm-body">([\s\S]*?)\n    <\/div>/.exec(sansCommentaires(html));
  assert.ok(zone, 'le corps de la surcouche de telechargement doit etre trouve dans index.html');
  for (const id of identifiants) {
    assert.ok(zone[1].includes('id="' + id + '"'), '#' + id + ' doit etre dans le corps de la surcouche');
  }
  const enfants = zone[1].match(/^ {6}<[a-zA-Z][^>]*>/gm) || [];
  const reunis = enfants.length === 2
    && /id="dlmFiche"/.test(enfants[0])
    && !new RegExp('id="(' + identifiants.join('|') + ')"').test(enfants[1]);
  const couvre = /grid-row:\s*(?:span\s+[2-9]|1\s*\/\s*-1)/.test(regleFiche[1]);

  assert.ok(reunis || couvre,
    'le corps de la surcouche doit avoir DEUX enfants directs — la fiche, puis le conteneur des quatre blocs — '
    + 'ou la fiche doit couvrir ses rangees (grid-row). Enfants directs trouves : ' + enfants.length + ' : '
    + enfants.join(' ') + '. Sans cela, la pose automatique de la grille met un titre de section dans la rangee '
    + 'de la fiche, et sa table a la rangee suivante : 495 px de colonne vide, mesures a 1600x1000 ET a 900x900');
  // Si l'on retient la seconde forme, il faut aussi que les quatre blocs soient
  // EPINGLES en colonne 2 : sans cela ils se poseraient en colonne 1, sous la
  // fiche, et le contenu n'aurait plus de colonne du tout.
  if (!reunis) {
    for (const id of identifiants) {
      assert.ok(new RegExp('\\.dlm-body>#' + id + '\\{[^}]*grid-column:\\s*2').test(nu),
        '#' + id + ' doit etre epingle en colonne 2 des lors que la fiche couvre les rangees');
    }
  }
});

// L'IA NE TOUCHE PAS AU COEUR. Les deux baremes de pertinence, la reconnaissance
// des dossiers et la logique FAT32 restent PURS : ils ne doivent dependre d'aucun
// module d'IA. Sans ce garde-fou, quelqu'un ajouterait un jour "juste un appel
// au modele" dans le classement des resultats, et une mesure de l'application
// dependrait d'un modele qui derive.
test('aucun module du coeur ne depend de l IA', () => {
  const coeur = ['pertinence-dlc.js', 'pkg.js', 'platform.js', 'aurora-log.js', 'launchini.js'];
  for (const f of coeur) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', f), 'utf8');
    // Le motif est LARGE a dessein : il attrape tout specifieur de `require` qui
    // MENTIONNE l un des deux modules, quel que soit le prefixe relatif et avec ou
    // sans extension. La version etroite (`./(ollama|instantane)` colle a la
    // citation) laissait passer `require('./ollama.js')` et
    // `require('../lib/ollama')` : deux trous par lesquels la prochaine personne
    // aurait fait entrer l IA dans le coeur sans qu aucun test ne rougisse.
    assert.ok(!/require\s*\(\s*['"][^'"]*(ollama|instantane)[^'"]*['"]\s*\)/.test(src), f + ' ne doit pas dependre de l IA');
  }
  // et cote client : les fonctions de pertinence ne doivent pas lire l assistant.
  // La fin du bloc est le MARQUEUR du bloc suivant, cherche a PARTIR du debut du
  // bloc : les deux `indexOf` partant du debut du fichier, le marqueur de
  // l'assistant (ligne 765) precede celui de la pertinence (ligne 2011) et la
  // tranche etait VIDE -- le garde-fou ne pouvait pas passer.
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const iP = app.indexOf('// ---------- Pertinence');
  const iA = app.indexOf('// ---------- Assistant', iP);
  // Sans cette garde, un marqueur de fin manquant rendrait `iA = -1` et
  // `slice(iP, -1)` rendrait TOUTE LA FIN DU FICHIER : `length > 100` passerait
  // quand meme et le garde-fou inspecterait les sections Console, Manette et
  // Scripts Aurora au lieu de la pertinence -- un instrument qui rend un verdict
  // sur une region qu'il n'a pas regardee. On nomme donc le vrai probleme ici.
  assert.ok(iA > iP, 'le marqueur de fin du bloc de pertinence doit exister apres lui');
  const bloc = app.slice(iP, iA);
  assert.ok(bloc.length > 100, 'le bloc de pertinence doit etre trouvable');
  assert.ok(!/ia[A-Z]/.test(bloc), 'les fonctions de pertinence ne doivent pas appeler l assistant');
});

// --- l hote du moteur local est FIGE -----------------------------------------
//
// `lib/ollama.js` ecrit `const HOTE = '127.0.0.1'`. C est la promesse « ca reste sur
// mon PC » rendue verifiable : si l hote etait lu dans `config.json`, une valeur
// suffirait a envoyer l etat de la machine -- noms de jeux, chemins, journaux -- a
// une machine inconnue.
//
// POURQUOI UN GARDE-FOU DE SOURCE, ET PAS UN TEST D EXECUTION. Un tour de correction
// precedent avait ajoute, dans `test/ollama.test.js`, le test « l hote ne peut pas
// etre detourne par une option ». Ce test est QUASI VIDE : `disponible(port)` et
// `modeles(port)` ne prennent qu UN parametre, donc l objet injecte est abandonne
// avant d atteindre `demander()`, qui se sert de la constante. Le scenario nomme par
// le constat -- hote lu dans `config.json` avec repli sur `127.0.0.1` -- restait donc
// VERT, et c est ce qui a fait croire deux fois a la fermeture de ce point.
//
// Ce qu on veut interdire n est pas un detournement A L EXECUTION : c est une LIGNE
// DE CODE. La seule facon de la voir est de lire la source.
test('l hote du moteur ne peut pas venir d une configuration', () => {
  // Lu SANS ses commentaires, et pas par precaution de style : le bloc d en-tete de
  // `lib/ollama.js` cite lui-meme `config.json` ET la mutation a interdire pour
  // expliquer la regle. Ce depot s est fait prendre TROIS fois par un garde-fou qui
  // lisait la prose expliquant le defaut au lieu du code.
  const src = sansCommentaires(fs.readFileSync(path.join(__dirname, '..', 'lib', 'ollama.js'), 'utf8'));
  const fautifs = [];

  // 1. LA DECLARATION EST UN LITTERAL, et rien d autre. C est ce qui attrape la
  //    mutation realiste : `const HOTE = (cfg && cfg.ia && cfg.ia.hote) || '127.0.0.1';`
  //    -- un repli qui VAUT la bonne adresse est exactement le cas que le constat
  //    decrit, et il laisserait `O.HOTE === '127.0.0.1'` vrai tout en lisant la config.
  const decl = /(?:^|\n)[ \t]*(?:const|let|var)[ \t]+HOTE[ \t]*=[ \t]*([^\n;]*)/.exec(src);
  assert.ok(decl, 'lib/ollama.js doit declarer HOTE');
  if (decl[1].trim() !== "'127.0.0.1'") fautifs.push('declaration : HOTE = ' + decl[1].trim());

  // 2. AUCUN AUTRE MODULE QUE `http`. Pour lire `config.json` il faut `fs` ou un
  //    module de configuration : les deux passent par un `require`. Le client du
  //    moteur est un client HTTP sur le module natif, zero dependance -- un module
  //    qui a besoin d ouvrir un fichier n a rien a faire ici.
  const reqs = [...src.matchAll(/require\([ \t]*['"]([^'"]+)['"]/g)].map(m => m[1]);
  for (const r of reqs) if (r !== 'http') fautifs.push('require : ' + r);

  // 3. AUCUNE VOIE DE CONFIGURATION MEME SANS require : l environnement.
  for (const m of src.matchAll(/[^\n]*process\.env[^\n]*/g)) fautifs.push('environnement : ' + m[0].trim());

  // 4. LA REQUETE DOIT VISER LA CONSTANTE. Une redirection se fait sans toucher a la
  //    declaration : `host: cfg.hote` suffirait, et la declaration resterait intacte.
  const host = /host[ \t]*:[ \t]*([^,\n]*)/.exec(src);
  assert.ok(host, 'lib/ollama.js doit poser l option `host` de la requete');
  if (host[1].trim() !== 'HOTE') fautifs.push('option host : ' + host[1].trim());

  // 5. `HOTE` N EST JAMAIS REECRIT ailleurs : une seconde ecriture annulerait tout
  //    ce que les quatre points precedents viennent de verrouiller.
  const ecritures = [...src.matchAll(/(?:^|\n)[ \t]*HOTE[ \t]*=[^=]/g)].length;
  if (ecritures !== 0) fautifs.push('reaffectation de HOTE : ' + ecritures);

  assert.deepStrictEqual(fautifs, [],
    'l hote du moteur doit rester un litteral fige sur la boucle locale :\n  ' + fautifs.join('\n  '));
});

// --- navigation : six destinations ------------------------------------------
// R1 (specs/002-navigation-destinations) : le rail porte SIX destinations,
// pas huit. Les sous-vues existent encore mais n'ont pas d'entree de rail.
// Stockage a rejoint le rail : la vue mesure l'espace par disque, c'est une
// destination a part entiere.
test('rail : exactement six destinations .ttab', () => {
  const rail = /id="blades"[\s\S]*?<\/nav>/.exec(html);
  assert.ok(rail, 'le rail #blades doit exister');
  const tabs = rail[0].match(/class="[^"]*ttab/g) || [];
  assert.strictEqual(tabs.length, 6,
    'le rail doit avoir 6 destinations, il en a ' + tabs.length);
  const ids = [...rail[0].matchAll(/id="(nv-[a-z]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(ids, ['nv-dash', 'nv-lib', 'nv-con', 'nv-sto', 'nv-act', 'nv-tools'],
    'ordre attendu : dash, lib, con, sto, act, tools — obtenu : ' + ids.join(','));
});

test('navigation : chaque vue est couverte par la map DEST', () => {
  const vues = [...html.matchAll(/class="view[^"]*" id="v-([a-z]+)"/g)].map(m => m[1]);
  const dm = /DEST\s*=\s*\{([^}]*)\}/.exec(inline);
  assert.ok(dm, 'app.js doit definir la map DEST (vue -> destination)');
  const couvertes = new Set([...dm[1].matchAll(/([a-z]+)\s*:/g)].map(m => m[1]));
  const orphelines = vues.filter(v => !couvertes.has(v));
  assert.deepStrictEqual(orphelines, [],
    'vues sans destination : ' + orphelines.join(', '));
});

test('navigation : aucun identifiant nv-* orphelin dans app.js', () => {
  const cites = new Set([...inline.matchAll(/nv-([a-z]+)/g)].map(m => m[1]));
  const definis = new Set([...html.matchAll(/id="nv-([a-z]+)"/g)].map(m => m[1]));
  const orphelins = [...cites].filter(c => !definis.has('' + c) && !definis.has(c));
  assert.deepStrictEqual(orphelins, [],
    'nv-* cites sans element : ' + orphelins.join(', '));
});
