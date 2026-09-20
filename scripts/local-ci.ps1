# Local CI loop for qodesh green-roomz. Totally offline. Append-only log.
$ErrorActionPreference = 'Continue'
$Root = 'C:\Users\brian\Documents\green-roomz'
$Node = 'C:\Program Files\nodejs\node.exe'
$Log = Join-Path $Root 'data\local-ci.log'
$IntervalSec = 900
$Sm11Ci = Join-Path $Root 'scripts\sm11-ci.ps1'
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'data') | Out-Null

function Stamp { Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK' }

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Stamp), $msg
  try { Add-Content -Path $Log -Value $line -Encoding utf8 } catch {}
  Write-Output $line
}

trap {
  Write-Log ("TRAP: " + $_.Exception.Message)
  continue
}

Write-Log "local-ci start pid=$PID interval=${IntervalSec}s ppid=$($PID)"
Set-Location $Root

while ($true) {
  $t0 = Get-Date
  $outFile = Join-Path $Root 'data\local-ci-last.txt'
  $code = -1
  try {
    $tests = @(Get-ChildItem -Path (Join-Path $Root 'test\*.test.mjs') | ForEach-Object { $_.FullName })
    if ($tests.Count -eq 0) { throw 'no test\*.test.mjs files' }
    # Direct invoke — nested Start-Process+redirect was dying mid-suite.
    & $Node --test @tests *> $outFile
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = -2 }
  } catch {
    Write-Log ("test-runner-exception: " + $_.Exception.Message)
    $code = 99
  }
  $tail = ''
  if (Test-Path $outFile) {
    $lines = Get-Content $outFile -ErrorAction SilentlyContinue
    $summary = $lines | Where-Object {
      $_ -match '^(# |ℹ )?(tests|pass|fail|cancelled|skipped|todo|duration_ms)\b'
    } | Select-Object -Last 8
    $tail = ($summary -join ' | ')
  }
  $elapsed = [int]((Get-Date) - $t0).TotalSeconds
  if ($code -eq 0) {
    Write-Log "PASS exit=0 ${elapsed}s $tail"
  } else {
    Write-Log "FAIL exit=$code ${elapsed}s $tail"
  }

  try {
    $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/health' -TimeoutSec 3
    Write-Log ("health status=" + $h.status)
  } catch {
    Write-Log 'health down'
  }

  # Optional sm11 ring probe — never fails the CI cycle.
  if (Test-Path -LiteralPath $Sm11Ci) {
    try {
      & $Sm11Ci -Root $Root -Log $Log | Out-Null
    } catch {
      Write-Log ("sm11 FAIL exception: " + $_.Exception.Message)
    }
  }

  Write-Log "sleep ${IntervalSec}s"
  Start-Sleep -Seconds $IntervalSec
  Write-Log 'wake'
}
