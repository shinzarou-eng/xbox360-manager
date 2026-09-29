---
name: Rapport de bug
about: Quelque chose ne fonctionne pas comme prévu
title: ''
labels: bug
assignees: ''
---

## Diagnostic

Colle ici la sortie de :

```
npm run doctor
```

Elle identifie d'elle-même la moitié des causes (outil externe manquant, disque
non branché, dossier en lecture seule).

```
(sortie de npm run doctor)
```

## Ce qui se passe

Décris le comportement observé, puis ce que tu attendais.

## Étapes de reproduction

1.
2.
3.

## Contexte

- Système : <!-- Windows 11 / autre -->
- Version de Node : <!-- node --version -->
- Format de la bibliothèque : <!-- GOD / XBLA / jeux extraits / ISO -->
- Disque : <!-- NTFS / exFAT / FAT32 -->

## Journal

Si le problème touche le tri ou l'installation, joins les dernières lignes de
l'onglet **Téléchargements** ou de `/api/sortlog`.

## Vérifications

- [ ] J'ai relancé le serveur après avoir modifié `config.json`
- [ ] Le problème se reproduit sur une bibliothèque fraîchement scannée

> **Ne joins jamais `config.json` ni `secrets.json`** : ils contiennent ton
> cookie de session archive.org. Colle uniquement les chemins de dossiers si
> c'est pertinent.
