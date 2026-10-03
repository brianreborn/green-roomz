<#
.SYNOPSIS
  Fleet live console for Windows hosts (qodesh / shalom).

.DESCRIPTION
  Left pane: tail newest log(s) under a console data dir.
  Right pane: btop if on PATH, else print guidance to open Task Manager.
  Does NOT scrape laptop metrics into the Linux box console — host-local only.

  Preferred log roots (first that exists wins, or create default):
    C:\fleet\console\
    C:\Users\brian\Documents\green-roomz\data\_console\

.NOTES
  Defensive: no network, no repo clone, no credential touch.
  Requires Windows Terminal (wt.exe) when available; falls back to two consoles.
#>
[CmdletBinding()]
param(
  [string]$ConsoleRoot = '',
  [switch]$NoLaunch,
  [switch]$OpenTaskMgr
)

$ErrorActionPreference = 'Stop'

function Resolve-ConsoleRoot {
  param([string]$Preferred)
  $candidates = @()
  if ($Preferred) { $candidates += $Preferred }
  $candidates += @(
    'C:\fleet\console',
    (Join-Path $env:USERPROFILE 'Documents\green-roomz\data\_console'),
    'C:\Users\brian\Documents\green-roomz\data\_console'
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath $c)) { return (Resolve-Path -LiteralPath $c).Path }
  }
  $default = 'C:\fleet\console'
  New-Item -ItemType Directory -Force -Path $default | Out-Null
  foreach ($name in @('console.log', 'prompt.log', 'response.log')) {
    $p = Join-Path $default $name
    if (-not (Test-Path -LiteralPath $p)) {
      New-Item -ItemType File -Force -Path $p | Out-Null
    }
  }
  return $default
}

function Find-Btop {
  $cmd = Get-Command btop -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $guesses = @(
    'C:\fleet\bin\btop.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\btop\btop.exe'),
    'C:\Program Files\btop\btop.exe'
  )
  foreach ($g in $guesses) {
    if (Test-Path -LiteralPath $g) { return $g }
  }
  return $null
}

function Find-Wt {
  $cmd = Get-Command wt.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $guess = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\wt.exe'
  if (Test-Path -LiteralPath $guess) { return $guess }
  return $null
}

$root = Resolve-ConsoleRoot -Preferred $ConsoleRoot
Write-Host "Console root: $root"

# Ensure touch files exist (workers append here)
foreach ($name in @('console.log', 'prompt.log', 'response.log')) {
  $p = Join-Path $root $name
  if (-not (Test-Path -LiteralPath $p)) {
    New-Item -ItemType File -Force -Path $p | Out-Null
  }
}

$btop = Find-Btop
$wt = Find-Wt

# Left: PowerShell Get-Content -Wait on console.log (and note sibling logs)
$leftCmd = @"
`$root = '$root'
Write-Host '=== fleet live console (LEFT: logs) ===' -ForegroundColor Green
Write-Host `"Root: `$root`"
Write-Host 'Tailing console.log (Ctrl+C to stop). prompt.log / response.log are siblings.'
Write-Host ''
`$log = Join-Path `$root 'console.log'
if (-not (Test-Path -LiteralPath `$log)) { New-Item -ItemType File -Force -Path `$log | Out-Null }
Get-Content -LiteralPath `$log -Wait -Tail 80
"@

if ($btop) {
  $rightCmd = @"
Write-Host '=== fleet live console (RIGHT: btop) ===' -ForegroundColor Cyan
& '$btop'
"@
  $rightHint = "btop @ $btop"
} else {
  $rightCmd = @"
Write-Host '=== fleet live console (RIGHT: no btop) ===' -ForegroundColor Yellow
Write-Host 'btop not found on PATH or common install paths.'
Write-Host 'Open Task Manager on THIS host for CPU/RAM (not the Linux box console).'
Write-Host '  Start-Process taskmgr'
Write-Host '  or: Win+R → taskmgr'
Write-Host ''
Write-Host 'Optional: install btop for Windows and re-run this script.'
Write-Host 'Press Enter to open Task Manager now, or Ctrl+C to skip...'
try { [void][Console]::ReadLine(); Start-Process taskmgr } catch { }
"@
  $rightHint = 'taskmgr guidance (btop missing)'
}

Write-Host "Right pane: $rightHint"

if ($OpenTaskMgr) {
  Start-Process taskmgr
  Write-Host 'Started taskmgr (host-local).'
}

if ($NoLaunch) {
  Write-Host 'NoLaunch set — not starting terminals.'
  Write-Host "Left command preview length: $($leftCmd.Length)"
  return
}

$leftEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($leftCmd))
$rightEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($rightCmd))

if ($wt) {
  # Windows Terminal: split left | right
  # wt.exe window; split-pane; first pane runs left, second right
  $wtArgs = @(
    '-w', '0',
    'nt', '--title', 'fleet-log',
    'powershell', '-NoExit', '-EncodedCommand', $leftEncoded,
    ';', 'split-pane', '-H', '--title', 'fleet-stats',
    'powershell', '-NoExit', '-EncodedCommand', $rightEncoded
  )
  Write-Host "Launching Windows Terminal: $wt"
  Start-Process -FilePath $wt -ArgumentList $wtArgs | Out-Null
} else {
  Write-Host 'wt.exe not found — opening two powershell windows.'
  Start-Process powershell -ArgumentList @('-NoExit', '-EncodedCommand', $leftEncoded) | Out-Null
  Start-Process powershell -ArgumentList @('-NoExit', '-EncodedCommand', $rightEncoded) | Out-Null
}

Write-Host 'Done. Host stats stay on this Windows machine (qodesh/shalom).'
