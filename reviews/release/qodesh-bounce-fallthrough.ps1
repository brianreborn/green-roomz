# DISPATCH-FIX-01 bounce — run on qodesh when local-exec is stable
$ErrorActionPreference = 'Stop'
$root = 'C:\Users\brian\Documents\green-roomz'
$bak = Join-Path $root '_bounce-backup-20260912'
$src = Join-Path $bak 'routing.mjs.from-box'
$dst = Join-Path $root 'src\routing.mjs'
$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $src)) { throw "missing staged patch: $src" }
New-Item -ItemType Directory -Force -Path $bak | Out-Null
if (Test-Path $dst) { Copy-Item $dst (Join-Path $bak 'routing.mjs.pre') -Force }
Copy-Item $src $dst -Force
Write-Output "installed routing.mjs from staged box patch"

# Prefer graceful: find green-roomz serve and stop only that PID (not all node)
$serve = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'green-roomz\.mjs' } |
  Select-Object -First 1
if ($serve) {
  Write-Output "stopping serve pid $($serve.ProcessId)"
  Stop-Process -Id $serve.ProcessId -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
} else { Write-Output 'no green-roomz serve pid found' }

Start-Process -FilePath $node -ArgumentList @((Join-Path $root 'bin\green-roomz.mjs'),'serve') -WorkingDirectory $root -WindowStyle Minimized
Start-Sleep -Seconds 5
$h = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/health' -TimeoutSec 10
Write-Output "health $($h.StatusCode) $($h.Content)"

function Post($model) {
  $body = @{ model = $model; messages = @(@{ role = 'user'; content = 'hi' }); max_tokens = 8 } | ConvertTo-Json -Depth 5
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Method POST -Uri 'http://127.0.0.1:8080/v1/chat/completions' -ContentType 'application/json' -Body $body -TimeoutSec 20
    "MODEL=$model STATUS=$($r.StatusCode) BODY=$($r.Content.Substring(0,[Math]::Min(200,$r.Content.Length)))"
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $code = [int]$resp.StatusCode
      $sr = New-Object IO.StreamReader($resp.GetResponseStream())
      $txt = $sr.ReadToEnd()
      "MODEL=$model STATUS=$code BODY=$($txt.Substring(0,[Math]::Min(200,$txt.Length)))"
    } else { "MODEL=$model ERR=$($_.Exception.Message)" }
  }
}
Post 'code-agent'
Post 'general-text-agent'
Post 'speech-synthesis-agent'
Post 'image-generation-agent'
Post 'auto'
