# API HTTP — Xbox 360 Manager

Documentation de l'interface HTTP de l'application locale **Xbox 360 Manager**.
Source de vérité : `server.js` (serveur Node.js sans framework, module `http` natif).
Ce document décrit le comportement **réel** du serveur, pas un comportement souhaité.

---

## 1. Généralités

| | |
|---|---|
| **Base** | `http://localhost:4360` |
| **Port** | `4360` (constante `PORT`, non configurable) |
| **Encodage des réponses** | JSON UTF-8 (`Content-Type: application/json; charset=utf-8`) pour tout `/api/*`, sauf `/api/cover` (image binaire) |
| **Encodage des requêtes** | JSON dans le corps, ou paramètres de *query string* |
| **Authentification** | **aucune** |

### Avertissement de sécurité — à lire avant de construire dessus

L'application est conçue pour tourner sur **la machine de l'utilisateur** et n'expose
**aucune authentification, aucun jeton, aucun contrôle d'origine (pas de CORS)**.
Toute personne capable d'atteindre le port 4360 peut, sans mot de passe :

* **supprimer des fichiers et des dossiers arbitraires** (`POST /api/delete`) ;
* **supprimer du contenu de la console** (`POST /api/content/delete`) ;
* **déplacer, renommer, importer et télécharger** des fichiers ;
* lire la configuration locale et déclencher l'ouverture d'explorateur Windows.

> **Ne jamais exposer cette API sur un réseau** (pas de `--host 0.0.0.0`, pas de reverse
> proxy public, pas de tunnel). Elle doit rester liée à `localhost` uniquement.
> Un site web tiers ne peut pas l'appeler directement (aucun en-tête CORS n'est émis),
> mais un client local (CLI, script, app mobile sur le même hôte) le peut intégralement.

### Format des réponses

Toutes les routes JSON passent par un unique helper :

```js
const json = (o, code = 200) => { res.writeHead(code, {...}); res.end(JSON.stringify(o)); };
```

Deux conséquences pratiques :

1. **Le code HTTP par défaut est `200`, même pour une erreur.** La quasi-totalité des
   erreurs applicatives sont renvoyées en `200 OK` avec un corps `{"error": "..."}`.
   Un client doit tester le **champ `error`**, pas le code HTTP.
2. Le code `500` n'est utilisé que si un handler **lève une exception** (bug interne).
   Le code `404` n'est utilisé que pour un chemin inconnu, et dans ce cas le corps est
   le texte brut `404` (pas de JSON).

### Format d'erreur

```json
{ "error": "TID invalide" }
```

Cas particuliers, tous renvoyés avec le code HTTP indiqué :

| Situation | Corps | HTTP |
|---|---|---|
| Erreur applicative (paramètre invalide, cible introuvable…) | `{"error": "..."}` | `200` |
| Corps de requête non parsable | `{"error": "JSON invalide"}` | `200` |
| Exception non prévue dans le handler | `{"error": "<message>"}` | `500` |
| Chemin inconnu | `404` (texte brut) | `404` |
| `/api/cover` sans `tid` valide, ou aucune jaquette trouvée | *(corps vide)* | `404` |

### Méthodes

Le routage est une chaîne de tests sur `u.pathname`. **Aucune route ne teste de méthode
autre que `POST`** : une route marquée POST ci-dessous répond uniquement si
`req.method === 'POST'`. Appelée en `GET`, elle **ne renvoie rien** (le serveur tombe
dans le `404` texte brut). Les routes sans mention de méthode répondent à n'importe
quelle méthode (`GET`, `POST`, `HEAD`…) et ignorent tout corps éventuel.

### Corps de requête

Le helper `body(cb)` lit le flux, le parse en JSON, puis appelle le handler :

* corps vide → `{}` (pas une erreur) ;
* JSON invalide → `{"error": "JSON invalide"}`, le handler n'est **jamais** appelé ;
* une exception du handler est capturée et transformée en `{"error": ...}` HTTP `500`.

Le `Content-Type` de la requête n'est **pas** vérifié.

---

## 2. Index des endpoints

**48 chemins distincts**, soit **49 opérations** (`GET /api/config` et `POST /api/config`
sont deux opérations sur un même chemin). Les 21 opérations en `POST` sont signalées
par la méthode.

> **Cet index est INCOMPLET, et le compte ci-dessus n'est pas verifie.** Mesure : **33**
> des 81 chemins servis par `server.js` (`u.pathname === '/api/…'`) n'ont **aucune ligne
> dans cet index** — la famille `/api/ftp/*` en entier, `/api/wallpaper`, `/api/reseau`,
> `/api/acces`, `/api/fs`, `/api/launchini`, `/api/emulateurs`, `/api/asset`… Les
> completer est un chantier a part ; en attendant, `server.js` fait foi.

### Bibliothèque

| Méthode | Chemin | Description |
|---|---|---|
| `GET` | `/api/games` | Liste les jeux de la bibliothèque (GOD, extraits) + éléments en attente dans le dépôt. |
| `GET` | `/api/diaporama` | Les jeux **qui ont une jaquette** : `[{tid, name, size}]`. Appelée une fois, à l'ouverture du diaporama. |
| `GET` | `/api/gamedetail` | Détail d'un dossier de jeu : nombre de fichiers, disques, exécutable, plus gros enfants. |
| `GET` | `/api/health` | Diagnostic : contenu orphelin (DLC/TU sans jeu) et éléments du dépôt non reconnus. |
| `GET` | `/api/advisor` | Suggestions d'actions (doublons, orphelins, MAJ, jaquettes, DL en échec). Peut renvoyer `pending`. |
| `GET` | `/api/catalog` | Index local des titres connus (TitleID → nom), filtrable par nom et par type. |
| `GET` | `/api/cover` | Renvoie la jaquette en JPEG/PNG (binaire) et la met en cache ; `404` sinon. |
| `POST` | `/api/cover/refresh` | Supprime les jaquettes en cache d'un TitleID (force le re-téléchargement). |
| `POST` | `/api/cover/custom` | Télécharge une jaquette depuis une URL fournie et la stocke. |
| `POST` | `/api/precovers` | Lance en arrière-plan le téléchargement des jaquettes manquantes. |

### Contenu & DLC/TU

| Méthode | Chemin | Description |
|---|---|---|
| `GET` | `/api/gamecontent` | DLC et Title Updates installés pour un TitleID + TU en ligne marquées selon le MediaID. |
| `GET` | `/api/mycontent` | Vue agrégée DLC/TU pour tous les jeux installés. Peut renvoyer `pending`. |
| `GET` | `/api/tucheck` | Nombre de Title Updates disponibles par TitleID (cache 24 h). Les TID non encore connus sont absents. |
| `POST` | `/api/tu/install` | Télécharge et installe une Title Update précise. |
| `GET` | `/api/dlc` | Cherche des DLC/XBLA/bundles sur archive.org (par nom et par TitleID). |
| `POST` | `/api/dlc/install` | Met en file le téléchargement d'un DLC avec installation automatique à la fin. |

### Dépôt & organisation

| Méthode | Chemin | Description |
|---|---|---|
| `GET` | `/api/drop` | Analyse le(s) dossier(s) de dépôt et décrit chaque élément (type, TID, actions possibles). |
| `GET` | `/api/scanfolder` | Analyse un dossier arbitraire du disque et décrit son contenu. |
| `POST` | `/api/organize` | Exécute une liste d'actions (ranger, extraire, convertir, supprimer) sur des éléments choisis. |
| `POST` | `/api/sort` | Lance le tri automatique complet du dossier de dépôt (asynchrone). |
| `GET` | `/api/sortlog` | Journal des opérations de tri/organisation en cours + état du verrou. |
| `POST` | `/api/move` | Déplace des fichiers/dossiers vers un dossier de destination. |
| `POST` | `/api/rename` | Renomme un fichier/dossier. |
| `POST` | `/api/delete` | **Destructif** — supprime récursivement des chemins arbitraires. |
| `POST` | `/api/content/delete` | **Destructif** — supprime un élément à l'intérieur du dossier Content uniquement. |
| `POST` | `/api/import` | Copie un fichier/dossier local existant vers le dossier de dépôt. |
| `POST` | `/api/upload` | Reçoit un corps binaire brut et l'écrit dans le dossier de dépôt. |
| `POST` | `/api/open` | Ouvre l'explorateur Windows sur un chemin. |

### Téléchargements

| Méthode | Chemin | Description |
|---|---|---|
| `POST` | `/api/download` | Met un téléchargement en file (asynchrone) et rend la main immédiatement. |
| `GET` | `/api/downloads` | État complet de la file + espace libre du dépôt. |
| `POST` | `/api/dlctl` | Contrôle un élément : `pause`, `resume`, `retry`, `cancel`, `remove`, `up`, `down`, `clear`. |
| `GET` | `/api/dlstatus` | Vue compacte de la progression, compatible avec l'ancien format mono-téléchargement. |

### Catalogues & recherche

