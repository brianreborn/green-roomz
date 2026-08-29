$ErrorActionPreference = "Stop"
$BinaryPath = "C:\\LocalAI\\llama-b10665-bin-win-vulkan-x64\\llama-server.exe"

# Escaped UTF-8 Emoji Definitions
$Rocket = [char]0xD83D + [char]0xDE80; $Check = [char]0x2705; $StopSign = [char]0xD83D + [char]0xDFD1; $Hourglass = [char]0x23F3; $Brain = [char]0xD83E + [char]0xE0E0; $Robot = [char]0xD83E + [char]0xDD16; $Warning = [char]0x274C; $Gear = [char]0x2699

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "$Rocket RUNNING NATIVE GROK-CODE PLATFORM ON SHALOM" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Clear out any broken text fragments from the cache folder
$BadFile = "C:\LocalAI\.cache\Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf"
if (Test-Path $BadFile) { Remove-Item $BadFile -Force }

$StaleProcesses = Get-Process -Name "llama-server" -ErrorAction SilentlyContinue
if ($StaleProcesses) {
    Write-Host "$StopSign Clearing old background server instances..." -ForegroundColor Yellow
    Stop-Process -Name "llama-server" -Force; Start-Sleep -Seconds 2
}

Write-Host "$Hourglass Initializing async Vulkan abstraction layer..." -ForegroundColor Gray

# Use WScript.Shell COM routing to spin up a truly unprivileged, raw background thread process
$WshShell = New-Object -ComObject WScript.Shell
$ExecCmd = "`"$BinaryPath`" -hf Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M --host 127.0.0.1 --port 8081 --n-gpu-layers 99 --threads 4 --batch-size 512 --ubatch-size 512 --split-mode none"
$WshShell.Run($ExecCmd, 0, $false)

Write-Host "$Gear Streaming weights from HF and warming VRAM. Waiting for port 8081..." -ForegroundColor Yellow
$PortBound = $false
$RetryCount = 0
$MaxRetries = 480 # Up to 120 seconds (250ms polling intervals)

while (-not $PortBound -and $RetryCount -lt $MaxRetries) {
    $CheckPort = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
    if ($CheckPort) {
        $PortBound = $true
    } else {
        Start-Sleep -Milliseconds 250
        $RetryCount++
        if ($RetryCount % 4 -eq 0) {
            Write-Progress -Activity "Loading LocalAI Backend Engine" -Status "Streaming weights layer (Attempt $($RetryCount/4)/120s)..."
        }
    }
}

if (-not $PortBound) {
    throw "Initialization failed: Port 8081 did not open within the expected timeline."
}

Write-Host "$Check Native suite successfully bound to network interface loop!" -ForegroundColor Green
Write-Host "$Brain Feeding local offline engineering session prompt..." -ForegroundColor Cyan

$Payload = @{
    model = "local-model"
    messages = @(
        @{ role = "system"; content = "You are an efficient, local offline engineering agent running directly on host hardware (machine: shalom). Process tasks step-by-step using strict logical constraints. Keep responses concise and structurally clean." },
        @{ role = "user"; content = "Analyze the local environment configuration, read back success validation benchmarks, and declare operational availability." }
    )
} | ConvertTo-Json -Depth 5 -Compress

try {
    $Response = Invoke-RestMethod -Uri "http://127.0.0.1:8081/v1/chat/completions" -Method Post -ContentType "application/json" -Body $Payload
    Write-Host "$Check RESTART_DONE. Local engine is fully live on shalom!" -ForegroundColor Green
    Write-Host "$Robot Response: " -ForegroundColor White
    $Response.choices.message.content
} catch {
    Write-Host "$Warning Endpoint failed to respond. Check if your graphics engine layer rejected the layer count mapping flags." -ForegroundColor Red
}
Write-Host "=============================================" -ForegroundColor Cyan
