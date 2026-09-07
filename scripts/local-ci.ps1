# Local CI watcher for qodesh green-roomz. Totally offline. Append-only log.
$ErrorActionPreference = 'Continue'
$Root = 'C:\Users\brian\Documents\green-roomz'
$Node = 'C:\Program Files\nodejs\node.exe'
$Log = Join-Path $Root 'data\local-ci.log'
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'data') | Out-Null

function Stamp { Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK' }

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Stamp), $msg
  try { Add-Content -Path $Log -Value $line -Encoding utf8 } catch {}
  Write-Output $line
}

Write-Log "local-ci watcher start pid=$PID ppid=$($PID)"
Set-Location $Root

function Invoke-CiCycle {
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

}

$watcher = New-Object IO.FileSystemWatcher $Root
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [IO.NotifyFilters]::LastWrite -bor [IO.NotifyFilters]::FileName
$watcher.Filter = '*.*'
$subscriptions = @(
  Register-ObjectEvent $watcher Changed -SourceIdentifier 'GreenRoomzCiChanged'
  Register-ObjectEvent $watcher Created -SourceIdentifier 'GreenRoomzCiCreated'
  Register-ObjectEvent $watcher Deleted -SourceIdentifier 'GreenRoomzCiDeleted'
  Register-ObjectEvent $watcher Renamed -SourceIdentifier 'GreenRoomzCiRenamed'
)

try {
  Invoke-CiCycle
  while ($true) {
    $event = Wait-Event
    if (-not $event) { continue }
    Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue
    $path = [string]$event.SourceEventArgs.FullPath
    if ($path -match '\\data\\|\\node_modules\\|\\\.git\\') { continue }
    Start-Sleep -Milliseconds 750
    while ($pending = Get-Event -SourceIdentifier 'GreenRoomzCiChanged' -ErrorAction SilentlyContinue) {
      Remove-Event -EventIdentifier $pending.EventIdentifier -ErrorAction SilentlyContinue
    }
    Write-Log "change detected path=$path"
    Invoke-CiCycle
  }
} finally {
  $subscriptions | Unregister-Event -Force -ErrorAction SilentlyContinue
  $watcher.Dispose()
  Write-Log 'local-ci watcher stopped'
}
