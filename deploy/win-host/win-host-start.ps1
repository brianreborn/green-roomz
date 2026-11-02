[CmdletBinding()]
param(
    [switch]$SmokeTest,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

function Get-GrzSetting {
    # Env var first, then the gitignored private override (KEY=VALUE lines), then default.
    param([string]$Name, [string]$Default = '', [string]$File = (Join-Path $PSScriptRoot 'local.env'))
    $v = [Environment]::GetEnvironmentVariable($Name)
    if ($v) { return $v }
    if ($File -and (Test-Path -LiteralPath $File)) {
        foreach ($line in Get-Content -LiteralPath $File) {
            if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $Matches[1] -eq $Name) { return $Matches[2] }
        }
    }
    return $Default
}

$Root = 'C:\LocalAI'
$GatewayRoot = Join-Path $Root 'android-pack\grz-termux'
$Manifest = Join-Path $GatewayRoot 'config\agents.windows.json'
$GatewayEntry = Join-Path $GatewayRoot 'bin\green-roomz.mjs'
$BackendLauncher = Join-Path $Root 'native-engines.ps1'
$SmokeTestEntry = Join-Path $GatewayRoot 'smoke-test.mjs'
$LaunchLog = Join-Path $Root 'win-host-launch.log'
$GatewayOut = Join-Path $Root 'gateway.log'
$GatewayErr = Join-Path $Root 'gateway.err'
$BackendLaunchOut = Join-Path $Root 'win-host-backend-launch.log'
$BackendLaunchErr = Join-Path $Root 'win-host-backend-launch.err'

function Write-LaunchLine {
    param([string]$Message)
    $line = '{0:o} {1}' -f (Get-Date), $Message
    Write-Host $Message
    Add-Content -LiteralPath $LaunchLog -Value $line -Encoding utf8
}

function Test-Listener {
    param([int]$Port)
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Test-Endpoint {
    param([string]$Uri)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 2
        # A 4xx response proves only that something is listening.  Do not
        # claim READY until the endpoint itself returns a successful status.
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    } catch {
        return $false
    }
}

function Wait-Endpoint {
    param(
        [string]$Name,
        [string]$Uri,
        [int]$TimeoutSeconds = 60
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Endpoint -Uri $Uri) {
            Write-LaunchLine "[OK] $Name is healthy at $Uri"
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "$Name did not become healthy at $Uri within $TimeoutSeconds seconds."
}

# The expected machine name is private: set GRZ_EXPECTED_COMPUTERNAME in the environment or in
# the gitignored local.env next to this script (see local.env.example).
$ExpectedComputer = Get-GrzSetting -Name 'GRZ_EXPECTED_COMPUTERNAME'
if (-not $ExpectedComputer) {
    Write-Warning 'GRZ_EXPECTED_COMPUTERNAME is not set; skipping the machine-name guard.'
} elseif ($env:COMPUTERNAME -ine $ExpectedComputer) {
    throw "This launcher is for $ExpectedComputer, not $($env:COMPUTERNAME)."
}

foreach ($requiredPath in @($GatewayRoot, $Manifest, $GatewayEntry, $BackendLauncher)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required Windows host artifact is missing: $requiredPath"
    }
}

[IO.File]::WriteAllText(
    $LaunchLog,
    ('{0:o} Starting Green-Roomz on WIN-HOST.{1}' -f (Get-Date), [Environment]::NewLine),
    [Text.UTF8Encoding]::new($false)
)

if (-not (Test-Listener -Port 8081)) {
    Write-LaunchLine '[START] Native Windows host backend on 127.0.0.1:8081'
    $backendProcess = Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $BackendLauncher) `
        -RedirectStandardOutput $BackendLaunchOut `
        -RedirectStandardError $BackendLaunchErr `
        -WindowStyle Hidden `
        -Wait `
        -PassThru
    if ($backendProcess.ExitCode -ne 0) {
        throw "Windows host backend launcher failed with exit code $($backendProcess.ExitCode). See $BackendLaunchErr"
    }
} else {
    Write-LaunchLine '[REUSE] Listener already present on 127.0.0.1:8081'
}
Wait-Endpoint -Name 'Windows host native backend' -Uri 'http://127.0.0.1:8081/v1/models' -TimeoutSeconds 75

if (-not (Test-Listener -Port 8080)) {
    Write-LaunchLine '[START] Green-Roomz Windows host gateway on 127.0.0.1:8080'
    $node = (Get-Command node -ErrorAction Stop).Source
    Start-Process -FilePath $node `
        -ArgumentList @($GatewayEntry, 'serve', '--manifest', $Manifest) `
        -WorkingDirectory $GatewayRoot `
        -RedirectStandardOutput $GatewayOut `
        -RedirectStandardError $GatewayErr `
        -WindowStyle Hidden | Out-Null
} else {
    Write-LaunchLine '[REUSE] Listener already present on 127.0.0.1:8080'
}
Wait-Endpoint -Name 'Green-Roomz gateway' -Uri 'http://127.0.0.1:8080/v1/models' -TimeoutSeconds 30

if ($SmokeTest) {
    if (-not (Test-Path -LiteralPath $SmokeTestEntry)) {
        throw "Smoke test is missing: $SmokeTestEntry"
    }
    Write-LaunchLine '[TEST] Running Green-Roomz smoke test'
    & node $SmokeTestEntry
    if ($LASTEXITCODE -ne 0) {
        throw "Smoke test exited with code $LASTEXITCODE."
    }
}

if (-not $NoBrowser) {
    Start-Process 'http://localhost:8080/'
}

Write-LaunchLine '[READY] Green-Roomz is running on WIN-HOST.'
