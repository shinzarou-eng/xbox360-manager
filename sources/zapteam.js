// Source : les releases du groupe ZapTeaM (« ZTM ») hebergees sur archive.org.
//
// POURQUOI CETTE SOURCE EST UN INDEX, ET PAS UNE REQUETE. Mesure du 2026-09-20 :
// archive.org n'indexe PAS les noms de fichiers, donc chercher `Dark.Souls.1.DLC.
// RF.X360-ZTM` en ligne rend `numFound=0`, et `q=ZTM` rend 232 resultats sans
// rapport. Un release ZTM ne se trouve qu'en LISANT les items du deposant et en
// filtrant en local — 11 items, 3 239 noms. Le catalogue est donc construit une
// fois dans `dlc_index/zapteam.json` (meme forme que les index DLC de
// l'application), DATE, et relu ici. La logique vit dans `lib/ztm.js` : ce
// fichier n'est que l'adaptateur du contrat de `lib/sources.js`.
//
// LES DEUX FAMILLES SONT SERVIES, ET LE TYPE VOYAGE AVEC LE RESULTAT :
//   jeu  `Nom.<REGION>.<X360|XBLA>-ZTM.rar`          2 374 releases
//   dlc  `Nom.DLC.<REGION>.<X360|XBLA>-ZTM.rar`        865 releases
// Le seul discriminant est le token `DLC` (mesure : 0 nom de jeu le porte, 865
// noms de DLC sur 866). `RF` (1 547 ici), `X360` et `XBLA` sont dans les DEUX
// familles et ne discriminent rien.
//
// CE QUE CETTE SOURCE NE PEUT PAS FAIRE, ET QUI EST DIT DANS L'INTERFACE :
//  - elle TROUVE, elle ne telecharge pas. Les items sont reserves aux comptes
//    (`access-restricted-item: true`, collection `loggedin`) : un HEAD anonyme
//    rend 302 puis 401. Le telechargement passe par la file existante, qui joint
//    le cookie archive.org (`iaHdrs`, server.js) — une source n'y a pas acces,
//    et ne doit pas y avoir acces ;
//  - elle ne garantit PAS le contenu d'un `.rar`. Les titres d'items annoncent
//    XEX / XBLA / GOD, l'extension est `.rar` a 100 %, et AUCUN nom ne finit par
//    `.iso`. Ce qu'il y a DANS l'archive n'est pas mesurable depuis le metadata
//    d'archive.org : on ne dit donc jamais que ce sont des ISO.
const Ztm = require('../lib/ztm');

// Une recherche par frappe ne doit pas rendre 200 lignes : l'interface en
// affiche 25, et le reste est derriere un bouton.
const MAX = 60;

module.exports = {
  id: 'zapteam',
  nom: 'ZapTeaM (ZTM)',
  description: 'Releases du groupe ZapTeaM hebergees sur archive.org : jeux Xbox 360 et leurs DLC. Index local date, compte archive.org requis pour telecharger.',
  nature: 'tiers',

  search(q, opts, cb) {
    const o = opts || {};
    const max = o.max || MAX;
    // L'index est construit au PREMIER appel s'il manque (11 requetes mesurees a
    // ~2 s), puis relu. `opts.rafraichir` force sa reconstruction : c'est ce que
    // fait le bouton de l'interface, et rien d'autre — aucune lecture en tache de
    // fond, le catalogue amont datant de 2022 et ne bougeant pas tout seul.
    Ztm.lireOuConstruire((e, index) => {
      if (e) return cb(e);
      if (!index) return cb(new Error('index ZTM illisible'));
      const etat = Ztm.etat(index);
      const trouves = Ztm.filtrer(index.items, q, { max, type: o.type });
      cb(null, trouves.map(f => ({
        // LA CLE EST COMPOSEE, et elle doit l'etre : un item archive.org contient
        // jusqu'a 866 releases, donc son identifiant seul ne designe pas un
        // fichier. `<item>/<nom>` se relit sans ambiguite et se recolle pour
        // l'URL de telechargement.
        id: f.colId + '/' + f.name,
        titre: f.name,
        // LE CONTRAT NOMME `taille`, L'APPLICATION LIT `size` : les deux sont
        // publies. `lib/sources.js` definit `{ id, titre, taille }` (cote
        // serveur, un seul nom pour toutes les sources) ; cote client, tous les
        // autres resultats portent `size` — archive.org, Vimm — et le garde-fou
        // des champs du client refuse `.taille`. Renommer l'un casserait l'autre
        // en silence : on publie les deux, avec la meme valeur.
        taille: Number(f.size) || 0,
        size: Number(f.size) || 0,
        url: f.url,
        type: Ztm.typeDe(f.name),
        region: Ztm.regionDe(f.name),
        plateforme: Ztm.plateformeDe(f.name),
        // L'etiquette de l'item, telle que son TITRE l'annonce : c'est le format
        // que l'amont revendique (XEX, XBLA, GOD, DLC). On la montre comme une
        // revendication de la source, jamais comme un fait verifie.
        detail: f.col,
        // L'etat de l'index voyage avec chaque resultat : l'interface peut ainsi
        // DIRE de quand date ce qu'elle montre, sans route supplementaire.
        index: etat
      })));
    }, !!o.rafraichir);
  },

  files(itemId, cb) {
    // `itemId` est la cle composee rendue par `search` : `<item>/<nom>`. Un seul
    // fichier par release — le materiel ZTM est deja un fichier par release,
    // comme `dossier-local` pour un fichier de disque.
    const s = String(itemId || '');
    const coupe = s.indexOf('/');
    if (coupe < 1) return cb(new Error('identifiant attendu : <item>/<nom de fichier>'));
    const colId = s.slice(0, coupe), nom = s.slice(coupe + 1);
    const index = Ztm.lireIndex();
    if (!index) return cb(new Error('index ZTM absent'));
    const f = index.items.find(x => x.colId === colId && x.name === nom);
    if (!f) return cb(new Error('release absente de l\'index : ' + s));
    cb(null, [{ nom: f.name, taille: Number(f.size) || 0, url: f.url }]);
  },

  // --- hors contrat : l'index local, expose par /api/sources/index -----------
  // `lib/sources.js` ne transporte que le contrat (id, nom, description, nature,
  // search, files) ; ces deux fonctions sont relayees par une route generique, et
  // une source qui n'a pas d'index n'en a pas besoin.
  etatIndex() {
    return Ztm.etat(Ztm.lireIndex());
  },

  rafraichirIndex(cb) {
    Ztm.lireOuConstruire((e, index) => {
      if (e) return cb(e);
      cb(null, Ztm.etat(index));
    }, true);
  }
};
