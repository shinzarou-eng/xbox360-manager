# Dataset MediaID → Title Update

Une table qui répond à une question précise :

> **Pour un disque de jeu identifié par son MediaID, quelles Title Updates existent, et laquelle est la bonne ?**

Ce fichier explique ce que contient le dataset, d'où viennent les données, comment le régénérer, et ce qu'il ne faut PAS en déduire.

---

## Pourquoi ce dataset existe

Une **Title Update** n'est active que pour le **MediaID du disque** sur lequel elle a été installée. Le MediaID identifie un pressage donné d'un jeu : le même titre peut en avoir plusieurs selon l'édition, la région ou le tirage.

Conséquence concrète : installer « la dernière version disponible » à l'aveugle ne sert **à rien** si le MediaID diffère. La console ignore la mise à jour, et les DLC qui en dépendent restent bloqués — sans le moindre message d'erreur. C'est un cas réel rencontré sur ce projet : une TU v5 destinée au MediaID `CAA468A3`, installée sur un disque `6D88AE4F`.

Les sources publiques existantes ne répondent pas à cette question :

| Source | Ce qu'elle donne | Ce qui manque |
|---|---|---|
| XboxUnity `TitleUpdateInfo` | la liste des TU **par TitleID**, groupées par MediaID | aucune agrégation, aucun index exploitable, aucune logique de sélection |
| Aurora / FSD | installation manuelle d'une TU | ne vérifie pas le MediaID |
| Ce dataset | **la correspondance TitleID → MediaID → TU**, aplatie et interrogeable | — |

C'est cette correspondance qui n'existait nulle part. Elle est publiée ici en clair, pour que n'importe quel outil puisse l'utiliser.

---

## Provenance

Les données sont collectées depuis :

```
https://xboxunity.net/Resources/Lib/TitleUpdateInfo.php?titleid=<TITLEID>
```

XboxUnity est un service tiers communautaire. Ce dépôt ne fait que **réorganiser** ce qu'il publie : aucune donnée n'est inventée, et aucune mise à jour n'est redistribuée — uniquement des métadonnées factuelles (identifiants, versions, tailles).

Deux particularités de la source, source d'erreurs si on les ignore :

- Les mises à jour sont sous **`MediaIDS[].Updates[]`**, et non sous une clé racine `Updates`.
- Le champ `Size` est exprimé en **kilooctets**. Le dataset le convertit en **octets**.

---

## Contenu

> **État du fichier versionné.** L'index livré dans `data/` est un **échantillon**
> produit avec `--limit 6`, qui sert à valider le format et à documenter la
> structure. Il ne couvre pas la base de titres complète : lancez
> `npm run dataset` pour produire l'index réel. Le format est identique, seule
> l'étendue change.

| Fichier | Format | Usage |
|---|---|---|
| `data/tu-index.json` | JSON structuré | lecture programmatique, jointures |
| `data/tu-index.csv` | CSV plat | tableur, SQL, `git diff` lisible |

### `tu-index.json`

```json
{
  "schema": 1,
  "source": "https://xboxunity.net/Resources/Lib/TitleUpdateInfo.php",
  "generated": "2026-09-19T09:33:28.461Z",
  "titles": [
    {
      "tid": "584109B7",
      "name": "0 day Attack on Earth",
      "mediaIds": [
        {
          "media": "79595405",
          "updates": [
            { "tuid": "21442", "version": 2, "size": 233472 }
          ]
        }
      ]
    }
  ]
}
```

| Champ | Signification |
|---|---|
| `schema` | version du format. **Vérifiez-la** avant de parser : une valeur inconnue signifie que le format a changé. |
| `source` | l'URL collectée, pour la traçabilité |
| `generated` | date de collecte (ISO 8601). Les TU évoluent : un dataset ancien peut manquer des mises à jour récentes. |
| `titles[].tid` | TitleID, 8 caractères hexadécimaux majuscules |
| `titles[].name` | nom du titre, tel que fourni par la base de titres du projet (peut être `null`) |
| `titles[].mediaIds[].media` | **MediaID du disque**, 8 caractères hexadécimaux |
| `titles[].mediaIds[].updates[]` | mises à jour disponibles **pour ce MediaID précis** |
| `updates[].tuid` | identifiant de la Title Update (chaîne) |
| `updates[].version` | numéro de version, entier |
| `updates[].size` | taille en **octets** |

