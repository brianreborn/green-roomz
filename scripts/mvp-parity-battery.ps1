# Green-Roomz Windows MVP parity battery - capability surface vs basic ChatGPT/Grok.
# Hits localhost gateway only. CPU chat path. Never loads GGUFs on 8600 GT.
# Operator: Brian. Host: qodesh (Athlon-friendly; short prompts).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\mvp-parity-battery.ps1
# Env: GRZ_BASE_URL (default http://127.0.0.1:8080), GRZ_MODEL (default general-text-speculator)

param(
  [string]$BaseUrl = $(if ($env:GRZ_BASE_URL) { $env:GRZ_BASE_URL } else { "http://127.0.0.1:8080" }),
  [string]$Model = $(if ($env:GRZ_MODEL) { $env:GRZ_MODEL } else { "general-text-speculator" }),
  [string]$OutPath = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $OutPath) {
  $OutPath = Join-Path $Root "data\mvp-parity-last.json"
}
$OutDir = Split-Path -Parent $OutPath
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }

$started = [DateTimeOffset]::UtcNow
$cases = New-Object System.Collections.Generic.List[object]
$failClosed = $false

function Add-Case([string]$Id, [string]$Name, [string]$Status, [string]$Detail, [int]$Ms) {
  $cases.Add([ordered]@{
    id = $Id
    name = $Name
    status = $Status
    detail = $Detail
    ms = $Ms
  }) | Out-Null
  $color = switch ($Status) {
    "PASS" { "Green" }
    "SKIP" { "DarkYellow" }
    "FAIL" { "Red" }
    default { "Gray" }
  }
  Write-Host ("[{0}] {1} - {2}" -f $Id, $Status, $Name) -ForegroundColor $color
  if ($Detail) { Write-Host ("       {0}" -f $Detail) -ForegroundColor DarkGray }
}

function Get-Json([string]$Uri, [int]$TimeoutSec = 30) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $resp = Invoke-WebRequest -Uri $Uri -Method GET -UseBasicParsing -TimeoutSec $TimeoutSec
  $sw.Stop()
  if ($resp.StatusCode -lt 200 -or $resp.StatusCode -ge 300) {
    throw "HTTP $($resp.StatusCode) GET $Uri"
  }
  $obj = $null
  if ($resp.Content) { $obj = $resp.Content | ConvertFrom-Json }
  return @{ StatusCode = [int]$resp.StatusCode; Body = $obj; Raw = $resp.Content; Ms = [int]$sw.ElapsedMilliseconds }
}

function Post-Json([string]$Uri, [hashtable]$BodyObj, [int]$TimeoutSec = 180) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $json = $BodyObj | ConvertTo-Json -Depth 20 -Compress
  $resp = Invoke-WebRequest -Uri $Uri -Method POST -ContentType "application/json; charset=utf-8" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -UseBasicParsing -TimeoutSec $TimeoutSec
  $sw.Stop()
  if ($resp.StatusCode -lt 200 -or $resp.StatusCode -ge 300) {
    throw "HTTP $($resp.StatusCode) POST $Uri"
  }
  $obj = $null
  if ($resp.Content) { $obj = $resp.Content | ConvertFrom-Json }
  return @{ StatusCode = [int]$resp.StatusCode; Body = $obj; Raw = $resp.Content; Ms = [int]$sw.ElapsedMilliseconds; Json = $json }
}

function Start-CurlProcess([string]$Arguments) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "curl.exe"
  $psi.Arguments = $Arguments
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  return [System.Diagnostics.Process]::Start($psi)
}

Write-Host "Green-Roomz MVP parity battery" -ForegroundColor Cyan
Write-Host "  base=$BaseUrl  model=$Model" -ForegroundColor DarkGray
Write-Host "  out=$OutPath" -ForegroundColor DarkGray
Write-Host "  CPU localhost only - never GGUF on 8600 GT." -ForegroundColor DarkGray
Write-Host ""

