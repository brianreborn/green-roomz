[CmdletBinding()]
param(
  [int]$IntervalSec = 300,
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$Data = Join-Path $Root 'data'
$Log = Join-Path $Data 'repo-sync.log'
$PidFile = Join-Path $Data 'repo-sync.pid'
New-Item -ItemType Directory -Force -Path $Data | Out-Null

function Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'o'), $Message
  Add-Content -LiteralPath $Log -Value $line -Encoding utf8
  Write-Output $line
}

if (Test-Path $PidFile) {
  $oldPid = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue
  if ($oldPid -and (Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue)) {
    Log "already running pid=$oldPid"
    exit 0
  }
}
[System.IO.File]::WriteAllText($PidFile, [string]$PID)

function Git([string[]]$Args) {
  & git -C $Root @Args 2>&1
  return $LASTEXITCODE
}

try {
  Log "worker started pid=$PID branch=$Branch interval=${IntervalSec}s"
  while ($true) {
    $status = @(git -C $Root status --porcelain 2>&1)
    $fetchOutput = @(git -C $Root fetch --prune origin 2>&1)
    $fetchCode = $LASTEXITCODE
    if ($fetchCode -ne 0) {
      Log ("fetch failed exit=$fetchCode " + (($fetchOutput -join ' ') -replace '\s+', ' ').Trim())
    } else {
      $ahead = @(git -C $Root rev-list --count "HEAD..origin/$Branch" 2>&1)[-1]
      $behind = @(git -C $Root rev-list --count "origin/$Branch..HEAD" 2>&1)[-1]
      if ($status.Count -gt 0) {
        Log "local changes present; no merge remote_ahead=$ahead local_ahead=$behind"
      } elseif ([int]$ahead -gt 0 -and [int]$behind -eq 0) {
        $mergeOutput = @(git -C $Root merge --ff-only "origin/$Branch" 2>&1)
        $mergeCode = $LASTEXITCODE
        Log "fast-forward exit=$mergeCode remote_ahead=$ahead $($mergeOutput -join ' ')"
      } else {
        Log "up to date remote_ahead=$ahead local_ahead=$behind"
      }
    }
    Start-Sleep -Seconds ([Math]::Max(30, $IntervalSec))
  }
} finally {
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  Log 'worker stopped'
}
