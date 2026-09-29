<#
.SYNOPSIS
  Construit l'archive portable de Xbox 360 Manager.

.DESCRIPTION
  Assemble dans dist/ un dossier propre contenant uniquement ce qu'il faut pour
  faire tourner l'application, puis le compresse. Le zip produit ne contient
  AUCUNE donnee personnelle : ni config.json, ni secrets.json (cookie de session),
  ni cache, ni jaquettes telechargees.

  Les binaires tiers (7z, iso2god, exiso, xextool) ne sont PAS embarques : leurs
  licences ne le permettent pas forcement, et l'utilisateur les installe ou les
  depose lui-meme. `npm run doctor` les detecte et dit ce qui manque.

.EXAMPLE
  powershell -File scripts\build-release.ps1
  powershell -File scripts\build-release.ps1 -Version 1.1.0
#>
param(
  [string]$Version = '',
  [string]$OutDir = 'dist'
)

$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT

if (-not $Version) {
  $Version = (Get-Content package.json -Raw | ConvertFrom-Json).version
}
$nom = "xbox360-manager-$Version"
$stage = Join-Path $OutDir $nom

Write-Host "Construction de $nom"

# --- fichiers de l'application ---------------------------------------------
# liste explicite plutot qu'un « tout sauf » : un fichier ajoute par erreur dans
# le depot ne doit pas se retrouver dans une archive diffusee publiquement.
$fichiers = @(
  'server.js', 'package.json', 'package-lock.json',
  'README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'config.example.json'
)
$dossiers = @('lib', 'public', 'scripts', 'sources', 'test', 'docs', 'desktop')
# `docs` est indispensable : le README montre neuf captures qui y vivent. Sans
# elles, l'archive livrait un README troue d'images cassees — et le test
# « le README ne reference que des captures qui existent » le refuse, a raison.
#
# `desktop` (la coquille WPF) part en SOURCES : ses trois projets, sa documentation
# et ses assets. Le destinataire compile lui-meme (`dotnet build`), comme il
# installe Node lui-meme : on ne livre pas d'executable non signe.

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

foreach ($f in $fichiers) {
  if (Test-Path $f) { Copy-Item $f (Join-Path $stage $f) -Force }
  else { Write-Warning "  absent : $f" }
}
foreach ($d in $dossiers) {
  if (Test-Path $d) { Copy-Item $d (Join-Path $stage $d) -Recurse -Force }
  else { Write-Warning "  absent : $d" }
}

# la base de titres est necessaire : sans elle, les jeux s'affichent par TitleID
$csv = 'ISO2GOD\gamelist_xbox360.csv'
if (Test-Path $csv) {
  New-Item -ItemType Directory -Force -Path (Join-Path $stage 'ISO2GOD') | Out-Null
  Copy-Item $csv (Join-Path $stage $csv) -Force
} else { Write-Warning "  absent : $csv (les titres s'afficheront par TitleID)" }

# --- les sorties de compilation de la coquille NE partent PAS ---------------
# `Copy-Item -Recurse` sur `desktop` embarquerait `bin/` et `obj/` : des dizaines
# de Mo, propres a une machine, et sans aucun interet pour le destinataire qui
# compile lui-meme. On les retire APRES la copie : la garde « aucune donnee
# personnelle » plus bas compte les fichiers de l'archive, et un `bin/` oublie
# ferait echouer le compte sans rien dire d'utile.
foreach ($p in @('desktop\bin', 'desktop\obj',
                 'desktop\XboxManager\bin', 'desktop\XboxManager\obj',
                 'desktop\XboxManager.Coeur\bin', 'desktop\XboxManager.Coeur\obj',
                 'desktop\XboxManager.Coeur.Tests\bin', 'desktop\XboxManager.Coeur.Tests\obj')) {
  $c = Join-Path $stage $p
  if (Test-Path $c) { Remove-Item $c -Recurse -Force }
}

# --- garde-fou : aucune donnee personnelle dans l'archive -------------------
# Un cookie de session archive.org diffuse publiquement serait une fuite.
$interdits = @('config.json', 'secrets.json', 'downloads.json', 'mediaid.json',
  'tu_check.json', 'hb_index.json', 'tu_installed.json')
$fuites = @()
foreach ($f in $interdits) {
  if (Test-Path (Join-Path $stage $f)) { $fuites += $f }
}
foreach ($d in @('covers', 'data', '.iaprofile', '_A_TRIER', 'Content', 'Games', '_extract_tmp')) {
  if (Test-Path (Join-Path $stage $d)) { $fuites += $d }
}
if ($fuites.Count) {
  Remove-Item $stage -Recurse -Force
  throw "Arret : donnees personnelles detectees dans l'archive ($($fuites -join ', ')). Rien n'a ete produit."
}
Write-Host "  aucune donnee personnelle dans l'archive"

# --- archive ----------------------------------------------------------------
$zip = Join-Path $OutDir "$nom.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $stage -DestinationPath $zip -CompressionLevel Optimal

$taille = [math]::Round((Get-Item $zip).Length / 1KB, 0)
$nb = (Get-ChildItem $stage -Recurse -File | Measure-Object).Count
Write-Host ""
Write-Host "  archive : $zip"
Write-Host "  taille  : $taille Ko pour $nb fichiers"
Write-Host ""
Write-Host "  L'utilisateur doit avoir Node.js >= 18, puis :"
Write-Host "    npm run doctor    (dit ce qui manque)"
Write-Host "    npm start"