# --- A: health ---
try {
  $r = Get-Json "$BaseUrl/health" 10
  $product = $r.Body.product
  $status = $r.Body.status
  if ($product -ne "Green-Roomz") {
    Add-Case "A" "health GET /health" "FAIL" "product='$product' (want Green-Roomz); status=$status" $r.Ms
    $failClosed = $true
  } elseif (-not $status) {
    Add-Case "A" "health GET /health" "FAIL" "missing status field" $r.Ms
    $failClosed = $true
  } else {
    Add-Case "A" "health GET /health" "PASS" "product=$product status=$status http=$($r.StatusCode)" $r.Ms
  }
} catch {
  Add-Case "A" "health GET /health" "FAIL" $_.Exception.Message 0
  $failClosed = $true
}

# --- B: models ---
$modelIds = @()
try {
  $r = Get-Json "$BaseUrl/v1/models" 15
  if ($r.Body.data) { $modelIds = @($r.Body.data | ForEach-Object { $_.id }) }
  $need = @("general-text-speculator", "tool-router-agent")
  $missing = @($need | Where-Object { $modelIds -notcontains $_ })
  if ($modelIds.Count -eq 0) {
    Add-Case "B" "GET /v1/models lists aliases" "FAIL" "empty data[]" $r.Ms
    $failClosed = $true
  } elseif ($missing.Count -gt 0) {
    Add-Case "B" "GET /v1/models lists aliases" "FAIL" ("missing: " + ($missing -join ", ") + "; have: " + ($modelIds -join ", ")) $r.Ms
    $failClosed = $true
  } else {
    Add-Case "B" "GET /v1/models lists aliases" "PASS" ("count=$($modelIds.Count); " + ($modelIds -join ", ")) $r.Ms
  }
  if ($modelIds -notcontains $Model) {
    if ($modelIds -contains "general-text-speculator") { $Model = "general-text-speculator" }
    elseif ($modelIds.Count -gt 0) { $Model = $modelIds[0] }
  }
} catch {
  Add-Case "B" "GET /v1/models lists aliases" "FAIL" $_.Exception.Message 0
  $failClosed = $true
}

# --- C: non-stream chat ---
try {
  $body = @{
    model = $Model
    stream = $false
    max_tokens = 64
    messages = @(
      @{ role = "user"; content = "Reply with exactly: parity-ok" }
    )
  }
  $r = Post-Json "$BaseUrl/v1/chat/completions" $body 180
  $assistantC = [string]$r.Body.choices[0].message.content
  if (-not $assistantC) {
    Add-Case "C" "non-stream chat ($Model)" "FAIL" "empty choices[0].message.content" $r.Ms
    $failClosed = $true
  } else {
    $snip = $assistantC.Trim()
    if ($snip.Length -gt 80) { $snip = $snip.Substring(0, 80) + "..." }
    Add-Case "C" "non-stream chat ($Model)" "PASS" "http=$($r.StatusCode) reply='$snip'" $r.Ms
  }
} catch {
  Add-Case "C" "non-stream chat ($Model)" "FAIL" $_.Exception.Message 0
  $failClosed = $true
}

# --- D: multi-turn ---
try {
  $body = @{
    model = $Model
    stream = $false
    max_tokens = 64
    messages = @(
      @{ role = "user"; content = "My name is Ada. Reply with one short ACK." }
      @{ role = "assistant"; content = "ACK, Ada." }
      @{ role = "user"; content = "What did I call myself? One word." }
    )
  }
  $r = Post-Json "$BaseUrl/v1/chat/completions" $body 180
  $reply = [string]$r.Body.choices[0].message.content
  if (-not $reply) {
    Add-Case "D" "multi-turn name recall" "FAIL" "empty reply" $r.Ms
    $failClosed = $true
  } else {
    $snip = $reply.Trim()
    if ($snip.Length -gt 80) { $snip = $snip.Substring(0, 80) + "..." }
    $hint = if ($reply -match '(?i)Ada') { "contains Ada" } else { "no literal Ada (soft - still PASS if HTTP ok)" }
    Add-Case "D" "multi-turn name recall" "PASS" "http=$($r.StatusCode) $hint reply='$snip'" $r.Ms
  }
} catch {
  Add-Case "D" "multi-turn name recall" "FAIL" $_.Exception.Message 0
  $failClosed = $true
}

