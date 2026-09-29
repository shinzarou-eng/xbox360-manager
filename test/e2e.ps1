# Test de bout en bout du pipeline de tri, sur des dossiers TEMPORAIRES.
#
# La config reelle est sauvegardee au debut et TOUJOURS restauree a la fin (y
# compris en cas d'erreur, via try/finally) : la bibliotheque de l'utilisateur
# n'est jamais touchee.
#
# Verifie :
#   CAS 1 - un dossier contenant un fichier non reconnu doit SURVIVRE
#           (avant : supprime recursivement -> perte de donnees silencieuse)
#   CAS 2 - un package GOD valide doit etre range dans <games>\<TID>\00007000
#           et le dossier source nettoye
#   CAS 3 - un .iso dont l'extraction echoue doit rester dans le depot
#   ET    - le serveur doit rester REPONDANT pendant le tri (passage a l'asynchrone)
#
# Prerequis : le serveur tourne sur le port 4360.
# Usage : powershell -File test\e2e.ps1
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$cfgPath = Join-Path $ROOT 'config.json'
$base = Join-Path $env:TEMP ('x360e2e-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
$backup = Join-Path $base 'config.backup.json'

function Api($method, $path, $bodyObj) {
  $p = @{ Uri = "http://localhost:4360$path"; Method = $method; TimeoutSec = 60; UseBasicParsing = $true }
  if ($bodyObj) { $p.Body = ($bodyObj | ConvertTo-Json -Compress); $p.ContentType = 'application/json' }
  (Invoke-WebRequest @p).Content | ConvertFrom-Json
}

# faux package GOD valide : magic LIVE a 0, type 00007000 a 0x344,
# TitleID a 0x360, nom UTF-16LE a 0x412 (offsets reels)
function New-FakeGod($path, $tid, $title) {
  $b = New-Object byte[] 0x600
  [Text.Encoding]::ASCII.GetBytes('LIVE').CopyTo($b, 0)
  ([byte[]](0x00, 0x00, 0x70, 0x00)).CopyTo($b, 0x344)
  $t = New-Object byte[] 4
  for ($i = 0; $i -lt 4; $i++) { $t[$i] = [Convert]::ToByte($tid.Substring($i * 2, 2), 16) }
  $t.CopyTo($b, 0x360)
  [Text.Encoding]::Unicode.GetBytes($title).CopyTo($b, 0x412)
  [IO.File]::WriteAllBytes($path, $b)
}

New-Item -ItemType Directory -Force -Path $base | Out-Null
$drop = Join-Path $base 'drop'
$games = Join-Path $base 'games'
$content = Join-Path $base 'content'
foreach ($d in @($drop, $games, $content)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }

Copy-Item $cfgPath $backup -Force
$orig = Get-Content $backup -Raw | ConvertFrom-Json

$verdict = @()
try {
  # --- CAS 1 : fichier non reconnu dans un dossier -> le dossier doit survivre
  New-Item -ItemType Directory -Force -Path (Join-Path $drop 'dossier_inconnu') | Out-Null
  Set-Content -Path (Join-Path $drop 'dossier_inconnu\readme.nfo') -Value 'contenu non pris en charge'

  # --- CAS 2 : package GOD valide -> <games>\<TID>\00007000
  New-Item -ItemType Directory -Force -Path (Join-Path $drop 'dossier_god') | Out-Null
  New-FakeGod (Join-Path $drop 'dossier_god\package.bin') '415607D3' 'Test Game E2E'

  # --- CAS 3 : .iso dont l'extraction echoue -> source conservee
  [IO.File]::WriteAllBytes((Join-Path $drop 'jeu.iso'), (New-Object byte[] 4096))

  Write-Host "=== config -> dossiers temporaires ==="
  Api 'POST' '/api/config' @{ drop = $drop; games = $games; content = $content; scanExtra = @() } | Out-Null
  Write-Host "  $drop"

  Write-Host "`n=== declenchement du tri ==="
  $sw = [Diagnostics.Stopwatch]::StartNew()
  Api 'POST' '/api/sort' @{} | Out-Null

  # le serveur doit rester REPONDANT pendant le tri : c'est tout l'objet du
  # passage a l'asynchrone (avant, la boucle d'evenements etait bloquee)
  $latences = @()
  $fini = $false
  while ($sw.Elapsed.TotalSeconds -lt 120) {
    Start-Sleep -Milliseconds 400
    $t0 = [Diagnostics.Stopwatch]::StartNew()
    try { Api 'GET' '/api/games' $null | Out-Null; $t0.Stop(); $latences += $t0.ElapsedMilliseconds }
    catch { $t0.Stop(); $latences += -1 }
    $log = Api 'GET' '/api/sortlog' $null
    if (($log.lines -join "`n") -match 'Tri termine') { $fini = $true; break }
  }
  $sw.Stop()

  Write-Host ("  tri termine : {0} en {1:N1} s" -f $fini, $sw.Elapsed.TotalSeconds)
  $bon = @($latences | Where-Object { $_ -ge 0 })
  $mauvais = @($latences | Where-Object { $_ -lt 0 })
  Write-Host ("  requetes pendant le tri : {0} OK, {1} en echec" -f $bon.Count, $mauvais.Count)
  if ($bon.Count) {
    Write-Host ("  latence /api/games : min {0} ms / median {1} ms / max {2} ms" -f `
        ($bon | Measure-Object -Minimum).Minimum,
      ($bon | Sort-Object)[[int]($bon.Count / 2)],
      ($bon | Measure-Object -Maximum).Maximum)
  }

  Write-Host "`n=== resultats ==="
  $c1 = Test-Path (Join-Path $drop 'dossier_inconnu')
  $c1f = Test-Path (Join-Path $drop 'dossier_inconnu\readme.nfo')
  $c2src = Test-Path (Join-Path $drop 'dossier_god')
  $c2dst = Test-Path (Join-Path $games '415607D3\00007000\package.bin')
  $c3 = Test-Path (Join-Path $drop 'jeu.iso')

  Write-Host ("  CAS 1 dossier non reconnu conserve .......... {0}  (fichier present: {1})" -f $c1, $c1f)
  Write-Host ("  CAS 2 GOD range dans games\<TID>\00007000 ... {0}  (source nettoyee: {1})" -f $c2dst, (-not $c2src))
  Write-Host ("  CAS 3 iso en echec conserve dans le depot ... {0}" -f $c3)

  Write-Host "`n=== journal de tri ==="
  (Api 'GET' '/api/sortlog' $null).lines | Select-Object -Last 20 | ForEach-Object { "  $_" }

  $ok = $true
  if (-not $fini) { $verdict += "ECHEC: le tri ne s'est pas termine"; $ok = $false }
  if (-not $c1) { $verdict += 'ECHEC: le dossier non reconnu a ete SUPPRIME (perte de donnees)'; $ok = $false }
  if (-not $c1f) { $verdict += 'ECHEC: le fichier non reconnu a ete perdu'; $ok = $false }
  if (-not $c2dst) { $verdict += "ECHEC: le package GOD n'a pas ete range"; $ok = $false }
  if ($c2src) { $verdict += "ECHEC: le dossier GOD source n'a pas ete nettoye"; $ok = $false }
  if (-not $c3) { $verdict += "ECHEC: l'iso en echec a ete supprime"; $ok = $false }
  if ($mauvais.Count -gt 0) { $verdict += 'ECHEC: le serveur a cesse de repondre pendant le tri'; $ok = $false }
  if ($ok) { $verdict += 'TOUT OK' }
} finally {
  # --- restauration : TOUJOURS, meme si le test a echoue ---
  Write-Host "`n=== restauration de la config ==="
  Copy-Item $backup $cfgPath -Force
  # on repousse les VALEURS D'ORIGINE dans le process du serveur (et non celles
  # du test : c'est l'erreur qui avait ecrase la config la premiere fois)
  try {
    Api 'POST' '/api/config' @{ drop = $orig.drop; games = $orig.games; content = $orig.content; homebrew = $orig.homebrew; emulators = $orig.emulators; scanExtra = @(); lang = $orig.lang; archiveCookie = $orig.archiveCookie } | Out-Null
    $now = Api 'GET' '/api/config' $null
    Write-Host ("  drop={0}" -f $now.drop)
    if ($now.drop -ne $orig.drop) { Write-Host "  ATTENTION: la config du serveur differe de l'original" }
  } catch { Write-Host "  ATTENTION: restauration en memoire impossible ($($_.Exception.Message)) - redemarrer le serveur" }
  Remove-Item $base -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host "`n=== VERDICT ==="
  $verdict | ForEach-Object { Write-Host "  $_" }
}
