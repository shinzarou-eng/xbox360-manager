<#
.SYNOPSIS
  Crée (ou retire) le raccourci du Menu Démarrer de l'utilisateur.

.DESCRIPTION
  AUCUN ADMINISTRATEUR, AUCUNE COPIE. Le raccourci vise l'exécutable là où il est
  compilé : les données de l'application (config.json, secrets.json, covers\,
  dl\) restent à côté du code de l'application.

  Un installateur qui copierait tout dans C:\Program Files rendrait ces fichiers
  non inscriptibles — l'application écrit 8 fichiers JSON et 3 dossiers à côté de
  son code (mesuré : 23 chemins, 49 écritures). C'est exactement pourquoi la
  décision (a) du 2026-09-20 a été retenue : un raccourci, pas une installation
  (spec §9).

  Ce que ce script NE fait PAS, et qu'il faut savoir :
    - il ne demande PAS les droits d'administrateur (le Menu Démarrer de
      l'utilisateur est inscriptible par l'utilisateur) ;
    - il n'ajoute AUCUNE entrée dans « Programmes et fonctionnalités » ;
    - il ne démarre RIEN automatiquement : le démarrage automatique est une
      option de l'application, désactivée par défaut (§8.2).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File desktop\Installer.ps1
  powershell -ExecutionPolicy Bypass -File desktop\Installer.ps1 -Retirer
  powershell -ExecutionPolicy Bypass -File desktop\Installer.ps1 -Dossier ([Environment]::GetFolderPath('Desktop'))
#>
param(
  [switch]$Retirer,
  [string]$Exe = '',
  # OU poser le raccourci. Par defaut le Menu Demarrer de l'utilisateur, qui ne
  # demande AUCUN droit d'administrateur. Le parametre sert au Bureau (meme
  # raccourci, autre endroit) et il rend le script VERIFIABLE : un agent ne peut
  # pas ecrire dans %APPDATA%, donc il l'eprouve sur un dossier de travail.
  [string]$Dossier = '',
  [string]$Nom = 'Xbox 360 Manager'
)

$ErrorActionPreference = 'Stop'

if (-not $Exe) {
  $trouve = Get-ChildItem (Join-Path $PSScriptRoot 'XboxManager\bin') -Recurse -Filter 'XboxManager.exe' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $trouve) {
    Write-Host "Executable introuvable. Compilez d'abord :" -ForegroundColor Yellow
    Write-Host "  dotnet build desktop\XboxManager.sln -m:1 -nr:false"
    exit 1
  }
  $Exe = $trouve.FullName
}

if (-not $Dossier) { $Dossier = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs' }
$lien = Join-Path $Dossier ($Nom + '.lnk')

if ($Retirer) {
  if (Test-Path $lien) {
    Remove-Item $lien -Force
    Write-Host "Raccourci retire : $lien"
  } else {
    Write-Host 'Aucun raccourci a retirer.'
  }
  exit 0
}

if (-not (Test-Path $Exe)) {
  Write-Host "L'executable indique n'existe pas : $Exe" -ForegroundColor Red
  exit 1
}

$sh = New-Object -ComObject WScript.Shell
$r = $sh.CreateShortcut($lien)
$r.TargetPath = $Exe
$r.WorkingDirectory = Split-Path -Parent $Exe
$r.IconLocation = $Exe
$r.Description = 'Xbox 360 Manager'
$r.Save()

Write-Host "Raccourci cree : $lien"
Write-Host "Il vise : $Exe"
Write-Host "Aucun fichier n'a ete copie : les donnees restent a cote du code de l'application."