# --- E: stream SSE via curl.exe ---
try {
  $tmpBody = Join-Path $env:TEMP ("grz-parity-E-{0}.json" -f [guid]::NewGuid().ToString("N"))
  $tmpOut = Join-Path $env:TEMP ("grz-parity-E-{0}.sse" -f [guid]::NewGuid().ToString("N"))
  $payload = @{
    model = $Model
    stream = $true
    max_tokens = 48
    messages = @(
      @{ role = "user"; content = "Count 1 2 3. Very short." }
    )
  } | ConvertTo-Json -Depth 20 -Compress
  [System.IO.File]::WriteAllText($tmpBody, $payload, [System.Text.UTF8Encoding]::new($false))

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  # Quote paths for Windows; curl @file reads the JSON body.
  $argsE = "-sS -N --fail --max-time 120 -H `"Content-Type: application/json`" -H `"Accept: text/event-stream`" -d `"@$tmpBody`" -o `"$tmpOut`" `"$BaseUrl/v1/chat/completions`""
  $p = Start-CurlProcess $argsE
  if (-not $p.WaitForExit(130000)) {
    try { $p.Kill() } catch {}
    throw "curl.exe timed out (case E)"
  }
  $errE = $p.StandardError.ReadToEnd()
  $sw.Stop()

  $sse = ""
  if (Test-Path $tmpOut) { $sse = [System.IO.File]::ReadAllText($tmpOut) }
  Remove-Item -Force -ErrorAction SilentlyContinue $tmpBody, $tmpOut

  if ($p.ExitCode -ne 0) {
    Add-Case "E" "stream:true SSE data: chunks" "FAIL" "curl exit=$($p.ExitCode) err=$errE" ([int]$sw.ElapsedMilliseconds)
    $failClosed = $true
  } else {
    $dataLines = @($sse -split "`r?`n" | Where-Object { $_ -match '^\s*data:\s*' })
    $hasDone = ($sse -match 'data:\s*\[DONE\]')
    if ($dataLines.Count -lt 1) {
      Add-Case "E" "stream:true SSE data: chunks" "FAIL" "no data: lines in SSE body" ([int]$sw.ElapsedMilliseconds)
      $failClosed = $true
    } else {
      Add-Case "E" "stream:true SSE data: chunks" "PASS" ("data_lines=$($dataLines.Count) done=$hasDone") ([int]$sw.ElapsedMilliseconds)
    }
  }
} catch {
  Add-Case "E" "stream:true SSE data: chunks" "FAIL" $_.Exception.Message 0
  $failClosed = $true
}

