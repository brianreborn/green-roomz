$ErrorActionPreference = "Stop"
$BinaryPath = 'C:\LocalAI\llama-b10665-bin-win-vulkan-x64\llama-server.exe'
$LocalModel = 'C:\LocalAI\qwen2.5-coder-1.5b-instruct-q4_k_m.gguf'

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "RUNNING NATIVE LOCALAI PLATFORM ON SHALOM" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Check if port 8081 is already listening
$ExistingPort = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
if (-not $ExistingPort) {
    Write-Host "Starting background llama-server on port 8081..." -ForegroundColor Yellow
    $ServerArgs = @(
        '-m', $LocalModel,
        '--host', '127.0.0.1',
        '--port', '8081',
        '--n-gpu-layers', '99',
        '--threads', '6',
        '--batch-size', '512',
        '--ubatch-size', '512',
        '--split-mode', 'none'
    )
    Start-Process -FilePath $BinaryPath -ArgumentList $ServerArgs -WindowStyle Hidden

    $PortBound = $false
    $RetryCount = 0
    while (-not $PortBound -and $RetryCount -lt 120) {
        Start-Sleep -Milliseconds 500
        $CheckPort = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
        if ($CheckPort) { $PortBound = $true }
        $RetryCount++
    }

    if (-not $PortBound) {
        throw "Initialization failed: Port 8081 did not open in 60s."
    }
}

Write-Host "[OK] Backend engine listening on port 8081." -ForegroundColor Green

# Wait for model load to complete (retry health ping)
$Payload = @{
    model = "local-model"
    messages = @( @{ role = "user"; content = "Ping" } )
} | ConvertTo-Json -Depth 5 -Compress

$Ready = $false
$PingTries = 0
while (-not $Ready -and $PingTries -lt 30) {
    try {
        $Response = Invoke-RestMethod -Uri "http://127.0.0.1:8081/v1/chat/completions" -Method Post -ContentType "application/json" -Body $Payload -ErrorAction Stop
        if ($Response -and $Response.choices) { $Ready = $true }
    } catch {
        Start-Sleep -Seconds 1
        $PingTries++
    }
}

if ($Ready) {
    Write-Host "[OK] Local engine live on shalom!" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host "[WARN] Health ping timed out waiting for model load." -ForegroundColor Yellow
    Write-Host "=============================================" -ForegroundColor Cyan
    exit 0
}