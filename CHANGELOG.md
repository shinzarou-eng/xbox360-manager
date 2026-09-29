# Changelog

Toutes les modifications notables de ce projet.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) · versionnage [SemVer](https://semver.org/lang/fr/).

## [1.4.0] — 2026-09-19

L'application pilote la console **et** sait où poser ce qu'elle y envoie. Un
client FTP écrit à la main — toujours zéro dépendance — relie Aurora, FSD ou
Dashlaunch depuis le PC, et le reste de l'application décrit ce qu'elle observe
au lieu de le supposer.

### Console (FTP)

- **Connexion à la console** : adresse, port, utilisateur, mot de passe. Les
  capacités négociées sont affichées (`UNIX Type: L8 · MLSD · UTF-8`), parce que
  c'est ce qui explique une commande refusée.
- **Explorateur à deux panneaux** : la console d'un côté, ce que le PC peut lui
  envoyer de l'autre.
- **Comparaison** : ce que le PC possède et que la console n'a pas.
- Le mot de passe va dans `secrets.json`, jamais dans `config.json` —
  `publicCfg()` n'expose que `hasFtpPass`.

### Le client FTP

Écrit sur `net`, il gère ce qu'aucune bibliothèque générale ne couvre :

- **Bannière sur plusieurs lignes** (`220-` puis `220`). Un client qui n'en lit
  qu'une se désynchronise pour toute la session.
- **EPSV puis PASV**, et une réponse PASV dont l'adresse est inutilisable
  (console derrière un NAT) : on garde l'hôte du canal de contrôle.
- **MLSD puis LIST**, avec les trois formats réellement rencontrés : MLSD, Unix
  et DOS.
- `OPTS UTF8 ON`, `TYPE I` avant chaque transfert (sans quoi les fins de ligne
  sont traduites et le fichier corrompu).

### File de transferts : un seul à la fois

**Deux envois lancés en même temps écrasaient tout.** Mesuré : `A/f0.bin`
CORROMPU, neuf fichiers MANQUANTS, **zéro intact** — le client a une file de
réponses FIFO partagée et stocke la connexion passive dans un champ d'instance,
donc le second `PASV` remplace la cible du premier.

- File séquentielle, position affichée (« EN ATTENTE · 2/3 »), annulation de ce
  qui n'a pas commencé. Un `STOR` engagé ne s'abandonne pas proprement : on le
  dit au lieu de laisser un fichier partiel sur la console.
- **Chaque envoi est vérifié par la somme de contrôle de la console** (XCRC).
  Le code `226` dit que le serveur a fini d'écrire, pas que les octets sont bons.

### Ce à quoi sert chaque disque

- **Rôles** : jeux, dépôt, contenu, homebrew, émulateurs, Aurora, système. Le
  sélecteur affiche `E — Aurora` au lieu de `E`.
- **Le piège FAT32 est dit AVANT** : un disque FAT32 refuse tout fichier de plus
  de 4 Go, et une image Xbox 360 en fait 7 à 8. L'application connaissait la
  limite mais ne l'annonçait qu'à l'échec, sous la forme trompeuse « Disque
  plein ».
- **Un rôle sur un disque absent se voit** : sans cela, le disque débranché
  disparaît de la liste et l'application cherche encore ses jeux sur un disque
  qui n'est plus là. « Disque débranché » et « chemin disparu » sont distingués —
  ils ne se réparent pas pareil.

### Choisir ses dossiers au lieu de les taper

`GET /api/fs` parcourt le disque local et **reconnaît** chaque dossier : disque
Xbox, dossier de jeux (par TitleID), contenu, Aurora, dépôt, homebrew, jeu
extrait, vide. On choisit ce qu'on voit plutôt qu'un chemin qu'on espère.

### Quatre langues

Français, anglais, **espagnol, portugais**. 518 chaînes, 100 % couvertes.

- Dictionnaires indexés sur l'anglais, qui sert de pivot : les 568 appels `T()`
  du code restent tels quels. Une chaîne non traduite retombe sur l'**anglais**,
  pas sur le français — quelqu'un qui lit l'espagnol comprend mieux l'anglais.
- Menu au **survol et au focus** : à la manette il n'y a pas de survol.

### Journal d'Aurora, lu par FTP

Le guide conseille de télécharger `Aurora.log` et d'y chercher `ERROR`. La
session FTP est déjà ouverte : l'application le fait, **regroupe** les répétitions
(93 lignes → 4 problèmes) et rend des pistes concrètes.

### Plugins Aurora

Compatibilité selon le guide, qui se réfère à Aurora 0.7b.2. **Ce que le guide ne
dit pas, on ne le dit pas** : sa table « non fonctionnels » est vide, donc un
plugin absent est NON TESTÉ, jamais « cassé ». La **procédure de sortie** est
fournie : un plugin incompatible fige Aurora au démarrage, et on s'en sort par
FTP.

### Émulateurs

**Un émulateur sans son dossier de ROMs démarre sur une liste vide** — le cas qui
fait croire à une panne. Le diagnostic nomme le dossier exact à créer. Le BIOS
PS1 est annoncé dès qu'un émulateur PS1 est installé.

### Jeux Xbox 1

La 360 ne les lit pas nativement : un émulateur (« XeFu ») doit être installé
dans une **partition à part**, `HddX`. Sans la partition, il faut le *HDD
Compatibility Partition Fixer*, qui se lance **sur la console**. Un jeu est un
dossier avec `default.xbe` — **jamais** `default.xex`, qui est un jeu Xbox 360.

### L'assistant : des verbes, pas des noms

Ses boutons portaient des noms (`SANTE`, `DOUBLONS`) et ses titres du jargon
(`TU incompatible`), sans jamais dire quoi faire. Désormais : `VÉRIFIER`,
`INSTALLER LA vN`, un titre en clair, un détail qui donne le **remède**, et la
sévérité lisible au bord.

### Sécurité

- **Le serveur n'écoute que `127.0.0.1`.** `server.listen(PORT)` sans hôte fait
  écouter Node sur toutes les interfaces : l'application était joignable depuis le
  réseau local, alors qu'elle expose la suppression de fichiers et la lecture du
  disque. `X360_HOST` rouvre l'accès en connaissance de cause.
- `/api/ftp/download` n'accepte qu'une destination dans les dossiers de
  l'application.

### Tests (376, +135)

- `test/aide-ftp.js` : un serveur FTP **en process**. Un client de protocole ne se
  teste pas contre une vraie console — on ne peut ni choisir le format des listes,
  ni provoquer un refus. La doublure sert aussi de **fausse console**.
- Quatre garde-fous **mutation-vérifiés** : cohérence du style, traductions,
  taille des icônes rendues, écoute locale.
- `scripts/verif-transferts.js` et `scripts/verif-journal.js` : bout en bout par
  l'API, sans console.

Bugs réels trouvés par ces tests, tous invisibles à l'œil :

- deux envois simultanés corrompaient les fichiers ;
- l'icône d'une ligne de transfert n'avait pas de taille : la ligne faisait
  **200 px** de haut avec des flèches géantes ;
- `<use href="#i-check">` vers un symbole absent ne produit **aucune erreur** : un
  carré vide, silencieusement ;
- `class="btn accent" class="ck-auto"` — deux attributs `class`, le second est
  ignoré ;
- une installation incomplète affichait **« INCOMPLÈTE » et « tout est en place »**
  dans la même liste.

### Archive

`npm run release` produit `dist/xbox360-manager-1.4.0.zip` — 2,3 Mo, 100 fichiers.
Le script refuse de produire quoi que ce soit s'il détecte `config.json`,
`secrets.json` ou une donnée personnelle.

## [1.3.0] — 2026-09-19

Refonte du Catalogue et de la zone Téléchargements. Ces deux vues ne disaient pas
ce qu'elles faisaient : comptes sans référentiel, en-têtes sans intitulé, filtres
qui ne montraient pas qu'ils s'excluaient, sections vides affichées en permanence.

### Catalogue

- **Le compte ne voulait rien dire.** Le serveur s'arrêtait à 300 titres sans le
  dire, et l'écran affichait « 300 affichés ». Impossible de distinguer une
  recherche qui a trouvé d'une liste tronquée. `/api/catalog` renvoie désormais
  `{items, total, cap}` : le statut dit « 300 titres sur 3 079 — affine la
  recherche pour voir le reste ».
- **Aucun tri.** Sélecteur Nom / TitleID / Type. Le tri ignore la ponctuation de
  tête : les titres XboxUnity commençant par « [eM] » remontaient tous en première
  page et le catalogue ne ressemblait plus à un catalogue.
- **Le catalogue ne disait pas ce qu'on possède déjà.** Badge `INSTALLÉ`, calculé
  sur la bibliothèque scannée (le cache de scan, pas un nouveau parcours disque).
- **Colonnes sans intitulé.** La première (`jaquette`) et la dernière (`action`)
  n'avaient pas d'en-tête. La jaquette est passée **dans** la cellule du titre,
  comme dans un ListView Fluent ; les actions ont un intitulé.
- **Filtres qui ne disaient pas qu'ils s'excluaient.** Quatre boutons discrets
  remplacés par un contrôle segmenté.
- **Barre de recherche à largeur fixe** (340 px, quelle que soit la fenêtre) :
  elle prend maintenant la place restante.
- **Aucun état de chargement, d'erreur ou de vide.** Squelettes pendant la
  requête, état vide avec une issue (« Effacer la recherche »), message dédié si
  la base est injoignable. Une frappe plus récente annule la réponse précédente
  au lieu de l'écraser avec un résultat périmé.

### Téléchargements

- **Quatre tuiles de source pour un choix qu'on fait une fois** occupaient toute
  une bande d'écran. Remplacées par un contrôle segmenté avec, en dessous, une
  ligne qui dit ce que la source choisie fait réellement — « Vimm » et
  « Archive.org » étaient deux mots opaques pour qui ne connaît pas les sites.
- **Le bloc de recherche mélangeait deux tâches sans rapport** : le lien direct et
  l'import étaient sur la même ligne, à côté de la recherche. Déplacés dans une
  section repliable « Autres moyens d'ajouter un fichier ».
- **Sections vides affichées en permanence.** « RÉSULTATS », « FICHIERS » et
  « LOG » apparaissaient avant toute recherche, et repoussaient la file d'attente
  sous des tableaux vides. Une section n'apparaît plus que si elle a un contenu ;
  le journal est replié.
- **File d'attente vide** : le cadre en pointillés au milieu de sections vides est
  devenu un état vide qui dit quoi faire.
- Les en-têtes annoncent ce qu'ils contiennent : « Taille / version », « Action ».

### Garde-fous ajoutés

- **Structure HTML** : un `<div>` non fermé ne provoque aucune erreur — le
  navigateur referme à sa façon et le document se retrouve imbriqué au mauvais
  endroit. La page s'affiche, simplement pas comme prévu. Aucun test ne le voyait.
  Le test vérifie l'équilibre et l'imbrication de toutes les balises.
- **Cohérence en-tête / lignes de tableau** : un `<td>` de trop ajoute une colonne
  fantôme et décale les données, sans erreur. Le test associe explicitement chaque
  constructeur de lignes à son `<tbody>` et compare aux en-têtes (les lignes de
  remplissage sont comptées par `colspan`).
- **`scripts/uicheck.js`** : sonde de **rendu**. Elle ouvre l'app dans un vrai
  navigateur via CDP (`Runtime.evaluate`, jamais `Page.enable` — cet appel fait
  planter le moteur dans cet environnement) et rapporte des faits mesurés :
  égalité des marges de la colonne de lecture, débordements horizontaux, largeur
  réelle des colonnes, cellules par ligne, contraste composé sur le fond réel,
  alignement des bords gauches. Sans `--launch`, elle ne lance rien : elle se
  connecte à un navigateur déjà en écoute sur le port 9444, pour ne jamais ouvrir
  de boîte « Erreur d'application » sur le bureau.

## [1.2.0] — 2026-09-19

Interface, extensibilité et distribution. Le projet passe d'un outil qui marche à
un outil sur lequel d'autres peuvent bâtir.

### Interface

- **Le texte secondaire échouait au contraste WCAG.** `--dim2` valait `#6e7681`,
  soit **4,12:1** sur le fond — sous le seuil AA de 4,5:1 — alors qu'il porte du
  texte réel à 10-11 px (identifiants, pastilles, libellés de section). Passé à
  `#7d8590` (5,09:1), et `--dim` à `#9aa4b0` (7,51:1) pour préserver la hiérarchie.
- **Aucun repli sur fenêtre étroite.** Zéro requête de média : sous ~1080 px, la
  barre d'onglets et les contrôles de droite se chevauchaient. Deux paliers
  ajoutés (1180 px, 820 px) qui font céder les icônes avant les libellés.
- **Aucun respect de `prefers-reduced-motion`** alors que l'interface bouge
  beaucoup (fanart flouté, reflets sous les jaquettes, survols, panneau latéral).
  Les transitions sont neutralisées, pas supprimées.
- **Fenêtre inaccessible au clavier.** Une quinzaine d'éléments interactifs
  étaient des `<div onclick>` : ni atteignables au Tab, ni actionnables.
  Désormais focusables, avec Entrée et Espace qui déclenchent l'action. Les
  lignes de tableau reçoivent `tabindex` mais **pas** `role="button"` — cela les
  sortirait de la structure du tableau pour un lecteur d'écran.
- **Échelle typographique.** 15 tailles distinctes (8, 9, 10, … 40 px) : aucune
  hiérarchie lisible. Six marches, et plus rien sous 10 px.
- Hauteur de ligne globale (le texte courant héritait du ~1.2 du navigateur),
  échelle d'espacement en base 4, rayons et durées en variables.

### Fluidité

- **La bibliothèque scintillait en permanence.** `renderGames()` remplaçait tout
  le `innerHTML` de la grille à chaque appel — et il est appelé à chaque sondage
  des Title Updates, toutes les 8 secondes. Les jaquettes étaient donc recréées
  en boucle et leur animation d'apparition se rejouait. Une signature du contenu
  affiché évite maintenant toute reconstruction inutile.
- **Le flou était empilé pour rien.** Le fond est un fanart **déjà flouté**, sur
  lequel une douzaine de panneaux ajoutaient leur propre `backdrop-filter` :
  invisible à l'œil, une passe de composition chacun. Il n'en reste que sur les
  barres et les modales, où l'effet se voit vraiment.
- Flou du fanart ramené de 60 à 44 px, agrandissement de 35 % à 30 %.

### Distribution

- `scripts/build-release.ps1` produit une archive portable de 189 Ko, avec une
  **liste blanche** de fichiers et un **refus de produire** si une donnée
  personnelle (cookie de session compris) y entre.
- Workflow de release qui **extrait l'archive et la reteste** avant publication.

### Extensibilité

- `lib/sources.js` : les sources de contenu sont des fichiers autonomes. Le
  chargement est défensif — une source cassée est signalée et ignorée, jamais
  fatale. `docs/PLUGINS.md` documente le contrat.
- `lib/platform.js` : la couche système est isolée. Sous Linux, la détection des
  systèmes de fichiers lit `/proc/mounts`, sans aucun processus externe.
- `lib/tu.js` + `docs/DATASET.md` : le moteur MediaID→Title Update est extrait et
  testable, et la table publiée en données ouvertes.
- `node server.js --selftest` : charge tout le serveur sans ouvrir le port. La CI
  l'exécute, car `node --check` ne voit pas une erreur survenant au chargement.

## [1.1.0] — 2026-09-19

Audit complet du serveur et du client, après une première phase de tests.

### Corrigé — pertes de données

- **`movePath` faisait une copie complète au lieu d'un rename.** La fonction
  s'appelait elle-même au lieu d'appeler `fs.renameSync` : récursion jusqu'au
  stack overflow, puis repli silencieux sur copie+suppression. **Tout**
  déplacement (GOD, ISO, archives, fusion de dossiers) recopiait l'intégralité
  des octets, même sur le même disque — 13 Go écrits puis effacés au lieu d'un
  rename instantané. Régression introduite en 1.0.0.
- **Un dossier du dépôt était supprimé même si son contenu avait échoué.**
  Un dossier contenant `game.iso` + `cover.png` dont l'extraction échouait était
  effacé récursivement, alors que le journal annonçait « source conservée ».
  `processItem` retourne désormais un booléen, et la suppression passe par
  `rmdirSync`, qui refuse un dossier non vide.
- **La source d'un téléchargement était supprimée alors qu'un paquet avait
  échoué** : un simple disque plein suffisait à perdre un jeu, avec un badge
  « Installé ».
- **La purge de `tu_installed.json` visait le mauvais dossier** et comparait les
  tuids par sous-chaîne.

### Corrigé — sécurité

- **XSS par données distantes.** Les titres d'items et noms de fichiers
  archive.org — créés par n'importe qui — étaient injectés bruts dans
  `innerHTML`, ainsi que les résultats XboxUnity. Un titre contenant
  `<img src=x onerror=...>` s'exécutait à l'ouverture du modal, dans une page
  ayant accès à l'API locale complète (suppression, déplacement, installation).
  Trois échappeurs désormais appliqués partout : `escH` (texte), `escA`
  (attribut), `jsA` (littéral JS dans un handler).
- **`esc()` n'échappait que l'apostrophe** et servait dans des attributs
  `title="..."` : un guillemet dans un nom de fichier fermait l'attribut.
  Fonction supprimée.
- **`/api/content/delete` acceptait la racine `Content` elle-même** et ses
  voisins (`..._backup`) : un POST suffisait à effacer tout le contenu de la
  console. Préfixe strict avec séparateur.
- **Le cookie de session archive.org vivait en clair dans `config.json`** — le
  fichier qu'on partage pour demander de l'aide — et `GET /api/config` le
  renvoyait à la page, donc à n'importe quel XSS. Il vit maintenant dans
  `secrets.json` (ignoré par git, chmod 600) et n'est jamais renvoyé au
  navigateur. Migration automatique.

### Corrigé — blocages et erreurs silencieuses

- **`execFile` peut lever de façon synchrone** (EPERM selon la politique locale,
  EINVAL sur un binaire absent). Le throw ne passe pas par le callback `error`
  et tuait le process, qui n'installe aucun `uncaughtException` : le serveur
  refusait de démarrer. Tout passe par `spawnSafe()`.
- **Un `execFileSync` dans le pipeline gelait l'application entière** — UI *et*
  téléchargements en cours — pendant une extraction ISO (timeout 600 s), une
  conversion ISO→GOD (3600 s), une décompression 7z (900 s) ou la copie d'un
  GOD de 13 Go. Pipeline passé en asynchrone.
- **`body()` appelait son callback deux fois** et avalait l'exception réelle du
  handler : erreurs mensongères, et crash du process quand `saveCfg` ou
  `runSort` jetait à son tour.
- **Aucun timeout sur les requêtes sortantes** (le défaut Node vaut 0, donc
  infini) : un serveur distant qui acceptait la connexion puis se taisait
  laissait la requête HTTP pendante pour toujours. 15 s et borne de redirection.
- **Le verrou `sorting` n'avait pas de propriétaire** : trois producteurs le
  partageaient et une installation qui se terminait pendant un tri relâchait le
  verrou du tri, laissant deux pipelines déplacer les mêmes fichiers.
- **Un seul `.dlctmp` partagé** par toutes les installations : avec 3
  téléchargements parallèles, l'un détruisait le dossier temporaire de l'autre
  en pleine extraction. Un temporaire par installation.
- **La base MediaID/TU se construisait dans le handler HTTP** (scan des `.data`
  par blocs de 8 Mo) : `/api/mycontent` mettait 8,6 s pour 16 jeux, et cela
  grandit linéairement. Cache seul dans la réponse, calcul en tâche de fond.
- **Boutons morts sans aucun message** : un chemin contenant une apostrophe
  (`Assassin's Creed`) rendait le handler inline invalide — OUVRIR et le
  double-clic ne faisaient rien.
- **Onglets définitivement vides** : les drapeaux `*Loaded` étaient posés avant
  l'`await`, donc un premier échec réseau empêchait tout rechargement.
- **Pollings sans fin** quand XboxUnity est injoignable (`tuCheck` toutes les
  8 s à vie avec reconstruction complète de la grille, advisor toutes les 12 s).
- **Repli dangereux sur une TU incompatible** : quand aucune TU ne correspondait
  au MediaID du disque, l'UI en proposait une autre en l'étiquetant « meilleure
  version pour ton disque » — la console l'ignore et les DLC restent bloqués.

### Ajouté

- `lib/` : `fsutil`, `pkg`, `mediaid`, `doctor` — les fonctions pures sorties du
  monolithe, donc testables.
- **61 tests** (`npm test`) — 154 depuis l'ajout du moteur MediaID→TU, du
  registre de sources et de la couche système. Parmi eux : un garde-fou qui
  refuse toute copie quand un
  rename suffit, un test du chevauchement de blocs de 8 Mo pour la lecture
  MediaID, et un test qui vérifie que le `<script>` de l'UI **compile** — un
  doublon `const` le rendait entièrement inerte sans erreur côté serveur.
- `test/e2e.ps1` : test de bout en bout du tri sur dossiers temporaires (dossier
  non reconnu conservé, GOD rangé au bon endroit, ISO en échec conservé, serveur
  réactif pendant le tri).
- `npm run doctor` : diagnostic d'environnement (Node, 7-Zip, iso2god, exiso,
  xextool, base de titres, dossiers configurés), avec une piste pour chaque
  point manquant. Distingue ce qui **bloque** de ce qui **dégrade**.
- `lib/doctor.js`, `scripts/doctor.js`, CI GitHub Actions (Windows + Linux,
  Node 18/20/22), `CHANGELOG.md`, `CONTRIBUTING.md`, `.editorconfig`.

### Notes

- Le diagnostic a révélé un piège réel : 7-Zip installé depuis le Microsoft
  Store (l'installation par défaut sur Windows 11) est un alias de 0 octet sur
  lequel `fs.existsSync` rend **faux** alors que `spawn` l'exécute très bien.
  La détection traite donc `EACCES` comme « présent ».
- `movePath` (repli `cpSync` cross-disque) et `copyDir` restent synchrones :
  déplacer plusieurs Go bloque encore la boucle d'événements. Connu, non corrigé.

## [1.0.0]

Première version : scan de bibliothèque (GOD, XBLA, jeux extraits, ISO),
organisation sécurisée du dépôt, DLC et Title Updates avec correspondance
MediaID, catalogue archive.org et Vimm's Vault, boutique homebrew, assistant
d'analyse.
