# Contribuer

Merci de t'y intéresser. Ce projet gère des bibliothèques de plusieurs centaines
de Go : une régression ne se voit pas toujours tout de suite, et certaines se
paient en fichiers perdus. Quelques règles évitent ça.

## Démarrer

```bash
git clone https://github.com/shinzarou-eng/xbox360-manager.git
cd xbox360-manager
npm run doctor     # dit exactement ce qui manque sur ta machine
npm start          # puis http://localhost:4360
```

Aucune dépendance à installer : le projet utilise uniquement la bibliothèque
standard de Node (>= 18). **Ne pas ajouter de dépendance** sans en discuter
d'abord — c'est un choix assumé, pas un oubli.

## Tests

```bash
npm test           # 154 tests, chargés dans le process courant
npm run check      # syntaxe de server.js
node scripts/doctor.js
```

`npm test` lance `test/run.js`, qui charge les `test/*.test.js` **dans le process
courant**. N'utilise pas `node --test` directement : son runner lance chaque
fichier dans un processus enfant avec stdio en pipe, ce que certains
environnements restreints refusent (EPERM).

Le test de bout en bout du pipeline de tri se lance à part, avec le serveur en
route :

```powershell
powershell -File test\e2e.ps1
```

Il travaille sur des dossiers temporaires et restaure `config.json` **dans tous
les cas** (bloc `finally`). Si tu le modifies, garde cette garantie : il a déjà
écrasé une config réelle une fois.

## Sonde de rendu (uicheck)

`node scripts/uicheck.js <vue> [recherche]` mesure le rendu **réel** dans le
navigateur : marges, débordements, tailles de cellules, contraste, cibles
tactiles. La sonde ne lance jamais de navigateur : elle se connecte à un Chrome
déjà en écoute :

```powershell
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$prof   = "$PWD\.browser-probe\ui"
Start-Process $chrome -ArgumentList ('--remote-debugging-port=9444 --user-data-dir="'+$prof+
  '" --headless=new --no-first-run --no-default-browser-check --disable-gpu about:blank')
node scripts\uicheck.js cat halo
```

Passe les arguments en **une seule chaîne** : un tableau `-ArgumentList @(...)`
fait échouer Chrome en headless. Options : `UICHECK_SIZE=1600x1000`,
`UICHECK_SHOT=shot.png`, `UICHECK_PHONE=1` (émulation tactile + cibles 44 px),
`--modal`, `UICHECK_EVAL=<expr>`.

## Code

- `server.js` : routage HTTP et pipeline. Les helpers purs sont dans `lib/`.
- `public/index.html` : l'interface, un seul fichier. Le `<script>` inline doit
  **compiler** — c'est vérifié par `test/client.test.js`, parce qu'un doublon
  `const` a déjà rendu toute l'interface inerte en silence.
- Ajoute un test dans `test/` pour toute fonction pure que tu extrais : c'est la
  raison d'être du découpage en modules.
- `lib/` n'a le droit de dépendre que de `lib/` et de la stdlib.

### Lisibilité

Le fichier a longtemps été écrit en lignes très denses (jusqu'à 499 caractères).
C'est ce qui rend les bugs invisibles à la relecture. Tiens-toi à ~120
caractères, et découpe plutôt que de compresser.

## Invariants du produit

Ces règles ne sont pas négociables, elles protègent les données de l'utilisateur :

1. **Jamais de déplacement, suppression ou extraction sans confirmation
   explicite.**
2. **Une source n'est supprimée que si son traitement a réussi.** Si un doute
   existe, on conserve — l'utilisateur préfère trier deux fois que perdre un jeu.
3. **Le contenu non pris en charge est conservé**, pas effacé.
4. Une Title Update n'est proposée que si elle correspond au **MediaID du disque
   installé**. Proposer « la dernière version » à l'aveugle bloque les DLC.

## Pièges connus

Ils ont tous coûté du temps. Relis-les avant de toucher aux zones concernées :

| Piège | Réalité |
|---|---|
| `movePath` | `renameSync` échoue en EXDEV entre disques — mais le chemin rapide doit rester un rename, jamais une copie |
| Offsets de package | à `0x344` et `0x360` ce sont des **octets bruts**, pas de l'ASCII |
| `.iso` de Vimm | souvent un **7z renommé**, parfois doublement : toujours renifler par octets magiques |
| `execFile` | peut **lever de façon synchrone** (EPERM/EINVAL) et tuer le process : passer par `spawnSafe` |
| 7-Zip Microsoft Store | alias de 0 octet : `fs.existsSync` rend faux, `spawn` fonctionne |
| Chemin avec apostrophe | casse les handlers inline (`Assassin's Creed`) : utiliser `jsA` |
| Données archive.org | contrôlables par un tiers : `escH`/`escA`/`jsA`, jamais de brut dans `innerHTML` |
| Temps | une TU n'est active que pour **son** MediaID (`XSI+0x14C`) |

## Pull requests

- Un sujet par PR, avec le *pourquoi* dans la description (le *quoi* est dans le diff).
- `npm test` doit passer. Si tu corriges un bug, ajoute le test qui l'aurait attrapé.
- Décris comment tu as vérifié, surtout si tu as touché au pipeline de tri.
- Pas de commit qui mélange un correctif et un reformatage massif.

## Signaler un bug

Ouvre une issue avec la sortie de `npm run doctor` : la moitié des problèmes
viennent d'un outil externe manquant ou d'un disque non branché, et ce rapport
les identifie tout de suite.

**Ne joins jamais ton `config.json` ni ton `secrets.json`** : ils contiennent ton
cookie de session archive.org.
