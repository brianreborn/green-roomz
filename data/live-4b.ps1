$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$curl = 'C:\Windows\System32\curl.exe'
Set-Location $root
$data = Join-Path $root 'data'
$serveErr = Join-Path $data 'serve-4b.err.log'
$postBody = Join-Path $data 'post-4b-body.json'
$postResp = Join-Path $data 'post-4b-response.json'
$postHdrs = Join-Path $data 'post-4b-headers.txt'
$report = Join-Path $data 'live-4b-report.json'
$healthOut = Join-Path $data 'serve-4b-health.json'

function RamFreeGB {
  $os = Get-CimInstance Win32_OperatingSystem
  return [math]::Round($os.FreePhysicalMemory/1MB, 2)
}
function ProcInfo($name) {
  Get-Process $name -ErrorAction SilentlyContinue | ForEach-Object {
    [pscustomobject]@{ Id=$_.Id; Name=$_.ProcessName; WS_MB=[math]::Round($_.WorkingSet64/1MB,1) }
  }
}

$freeBefore = RamFreeGB
Write-Output ("freeRAM_before={0}GB" -f $freeBefore)
if ($freeBefore -lt 3.0) {
  Write-Output 'SKIP live POST: free RAM < 3GB'
  @{ live=$false; skip='low_ram'; free_ram_gb=$freeBefore } | ConvertTo-Json | Set-Content -Path $report -Encoding ascii
  exit 0
}

Write-Output '=== make vulkan-all-only manifest ==='
& $node (Join-Path $data 'make-serve-manifest.mjs') $root
if ($LASTEXITCODE -ne 0) { throw "make-serve-manifest failed $LASTEXITCODE" }

$bodyObj = '{"model":"general-text-speculator","messages":[{"role":"user","content":"Reply with exactly the word hello and nothing else."}],"max_tokens":24,"temperature":0}'
[System.IO.File]::WriteAllText($postBody, $bodyObj, (New-Object System.Text.UTF8Encoding $false))

if (Test-Path $serveErr) { Remove-Item $serveErr -Force }
Write-Output '=== start serve ==='
$serveArgs = @('.\bin\green-roomz.mjs','serve','--manifest','.\data\serve-vulkan-all-4b.json','--host','127.0.0.1','--port','18080')
$serve = Start-Process -FilePath $node -ArgumentList $serveArgs -WorkingDirectory $root -RedirectStandardError $serveErr -RedirectStandardOutput (Join-Path $data 'serve-4b.out.log') -PassThru -WindowStyle Hidden
Write-Output ("serve pid={0}" -f $serve.Id)

$ready = $false
for ($i=0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if ($serve.HasExited) { throw "serve exited early code=$($serve.ExitCode)" }
  try {
    $h = & $curl -sS --max-time 2 "http://127.0.0.1:18080/health"
    if ($h -match 'green-roomz|degraded|"ok"') { $ready = $true; $h | Out-File $healthOut -Encoding ascii; break }
  } catch {}
}
if (-not $ready) {
  Write-Output 'serve did not become ready'
  Get-Content $serveErr -ErrorAction SilentlyContinue | Select-Object -Last 40
  if (-not $serve.HasExited) { Stop-Process -Id $serve.Id -Force -ErrorAction SilentlyContinue }
  Get-Process llama-server -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  throw 'serve not ready'
}
Write-Output 'serve ready'
Get-Content $serveErr -ErrorAction SilentlyContinue | Select-Object -Last 5

Write-Output '=== POST /v1/chat/completions ==='
$sw = [System.Diagnostics.Stopwatch]::StartNew()
& $curl -sS --max-time 180 -D $postHdrs -o $postResp -H "Content-Type: application/json" --data-binary "@$postBody" "http://127.0.0.1:18080/v1/chat/completions"
$curlExit = $LASTEXITCODE
$sw.Stop()
Write-Output ("curl_exit={0} wall_ms={1}" -f $curlExit, $sw.ElapsedMilliseconds)

$llama = @(ProcInfo 'llama-server')
$freeDuring = RamFreeGB
Write-Output ("freeRAM_during={0}GB" -f $freeDuring)
$llama | ForEach-Object { Write-Output ("llama pid={0} ws_mb={1}" -f $_.Id, $_.WS_MB) }

Write-Output '=== headers ==='
Get-Content $postHdrs -ErrorAction SilentlyContinue
Write-Output '=== response snippet ==='
if (Test-Path $postResp) { Get-Content $postResp -Raw }

Write-Output '=== STOP serve + llama-server ==='
if (-not $serve.HasExited) {
  Stop-Process -Id $serve.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
Get-Process llama-server -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Output ("killing leftover llama-server pid {0}" -f $_.Id)
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
# if serve node still alive
if (-not $serve.HasExited) {
  Stop-Process -Id $serve.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 3
$left = @(Get-Process llama-server -ErrorAction SilentlyContinue)
$freeAfter = RamFreeGB
Write-Output ("freeRAM_after={0}GB leftovers_llama={1}" -f $freeAfter, $left.Count)

$httpStatus = $null
if (Test-Path $postHdrs) {
  $statusLine = (Get-Content $postHdrs | Select-Object -First 1)
  if ($statusLine -match 'HTTP/\S+\s+(\d+)') { $httpStatus = [int]$Matches[1] }
}

$rep = [ordered]@{
  live = $true
  alias = 'general-text-speculator'
  profile = 'vulkan-all'
  ctx_size = 1024
  draft_enabled = $false
  serve_pid = $serve.Id
  llama = $llama
  http_status = $httpStatus
  curl_exit = $curlExit
  wall_ms = $sw.ElapsedMilliseconds
  free_ram_gb_before = $freeBefore
  free_ram_gb_during = $freeDuring
  free_ram_gb_after = $freeAfter
  leftovers_llama = $left.Count
}
($rep | ConvertTo-Json -Depth 6) | Set-Content -Path $report -Encoding ascii
Write-Output 'DONE live-4b'
Get-Content $report
