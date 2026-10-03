$ErrorActionPreference = 'Stop'
$Root = 'C:\Users\brian\Documents\Codex\2026-08-28\files-pasted-by-the-user-1\outputs\green-roomz'
$Node = 'C:\Program Files\nodejs\node.exe'
$Log = Join-Path $Root 'data\serve.log'
$Port = 8080

function Test-Listening {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$conns
}

if (Test-Listening) {
  Write-Output "already-listening :$Port"
  exit 0
}

New-Item -ItemType Directory -Force -Path (Split-Path $Log) | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'
Add-Content -Path $Log -Value "[$stamp] starting green-roomz serve"

$proc = Start-Process -FilePath $Node -ArgumentList '.\bin\green-roomz.mjs','serve' -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardError $Log -RedirectStandardOutput (Join-Path $Root 'data\serve.out.log') -PassThru
Start-Sleep -Seconds 2
if (Test-Listening) {
  Write-Output "started pid=$($proc.Id) http://127.0.0.1:$Port"
  exit 0
}
# give cold bootstrap a bit more
Start-Sleep -Seconds 4
if (Test-Listening) {
  Write-Output "started pid=$($proc.Id) http://127.0.0.1:$Port"
  exit 0
}
Write-Output "start-failed pid=$($proc.Id) see $Log"
exit 1
