# Coquille WPF — fenêtre Windows de Xbox 360 Manager

Cette coquille **héberge** l'interface existante : ce n'est pas une réécriture en
XAML. Elle ouvre une fenêtre sans barre d'adresse, avec une icône dans la barre
des tâches, et elle **trouve ou lance** le serveur Node de l'application.

## Compiler

```powershell
dotnet build desktop\XboxManager.sln -m:1 -nr:false
```

> [!IMPORTANT]
> **`-m:1 -nr:false` n'est pas un ornement.** Mesuré le 2026-09-21 : une
> construction **multi-projets** échoue dans cet environnement avec
> « ÉCHEC de la build. 0 Avertissement(s) 0 Erreur(s) » — **aucun diagnostic**,
> et un code de sortie 1 — parce qu'MSBuild répartit les projets sur des nœuds de
> travail qui communiquent par **pipes nommés**, refusés ici (même cause que
> Chromium et WebView2). En construction à un seul nœud et sans réutilisation de
> nœuds, les vrais messages apparaissent. C'est ce commutateur qui a révélé, entre
> autres, une référence de projet manquante.
>
> Dans un terminal ordinaire (hors bac à sable), `dotnet build desktop\XboxManager.sln`
> fonctionne — le commutateur ne coûte que quelques secondes.

Aucun paquet n'est téléchargé : `Microsoft.Web.WebView2` est **figé** à la version
présente dans le cache NuGet local (`1.0.4191.47`). NuGet.org n'est pas joignable
depuis `dotnet` sur cette machine (mesuré : « The SSL connection could not be
established »), donc `dotnet build` affiche des avertissements `NU1900`
(« données de vulnérabilité indisponibles ») : **c'est normal, ce n'est pas une
erreur.** Changer la version de WebView2 demande une machine qui atteint
NuGet.org.

## Les tests du cœur

```powershell
dotnet run --project desktop\XboxManager.Coeur.Tests
```

Affiche `n/n` et sort en code 0 — ou 1 dès qu'un test échoue. **Pas de cadre de
test** (`xunit`, `MSTest`, `Microsoft.NET.Test.Sdk` ne sont pas dans le cache
NuGet local et NuGet.org est injoignable depuis `dotnet`) : c'est le même choix
que `test/run.js` côté Node plutôt que `node --test`. Toute la logique décidable —
sonde, décision, racine de l'application, recherche de Node — vit dans
`XboxManager.Coeur`, une bibliothèque **sans WPF**, donc testable sans fenêtre ni
réseau.

## Lancer

```powershell
dotnet run --project desktop\XboxManager
```

Node doit être installé (`node --version`). La coquille le cherche dans le `PATH`,
puis dans `runtime\node\node.exe`. Sur la machine de référence il est en
`C:\nvm4w\nodejs\node.exe` — **nvm4w change de version**, c'est pourquoi aucun
chemin n'est écrit en dur.

