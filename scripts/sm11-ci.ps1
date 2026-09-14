# Optional sm11 ring probe for local-ci. Non-fatal if exe/GPU missing.
# Usage: .\scripts\sm11-ci.ps1
#        .\scripts\sm11-ci.ps1 -Root C:\path\to\green-roomz
param(
  [string]$Root = 'C:\Users\brian\Documents\green-roomz',
  [string]$Log = ''
)

$ErrorActionPreference = 'Continue'
if (-not $Log) { $Log = Join-Path $Root 'data\local-ci.log' }
$Exe = Join-Path $Root 'native\sm11-monitor\out\sm11_monitor.exe'
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'data') | Out-Null

function Stamp { Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK' }

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Stamp), $msg
  try { Add-Content -Path $Log -Value $line -Encoding utf8 } catch {}
  Write-Output $line
}

if (-not (Test-Path -LiteralPath $Exe)) {
  Write-Log 'sm11 SKIP no sm11_monitor.exe'
  return
}

$slots = 16
$envBytes = 64
$stdin = @"
--json --ring-push --ring-slots $slots --env-bytes $envBytes
--json --ring-verify --ring-slots $slots --env-bytes $envBytes
--json --ring-drain 1 --ring-slots $slots --env-bytes $envBytes
quit
"@

$raw = ''
$code = -1
try {
  $raw = $stdin | & $Exe --serve 2>$null
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = -2 }
} catch {
  Write-Log ("sm11 FAIL spawn: " + $_.Exception.Message)
  return
}

$lines = @($raw | Where-Object { $_ -match '^\s*\{' })
$push = $null; $verify = $null; $drain = $null
foreach ($ln in $lines) {
  try {
    $j = $ln | ConvertFrom-Json -ErrorAction Stop
  } catch { continue }
  if ($null -eq $j) { continue }
  if ($j.PSObject.Properties.Name -contains 'ring_push_ok') { $push = $j }
  elseif ($j.PSObject.Properties.Name -contains 'ring_verify_ok') { $verify = $j }
  elseif ($j.PSObject.Properties.Name -contains 'ring_drain_ok') { $drain = $j }
}

$device = ''
foreach ($j in @($push, $verify, $drain)) {
  if ($j -and $j.device) { $device = [string]$j.device; break }
}

$pushOk = if ($push) { [bool]$push.ring_push_ok } else { $false }
$verifyOk = if ($verify) { [bool]$verify.ring_verify_ok } else { $false }
$checked = if ($verify -and $null -ne $verify.ring_verify_checked) { [int]$verify.ring_verify_checked } else { 0 }
$drainOk = if ($drain) { [bool]$drain.ring_drain_ok } else { $false }
$drained = if ($drain -and $null -ne $drain.ring_drained) { [int]$drain.ring_drained } else { 0 }
$allOk = $push -and $verify -and $drain -and $pushOk -and $verifyOk -and $drainOk -and ($checked -ge 1) -and ($drained -ge 1)

if ($allOk) {
  Write-Log "sm11 PASS push=1 verify=1/$checked drain=$drained device=$device exit=$code"
} elseif (-not $push -and -not $verify -and -not $drain) {
  $snippet = (($raw | Out-String) -replace '\s+', ' ').Trim()
  if ($snippet.Length -gt 160) { $snippet = $snippet.Substring(0, 160) + '…' }
  Write-Log "sm11 FAIL no-json exit=$code $snippet"
} else {
  Write-Log ("sm11 FAIL push={0} verify={1}/{2} drain={3}/{4} device={5} exit={6}" -f `
    $(if ($pushOk) { 1 } else { 0 }),
    $(if ($verifyOk) { 1 } else { 0 }),
    $checked,
    $(if ($drainOk) { 1 } else { 0 }),
    $drained,
    $device,
    $code)
}