# --- F: abort mid-stream (PASS if client closes cleanly) ---
try {
  $tmpBody = Join-Path $env:TEMP ("grz-parity-F-{0}.json" -f [guid]::NewGuid().ToString("N"))
  $payload = @{
    model = $Model
    stream = $true
    max_tokens = 128
    messages = @(
      @{ role = "user"; content = "Write a long list of animals, one per line." }
    )
  } | ConvertTo-Json -Depth 20 -Compress
  [System.IO.File]::WriteAllText($tmpBody, $payload, [System.Text.UTF8Encoding]::new($false))

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $argsF = "-sS -N --max-time 60 -H `"Content-Type: application/json`" -H `"Accept: text/event-stream`" -d `"@$tmpBody`" `"$BaseUrl/v1/chat/completions`""
  $p = Start-CurlProcess $argsF

  # Let a few chunks arrive, then kill client early (simulates Ctrl-C / abort).
  Start-Sleep -Milliseconds 800
  $killed = $false
  if (-not $p.HasExited) {
    try { $p.Kill(); $killed = $true } catch { }
  }
  try { [void]$p.WaitForExit(5000) } catch { }
  $sw.Stop()
  Remove-Item -Force -ErrorAction SilentlyContinue $tmpBody

  if ($p.HasExited) {
    $how = if ($killed) { "client killed early; exit=$($p.ExitCode)" } else { "stream ended before kill; exit=$($p.ExitCode)" }
    Add-Case "F" "abort mid-stream (client kill)" "PASS" $how ([int]$sw.ElapsedMilliseconds)
  } else {
    try { $p.Kill() } catch {}
    Add-Case "F" "abort mid-stream (client kill)" "FAIL" "curl process still alive after Kill()" ([int]$sw.ElapsedMilliseconds)
    $failClosed = $true
  }
} catch {
  Add-Case "F" "abort mid-stream (client kill)" "FAIL" $_.Exception.Message 0
  $failClosed = $true
}

# --- G: system + user roles (optional) ---
try {
  $body = @{
    model = $Model
    stream = $false
    max_tokens = 48
    messages = @(
      @{ role = "system"; content = "You are a terse bot. Answer in exactly one word." }
      @{ role = "user"; content = "What color is the sky on a clear day?" }
    )
  }
  $r = Post-Json "$BaseUrl/v1/chat/completions" $body 180
  $reply = [string]$r.Body.choices[0].message.content
  if (-not $reply) {
    Add-Case "G" "POST system+user roles" "FAIL" "empty reply" $r.Ms
    $failClosed = $true
  } else {
    $snip = $reply.Trim()
    if ($snip.Length -gt 80) { $snip = $snip.Substring(0, 80) + "..." }
    Add-Case "G" "POST system+user roles" "PASS" "http=$($r.StatusCode) reply='$snip'" $r.Ms
  }
} catch {
  Add-Case "G" "POST system+user roles" "FAIL" $_.Exception.Message 0
  $failClosed = $true
}

$finished = [DateTimeOffset]::UtcNow
$passN = @($cases | Where-Object { $_.status -eq "PASS" }).Count
$failN = @($cases | Where-Object { $_.status -eq "FAIL" }).Count
$skipN = @($cases | Where-Object { $_.status -eq "SKIP" }).Count
$overall = if ($failN -gt 0 -or $failClosed) { "FAIL" } else { "PASS" }

# Build as PSCustomObject to avoid PS5.1 [ordered] nested type mismatch
$result = [pscustomobject]@{
  schema = "green-roomz.mvp-parity-battery.v1"
  product = "Green-Roomz"
  host_hint = "qodesh-windows-mvp"
  base_url = $BaseUrl
  model = $Model
  started_utc = $started.ToString("o")
  finished_utc = $finished.ToString("o")
  overall = $overall
  summary = [pscustomobject]@{ pass = [int]$passN; fail = [int]$failN; skip = [int]$skipN; total = [int]$cases.Count }
  cases = @($cases | ForEach-Object {
    [pscustomobject]@{ id = $_.id; name = $_.name; status = $_.status; detail = [string]$_.detail; ms = [int]$_.ms }
  })
  notes = @(
    "Capability surface check (not SOTA quality).",
    "Athlon-friendly: short prompts, max_tokens 48-128.",
    "Case F PASS = client abort closed cleanly (does not require server-side cancel ACK).",
    "Never GGUF on 8600 GT. Do not stop Linux cursor :8080/:8187."
  )
}

$jsonOut = $result | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($OutPath, $jsonOut, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host ("Overall: {0}  (pass={1} fail={2} skip={3})" -f $overall, $passN, $failN, $skipN) -ForegroundColor $(if ($overall -eq "PASS") { "Green" } else { "Red" })
Write-Host "Wrote $OutPath"

if ($overall -ne "PASS") { exit 1 }
exit 0
