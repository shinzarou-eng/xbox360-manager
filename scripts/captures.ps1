# Capture les ecrans de l'application pour le README.
#
#   powershell -File scripts/captures.ps1
#
# Le serveur doit tourner sur 4360. Le script lance Chrome lui-meme (hors bac a
# sable : Chromium a besoin de pipes nommes), prend une capture par vue, puis
# ferme tout.
#
# La vue CONSOLE est capturee connectee a la FAUSSE console (127.0.0.1) : une
# capture destinee a un README ne doit pas publier l'adresse du reseau prive de
# qui que ce soit.
$ErrorActionPreference = 'Stop'
$racine = Split-Path -Parent $PSScriptRoot
Set-Location $racine

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) { $chrome = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" }
if (-not (Test-Path $chrome)) { Write-Error "Chrome introuvable"; exit 1 }

$docs = Join-Path $racine 'docs'
New-Item -ItemType Directory -Force -Path $docs | Out-Null

# --- la fausse console, pour une capture sans adresse privee -----------------
$fausse = Start-Process -FilePath 'node' -ArgumentList 'scripts/faux-console.js 2121' -PassThru -WindowStyle Hidden
Start-Sleep 3

$profil = Join-Path $racine '.browser-probe\ui'
Remove-Item $profil -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $profil | Out-Null
$ligneArgs = '--remote-debugging-port=9444 --user-data-dir="' + $profil + '" --headless=new --no-first-run --no-default-browser-check --disable-gpu --hide-scrollbars about:blank'
$nav = Start-Process -FilePath $chrome -ArgumentList $ligneArgs -PassThru -WindowStyle Hidden

$pret = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if ($nav.HasExited) { break }
  try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:9444/json/version' -TimeoutSec 2 | Out-Null; $pret = $true; break } catch {}
}
if (-not $pret) { Write-Error "Le navigateur n'a pas demarre"; Stop-Process -Id $fausse.Id -Force; exit 1 }

$env:UICHECK_SIZE = '1600x1000'

# $args est une variable AUTOMATIQUE de PowerShell : un parametre portant ce nom
# est ecrase, et les options comme --modal n'arrivaient jamais a la sonde.
# Et les options sont un TABLEAU : PowerShell ne decoupe pas une chaine en
# plusieurs arguments (« '--modal --dlc' » arrive comme UN seul argument, donc
# `process.argv.includes('--modal')` est faux). On etale avec @extra.
function Capture([string]$vue, [string]$fichier, [string[]]$extra = @(), [string]$js = '') {
  $env:UICHECK_SHOT = Join-Path $docs $fichier
  if ($js) { $env:UICHECK_EVAL = $js; $env:UICHECK_EVAL_WAIT = '6000' }
  else { Remove-Item Env:\UICHECK_EVAL -ErrorAction SilentlyContinue; Remove-Item Env:\UICHECK_EVAL_WAIT -ErrorAction SilentlyContinue }
  $sortie = node scripts/uicheck.js $vue @extra 2>&1 | Select-String -Pattern 'DEFAUT|Aucun defaut|^    - '
  $etat = ($sortie | ForEach-Object { $_.Line.Trim() }) -join ' '
  $ko = (Get-Item $env:UICHECK_SHOT).Length
  Write-Output ("  " + $fichier.PadRight(28) + [Math]::Round($ko / 1KB) + " Ko   " + $etat)
}

