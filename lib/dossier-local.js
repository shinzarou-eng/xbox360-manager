// RECONNAITRE UN DOSSIER, pour pouvoir le choisir au lieu de le taper.
//
// Le panneau DOSSIERS demandait de TAPER cinq chemins a la main : rien ne disait
// si le dossier existait, s'il contenait des jeux, ni meme s'il ressemblait a
// quelque chose de connu. Choisir un dossier de jeux demandait deja de savoir ou
// il etait — ce qui est exactement ce que l'utilisateur venait chercher.
//
// Ici : a partir du CONTENU d'un dossier, on dit ce qu'il est. La fonction est
// PURE — on lui passe la liste des entrees, elle ne touche pas au disque — ce qui
// permet de la tester sur des cas reels sans dependre de la machine.

// Un dossier de package Xbox 360 : 8 caracteres hexa, c'est un TitleID.
const TID = /^[0-9A-Fa-f]{8}$/;
// Un type de contenu, lui aussi en hexa.
const TYPE = /^[0-9A-Fa-f]{8}$/;

const GENRES = {
  'disque-xbox': 'Ressemble à un disque Xbox 360',
  'jeux-tid': 'Dossier de jeux (dossiers par TitleID)',
  'contenu': 'Contenu de console (DLC, mises à jour)',
  'aurora': 'Installation d\'Aurora',
  'depot': 'Dépôt (fichiers à ranger)',
  'homebrew': 'Applications / émulateurs',
  'jeu-extrait': 'Un jeu extrait (default.xex)',
  'vide': 'Dossier vide',
  'inconnu': 'Contenu non reconnu'
};

// Les sous-dossiers qui font qu'un dossier est la RACINE d'un disque de console.
const MARQUEURS = ['games', 'content', 'homebrew', 'emulators', 'aurora', 'xexmenu',
  'dashlaunch', 'launch.ini', '_a_trier', 'roms'];

/**
 * Que contient ce dossier ?
 *
 * @param {Array<{name:string,dir:boolean}>} entrees  ce que `readdir` a rendu
 * @returns {{genre:string, titre:string, detail:string, confiance:number, indices:string[]}}
 */
