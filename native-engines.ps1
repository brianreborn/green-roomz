[CmdletBinding()]
param(
    [ValidateSet('auto', 'gpu', 'cpu')]
    [string]$Mode = 'auto',
    [int]$StartupTimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'
$Root = 'C:\LocalAI'
$BinaryPath = Join-Path $Root 'llama-b10665-bin-win-vulkan-x64\llama-server.exe'
$LocalModel = Join-Path $Root 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf'
$Port = 8081
$HealthUri = "http://127.0.0.1:$Port/v1/models"
$ChatUri = "http://127.0.0.1:$Port/v1/chat/completions"
$RunLog = Join-Path $Root 'shalom-backend-native.log'
$RunErr = Join-Path $Root 'shalom-backend-native.err'

function Test-HealthyBackend {
    try {
        $models = Invoke-RestMethod -Uri $HealthUri -Method Get -TimeoutSec 2 -ErrorAction Stop
        return [bool]($models -and $models.data)
    } catch { return $false }
}

function Test-ChatBackend {
    $payload = @{ model = 'local-model'; messages = @(@{ role = 'user'; content = 'Ping' }); max_tokens = 1 } |
        ConvertTo-Json -Depth 5 -Compress
    try {
        $response = Invoke-RestMethod -Uri $ChatUri -Method Post -ContentType 'application/json' -Body $payload -TimeoutSec 10 -ErrorAction Stop
        return [bool]($response -and $response.choices)
    } catch { return $false }
}

function Stop-OwnedProcess {
    param([System.Diagnostics.Process]$Process)
    if ($Process -and -not $Process.HasExited) {
        Write-Host "[WARN] Stopping failed Shalom backend process $($Process.Id)." -ForegroundColor Yellow
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        $Process.WaitForExit(5000)
    }
}

function Start-BackendAttempt {
    param([string]$Name, [int]$GpuLayers)
    $serverArgs = @(
        '-m', $LocalModel, '--host', '127.0.0.1', '--port', "$Port",
        '--n-gpu-layers', "$GpuLayers", '--threads', '6',
        '--batch-size', '512', '--ubatch-size', '512', '--split-mode', 'none'
    )
    Write-Host "[START] Shalom native backend ($Name; GPU layers=$GpuLayers)" -ForegroundColor Yellow
    $process = Start-Process -FilePath $BinaryPath -ArgumentList $serverArgs -WorkingDirectory $Root `
        -RedirectStandardOutput $RunLog -RedirectStandardError $RunErr -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($process.HasExited) {
            Write-Host "[WARN] Native backend exited during $Name startup (code $($process.ExitCode))." -ForegroundColor Yellow
            return $false
        }
        if ((Test-HealthyBackend) -and (Test-ChatBackend)) {
            Write-Host "[OK] Local engine live on Shalom ($Name)." -ForegroundColor Green
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    Write-Host "[WARN] Native backend did not pass health checks within $StartupTimeoutSeconds seconds ($Name)." -ForegroundColor Yellow
    Stop-OwnedProcess -Process $process
    return $false
}

Write-Host '=============================================' -ForegroundColor Cyan
Write-Host 'RUNNING NATIVE LOCALAI PLATFORM ON SHALOM' -ForegroundColor Cyan
Write-Host '=============================================' -ForegroundColor Cyan
if (-not (Test-Path -LiteralPath $BinaryPath)) { throw "Shalom backend binary is missing: $BinaryPath" }
if (-not (Test-Path -LiteralPath $LocalModel)) { throw "Shalom model is missing: $LocalModel" }

# Reuse only a backend that proves it can serve a request. A stale listener is
# not killed because it may belong to another local service.
$ExistingPort = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($ExistingPort) {
    if ((Test-HealthyBackend) -and (Test-ChatBackend)) {
        Write-Host "[REUSE] Healthy backend already listening on port $Port." -ForegroundColor Green
        exit 0
    }
    throw "Port $Port is occupied by an unhealthy listener; refusing to terminate an unknown process."
}

$ready = $false
if ($Mode -in @('auto', 'gpu')) { $ready = Start-BackendAttempt -Name 'GPU' -GpuLayers 99 }
if (-not $ready -and $Mode -in @('auto', 'cpu')) {
    Write-Host '[FALLBACK] Retrying Shalom backend in CPU mode after native startup failure.' -ForegroundColor Yellow
    $ready = Start-BackendAttempt -Name 'CPU fallback' -GpuLayers 0
}
if (-not $ready) { throw "Shalom native backend failed health checks in $Mode mode. See $RunLog and $RunErr" }

Write-Host '=============================================' -ForegroundColor Cyan
exit 0