Write-Output '=== captures ==='
Capture 'dash' 'screen-accueil.png' '' "(async function(){await loadDash();await new Promise(r=>setTimeout(r,3000));return 'ok';})()"
Capture 'lib'  'screen-bibliotheque.png' '' "(async function(){showView('lib',document.getElementById('nv-lib'));if(libView!=='flow')toggleView();await loadGames();await new Promise(r=>setTimeout(r,1800));flowTilt();await new Promise(r=>setTimeout(r,900));return 'ok';})()"
Capture 'lib'  'screen-liste.png' '' "(async function(){showView('lib',document.getElementById('nv-lib'));while(libView!=='list')toggleView();await loadGames();await new Promise(r=>setTimeout(r,1800));return 'ok';})()"
Capture 'cat'  'screen-catalogue.png' '' "(async function(){showView('cat',document.getElementById('nv-cat'));await new Promise(r=>setTimeout(r,3000));return 'ok';})()"
Capture 'as'   'screen-scripts.png' '' "(async function(){showView('as',document.getElementById('nv-as'));await new Promise(r=>setTimeout(r,4000));return 'ok';})()"
Capture 'dl'   'screen-telechargements.png' '' "(async function(){showView('dl',document.getElementById('nv-dl'));await new Promise(r=>setTimeout(r,2500));return 'ok';})()"
Capture 'ct'   'screen-dlc-tu.png' '' "(async function(){showView('ct',document.getElementById('nv-ct'));await new Promise(r=>setTimeout(r,3500));return 'ok';})()"

# --- console : on se connecte a la fausse console, jamais a celle de l'utilisateur
#
# ATTENTION : /api/ftp/connect ENREGISTRE l'adresse dans config.json — c'est
# voulu, on ne la retape pas a chaque fois. Ce script doit donc SAUVEGARDER et
# RESTAURER l'adresse de l'utilisateur, sinon il laisse 127.0.0.1:2121 derriere
# lui et l'application pointe ensuite sur une fausse console eteinte. C'est
# arrive. Meme regle que scripts/verif-ftp.js.
$cfgAvant = $null
try { $cfgAvant = ((Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4360/api/config' -TimeoutSec 20).Content | ConvertFrom-Json).console } catch {}
$corps = '{"host":"127.0.0.1","port":2121,"user":"xboxftp","pass":"xboxftp"}'
try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4360/api/ftp/connect' -Method POST -Body $corps -ContentType 'application/json' -TimeoutSec 60 | Out-Null } catch {}
Capture 'con' 'screen-console.png' '' "(async function(){showView('con',document.getElementById('nv-con'));await new Promise(r=>setTimeout(r,2500));await conAller('/Content/0000000000000000');await conChargerPc();await new Promise(r=>setTimeout(r,2500));return 'ok';})()"

# --- le panneau DLC d'un jeu qui en a vraiment
$env:UICHECK_GAME = 'Halo 3'; $env:UICHECK_TID = '4D5307E6'
Capture 'cat' 'screen-dlc.png' @('--modal','--dlc') "(async function(){await new Promise(r=>setTimeout(r,6000));return 'ok';})"

# --- nettoyage
try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4360/api/ftp/disconnect' -Method POST -Body '{}' -ContentType 'application/json' -TimeoutSec 30 | Out-Null } catch {}
# On REMET l'adresse de console de l'utilisateur, et on le dit : une config
# silencieusement modifiee est indiscernable d'une config intacte.
if ($cfgAvant) {
  # La forme attendue par /api/config est { console: { ... } } — pas les clefs a
  # la racine, qui seraient ignorees en silence.
  $retour = @{ console = @{ host = $cfgAvant.host; port = $cfgAvant.port; user = $cfgAvant.user } } | ConvertTo-Json -Compress -Depth 3
  try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4360/api/config' -Method POST -Body $retour -ContentType 'application/json' -TimeoutSec 30 | Out-Null } catch {}
  $verif = ''
  try { $verif = ((Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4360/api/config' -TimeoutSec 20).Content | ConvertFrom-Json).console.host } catch {}
  Write-Output ('  adresse de console restauree : ' + $verif + ':' + $cfgAvant.port + $(if ($verif -eq $cfgAvant.host) { '' } else { '   ATTENTION : non confirmee' }))
}
foreach ($p in @($nav, $fausse)) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
$c = netstat -ano | Select-String 'LISTENING' | Select-String ':2121'
foreach ($x in $c) { $id = (($x.Line -split '\s+') | Where-Object { $_ })[-1]; Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
Write-Output '=== termine ==='