| Méthode | Chemin | Description |
|---|---|---|
| `GET` | `/api/search` | Recherche d'items archive.org (média `software`, Xbox 360). |
| `GET` | `/api/searchfiles` | Recherche archive.org par nom **et** par TitleID, avec tous les fichiers téléchargeables. |
| `GET` | `/api/unity` | Base de titres XboxUnity (`TitleList.php`). |
| `GET` | `/api/item` | Liste les fichiers téléchargeables d'un item archive.org donné. |
| `GET` | `/api/vimm` | Recherche sur Vimm's Vault (liste des jeux Xbox 360). |
| `GET` | `/api/vimmfiles` | Résout la fiche Vimm d'un jeu → mediaId, token, UA et cookie nécessaires au DL. |
| `POST` | `/api/vimmdl` | Construit l'URL de téléchargement Vimm et met le DL en file. |
| `POST` | `/api/vimmcancel` | Libère le slot de téléchargement Vimm (`cancel.php`). |

### Homebrew

| Méthode | Chemin | Description |
|---|---|---|
| `GET` | `/api/homebrew` | Liste les applications homebrew et émulateurs installés localement. |
| `GET` | `/api/hbstore` | Catalogue homebrew téléchargeable (sélection curatée + recherche libre). |
| `POST` | `/api/hb/install` | Met en file un téléchargement homebrew avec extraction/installation automatique. |

### Configuration & divers

| Méthode | Chemin | Description |
|---|---|---|
| `GET` | `/api/config` | Configuration publique. **Ne renvoie jamais le cookie archive.org**, seulement `hasCookie`. |
| `POST` | `/api/config` | Met à jour la configuration et/ou le cookie archive.org. |
| `GET` | `/api/drives` | Lettres de lecteurs présents avec espace libre/total. |
| `GET` | `/api/removable` | Lettres des lecteurs amovibles (USB). |
| `POST` | `/api/ia/login` | Lance la connexion automatique à archive.org (Edge/Chrome + CDP). |
| `GET` | `/api/ia/status` | État de la connexion archive.org. |

### Hors `/api`

| Méthode | Chemin | Description |
|---|---|---|
| `GET` | `/` ou `/index.html` | Sert la SPA (`public/index.html`). Aucun autre fichier statique n'est servi. |

---

## 3. Détail par endpoint

### Bibliothèque

---

#### `GET /api/games`

Liste la bibliothèque complète. Le scan parcourt le dossier Content (`GOD`), le dossier
Games (`GOD` et `Extrait`) et les dossiers supplémentaires de `scanExtra`, puis ajoute
les éléments en attente de chaque dossier de dépôt (y compris les dépôts alternes créés
par la redirection FAT32).

**Paramètres** : aucun.

**Réponse `200`** — tableau d'objets jeu :

```json
[
  {
    "name": "Forza Horizon",
    "tid": "4D5309C9",
    "format": "GOD",
    "path": "C:\\Users\\moi\\xbox360_tools\\Games\\4D5309C9",
    "size": 7854326784
  },
  {
    "name": "[EN ATTENTE] mon_jeu.iso",
    "tid": "-",
    "format": "A trier",
    "path": "D:\\_A_TRIER\\mon_jeu.iso",
    "size": 8589934592
  }
]
```

| Champ | Type | Notes |
|---|---|---|
| `name` | string | Nom du jeu, ou nom de fichier préfixé `[EN ATTENTE] ` pour le dépôt. |
| `tid` | string | TitleID 8 hex majuscules, `"-"` si inconnu (dépôt, XEX sans TID). |
| `format` | string | `"GOD"`, `"Extrait"` ou `"A trier"`. |
| `path` | string | Chemin absolu du dossier (ou du fichier pour le dépôt). |
| `size` | number | Octets (taille récursive pour les dossiers). |
| `dup` | bool | Ajouté **uniquement** si plusieurs entrées partagent le même TitleID. |

**Effets de bord** : lecture disque (le résultat est mis en cache 15 s) ; lance en
arrière-plan l'analyse des MediaID manquants.

**Erreurs** : aucune erreur applicative (un dossier illisible est simplement ignoré).

---

#### `GET /api/gamedetail`

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `path` | oui | Chemin d'un fichier ou dossier existant. |

**Réponse `200`** :

```json
{
  "path": "D:\\_A_TRIER\\mon_jeu",
  "files": 42,
  "discs": ["4D5309C9", "4D5309CA"],
  "exe": "D:\\_A_TRIER\\mon_jeu\\default.xex",
  "children": [
    { "name": "default.xex", "size": 1486848 },
    { "name": "data.bin", "size": 734003200 }
  ]
}
```