Les mises à jour sont triées par version **décroissante** : la première de chaque liste est la plus récente pour ce disque.

### `tu-index.csv`

Une ligne par couple (TitleID, MediaID, TU) :

```csv
titleid,name,mediaid,tuid,version,size
584109B7,0 day Attack on Earth,79595405,21442,2,233472
```

Les noms contenant des virgules ou des guillemets sont échappés selon la RFC 4180. L'aller-retour `JSON → CSV → JSON` est couvert par des tests (`test/dataset.test.js`).

---

## Régénérer

```bash
npm run dataset                  # toute la base de titres (~4000 entrées)
node scripts/build-tu-dataset.js --limit 50    # essai rapide
node scripts/build-tu-dataset.js --refresh     # ignore le cache local
node scripts/build-tu-dataset.js --delay 500   # plus prudent sur le réseau
```

| Option | Défaut | Rôle |
|---|---|---|
| `--limit N` | 0 (toutes) | ne traiter que les N premiers titres |
| `--delay ms` | 350 | délai entre deux requêtes |
| `--refresh` | — | réinterroger même ce qui est en cache |
| `--max-failures N` | 15 | s'arrêter après N échecs consécutifs |

**La collecte est reprenable.** Chaque réponse brute est mise en cache dans `data/.tu-cache/<TITLEID>.json` (ignoré par git, valable 7 jours). Une collecte interrompue par le réseau, un Ctrl-C ou un blocage temporaire d'IP reprend là où elle s'était arrêtée — relance simplement la même commande. Une seconde exécution complète prend quelques centaines de millisecondes au lieu de plusieurs minutes.

Le collecteur est volontairement peu agressif : délai entre requêtes, User-Agent identifiable, arrêt automatique sur échecs répétés. **Ne le réglez pas à `--delay 0`** : XboxUnity est un service communautaire gratuit, et le marteler le dégrade pour tout le monde.

---

## Utilisation

Le moteur qui consomme ce dataset est `lib/tu.js`. La sélection tient en une idée :

```js
const { parseTuInfo, bestFor, diagnose } = require('./lib/tu');

// à partir d'une réponse XboxUnity brute
const parsed = parseTuInfo(docBrut);

// le MediaID du disque installé (lu dans le XEX, voir lib/mediaid.js)
const best = bestFor(parsed, '6D88AE4F');   // null si aucune TU ne correspond

// ou un verdict complet
diagnose({ parsed, mediaId: '6D88AE4F', installedTuids: [], tuFiles: 0 });
// -> { state: 'update-available', best: {...}, ... }
```

`bestFor` ne renvoie **jamais** la TU d'un autre MediaID. C'est la garantie centrale : mieux vaut ne rien proposer que de faire installer une mise à jour que la console ignorera.

---

## Ce qu'il ne faut PAS en déduire

- **Ce n'est pas une liste de ce qui est installable légalement.** Le dataset décrit des métadonnées publiées par un tiers ; il ne contient aucun fichier de mise à jour et ne dit rien du droit de les utiliser.
- **Un jeu absent du dataset n'a pas forcément zéro TU.** Un titre peut simplement ne pas être publié par XboxUnity, ou ne pas figurer dans la base de titres utilisée comme point de départ.
- **Ce n'est pas un instantané éternel.** De nouvelles TU sortent. Vérifiez `generated` : au-delà de quelques semaines, régénérez.
- **Le même jeu peut avoir plusieurs MediaID.** C'est le comportement normal (éditions, régions, pressages), pas une anomalie. Un disque donné n'en a qu'un.
- **Un MediaID inconnu de XboxUnity ne veut pas dire « pas de TU ».** Cela veut dire « on ne sait pas » — et c'est exactement pour ça que `match` peut valoir `null` plutôt que `false` dans l'API.

---

## Licence et attribution

Le **format et le code** de ce dataset relèvent de la licence MIT du dépôt.

Les **données** sont une agrégation de métadonnées factuelles publiées par XboxUnity. Il est recommandé de les publier sous **CC0** (domaine public) : des identifiants et des numéros de version ne sont pas une œuvre protégeable, et une licence permissive maximise la réutilisation — ce qui est tout l'intérêt de l'exercice.

Si vous réutilisez ce dataset, créditez **XboxUnity** comme source des données. La courtoisie coûte peu et c'est ce qui garde le service en vie.
