<#
.SYNOPSIS
  Publie une release GitHub avec l'archive produite par build-release.ps1.

.DESCRIPTION
  Le zip vit dans dist/, qui est ignore par git : une release est le seul endroit
  ou le publier. Le jeton d'API est celui que git utilise deja pour `git push`
  (aide de memorisation Windows), lu en memoire et JAMAIS affiche.

  Le script REFUSE de publier si l'archive contient une donnee personnelle —
  controler avant de rendre public, pas apres.

.EXAMPLE
  powershell -File scripts/gh-release.ps1
  powershell -File scripts/gh-release.ps1 -Draft
#>
param(
  [string]$Version = '',
  [string]$Notes = '',
  [switch]$Draft
)

$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
Set-Location $ROOT

if (-not $Version) { $Version = (Get-Content package.json -Raw | ConvertFrom-Json).version }
$tag = "v$Version"
$zip = Join-Path 'dist' "xbox360-manager-$Version.zip"

if (-not (Test-Path $zip)) { throw "Archive absente : $zip. Lance d'abord : npm run release" }

# --- 1. Le jeton, en memoire -------------------------------------------------
$cred = ("protocol=https`nhost=github.com`n`n" | git credential fill 2>$null)
$token = ($cred | Where-Object { $_ -match '^password=' }) -replace '^password=', ''
$user = ($cred | Where-Object { $_ -match '^username=' }) -replace '^username=', ''
if (-not $token) { throw "Aucun jeton memorise pour github.com. Fais un `git push` d'abord, ou installe gh et fais `gh auth login`." }

# --- 2. Le depot -------------------------------------------------------------
$url = (git remote get-url origin) -replace '\.git$', ''
if ($url -notmatch 'github\.com[:/]([^/]+)/([^/]+)$') { throw "Depot distant non reconnu : $url" }
$owner = $Matches[1]; $repo = $Matches[2]
Write-Host "Publication de $tag sur $owner/$repo"

$entetes = @{ Authorization = "token $token"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'xbox360-manager-release' }

# --- 3. Le controle qui compte : aucune donnee personnelle -------------------
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $zip))
$noms = $z.Entries | ForEach-Object { $_.FullName }
$z.Dispose()
$fuites = $noms | Where-Object { $_ -match '(^|/)(config|secrets|downloads|mediaid|tu_check|hb_index)\.json$' -and $_ -notmatch 'example' }
if ($fuites) {
  throw "Arret : l'archive contient des donnees personnelles ($($fuites -join ', ')). Rien n'a ete publie."
}
Write-Host "  aucune donnee personnelle dans l'archive"
Write-Host "  $($noms.Count) fichiers, $([math]::Round((Get-Item $zip).Length/1KB)) Ko"

# --- 4. Les notes : l'entree du CHANGELOG pour cette version -----------------
if (-not $Notes) {
  $lignes = Get-Content CHANGELOG.md
  $debut = ($lignes | Select-String -Pattern "^## \[$([regex]::Escape($Version))\]" | Select-Object -First 1).LineNumber
  if ($debut) {
    $suite = ($lignes | Select-String -Pattern "^## \[" | Where-Object { $_.LineNumber -gt $debut } | Select-Object -First 1).LineNumber
    $fin = if ($suite) { $suite - 2 } else { $lignes.Count }
    $Notes = ($lignes[($debut)..($fin-1)] -join "`n").Trim()
  } else { $Notes = "Version $Version." }
}
# On retire le titre : GitHub affiche deja le nom de la release.
$Notes = $Notes -replace '(?m)^##\s*\[[^\]]+\][^\n]*\n+', ''

# --- 5. La release -----------------------------------------------------------
# Le corps est envoye en OCTETS UTF-8. `Invoke-RestMethod` de PowerShell 5.1
# encode une chaine en UTF-16, et l'API repond « Problems parsing JSON » — un
# message qui n'oriente vers rien tant qu'on ne l'a pas vu une fois.
$corps = @{ tag_name = $tag; name = "Xbox 360 Manager $Version"; body = $Notes; draft = [bool]$Draft } | ConvertTo-Json
$corpsOctets = [System.Text.Encoding]::UTF8.GetBytes($corps)
try {
  $rel = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$owner/$repo/releases" -Headers $entetes -Body $corpsOctets -ContentType 'application/json; charset=utf-8'
  Write-Host "  release creee : $($rel.html_url)"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -eq 422) {
    # Deja existante : on la reprend au lieu d'echouer.
    $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/tags/$tag" -Headers $entetes
    Write-Host "  release deja existante : $($rel.html_url)"
  } else { throw "Creation impossible (HTTP $code) : $($_.ErrorDetails.Message)" }
}

# --- 6. L'archive ------------------------------------------------------------
$nom = Split-Path $zip -Leaf
$deja = $rel.assets | Where-Object { $_.name -eq $nom }
if ($deja) {
  Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$owner/$repo/releases/assets/$($deja.id)" -Headers $entetes | Out-Null
  Write-Host "  ancienne archive retiree"
}
$octets = [System.IO.File]::ReadAllBytes((Resolve-Path $zip))
$asset = Invoke-RestMethod -Method Post -Uri "https://uploads.github.com/repos/$owner/$repo/releases/$($rel.id)/assets?name=$nom" `
  -Headers $entetes -ContentType 'application/zip' -Body $octets
Write-Host "  archive publiee : $($asset.browser_download_url)"
Write-Host ""
Write-Host "  $($asset.size) octets, $($asset.download_count) telechargement(s)"