* `files` : nombre total de fichiers (parcours récursif jusqu'à 3 niveaux) ; vaut `1` si `path` est un fichier.
* `children` : **uniquement** les enfants directs, triés par taille décroissante, limités à **30** entrées.
* `discs` : noms de fichiers correspondant à `^[0-9A-F]{32}$` (packages GOD) ; si aucun, la liste contient les **sous-dossiers** (jeux multi-disques).
* `exe` : premier fichier `.xex` ou `.elf` trouvé, ou `null`.

**Erreurs** :
* `{"error": "Introuvable"}` — `path` absent ou inexistant.
* `{"error": "<message>"}` — erreur de lecture (permissions…).

---

#### `GET /api/health`

**Paramètres** : aucun.

**Réponse `200`** :

```json
{
  "issues": [
    {
      "type": "orphan",
      "tid": "58410A2B",
      "name": "Mon DLC",
      "path": "C:\\...\\Content\\0000000000000000\\58410A2B",
      "size": 52428800,
      "detail": "00000002, 000B0000"
    },
    {
      "type": "unknown",
      "name": "truc_bizarre.rar",
      "path": "D:\\_A_TRIER\\truc_bizarre.rar",
      "size": 123456,
      "detail": "type non reconnu"
    }
  ],
  "games": 37
}
```

| `type` | Signification | Champs |
|---|---|---|
| `orphan` | Dossier `<TID>` sous Content sans jeu correspondant dans la bibliothèque **et** sans sous-dossier de type jeu. | `tid`, `name`, `path`, `size`, `detail` (sous-dossiers) |
| `unknown` | Élément du dépôt dont le type n'est pas reconnu. | `name`, `path`, `size`, `detail` |

`games` = nombre de jeux avec TitleID valide.

**Effets de bord** : aucun (lecture seule ; alimente le cache de tailles).

---

#### `GET /api/advisor`

Analyse la bibliothèque et produit une liste de suggestions actionnables. C'est
l'endpoint le plus susceptible de renvoyer **`pending: true`** (voir « Patterns »).

**Paramètres** : aucun.

**Réponse `200`** :

```json
{
  "items": [
    {
      "type": "tu",
      "sev": "warn",
      "title": "MAJ dispo : Forza Horizon",
      "detail": "v5 · MediaID 4D5309C9",
      "act": { "label": "INSTALLER v5", "kind": "tu", "tid": "4D5309C9", "tuid": "12345" }
    }
  ],
  "pending": true
}
```

| Champ | Type | Notes |
|---|---|---|
| `items` | array | Suggestions, dans l'ordre : doublons, orphelins, dépôt en attente, TU, jaquettes, DL en échec. |
| `items[].type` | string | `"dup"`, `"orphan"`, `"pending"`, `"tu"`, `"tuWrong"`, `"nocov"`, `"dlerr"`. |
| `items[].sev` | string | `"info"`, `"warn"` ou `"err"`. |
| `items[].title` / `.detail` | string | Textes déjà localisés (fr/en selon `config.lang`). |
| `items[].act` | object | Action proposée ; voir ci-dessous. |
| `pending` | bool | `true` tant qu'un MediaID ou une liste de TU est encore en cours de calcul. |

Formes de `act` selon `kind` :

| `kind` | Champs supplémentaires |
|---|---|
| `dups`, `health`, `organize`, `covers` | `covers` ajoute `tids` (tableau de TitleID) |
| `tu` | `tid`, `tuid` |
| `retry`, `altIa`, `altVimm` | `id` (identifiant de l'élément en échec), `q` (requête de recherche suggérée) |

`type: "pending"` est ici l'alerte « éléments à organiser dans le dépôt » — à ne pas
confondre avec le champ booléen **`pending`** de la réponse.

**Effets de bord** : lecture disque ; lance en arrière-plan le remplissage du cache
MediaID, et interroge XboxUnity (cache 6 h) pour les TU.

---

#### `GET /api/catalog`

Index local `TitleID → nom` (issu de `ISO2GOD/gamelist_xbox360.csv`).

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `q` | non | Filtre insensible à la casse sur le nom **ou** le TitleID. |
| `kind` | non | `"GOD"`, `"XBLA"` ou `"INDIE"` (filtre exact). |

**Réponse `200`** — tableau, **limité à 300 entrées** :

```json
[
  { "tid": "58410A2B", "name": "Mon XBLA", "kind": "XBLA" }
]
```

`kind` est déduit du préfixe du TitleID : `5841…` → `XBLA`, `5855…` → `INDIE`,
sinon `GOD`.

**Effets de bord** : aucun.

---

#### `GET /api/cover`

**Renvoie une image binaire**, pas du JSON. C'est la seule exception de l'API.

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `tid` | oui | TitleID 8 hex. |
| `sz` | non | `"sm"` pour la vignette, sinon grande jaquette. |

**Réponse** :
* `200` + `Content-Type: image/jpeg` si `covers/<tid>_custom.jpg` existe et pèse plus de 500 octets — **la jaquette choisie par l'utilisateur passe en premier**, sauf quand `sz=sm` (la vignette de liste reste `_sm.jpg`) ;
* `200` + `Content-Type: image/jpeg` si le cache local `covers/<tid>.jpg` (ou `_sm.jpg`) existe et pèse plus de 500 octets ;
* sinon, `200` avec l'image téléchargée depuis une des sources (marketplace Xbox, icône XboxUnity, Xbox Live) et écrite en cache — le `Content-Type` peut alors être `image/jpeg` **ou** `image/png` selon la source ;
* `404` **corps vide** si `tid` est invalide ou si toutes les sources échouent.

**Effets de bord** : écrit `covers/<tid>.jpg` ou `covers/<tid>_sm.jpg`.

> `_custom.jpg` est LU, jamais écrit par cette route : il est produit hors de
> l'application (ou déposé à la main), et `POST /api/cover/custom` écrit
> aujourd'hui `<tid>.jpg`. Sans cette lecture, un jeu dont la seule image était
> `<tid>_custom.jpg` était **listé par le diaporama puis introuvable** — la route
> descendait chercher une jaquette officielle, et le diaporama affichait une image
> cassée. Mesuré : sur `545407F8`, `_custom.jpg` (602 octets) répondait 74 441
> octets avant, 602 après.

---

#### `POST /api/cover/refresh`

**Corps JSON** :

```json
{ "tid": "4D5309C9" }
```

**Réponse `200`** : `{ "ok": true }`

**Effets de bord** : supprime `covers/<tid>.jpg`, `covers/<tid>_sm.jpg` et
`covers/<tid>_custom.jpg` s'ils existent.

**Erreurs** : `{"error": "TID invalide"}`.

---

#### `POST /api/cover/custom`

**Corps JSON** :

```json
{ "tid": "4D5309C9", "url": "https://exemple.test/jaquette.jpg" }
```

**Réponse `200`** : `{ "ok": true }`

**Effets de bord** : télécharge l'URL, écrit `covers/<tid>.jpg`, supprime la vignette
`covers/<tid>_sm.jpg` (elle sera régénérée).

**Erreurs** :
* `{"error": "TID invalide"}` ;
* `{"error": "Image invalide"}` si le corps reçu fait moins de 1000 octets ;
* `{"error": "<message>"}` en cas d'échec réseau ;
* `{"error": "..."}` HTTP `500` si `url` est **absent** (le handler appelle `startsWith` sur `undefined`).

---

#### `POST /api/precovers`

**Corps JSON** :

```json
{ "tids": ["4D5309C9", "58410A2B"] }
```

**Réponse `200`** :

```json
{ "ok": true, "fetching": 2 }
```

Les TitleID invalides sont ignorés ; la liste est tronquée à **100** entrées.
`fetching` compte les TID **demandés** retenus, pas ceux réellement manquants.

**Effets de bord** : lance en arrière-plan le téléchargement des jaquettes absentes
(la réponse n'attend pas la fin des téléchargements).

---

### Contenu & DLC/TU

---

#### `GET /api/gamecontent`

DLC et TU installés pour un TitleID, enrichis des TU en ligne et du MediaID du disque
installé.

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `tid` | oui | TitleID 8 hex (insensible à la casse). |
| `path` | non | Chemin du jeu installé ; sert à lire le MediaID du disque (XEX2 → `XSI+0x14C`). |

**Réponse `200`** :

```json
{
  "dlcDir": "C:\\...\\Content\\0000000000000000\\4D5309C9\\00000002",
  "tuDir": "C:\\...\\Content\\0000000000000000\\4D5309C9\\000B0000",
  "dlcInstalled": [
    { "file": "abc123", "name": "Pack de courses", "size": 52428800, "path": "C:\\...\\abc123" }
  ],
  "tusInstalled": [
    { "file": "TU_12345", "name": "Title Update #5", "size": 1048576, "path": "C:\\...\\TU_12345" }
  ],
  "installedTuids": ["12345"],
  "tusOnline": [
    {
      "tuid": "12345",
      "version": 5,
      "name": "Title Update #5",
      "size": 1048576,
      "media": "4D5309C9",
      "installed": true,
      "match": true
    }
  ],
  "mediaId": "4D5309C9",
  "tuOk": true,
  "tuBest": { "tuid": "12345", "version": 5, "name": "Title Update #5", "size": 1048576, "media": "4D5309C9", "installed": true, "match": true }
}
```

Notes importantes :

* `tusOnline[].size` est exprimé en octets (la valeur XboxUnity, en Ko, est multipliée par 1024).
* `tusOnline[].match` est **ternaire** : `true` = compatible avec le MediaID du disque
  installé, `false` = TU d'un autre MediaID, **`null` = MediaID encore inconnu**. Le
  serveur n'annonce jamais une compatibilité qu'il ne peut pas prouver.
* `tuBest` est la TU compatible (`match === true`) de plus haute version ; `tuOk` =
  au moins une TU compatible est installée. `tuOk` vaut donc `false` quand le MediaID
  est inconnu, sans que cela signifie « rien à jour ».
* Les fichiers `.data` et le marqueur `tu_installed.json` sont exclus des listes.
* La réponse **attend** l'appel à XboxUnity (timeout 15 s). Si cet appel échoue,
  `tusOnline` vaut `[]` et **les champs `tuOk` et `tuBest` sont absents** de la réponse
  (et non `null`) : traitez leur absence comme « inconnu », pas comme « rien à jour ».

**Effets de bord** : lit le MediaID (peut parcourir plusieurs Go de fichiers `.data` si
le MediaID n'est pas en cache), appel réseau vers XboxUnity.

**Erreurs** : `{"error": "TID invalide"}`.

---

#### `GET /api/mycontent`

Vue agrégée DLC + TU pour **tous** les jeux installés. Peut renvoyer
**`pending: true`** (voir « Patterns »).

**Paramètres** : aucun.

**Réponse `200`** :

```json
{
  "games": [
    {
      "tid": "4D5309C9",
      "name": "Forza Horizon",
      "format": "GOD",
      "path": "C:\\...\\Games\\4D5309C9",
      "size": 7854326784,
      "mediaId": "4D5309C9",
      "dlc": [{ "file": "abc123", "name": "Pack de courses", "size": 52428800 }],
      "tus": [{ "file": "TU_12345", "name": "Title Update #5", "size": 1048576 }],
      "tusOnline": [
        { "tuid": "12345", "version": 5, "media": "4D5309C9", "size": 1048576, "match": true, "installed": true }
      ],
      "pending": false
    }
  ],
  "pending": true
}
```

* `mediaId` vaut `null` tant que l'analyse n'a pas abouti (cache uniquement, jamais de calcul bloquant ici).
* `games[].tusOnline[].match` est **ternaire** : `true` (compatible avec le MediaID du
  disque), `false` (autre MediaID), **`null` (MediaID inconnu)**. Tant que `match` vaut
  `null`, ne présentez pas la TU comme installable.
* `games[].pending` = `true` si la liste complète des TU en ligne n'est pas encore disponible pour ce jeu.
* `pending` (racine) = `true` si **au moins un** jeu est en attente (TU en ligne ou MediaID).
* Les jeux de format `"A trier"` et sans TitleID sont exclus de cette vue.

**Effets de bord** : lance en arrière-plan l'analyse MediaID et les requêtes XboxUnity
(cache 6 h).

---

#### `GET /api/tucheck`

Nombre de Title Updates disponibles par TitleID (source XboxUnity, cache disque `tu_check.json`, TTL 24 h).

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `tids` | oui | TitleID séparés par des virgules. Les valeurs qui ne sont pas exactement 8 caractères hexadécimaux sont **silencieusement ignorées**. |

**Réponse `200`** :

```json
{ "4D5309C9": 5, "58410A2B": 0 }
```

> **Attention — pas de champ `pending` ici.** Un TitleID dont le compteur n'est pas
> encore en cache est **absent** de l'objet (et non présent à `0`). La requête réseau
> est lancée en arrière-plan et le premier appel renvoie souvent `{}`.
> Le client doit **re-interroger** l'endpoint jusqu'à ce que toutes les clés demandées
> soient présentes. Un `0` est une valeur légitime (jeu sans TU), une clé absente ne l'est pas.

**Effets de bord** : requêtes HTTP vers XboxUnity, écriture de `tu_check.json`.

**Erreurs** : aucune (les entrées invalides sont ignorées).

---

#### `POST /api/tu/install`

Télécharge une Title Update et l'écrit dans `<content>\<TID>\000B0000\`.

**Corps JSON** :

| Champ | Requis | Description |
|---|---|---|
| `tid` | oui | TitleID 8 hex. |
| `tuid` | oui | Identifiant de la Title Update. |
| `force` | non | Si truthy, réinstalle même si le `tuid` est déjà marqué installé. |

**Réponse `200`** :
* `{ "ok": true, "already": true }` — déjà installée et `force` absent ;
* `{ "ok": true, "file": "TU_12345" }` — fichier téléchargé et écrit.

**Effets de bord** : crée `<content>\<TID>\000B0000\`, écrit le fichier TU, ajoute le
`tuid` au marqueur `tu_installed.json`. La réponse arrive après la fin de l'écriture.

**Erreurs** :
* `{"error": "Parametres invalides"}` — `tid` ou `tuid` manquant/invalide ;
* `{"error": "HTTP <code>"}` — XboxUnity n'a pas renvoyé 200 ;
* `{"error": "<message>"}` — erreur réseau ou d'écriture disque.

---

#### `GET /api/dlc`

Recherche des DLC/XBLA/bundles téléchargeables sur archive.org. Deux passes : par nom
(`q`) puis par TitleID (`tid`), suivies d'une passe « bundles jeu + DLC ».

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `q` | non | Nom du jeu. |
| `tid` | non | TitleID 8 hex ; ajouté comme seconde requête. |

**Réponse `200`** — tableau **limité à 120** entrées, dédoublonné par URL, trié par
pertinence puis par taille décroissante :

```json
[
  {
    "name": "Mon Jeu DLC Pack.rar",
    "size": 1073741824,
    "url": "https://archive.org/download/mon-item/Mon%20Jeu%20DLC%20Pack.rar",
    "col": "DLC",
    "colId": "XBOX_360_DLC_1"
  }
]
```

`col` ∈ `"DLC"`, `"DLC XBLA"`, `"XBLA"`, `"Indie"`, `"Bundle"`. L'ordre de tri suit
exactement ce classement (`DLC` d'abord, `Bundle` — c'est-à-dire un jeu complet — en
dernier). Les fichiers `.iso`/`.7z`/`.zip`/`.rar`/`.tar` sont retenus, les noms
commençant par `__` et les versions PC (`gog`, `setup`, `installer`, `windows`, `steam`)
sont exclus.

**Effets de bord** : requêtes archive.org (le cookie de session est joint s'il est
configuré) ; écrit `dlc_index/<collection>.json` (cache 7 jours).

**Erreurs** : non émises en tant qu'erreur — une collection inaccessible est ignorée
silencieusement et la réponse peut être un tableau vide.

---

#### `POST /api/dlc/install`

**Corps JSON** :

| Champ | Requis | Description |
|---|---|---|
| `url` | oui | URL `http(s)` du fichier. |
| `name` | non | Nom de fichier local. |

**Réponse `200`** :

```json
{ "queued": 1, "file": "Mon Jeu DLC Pack.rar" }
```

**Effets de bord** : met le téléchargement en file (`downloads.json`) avec installation
automatique à la fin (`after: "install"` → extraction, conversion ISO→GOD si besoin,
rangement dans Games/Content). Voir « Patterns — file de téléchargements ».

**Erreurs** : `{"error": "URL invalide"}` (URL absente ou non `http(s)`),
`{"error": "<message>"}` si l'URL n'est pas parsable.

---

### Dépôt & organisation

---

#### `GET /api/drop`

Analyse chaque élément du dossier de dépôt principal **et** de tous les dépôts alternes
(`<lettre>:\_A_TRIER` sur les disques NTFS/exFAT).

**Paramètres** : aucun.

**Réponse `200`** — tableau d'objets `analyzeItem` :

```json
[
  {
    "path": "D:\\_A_TRIER\\mon_jeu.iso",
    "name": "mon_jeu.iso",
    "size": 8589934592,
    "kind": "ISO",
    "tid": null,
    "title": null,
    "sub": null,
    "actions": ["extract", "god", "skip", "delete"]
  }
]
```

| Champ | Notes |
|---|---|
| `kind` | `"Inconnu"`, `"ISO"`, `"Archive"`, `"Archive (.iso)"`, `"GOD"`, `"Extrait"`, `"Dossier"`, ou un libellé de contenu (`"DLC"`, `"TU"`, `"XBLA"`, `"Avatar"`…). |
| `tid` | TitleID si déterminable, sinon `null`. |
| `title` | Nom du titre si connu, sinon `null`. |
| `sub` | Sous-type de package (`00007000`, `00000002`, `000B0000`…) ou `null`. |
| `actions` | Actions acceptées par `POST /api/organize` pour cet élément. Toujours `"skip"` et `"delete"`. |
| `error` | Ajouté si `stat` a échoué sur le chemin. |

**Effets de bord** : lecture disque (calcul de taille récursif, non mis en cache ici —
peut être lent sur un gros dépôt).

---

#### `GET /api/scanfolder`

Analyse un dossier arbitraire (typiquement un disque externe à importer). Descend
automatiquement dans les dossiers « conteneurs » ressemblant à du contenu Xbox
(`Content`, `0000000000000000`, `Games`…) jusqu'à 6 niveaux.

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `path` | oui | Dossier à analyser. Une valeur du type `D:` est normalisée en `D:\`. |

**Réponse `200`** :

```json
{
  "path": "E:\\",
  "items": [
    { "path": "E:\\Content\\0000000000000000", "name": "4D5309C9", "size": 1234, "kind": "GOD", "tid": "4D5309C9", "title": "Forza Horizon", "sub": "00007000", "actions": ["content", "skip", "delete"] }
  ]
}
```

`name` contient un chemin **relatif** au dossier scanné dès que la profondeur est > 0.

**Erreurs** : `{"error": "Dossier introuvable : <path>"}`, `{"error": "Pas un dossier : <path>"}`.

---

#### `POST /api/organize`

Exécute une liste d'actions choisies par l'utilisateur sur des éléments du dépôt.
Opération **asynchrone** et **verrouillante**.

**Corps JSON** :

```json
{
  "items": [
    { "path": "D:\\_A_TRIER\\mon_jeu.iso", "action": "god" },
    { "path": "D:\\_A_TRIER\\pack.rar", "action": "auto" },
    { "path": "D:\\_A_TRIER\\4D5309C9", "action": "content", "sub": "00007000" },
    { "path": "D:\\_A_TRIER\\vieux.dossier", "action": "delete" }
  ]
}
```

| Champ | Notes |
|---|---|
| `items[].path` | Requis. |
| `items[].action` | Requis. `"skip"` est filtré (aucun traitement). |
| `items[].sub` | Utilisé par l'action `content` (sous-type de package). |
| `items[].name` | Utilisé par l'action `games` (nom du dossier de destination). |

Actions possibles :

| Action | Effet | Suppression de la source |
|---|---|---|
| `extract` | Extrait l'ISO vers le dossier Games. | oui, si l'extraction réussit |
| `god` | Convertit l'ISO en GOD (`iso2god`). | oui, si la conversion réussit |
| `content` | Range le package dans Content ou Games selon le sous-type. | déplacement, pas de suppression |
| `games` | Déplace le dossier vers le dossier Games sous `name`. | déplacement |
| `auto` | Pipeline complet (archive → extraction → installation). | dossier/archive supprimé seulement si **tout** a réussi |
| `delete` | **Supprime récursivement et définitivement.** | — |
| `skip` | Ignoré. | — |

**Réponse `200`** :

```json
{ "started": true, "count": 4 }
```

`count` = nombre d'items réellement retenus après filtrage (`path` + `action` non `skip`).

**Effets de bord** : écritures/déplacements/suppressions de fichiers, exécution
d'outils externes (`exiso`, `iso2god`, `7z`), journalisation dans `/api/sortlog`,
invalidation du cache de scan à la fin. Le travail continue **après** la réponse.

**Erreurs** :
* `{"error": "Une operation est deja en cours"}` — le verrou `lockSort` est détenu
  (tri, autre organisation ou installation post-téléchargement) ;
* `{"error": "Rien a faire"}` — aucun item retenu.

---

#### `POST /api/sort`

Lance le tri automatique complet du dossier de dépôt principal (`config.drop`). Le
traitement est séquentiel et asynchrone.

**Corps JSON** : ignoré (peut être `{}`).

**Réponse `200` — tri démarré** :

```json
{ "started": true }
```

**Réponse `200` — verrou déjà pris** :

```json
{ "error": "Une operation est deja en cours" }
```

> **Le verrou d'opération.** Le tri, l'organisation et les installations
> post-téléchargement partagent un verrou unique. Si une autre opération le
> détient, le tri **ne démarre pas** et la réponse porte un `error` — vérifiez
> toujours ce champ avant d'annoncer un succès à l'utilisateur.
>
> Historiquement cette route renvoyait `{"started": true}` dans tous les cas, y
> compris quand rien ne démarrait : le clic semblait fonctionner et aucun
> fichier ne bougeait. Corrigé en 1.1.0. Pour connaître le détenteur courant du
> verrou, `GET /api/sortlog` expose le champ `sorting` (`null`, `"sort"`,
> `"organize"` ou `"install:<id>"`).

**Effets de bord** : vide le journal, déplace/extrait/supprime des fichiers, invalide
le cache de scan à la fin. Le tri se déroule en arrière-plan : la réponse revient
immédiatement, la progression se suit via `GET /api/sortlog`.

---

#### `GET /api/sortlog`

**Paramètres** : aucun.

**Réponse `200`** :

```json
{
  "sorting": "sort",
  "lines": [
    "[14:02:11] Depot : D:\\_A_TRIER  |  Jeux : ...  |  GOD : ...",
    "[14:02:11] == Tri de D:\\_A_TRIER ==",
    "[14:02:12] === mon_jeu.iso",
    "[14:02:40] == Tri termine =="
  ]
}
```

* `sorting` : `null` si aucune opération longue n'est en cours ; sinon le propriétaire du
  verrou — `"sort"`, `"organize"`, ou `"install:<id>"` (installation automatique après
  téléchargement).
* `lines` : les **80 dernières** lignes du journal (300 conservées en mémoire).

C'est le seul moyen fiable de savoir si `/api/sort` a réellement démarré.

---

#### `POST /api/move`

**Corps JSON** :

```json
{ "paths": ["D:\\_A_TRIER\\jeu1", "D:\\_A_TRIER\\jeu2"], "dest": "E:\\Sauvegarde" }
```

**Réponse `200`** :

```json
{ "ok": ["D:\\_A_TRIER\\jeu1"], "err": ["D:\\_A_TRIER\\jeu2: EPERM: operation not permitted"] }
```

Chaque élément est déplacé vers `dest/<basename>`. Les échecs n'interrompent pas les
suivants. Le dossier de destination doit exister.

**Effets de bord** : déplacements sur disque (recopie si changement de volume).

---

#### `POST /api/rename`

**Corps JSON** :

```json
{ "path": "D:\\_A_TRIER\\mon jeu", "name": "Mon Jeu (2005)" }
```

Le nouveau nom passe par `cleanName()`. Le chemin parent est conservé.

**Réponse `200`** : `{ "ok": true }`

**Erreurs** : `{"error": "<message>"}` (cible existante, chemin invalide…).

---

#### `POST /api/delete` — **destructif**

**Corps JSON** :

```json
{ "paths": ["D:\\_A_TRIER\\inutile.iso"] }
```

**Réponse `200`** :

```json
{ "ok": ["D:\\_A_TRIER\\inutile.iso"], "err": [] }
```

> **Aucune restriction de chemin.** N'importe quel chemin accessible en écriture par le
> processus peut être supprimé récursivement et définitivement (`fs.rmSync` avec
> `recursive: true, force: true`). Il n'y a **pas** de corbeille, pas d'annulation.
> C'est la route la plus dangereuse de l'API.
>
> Règle produit de l'application : **ne jamais** l'appeler sans confirmation explicite
> de l'utilisateur.

---

#### `POST /api/content/delete` — **destructif, restreint**

Supprime un élément de contenu de la console (DLC/TU/GOD) sous le dossier Content
configuré, ainsi que son éventuel fichier `.data` compagnon.

**Corps JSON** :

```json
{ "path": "C:\\...\\Content\\0000000000000000\\4D5309C9\\00000002\\abc123" }
```

**Garde-fou de chemin** — la cible doit être **strictement à l'intérieur** de
`config.content` :

* comparaison insensible à la casse, sur chemins résolus ;
* le préfixe doit être suivi d'un **séparateur** (`root + path.sep`), ce qui **refuse la
  racine elle-même** et tout voisin dont le nom commence par le même préfixe
  (par exemple `..._backup`). Cette règle a été durcie après un bug où un simple
  `indexOf(root) !== 0` permettait d'effacer tout le Content en un POST.

**Réponse `200`** : `{ "ok": true }`

**Effets de bord** : suppression récursive ; purge du marqueur `tu_installed.json` du
`<TID>` parent (seuls les `tuid` dont le fichier correspondant existe encore sont
conservés, comparaison exacte) ; invalidation du cache de scan.

**Erreurs** :
* `{"error": "Chemin hors du dossier Content"}` — chemin absent, racine, ou hors Content ;
* `{"error": "Introuvable"}` — chemin dans Content mais inexistant ;
* `{"error": "<message>"}` — échec de suppression.

---

#### `POST /api/import`

Copie un fichier ou dossier **déjà présent** sur le PC vers le dossier de dépôt.

**Corps JSON** :

```json
{ "path": "E:\\mon_jeu.iso" }
```

**Réponse `200`** :

```json
{ "ok": true, "dest": "D:\\_A_TRIER\\mon_jeu.iso" }
```

La destination réelle peut être un dépôt alterné sur un disque NTFS/exFAT si le dépôt
configuré est en FAT32 et que le fichier dépasse 4 Go (`pickDlDir`).

**Effets de bord** : copie récursive synchrone (`fs.cpSync`) — **bloque la boucle
d'événements** pendant toute la copie, y compris pour les téléchargements en cours.

**Erreurs** :
* `{"error": "Chemin introuvable : <path>"}` ;
* `{"error": "Fichier > 4 Go : depot en FAT32 et aucun disque NTFS/exFAT libre"}` ;
* `{"error": "<message>"}`.

---

#### `POST /api/upload`

Reçoit un flux binaire **brut** (pas de JSON, pas de multipart) et l'écrit dans le
dossier de dépôt.

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `name` | non | Nom de fichier (URL-encodé). Défaut : `fichier.bin`. Les caractères `\ / : * ? " < > |` sont remplacés par `_`. |

**Corps** : le contenu binaire. `Content-Length` sert à choisir le disque de destination
(redirection FAT32 si > 4 Go).

**Réponse `200`** : `{ "ok": true, "dest": "D:\\_A_TRIER\\mon_fichier.bin" }`

**Effets de bord** : écriture du fichier (streaming), invalidation implicite du scan
non effectuée — la bibliothèque se rafraîchit au prochain scan (cache 15 s).

**Erreurs** :
* `{"error": "Fichier > 4 Go : depot en FAT32 et aucun disque NTFS/exFAT libre"}` ;
* `{"error": "<message>"}` sur erreur d'écriture.

---

#### `POST /api/open`

Ouvre l'explorateur Windows sur un chemin (ou sur le dossier parent si c'est un fichier).

**Corps JSON** :

```json
{ "path": "D:\\_A_TRIER" }
```

**Réponse `200`** : `{ "ok": true }`

**Effets de bord** : lance `explorer.exe` **détaché** (le serveur ne l'attend pas).

**Erreurs** : `{"error": "Introuvable"}`, `{"error": "<message>"}`.

---

### Téléchargements

---

#### `POST /api/download`

Met un téléchargement en file. **Répond immédiatement** : le transfert se poursuit en
arrière-plan.

**Corps JSON** :

| Champ | Requis | Description |
|---|---|---|
| `url` | oui | URL `http(s)`. |
| `name` | non | Nom de fichier local. À défaut, dérivé de l'URL ; repli `download.bin`. |
| `install` | non | Si truthy, lance l'installation automatique à la fin du téléchargement (`after: "install"`). |

**Réponse `200`** :

```json
{ "queued": 3, "file": "mon_jeu.rar" }
```

`queued` = nombre d'éléments en attente **+** nombre de téléchargements actifs au moment
de la réponse (c'est une taille de file, pas un rang). `file` = nom local retenu.

**Effets de bord** : ajoute un élément à `downloads.json`, démarre `pumpDl()` (jusqu'à
3 transferts simultanés ; un seul si la source est Vimm). Le fichier est écrit dans le
dépôt, ou sur un disque NTFS/exFAT si le dépôt est en FAT32 et le fichier > 4 Go.

**Erreurs** : `{"error": "<message>"}` si l'URL n'est pas parsable. **Il n'y a pas de
validation `http(s)` sur cette route** : une URL d'un autre schéma ajoute un élément en
file qui échouera plus tard (statut `error`).

---

#### `GET /api/downloads`

**Paramètres** : aucun.

**Réponse `200`** :

```json
{
  "items": [
    {
      "id": "1717171717171_4321",
      "url": "https://archive.org/download/item/fichier.rar",
      "name": "fichier.rar",
      "status": "active",
      "received": 12345678,
      "total": 1073741824,
      "speed": 2345678,
      "error": null,
      "added": 1717171717171,
      "after": "install",
      "afterLabel": null,
      "note": "→ installe auto apres le DL",
      "dir": "D:\\_A_TRIER"
    }
  ],
  "drop": "D:\\_A_TRIER",
  "dropFree": 123456789012
}
```

| Champ | Notes |
|---|---|
| `status` | `"queued"`, `"active"`, `"paused"`, `"done"` ou `"error"`. |
| `received` / `total` | Octets. `total` vaut `0` tant que la taille n'est pas connue. |
| `speed` | Octets/seconde, mis à jour chaque seconde ; `0` si inactif. |
| `error` | Message d'erreur ou `null`. |
| `after` | `"install"` ou `"homebrew"`, présent seulement si demandé. |
| `afterLabel` | Nom logique passé à l'installeur homebrew. |
| `note` | Message d'information pour l'UI (redirection FAT32, installation reportée…). |
| `files` | Présent pour les téléchargements multi-fichiers (dossiers homebrew dézippés) : `[{url, rel, size}]`. |
| `headers` | Présent pour les téléchargements Vimm (`User-Agent`, `Referer`, `Cookie`). **Contient un cookie de session : ne pas journaliser.** |
| `finished` | Horodatage de fin, si terminé. |
| `installing` | `true` pendant l'installation post-téléchargement. |
| `installed` | Nombre de packages installés, une fois l'installation terminée. |
| `dir` | Dossier de destination effectif (peut différer du dépôt après redirection FAT32). |

Les éléments dont le statut était `"active"` au démarrage du serveur sont **requalifiés
en `"queued"`** au chargement : la file survit à un redémarrage.

`dropFree` = espace libre en octets sur le volume du dépôt ; `-1` si indéterminable.

---

#### `POST /api/dlctl`

**Corps JSON** :

```json
{ "id": "1717171717171_4321", "action": "pause" }
```

| `action` | Effet | Fichier partiel |
|---|---|---|
| `pause` | Arrête le transfert (possible aussi depuis `queued`). Conservation du partiel. | conservé |
| `resume` | Remet en file et redémarre (reprise par requête HTTP `Range`). | repris |
| `retry` | Identique à `resume` (l'erreur est effacée). | repris |
| `cancel` | Retire l'élément **et supprime le fichier partiel**. | supprimé |
| `remove` | Retire l'élément **sans** supprimer le fichier. | conservé |
| `up` / `down` | Réordonne l'élément dans la file d'attente (échange avec le voisin en file). | — |
| `clear` | Supprime de la liste tous les éléments `done` et `error`. **Ignore `id`.** | — |

**Réponse `200`** : `{ "ok": true }`

**Erreurs** :
* `{"error": "Introuvable"}` — `id` inconnu (sauf pour `clear`) ;
* `{"error": "action inconnue"}`.

---

#### `GET /api/dlstatus`

Vue compacte, compatible avec l'ancien format « un seul téléchargement ». Les champs
`file`, `pct`, `received`, `total`, `speed` ne décrivent que le **premier slot actif**
(3 transferts peuvent tourner en parallèle) ; `slots` expose la liste complète.

**Paramètres** : aucun.

**Réponse `200`** :

```json
{
  "active": true,
  "file": "fichier.rar",
  "pct": 12,
  "received": 12345678,
  "total": 1073741824,
  "speed": 2345678,
  "error": null,
  "queue": ["autre_fichier.zip"],
  "slots": [
    { "name": "fichier.rar", "pct": 12, "received": 12345678, "total": 1073741824, "speed": 2345678 }
  ]
}
```

* `active` : `true` si au moins un slot tourne.
* `error` : **toujours `null`** (champ hérité, conservé pour compatibilité ; les erreurs
  sont dans `/api/downloads`).
* `queue` : noms des éléments en statut `queued` (pas les `paused`).

---

### Catalogues & recherche

> Toutes ces routes interrogent des services distants (archive.org, XboxUnity, Vimm).
> Les réponses peuvent prendre plusieurs secondes et renvoyer un tableau vide en cas
> d'échec silencieux.

---

#### `GET /api/search`

Recherche d'items archive.org.

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `q` | non | Termes de recherche. `AND mediatype:software AND (xbox 360 OR xbox360)` est ajouté automatiquement. |

**Réponse `200`** — tableau (max 60, trié par nombre de téléchargements) :

```json
[
  { "id": "mon-item-archive", "title": "Mon Jeu Xbox 360", "size": 1073741824, "hits": 4210 }
]
```

**Erreurs** : `{"error": "<message>"}` en cas d'échec réseau / JSON invalide / timeout (15 s).

---

#### `GET /api/searchfiles`

Recherche agrégée : les meilleurs items puis **tous** leurs fichiers téléchargeables,
en une seule requête. Interroge par nom **et** par TitleID.

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `q` | non | Nom du jeu. |
| `tid` | non | TitleID 8 hex ; ajoute une requête `mediatype:software`. |

**Réponse `200`** — tableau :

```json
[
  {
    "name": "Disc 1.rar",
    "size": 4294967296,
    "url": "https://archive.org/download/mon-item/Disc%201.rar",
    "src": "Mon Jeu Xbox 360",
    "tidHit": true
  }
]
```

* `src` : titre de l'item source ; à inclure dans le score de pertinence côté client.
* `tidHit` : `true` si le TitleID apparaît dans le titre ou l'identifiant de l'item.
* Seuls les 10 premiers items (dédoublonnés) sont analysés ; extensions retenues :
  `.iso`, `.7z`, `.zip`, `.rar`, `.god`.
* Les résultats ne sont **pas** triés par pertinence par le serveur.

**Erreurs** : non émises — un échec renvoie un tableau vide.

---

#### `GET /api/unity`

Base de titres XboxUnity (`TitleList.php`).

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `q` | non | Termes de recherche. |

**Réponse `200`** — tableau (max 40) :

```json
[
  { "tid": "4D5309C9", "name": "Forza Horizon", "type": "1", "covers": 3, "updates": 5, "link": true, "newest": "2026-02-12" }
]
```

* `type`, `covers`, `updates` sont convertis en nombres (sauf `type`, laissé tel quel).
* `link` : `true` si `LinkEnabled === "1"`.
* `newest` : date du dernier contenu publié, reprise **telle quelle** du champ
  `NewestContent` de `TitleList.php` — c'est la même réponse, donc la fiche du jeu
  (colonne gauche de la surcouche de téléchargement) l'affiche en ligne
  « Dernier contenu » **sans une requête de plus**. Chaîne vide quand la source
  n'en publie pas ; la fiche n'affiche alors aucune ligne, elle n'invente rien.

**Erreurs** : `{"error": "<message>"}` ou `{"error": "Reponse vide"}`.

---

#### `GET /api/item`

Fichiers téléchargeables d'un item archive.org précis.

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `id` | oui | Identifiant de l'item archive.org. |

**Réponse `200`** :

```json
[
  {
    "name": "Disc 1.rar",
    "size": 4294967296,
    "url": "https://archive.org/download/mon-item/Disc%201.rar"
  }
]
```

Extensions retenues : `.iso`, `.7z`, `.zip`, `.rar`, `.god`.

**Erreurs** : `{"error": "<message>"}`.

---

#### `GET /api/vimm`

Recherche sur Vimm's Vault (pages liste, HTTP direct, sans Cloudflare).

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `q` | non | Termes de recherche. |

**Réponse `200`** — tableau :

```json
[
  { "id": "12345", "name": "Mon Jeu", "regions": "USA Europe", "ver": "1.0", "langs": "En Fr" }
]
```

**Erreurs** : `{"error": "<message>"}` (réseau, timeout 15 s, trop de redirections).

---

#### `GET /api/vimmfiles`

Résout la fiche d'un jeu Vimm. Si la page est protégée par Cloudflare Turnstile, le
serveur ouvre la page dans Edge en mode debug (profil `.iaprofile`, port 9333) et attend
que le défi passe. **Cet appel peut donc durer jusqu'à ~60 secondes.**

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `id` | oui | Identifiant Vimm (issu de `/api/vimm`). |

**Réponse `200`** :

```json
{
  "title": "Mon Jeu",
  "action": "//dl2.vimm.net/",
  "token": "abcdef0123456789",
  "medias": [
    { "id": "98765", "file": "Mon Jeu (USA).iso", "label": "v1.0 · 7.83 GB · SLUS-12345", "alt": 0 },
    { "id": "98765", "file": "Mon Jeu (USA) (alt).iso", "label": "v1.0 · 7.83 GB [alt]", "alt": 1 }
  ],
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Edg/126.0.0.0",
  "cookie": "cf_clearance=..."
}
```

* `medias[].alt` : `0` = fichier principal, `1`/`2` = variantes (`AltZipped`, `AltZipped2`).
  Une variante est le recours quand le fichier principal est corrompu côté serveur.
* `medias[].file` : nom de fichier décodé depuis le base64 de la page.
* `ua` et `cookie` sont **nécessaires** au téléchargement (`/api/vimmdl`) : Vimm refuse la
  requête sans eux.

> Le champ `cookie` contient un cookie Cloudflare de session (`cf_clearance`). Ce n'est
> **pas** le cookie archive.org, mais c'est une donnée sensible : ne pas la journaliser
> ni la committer.

**Erreurs** :
* `{"error": "Page bloquee par Cloudflare Turnstile (Edge indisponible)"}` ;
* `{"error": "Aucun mediaId trouve sur la page"}` ;
* `{"error": "<message>"}`.

---

#### `POST /api/vimmdl`

Construit l'URL de téléchargement Vimm et met le DL en file. Le transfert Vimm est
soumis à une limite serveur de **1 téléchargement simultané par IP**.

**Corps JSON** :

| Champ | Requis | Description |
|---|---|---|
| `mediaId` | oui | `medias[].id` renvoyé par `/api/vimmfiles`. |
| `action` | non | Hôte issu de `action` (ex. `//dl2.vimm.net/`). Défaut : `https://dl2.vimm.net/`. |
| `token` | non | `token` renvoyé par `/api/vimmfiles`. |
| `alt` | non | `1` ou `2` pour une variante. |
| `name` | non | Nom de fichier ; défaut `vimm_<mediaId>`. |
| `ua` | non | User-Agent réel du navigateur (issu de `/api/vimmfiles`). |
| `cookie` | non | Cookie `cf_clearance` (issu de `/api/vimmfiles`). |
| `id` | non | Identifiant Vimm du jeu, utilisé pour le `Referer`. |

**Réponse `200`** : `{ "queued": 1, "file": "Mon Jeu (USA).iso" }`

**Effets de bord** : ajoute un élément à la file avec `after: "install"` (installation
automatique), enregistre les en-têtes (`User-Agent`, `Referer`, `Cookie`) dans
`downloads.json`.

**Erreurs** : `{"error": "mediaId manquant"}`.

---

#### `POST /api/vimmcancel`

Libère le slot « 1 téléchargement à la fois » de Vimm, resté bloqué après un transfert
interrompu (le serveur répond alors `429 currently downloading`). Appelle
`GET https://<hôte>/cancel.php` avec les en-têtes persistés du téléchargement.

**Corps JSON** :

```json
{ "id": "1717171717171_4321" }
```

`id` cible l'élément de la file ; à défaut, le **premier** élément dont l'URL pointe
vers `vimm.net` est utilisé.

**Réponse `200`** : `{ "ok": true, "status": 200 }` (`status` = code HTTP de `cancel.php`).

**Effets de bord** : requête HTTP sortante vers Vimm.

**Erreurs** : `{"error": "aucun DL vimm"}`, `{"error": "<message>"}` (réseau).

---

### Homebrew

---

#### `GET /api/homebrew`

Liste les applications homebrew et émulateurs installés localement.

**Paramètres** : aucun.

**Réponse `200`** :

```json
[
  {
    "name": "Aurora",
    "exe": "Aurora.xex",
    "path": "C:\\Users\\moi\\xbox360_tools\\Homebrew\\Aurora",
    "kind": "Homebrew"
  }
]
```

* Seuls les **sous-dossiers** contenant un `.xex` ou `.elf` sont listés (premier trouvé récursivement).
* `kind` vaut `"Homebrew"` (dossier `config.homebrew`) ou `"Emulateur"` (dossier `config.emulators`).

**Effets de bord** : aucun.

---

#### `GET /api/hbstore`

Catalogue homebrew téléchargeable. Sans `q`, renvoie la sélection curatée (XeXMenu,
Aurora, Dashlaunch, FSD, NAND Flasher, XM360, Xell, RetroArch, émulateurs…) avec, pour
chaque entrée, les fichiers archive.org trouvés. Avec `q`, effectue une recherche libre.

**Paramètres** (query string) :

| Nom | Requis | Description |
|---|---|---|
| `q` | non | Recherche libre. Si absent ou vide, renvoie le catalogue curaté. |

**Réponse `200`** — tableau :

```json
[
  {
    "name": "Aurora Dashboard",
    "emu": false,
    "installed": false,
    "files": [
      {
        "name": "Aurora.rar",
        "size": 52428800,
        "url": "https://archive.org/download/mon-item/Aurora.rar",
        "src": "Aurora Dashboard Xbox 360",
        "rel": 1
      },
      {
        "name": "Bad Update Bundle (dossier complet)",
        "size": 104857600,
        "group": true,
        "rel": 1,
        "list": [
          { "url": "https://archive.org/download/mon-item/Apps/Aurora/default.xex", "rel": "Apps/Aurora/default.xex", "size": 1486848 }
        ]
      }
    ]
  }
]
```

* `installed` (ajouté par le serveur) : `true` si un dossier local correspond au nom.
* `emu` : `true` pour les émulateurs (destination `config.emulators`).
* `group: true` : item **dézippé** sur archive.org ; utiliser `list` pour télécharger le
  dossier complet fichier par fichier — à passer tel quel à `POST /api/hb/install`.
* En recherche libre, la réponse contient une **unique** entrée nommée
  `"Recherche : <q>"` avec `emu: false`, ou un tableau vide si rien n'est trouvé.
* Le catalogue curaté est mis en cache disque 24 h (`hb_index.json`) ; une seule
  construction d'index tourne à la fois, les appels concurrents **attendent** le même
  résultat (le premier appel peut donc être long).

**Effets de bord** : requêtes archive.org, écriture de `hb_index.json`.

---

#### `POST /api/hb/install`

Met en file un téléchargement homebrew avec extraction/installation automatique vers
`config.homebrew` (ou `config.emulators` selon le nom).

**Corps JSON** — deux formes acceptées :

1. **Fichier unique** :

```json
{ "url": "https://archive.org/download/mon-item/Aurora.rar", "name": "Aurora.rar", "app": "Aurora" }
```

2. **Groupe multi-fichiers** (item dézippé, `group: true` de `/api/hbstore`) : `files`
   doit être un tableau non vide dont **chaque** entrée porte une `url` `http(s)` :

```json
{
  "group": true,
  "app": "Aurora",
  "files": [
    { "url": "https://archive.org/download/mon-item/Apps/Aurora/default.xex", "rel": "Apps/Aurora/default.xex", "size": 1486848 }
  ]
}
```

**Réponse `200`** : `{ "queued": 1, "file": "Aurora.rar" }`
(pour un groupe, `file` vaut `b.app` ou `b.name`, défaut `homebrew`).

**Effets de bord** : file de téléchargement + installation automatique
(`after: "homebrew"`). Le mode multi-fichiers télécharge séquentiellement dans
`<dépôt>/<nom>/` avec reprise par fichier.

**Erreurs** : `{"error": "URL invalide"}` (forme 1 avec URL manquante ou non `http(s)`),
`{"error": "<message>"}`.

---

### Configuration & divers

---

#### `GET /api/config`

Renvoie la **configuration publique**.

**Paramètres** : aucun.

**Réponse `200`** :

```json
{
  "drop": "D:\\_A_TRIER",
  "games": "C:\\Users\\moi\\xbox360_tools\\Games",
  "content": "C:\\Users\\moi\\xbox360_tools\\Content\\0000000000000000",
  "homebrew": "C:\\Users\\moi\\xbox360_tools\\Homebrew",
  "emulators": "C:\\Users\\moi\\xbox360_tools\\Emulators",
  "scanExtra": ["E:\\Jeux360"],
  "lang": "fr",
  "hasCookie": true
}
```

> **Le cookie de session archive.org n'est JAMAIS renvoyé ici.** Il vit dans
> `secrets.json` (gitignoré, permissions `600`), séparé de `config.json` — précisément
> parce que `config.json` est le fichier qu'on partage pour demander de l'aide.
> La réponse n'expose qu'un booléen `hasCookie`, ce qui empêche un XSS dans l'UI de
> voler la session (mais l'UI peut toujours déclencher des suppressions : c'est un
> argument pour ne jamais exposer l'API, pas une protection suffisante).

**Effets de bord** : aucun.

---

#### `POST /api/config`

Met à jour la configuration. Tous les champs sont optionnels ; **seuls les champs
présents sont modifiés** (sémantique de patch).

**Corps JSON** :

```json
{
  "drop": "D:\\_A_TRIER",
  "games": "C:\\...\\Games",
  "content": "C:\\...\\Content\\0000000000000000",
  "homebrew": "C:\\...\\Homebrew",
  "emulators": "C:\\...\\Emulators",
  "lang": "fr",
  "scanExtra": ["E:\\Jeux360"],
  "archiveCookie": "logged-in-sig=...; logged-in-user=..."
}
```

| Champ | Type | Effet |
|---|---|---|
| `drop`, `games`, `content`, `homebrew`, `emulators`, `lang` | string | Remplacés si `!== undefined`. Aucune validation de chemin. |
| `scanExtra` | array | Remplacé **uniquement** si c'est bien un tableau. |
| `archiveCookie` | string | Voir ci-dessous. |

**Règle du cookie (importante)** :

* une **chaîne non vide** (après `trim`) → le cookie est écrit dans `secrets.json` ;
* une **chaîne vide** (`""` ou uniquement des espaces) → le cookie est **effacé** ;
* un champ **absent** (`undefined`) ou d'un autre type → le cookie est **laissé intact**.

C'est ce qui permet à l'UI d'enregistrer les dossiers sans effacer la session : elle
n'envoie simplement pas le champ. **Un client qui enverrait systématiquement
`archiveCookie: ""` détruirait la connexion à chaque sauvegarde de configuration.**

**Réponse `200`** :

```json
{ "ok": true, "cfg": { "...": "même forme que GET /api/config" } }
```

**Effets de bord** : écrit `config.json` et, si `archiveCookie` a été traité,
`secrets.json` (avec `chmod 600`).

**Erreurs** : `{"error": "JSON invalide"}`.

---

#### `GET /api/drives`

Lettres de lecteurs présents, avec espace.

**Paramètres** : aucun.

**Réponse `200`** :

```json
[
  { "letter": "C", "free": 123456789012, "total": 500107862016 },
  { "letter": "D", "free": 987654321000, "total": 2000398934016 }
]
```

Seuls les volumes accessibles apparaissent (les lettres absentes sont omises).

**Effets de bord** : lance en arrière-plan la détection des systèmes de fichiers
(NTFS/FAT32/exFAT) utilisée pour la redirection > 4 Go. La détection **n'est pas**
attendue : elle sera disponible aux appels suivants.

---

#### `GET /api/removable`

Lettres des lecteurs amovibles (`Win32_LogicalDisk`, `DriveType=2`).

**Paramètres** : aucun.

**Réponse `200`** :

```json
["E:", "F:"]
```

**Effets de bord** : lance PowerShell (`Get-CimInstance`) ; résultat mis en cache 60 s.
En cas d'échec et sans cache, renvoie `[]`.

---

#### `POST /api/ia/login`

Lance la connexion automatique à archive.org : ouvre Edge (ou Chrome) en mode debug sur
le profil `.iaprofile` (port 9333), laisse l'utilisateur se connecter, puis récupère les
cookies `logged-in-*` et les écrit dans `secrets.json`.

**Corps JSON** : ignoré.

**Réponse `200`** : `{ "started": true }` — réponse immédiate ; si un job est déjà
actif, renvoie la même chose sans en lancer un second.

**Effets de bord** : lance un navigateur, écrit `secrets.json`.

**Suivi** : interroger `GET /api/ia/status` jusqu'à `active: false`.

---

#### `GET /api/ia/status`

**Paramètres** : aucun.

**Réponse `200`** :

```json
{ "active": false, "done": true, "error": null, "hasCookie": true }
```

| Champ | Notes |
|---|---|
| `active` | Un job de connexion est en cours. |
| `done` | Un job s'est terminé avec succès. |
| `error` | Message d'erreur (`"Chrome/Edge introuvable"`, timeout…) ou `null`. |
| `hasCookie` | Un cookie archive.org est présent dans `secrets.json` (valeur jamais exposée). |

---

## 4. Patterns

### 4.1 Le motif `pending` — re-interroger, ne pas conclure

Certaines données coûteuses (MediaID d'un disque GOD, listes de Title Updates) ne sont
**pas** calculées dans le handler HTTP : elles seraient trop lentes (lire plusieurs Go de
fichiers `.data` pour un MediaID, interroger XboxUnity pour chaque jeu). Le serveur
répond avec ce qu'il sait **et signale l'incomplet** :

| Endpoint | Signal | Où |
|---|---|---|
| `GET /api/advisor` | `"pending": true` | racine de la réponse |
| `GET /api/mycontent` | `"pending": true` | racine **et** par jeu (`games[].pending`) |
| `GET /api/tucheck` | **aucun champ** — les TID inconnus sont simplement absents de l'objet | implicite |

Le client **doit** re-interroger l'endpoint (typiquement toutes les 1–2 secondes, avec
une limite raisonnable) tant que l'indicateur est vrai, et ne présenter ses conclusions
à l'utilisateur qu'une fois `pending` à `false`. Sinon il affichera des données
partielles — par exemple « aucune MAJ disponible » alors que l'analyse n'est pas finie,
ou « TU incompatible » alors que le MediaID n'est pas encore connu.

Pour `/api/tucheck`, le test n'est pas un champ mais la **complétude des clés** :

```js
// re-interroger tant que toutes les clés demandées ne sont pas revenues
const ok = tids.every(t => t in reponse);
```

Un `0` renvoyé est une vraie réponse (« ce jeu n'a aucune TU ») ; une clé absente
signifie « pas encore su ».

**Exception** : `GET /api/gamecontent` **n'a pas** de motif `pending` — il attend la
réponse de XboxUnity dans la requête (jusqu'à 15 s). Mais si cet appel échoue, les
champs `tuOk` et `tuBest` sont **absents** de la réponse, sans autre signal. Traitez
leur absence comme « indéterminé », pas comme « rien à jour ».

### 4.2 Le motif `queued` — les téléchargements sont asynchrones

Toutes les routes qui déclenchent un téléchargement (`POST /api/download`,
`/api/dlc/install`, `/api/hb/install`, `/api/vimmdl`) **rendent la main immédiatement**
avec :

```json
{ "queued": 2, "file": "mon_jeu.rar" }
```

...alors que le transfert n'a pas commencé ou vient à peine de commencer. Rien dans la
réponse ne permet de suivre la progression : il faut **polling** sur `GET /api/downloads`
(état complet, recommandé : c'est la seule source des erreurs) ou `GET /api/dlstatus`
(vue compacte historique, qui ne décrit qu'un seul slot actif).

Points à connaître pour un client :

* **3 téléchargements simultanés maximum** ; les autres attendent en statut `queued`.
* **Vimm est limité à 1 téléchargement à la fois** (règle serveur par IP) : un item Vimm
  ne démarre que si aucun autre Vimm n'est actif. En cas de blocage (HTTP `429 currently
  downloading`), appeler `POST /api/vimmcancel`.
* La file est **persistante** (`downloads.json`) et survit à un redémarrage ; les
  éléments `active` redeviennent `queued` au chargement.
* `pause`/`resume` reprennent le fichier partiel par requête HTTP `Range` ; `cancel`
  **supprime** le partiel, `remove` le conserve.
* Le contrôle d'espace disque est fait avant écriture ; si le dépôt est en FAT32 et le
  fichier > 4 Go, la destination est redirigée vers un disque NTFS/exFAT
  (`item.dir` + `item.note` dans `/api/downloads`).
* `after: "install"` déclenche l'installation automatique à la fin : extraction,
  conversion ISO→GOD, rangement dans `Games`/`Content`. Pendant cette phase,
  `item.installing` vaut `true`. Si une autre opération longue est en cours, l'installation
  **attend son tour** (jusqu'à ~30 minutes), puis est reportée avec un message dans
  `item.note`.

### 4.3 Le verrou d'opération (`lockSort`)

Une seule opération longue à la fois peut manipuler la bibliothèque. Le verrou a trois
producteurs : le tri automatique (`"sort"`), l'organisation manuelle (`"organize"`) et
l'installation post-téléchargement (`"install:<id>"`).

| Route | Comportement quand le verrou est pris |
|---|---|
| `POST /api/organize` | **refuse** et renvoie `{"error": "Une operation est deja en cours"}` (HTTP `200`) |
| `POST /api/sort` | **ne dit rien** : `runSort()` retourne immédiatement mais la réponse reste `{"started": true}` |
| installation après DL | **attend** son tour (polling interne toutes les 2 s, abandon après ~30 min avec un `note` explicatif) |

> **Conséquence pour un client :** ne vous fiez pas à la réponse de `POST /api/sort`
> pour savoir si le tri a démarré. Interrogez `GET /api/sortlog` et vérifiez que
> `sorting === "sort"` **et** que le journal `lines` contient bien le message de
> démarrage du tri. La valeur `sorting` est également le seul moyen d'afficher un état
> « opération en cours » correct (tri, organisation ou installation).

Un client qui enchaîne plusieurs actions doit donc :

1. appeler `GET /api/sortlog` pour vérifier que `sorting` est `null` ;
2. lancer l'action ;
3. re-poller `sorting` jusqu'à ce qu'il repasse à `null` avant d'en lancer une autre ;
4. sur `/api/organize`, traiter `{"error": "Une operation est deja en cours"}` comme un
   cas normal (réessayer plus tard), pas comme une erreur fatale.

---

## 5. Stabilité

Les chemins, les méthodes, les noms de champs et les formes de réponse décrits dans ce
document constituent **l'interface publique** de l'application.

**C'est un engagement, pas une description.** Toute modification d'un chemin, d'une
méthode, d'un nom de champ ou de la forme d'une réponse doit être accompagnée, **dans le
même changement**, de la mise à jour de ce document **et** de ses clients connus (SPA
`public/index.html`, CLI, intégrations tierces). Un renommage de champ ou un changement
de type n'est pas une amélioration : c'est une rupture de contrat.

Trois garanties complémentaires :

1. **Les ajouts sont permis, les retraits ne le sont pas.** Ajouter un champ à une
   réponse est rétrocompatible ; en supprimer ou en changer le type ne l'est pas. Les
   clients doivent tolérer les champs inconnus **et** l'absence des champs documentés
   comme optionnels.
2. **Le format d'erreur `{"error": "..."}` est stable.** Les codes HTTP, en revanche,
   ne sont pas un contrat fiable (la plupart des erreurs sortent en `200`) : testez le
   champ `error`.
3. **Les comportements contre-intuitifs documentés ici sont volontaires et protégés** :
   le cookie jamais renvoyé par `GET /api/config`, l'effacement du cookie uniquement sur
   chaîne vide, la restriction stricte de `/api/content/delete` au dossier Content, le
   refus des opérations concurrentes. Ce sont des garde-fous de sécurité ou de
   non-perte-de-données : ils ne doivent pas être « simplifiés » pour rendre l'API plus
   commode.