**Aucun fichier de l'application n'est copié** : les données (`config.json`,
`secrets.json`, `covers\`, `dl\`) restent à côté du code de l'application.

### Les arguments

| Argument | Effet |
|---|---|
| *(aucun)* | ouvre l'application — et **trouve ou lance** son serveur |
| `--test-glissement` | ouvre la fenêtre de **mesure** du glissement (spec §4.6). Charge une page en mémoire : **ne touche pas au port 4360**, donc c'est le seul mode qu'un agent peut lancer |
| `--auto-fermer <s>` | ferme la fenêtre toute seule après `s` secondes (vérification sans clic) |
| `--arriere-plan` | **ne montre pas** la fenêtre : l'icône de notification est alors le seul moyen de la rappeler (c'est le mode du démarrage automatique) |

**Instance unique** : une seconde exécution ne fait pas un doublon, elle ramène la
fenêtre existante au premier plan. Vérifié par deux lancements concurrents — le
second sort en code 0 et écrit au journal
`une instance tourne deja : on la ramene au premier plan`.

## Le raccourci (ce qui tient lieu d'« installation »)

```powershell
powershell -ExecutionPolicy Bypass -File desktop\Installer.ps1
powershell -ExecutionPolicy Bypass -File desktop\Installer.ps1 -Retirer
```

Le raccourci va dans le **Menu Démarrer de l'utilisateur**
(`%APPDATA%\Microsoft\Windows\Start Menu\Programs`) : **aucun administrateur
requis**, et **aucun fichier n'est copié**. Il vise l'exécutable là où il est
compilé, donc les données (`config.json`, `secrets.json`, `covers\`, `dl\`)
restent à côté du code de l'application — c'est la décision (a) du 2026-09-20.

`-Dossier <chemin>` pose le même raccourci ailleurs (par exemple le Bureau, avec
`[Environment]::GetFolderPath('Desktop')`), et `-Nom` change son nom.

**Ce qu'il ne fait pas, et c'est assumé** : aucune entrée dans « Programmes et
fonctionnalités », donc rien à désinstaller — voir plus bas. Un vrai installateur
exigerait d'abord de déménager les données vers `%APPDATA%`, parce que
`C:\Program Files` n'est pas inscriptible par l'application.

Vérifié : le raccourci est créé avec la bonne cible, le bon dossier de travail et
la bonne icône, puis retiré. **Non vérifiable par un agent** : le raccourci posé
dans le **vrai** Menu Démarrer — `%APPDATA%` est hors de l'espace de travail, donc
l'écriture y est refusée (mesuré : `UnauthorizedAccessException`). C'est un
lancement par l'utilisateur qui le vérifie.

## L'icône

`desktop\assets\icone.ico` — **six tailles** (16, 24, 32, 48, 64, 256) dans un seul
fichier : Windows prend celle qu'il lui faut, au lieu de réduire une image de
256 px (molle à 16 px dans la barre des tâches, illisible à 20 px dans le menu
Démarrer).

Elle **reprend la marque de la page** (`public/index.html`, `<svg class="xlogo">`) :
la fenêtre, la barre des tâches et l'onglet du navigateur montrent la même chose.
Rien n'est dessiné à la main.

Pour la refabriquer après un changement de marque :

```powershell
node .browser-probe/ztm-icone-extrait.js     # extrait le SVG de la page -> planche.html
node .browser-probe/ztm-icone-raster.js      # six PNG par CDP (navigateur de debug sur 9444)
node desktop\assets\ico.js desktop\assets\icone.ico .browser-probe\icone\marque-*.png
```

**Pourquoi par CDP et pas `chrome --headless --screenshot`** : un Chrome lancé
depuis cet environnement meurt sur
`FATAL:mojo\public\cpp\platform\platform_channel.cc: Acces refuse (0x5)` — il a
besoin de pipes nommés, refusés ici. Le navigateur qui écoute déjà sur 9444 a été
lancé hors bac à sable : on s'y connecte.

`desktop\assets\ico.js` empaquette des PNG en `.ico` **sans aucune dépendance**
(le format accepte des PNG tels quels depuis Vista) et lit la taille de chaque
image **dans son en-tête IHDR**, jamais dans son nom. Le `.csproj` copie l'icône
**à côté de l'exécutable** : `ApplicationIcon` ne l'inscrit que dans les ressources
de l'exe, alors que la zone de notification lit un **fichier**.

## Le journal

`desktop\XboxManager\bin\<configuration>\net10.0-windows\coquille.log`

Une ligne par événement, à côté de l'exécutable — **pas dans `%LOCALAPPDATA%`** :
la règle du projet est que rien de l'application ne s'écrit hors de son dossier, et
mesure faite, `%LOCALAPPDATA%` est **inécriptible** dans un contexte restreint (le
journal disparaîtrait en silence). C'est le premier fichier à lire quand « la
fenêtre est blanche ».

## Mesure du glissement — à faire UNE fois, à la main

Sur une fenêtre sans bordure dont le contenu est un WebView2, faire glisser la
fenêtre a deux solutions connues, et **aucune n'est parfaite**. On ne peut pas
savoir laquelle se comporte le mieux sans compiler et essayer :

```powershell
dotnet run --project desktop\XboxManager -- --test-glissement
```

La fenêtre porte deux bandes : **A** déplace la fenêtre par la page
(`-webkit-app-region: drag`), **B** par le C# (`DragMove()`), et une zone témoin
`no-drag` qui ne doit **rien** déplacer.

| | La fenêtre bouge ? | Le témoin `no-drag` reste immobile ? | Snap Layouts (survol du bouton Agrandir, et `Win`+flèche) ? |
|---|---|---|---|
| A — `-webkit-app-region: drag` | | | |
| B — `DragMove()` | | | |

Défauts connus, à vérifier plutôt qu'à supposer : A gèlerait les Snap Layouts ;
B bloquerait le fil JavaScript jusqu'au relâchement.

Date : …  ·  Windows : `winver` → …  ·  Verdict retenu : …

**Tant que ce tableau n'est pas rempli, le glissement de la fenêtre définitive
n'est pas décidé** — la Task 4 du plan s'appuie sur ce verdict.

## Liste de contrôle — à la main

Ce qu'un agent ne peut PAS vérifier (voir « Ce que l'agent peut vérifier » plus
bas) :

- [ ] La fenêtre s'ouvre sans barre d'adresse ni onglets, et l'en-tête de
      l'application **EST** la barre de titre.
- [ ] Le glissement fonctionne, et la zone des contrôles (onglets, sélecteur de
      disque, bouton de langue) ne déplace **pas** la fenêtre.
- [ ] Les trois boutons de légende : réduire, agrandir/restaurer (le glyphe
      change), fermer.
- [ ] Le Mica est présent sur Windows 11 — ou le repli **est écrit** à l'écran sur
      Windows 10.
- [ ] Une seconde exécution ramène la fenêtre au premier plan, sans doublon.
- [ ] L'icône de notification : afficher/masquer la fenêtre, puis quitter.
- [ ] À la fermeture, le serveur lancé **par la coquille** s'arrête — et un
      serveur trouvé déjà en route **ne s'arrête pas**.
- [ ] Le raccourci du Menu Démarrer ouvre l'application (`Installer.ps1`).
- [ ] La case « Démarrer avec Windows » (panneau DOSSIERS) : cochée, l'application
      s'ouvre à la connexion suivante **sans montrer sa fenêtre** ; décochée, la
      valeur disparaît du registre :
      `reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v XboxManager`

## Ce que l'agent peut vérifier, et ce qu'il ne peut pas

**Peut vérifier seul :** la compilation, le harnais C#
(`dotnet run --project desktop\XboxManager.Coeur.Tests`), le fait que la fenêtre
s'ouvre et se ferme proprement (`--auto-fermer <s>`), et le journal.

**NE PEUT PAS vérifier deux choses, mesurées :**

1. **WebView2 ne démarre pas dans un contexte restreint.** Le moteur de rendu est
   un processus Chromium séparé, qui a besoin de **pipes nommés** ; là où ils sont
   refusés, l'initialisation échoue sur `0x8000FFFF (E_UNEXPECTED)`. La coquille
   le dit alors **dans la fenêtre** et l'écrit au journal — elle ne plante pas :
   ```
   demarrage : --test-glissement --auto-fermer 3
   fenetre affichee : Glissement
   mesure du glissement : WebView2 INDISPONIBLE — Défaillance irrémédiable (0x8000FFFF (E_UNEXPECTED))
   ```
   Conséquence : `--auto-fermer` prouve que **la fenêtre s'ouvre et que
   l'application se termine proprement**, pas que WebView2 rend l'interface. Cette
   preuve-là demande un lancement par l'utilisateur, hors bac à sable.
2. **Lancer la coquille démarre le serveur de l'application** (port 4360). Ce
   démarrage est réservé au propriétaire de la machine : un serveur lancé sous le
   processus d'un agent meurt avec lui. Donc tout ce qui exige un clic — le
   glissement, les Snap Layouts, le Mica, l'icône de notification — se vérifie par
   la liste de contrôle ci-dessus, et jamais par un agent.

> **`--test-glissement` est le SEUL mode qu'un agent peut lancer** : il charge une
> page en mémoire et ne touche pas au port 4360. Tout autre lancement démarre le
> serveur.

## Mica : ce qui a changé, et pourquoi

La conception prévoyait `Window.BackdropType = Mica` (« WPF .NET 9+ »).
**Mesure du 2026-09-21 sur le SDK 10.0.401 : cette API n'existe pas** — ni la
propriété sur `Window`, ni le type `System.Windows.Media.BackdropType` (erreurs
`CS0103` et `CS0234`). L'effet est donc obtenu par **DWM** (`Native.cs` :
`DWMWA_SYSTEMBACKDROP_TYPE`, plus `DWMWA_WINDOW_CORNER_PREFERENCE` pour les coins
arrondis de Windows 11, et la barre de titre sombre). Si DWM refuse — Windows 10 —
la coquille **le dit dans la fenêtre** et au journal.

Trois appels d'interop utilisent `DllImport` et non `LibraryImport` : le
générateur de `LibraryImport` produit du code `unsafe`, donc il exige
`<AllowUnsafeBlocks>true</AllowUnsafeBlocks>` (mesuré : six erreurs `CS0227`) —
un commutateur de compilation de plus pour trois appels ne se justifie pas.

**Ce que le Mica de DWM ne fait PAS ici** : la page remplit toute la fenêtre et
elle est opaque, donc le matériau peint par DWM n'est pas visible — c'est le fond
de **la page** qui donne le Mica (elle échantillonne le papier peint du bureau,
`lib/wallpaper.js`). Ce que DWM apporte de visible, ce sont les **coins arrondis**
et la barre de titre sombre. Le dire vaut mieux que de laisser croire à deux Mica.

## Désinstaller

Il n'y a rien à désinstaller, et c'est la contrepartie assumée du choix retenu
(aucune entrée dans « Programmes et fonctionnalités ») :

1. `powershell -ExecutionPolicy Bypass -File desktop\Installer.ps1 -Retirer`
   (retire le raccourci du Menu Démarrer) ;
2. `reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v XboxManager /f`
   si le démarrage automatique a été activé ;
3. supprimer `desktop\XboxManager\bin` et `desktop\XboxManager\obj`.