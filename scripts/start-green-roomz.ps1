$ErrorActionPreference = 'Stop'
# PF3: portable roots — PSScriptRoot/.. or LocalAppData\Green-Roomz; node from PATH.
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$RootCandidate = (Resolve-Path (Join-Path $here '..')).Path
if (Test-Path (Join-Path $RootCandidate 'bin\green-roomz.mjs')) {
  $Root = $RootCandidate
} elseif (Test-Path (Join-Path $env:LOCALAPPDATA 'Green-Roomz\bin\green-roomz.mjs')) {
  $Root = Join-Path $env:LOCALAPPDATA 'Green-Roomz'
} else {
  $Root = $RootCandidate
}
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Error "Node.js not on PATH (where.exe node). Install Node >=20 and reopen the shell."
  exit 1
}
$Node = $nodeCmd.Source
$Log = Join-Path $Root 'data\serve.log'
$Port = 8080
$Cmd = Join-Path $env:SystemRoot 'System32\cmd.exe'
$env:GRZ_ROOT = $Root
$env:GRZ_EXE = '.exe'
if (-not $env:GRZ_LLAMA) { $env:GRZ_LLAMA = Join-Path $Root 'runtime\llama-server.exe' }

function Test-Listening {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$conns
}

function Show-ServeConsole {
  param([string]$Line)
  $window = Join-Path $Root 'scripts\serve-window.cmd'
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $Cmd
  $psi.UseShellExecute = $true
  $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal
  if ($Line) {
    $psi.Arguments = "/c start `"Green-Roomz serve`" /D `"$Root`" cmd /k $Line"
  } else {
    $psi.Arguments = "/c start `"Green-Roomz serve`" /D `"$Root`" `"$window`""
  }
  [Diagnostics.Process]::Start($psi) | Out-Null
}

New-Item -ItemType Directory -Force -Path (Split-Path $Log) | Out-Null

if (Test-Listening) {
  Show-ServeConsole "title Green-Roomz serve & echo already listening on :$Port & echo --- $Log --- & powershell -NoProfile -Command `"Get-Content -Wait -Tail 40 '$Log'`""
  Write-Output "already-listening :$Port (visible console on log)"
  exit 0
}

$stamp = Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'
Add-Content -Path $Log -Value "[$stamp] starting green-roomz serve (visible console)"

Show-ServeConsole ''

Start-Sleep -Seconds 2
if (Test-Listening) {
  Write-Output "started http://127.0.0.1:$Port (visible console)"
  exit 0
}
Start-Sleep -Seconds 4
if (Test-Listening) {
  Write-Output "started http://127.0.0.1:$Port (visible console)"
  exit 0
}
Write-Output "start-failed see $Log"
exit 1
