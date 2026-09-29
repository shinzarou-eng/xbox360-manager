# Écrire une source

Une **source** dit à l'application où chercher du contenu. Les sources sont des fichiers autonomes dans `sources/` : ajouter une source ne demande **aucune modification du serveur**.

C'est le point d'architecture qui compte. Les sources étaient auparavant câblées dans le cœur du programme : il fallait modifier le serveur pour en ajouter une, et la nature des sources disponibles était une décision de l'auteur, pas de l'utilisateur. Désormais le cœur reste un gestionnaire de bibliothèque, et les sources sont ce que vous en faites.

---

## Le contrat

Un fichier dans `sources/` exporte un objet :

```js
module.exports = {
  id: 'mon-depot',                       // obligatoire, slug unique
  nom: 'Mon dépôt',                      // obligatoire, affiché dans l'interface
  description: 'Fichiers de mon NAS.',   // obligatoire, une phrase
  nature: 'utilisateur',                 // facultatif, 'tiers' par défaut

  search(q, opts, cb) { /* cb(err, [{ id, titre, taille }]) */ },  // obligatoire
  files(itemId, cb)    { /* cb(err, [{ nom, taille, path|url }]) */ } // facultatif
};
```

### Les champs

| Champ | Type | Rôle |
|---|---|---|
| `id` | chaîne | Identifiant unique. Minuscules, chiffres et tirets (`^[a-z0-9][a-z0-9-]{1,30}$`). Sert d'identifiant dans l'API. |
| `nom` | chaîne | Nom affiché. |
| `description` | chaîne | Une phrase expliquant **d'où viennent les données**. Elle est montrée à l'utilisateur : soyez précis. |
| `nature` | `'libre'` \| `'utilisateur'` \| `'tiers'` | Nature de la source (voir ci-dessous). |
| `search` | fonction | `search(requete, options, cb)`. |
| `files` | fonction | Facultatif. `files(itemId, cb)`. Omettre si la source ne peut pas lister de fichiers. |

### `nature` — n'est pas décoratif

| Valeur | Signification |
|---|---|
| `libre` | Contenu libre de droits, ou publié par son auteur (homebrew, outils, émulateurs). |
| `utilisateur` | Fichiers déjà présents sur la machine de l'utilisateur. Il en est responsable. |
| `tiers` | Service externe. L'utilisateur reste responsable de ce qu'il en télécharge. |

Ce champ est affiché tel quel dans l'interface. Il existe pour que l'utilisateur sache **ce qu'il branche**, et pour que le projet n'ait pas à trancher à sa place.

### `search(requete, options, cb)`

Appelée pour chaque recherche. Rappelez le callback **une seule fois** :

```js
search(q, opts, cb) {
  // opts.timeout, opts.max peuvent être fournis
  if (!q) return cb(null, []);
  faireQuelqueChose(q, (err, items) => {
    if (err) return cb(err);
    cb(null, items.map(x => ({ id: x.chemin, titre: x.nom, taille: x.taille })));
  });
}
```

| Champ d'un résultat | Obligatoire | Rôle |
|---|---|---|
| `id` | oui | Identifiant passé ensuite à `files()`. Peut être un chemin, une URL, un identifiant interne. |
| `titre` | oui | Ce qui est affiché. |
| `taille` | non | En octets. |
| `detail` | non | Ligne secondaire (emplacement, source, date…). |

### `files(itemId, cb)`

Rend les fichiers téléchargeables d'un élément. Facultatif : si la source ne l'implémente pas, elle est simplement listée comme telle (`peutListerFichiers: false` dans `GET /api/sources`).

```js
files(itemId, cb) {
  cb(null, [{ nom: 'jeu.iso', taille: 123, url: 'https://…' }]);
  // ou { nom, taille, path } pour un fichier déjà sur le disque
}
```

Un fichier local déclare `path`, pas `url` : prétendre à une URL de téléchargement pour un fichier déjà présent ferait chercher l'interface au mauvais endroit.

---

## Ce que le registre garantit

Ces garanties sont testées (`test/sources.test.js`) et ne dépendent pas de la qualité de votre code :

- **Une source qui lève au chargement n'empêche rien.** Elle est signalée et ignorée ; le serveur démarre et les autres sources se chargent.
- **Une source hors contrat est rejetée avec une raison précise** (`champ \`description\` manquant`), affichée par `GET /api/sources` dans `rejections`. Un échec silencieux ici serait très coûteux à diagnostiquer.
- **Deux sources ne peuvent pas partager un `id`** : la seconde est rejetée.
- **Une source qui échoue pendant une recherche ne bloque pas les autres.** `chercherTout` rend les résultats des sources qui répondent et liste les erreurs à part.
- **Une source qui ne rappelle jamais son callback est abandonnée au délai** (20 s par défaut). Une source ne peut donc pas figer une recherche.
- **Un double appel du callback n'entraîne pas de doublons.**

Autrement dit : vous ne pouvez pas casser l'application en ajoutant une source. Vous pouvez seulement ne pas être chargé — et on vous dira pourquoi.

---

## L'exemple à copier

`sources/dossier-local.js` est la source de référence, et la plus utile : elle indexe les dossiers que vous désignez (disque externe, partage réseau monté, archives personnelles). Aucun service tiers, aucune question de droit.

Elle est configurée par `sourceFolders` dans `config.json` :

```json
{
  "sourceFolders": ["D:\\Archives", "Z:\\NAS\\xbox360"]
}
```

Deux points à reprendre dans votre propre source :

- **Borner le parcours.** `parcourir(base, maxProfondeur, maxFichiers)` limite profondeur et nombre de fichiers : un dossier choisi par erreur (racine d'un disque système) ne doit pas figer l'application.
- **Correspondre par mot entier.** Chercher `wake` ne doit pas remonter `waker`, sinon toute recherche courte remonte la moitié du disque.

Vous pouvez tester votre source sans l'installer :

```js
const ma = require('./sources/ma-source');
ma.search('halo', {}, (err, items) => console.log(err || items));
```

---

## Vérifier

```bash
node server.js --selftest     # charge tout, affiche les sources rejetées, et sort
npm test                      # le registre et la source de référence sont couverts
curl http://localhost:4360/api/sources
```

`--selftest` est le moyen le plus rapide de voir si votre fichier est chargé et accepté : il affiche le nombre de sources chargées et la raison de chaque rejet, sans ouvrir le port.