function reconnaitre(entrees, opts) {
  const o = opts || {};
  const e = entrees || [];
  const bas = n => String(n || '').toLowerCase();
  const nomPropre = bas(o.nom);
  const dossiers = e.filter(x => x.dir);
  const fichiers = e.filter(x => !x.dir);
  const nomsD = dossiers.map(x => bas(x.name));
  const nomsF = fichiers.map(x => bas(x.name));
  const tous = [...nomsD, ...nomsF];
  const indices = [];
  // On COMPARE en minuscules — Windows ne distingue pas la casse — mais on
  // AFFICHE le nom reel. Ecrire « games, content » quand les dossiers s'appellent
  // « Games », « Content » donne l'impression que l'application regarde ailleurs.
  const reel = new Map();
  for (const x of e) reel.set(bas(x.name), x.name);
  const nom = n => reel.get(bas(n)) || n;

  // Un dossier VIDE est vide — SAUF s'il porte une signature dans son nom. Un
  // `_A_TRIER` vide EST le depot : il attend des fichiers. Repondre « vide »
  // laisserait l'utilisateur chercher s'il a choisi le bon genre de dossier.
  if (!e.length && nomPropre !== '_a_trier') {
    return { genre: 'vide', titre: GENRES.vide, detail: 'Aucun fichier ni dossier.', confiance: 100, indices: [] };
  }

  // 1. Une installation d'Aurora : l'executable est la signature.
  if (nomsF.includes('aurora.xex')) {
    indices.push('Aurora.xex');
    return {
      genre: 'aurora', titre: GENRES.aurora,
      detail: 'Contient Aurora.xex : c\'est ici que vivent les scripts et les plugins.',
      confiance: 100, indices
    };
  }

  // 3. La racine d'un disque de console : plusieurs marqueurs a la fois. Un seul
  //    ne suffit pas — un dossier nomme « Games » au hasard existe.
  const marqueurs = MARQUEURS.filter(m => tous.includes(m));
  if (marqueurs.length >= 2) {
    indices.push(...marqueurs.map(nom));
    return {
      genre: 'disque-xbox', titre: GENRES['disque-xbox'],
      detail: 'Contient ' + marqueurs.slice(0, 4).map(nom).join(', ') + '.',
      confiance: Math.min(100, 40 + marqueurs.length * 15), indices
    };
  }

  // 4. Le contenu d'une console : les DLC et mises a jour vivent sous
  //    `0000000000000000`.
  if (!o.racine && nomsD.includes('0000000000000000')) {
    indices.push(nom('0000000000000000'));
    return {
      genre: 'contenu', titre: GENRES.contenu,
      detail: 'Contient ' + nom('0000000000000000') + ' : la console ne lit les DLC et les mises à jour que là.',
      confiance: 90, indices
    };
  }

  // 5. Un dossier de jeux : beaucoup de dossiers a nom de TitleID.
  const tids = dossiers.filter(x => TID.test(x.name));
  if (tids.length >= 3) {
    indices.push(tids.length + ' TitleID');
    return {
      genre: 'jeux-tid', titre: GENRES['jeux-tid'],
      detail: tids.length + ' dossiers nommés par TitleID — c\'est la disposition de la console.',
      confiance: Math.min(100, 50 + tids.length * 3), indices
    };
  }
  if (tids.length) indices.push(tids.length + ' TitleID');

  // 6. Un seul jeu extrait.
  if (nomsF.includes('default.xex')) {
    indices.push('default.xex');
    return {
      genre: 'jeu-extrait', titre: GENRES['jeu-extrait'],
      detail: 'C\'est un jeu, pas un dossier de jeux : choisis le dossier AU-DESSUS.',
      confiance: 90, indices
    };
  }

  // 7. Un depot : le nom, ou des archives dedans.
  // LE DOSSIER S'APPELLE _A_TRIER, ou il contient des archives. Un disque qui
  // CONTIENT un _A_TRIER n'est PAS un depot : le prendre pour tel proposait de
  // ranger tout le disque.
  const estDepot = nomPropre === '_a_trier';
  const archives = e.filter(x => !x.dir && /\.(iso|7z|zip|rar)$/i.test(x.name)).length;
  if (!o.racine && (estDepot || archives)) {
    indices.push(archives ? archives + ' archive(s)' : nom('_A_TRIER'));
    return {
      genre: 'depot', titre: GENRES.depot,
      detail: archives ? archives + ' fichier(s) à ranger.' : 'C\'est le dépôt lui-même.',
      confiance: estDepot ? 95 : 70, indices
    };
  }

  // 8. Applications et emulateurs : le nom, ou une collection de dossiers.
  if (!o.racine && nomsD.some(n => ['homebrew', 'emulators', 'apps', 'roms'].includes(n))) {
    indices.push(nom(nomsD.find(n => ['homebrew', 'emulators', 'apps', 'roms'].includes(n))));
    return {
      genre: 'homebrew', titre: GENRES.homebrew,
      detail: 'Contient ' + indices[0] + '.',
      confiance: 70, indices
    };
  }

  return {
    genre: 'inconnu', titre: GENRES.inconnu,
    detail: e.length + ' entrée(s), rien de reconnu. Tu peux quand même le choisir : l\'analyse te dira ce qu\'il y a.',
    confiance: 0, indices
  };
}

/**
 * Les dossiers a PROPOSER pour un usage donne, dans l'ordre.
 *
 * On ne devine pas a la place de l'utilisateur : on remonte ce qui a ete reconnu,
 * avec le nombre de jeux quand on le connait. « D:\Games — 17 jeux » se choisit
 * d'un coup d'oeil ; « D:\Games » tout seul demande d'y aller voir.
 */
function classerPour(genreVoulu, candidats) {
  return (candidats || [])
    .map(c => {
      const g = c.rec || {};
      let note = 0;
      if (g.genre === genreVoulu) note += 100;
      if (genreVoulu === 'jeux' && (g.genre === 'jeux-tid' || g.genre === 'disque-xbox')) note += 100;
      if (genreVoulu === 'depot' && g.genre === 'depot') note += 100;
      if (genreVoulu === 'contenu' && g.genre === 'contenu') note += 100;
      note += Math.round((g.confiance || 0) / 5);
      if (c.jeux) note += Math.min(30, c.jeux);
      return Object.assign({}, c, { note });
    })
    .sort((a, b) => b.note - a.note);
}

module.exports = { GENRES, MARQUEURS, reconnaitre, classerPour, TID };
