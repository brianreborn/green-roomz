# qodesh-startup.ps1 - one-shot bootstrap. Run as Administrator.
function Write-Info   { param($m) Write-Host ("[INFO]  " + $m) -ForegroundColor Cyan }
function Write-Ok     { param($m) Write-Host ("[OK]    " + $m) -ForegroundColor Green }
function Write-ErrorM { param($m) Write-Host ("[ERROR] " + $m) -ForegroundColor Red }

if ($env:OS -ne "Windows_NT") { Write-ErrorM "Windows only"; exit 1 }
Write-Info "Starting qodesh bootstrap."

# 1 - kill stray processes
Get-Process -Name llama-server,node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 2 - validate manifest
$manifestPath = "C:\LocalAI\android-pack\grz-termux\config\agents.windows.json"
if (-not (Test-Path -LiteralPath $manifestPath)) { Write-ErrorM "Manifest missing"; exit 1 }
try {
    $m = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $ports = @()
    foreach ($a in $m.agents) {
        if (-not $a.alias) { throw "Agent missing alias" }
        if ($a.port) { $ports += [int]$a.port }
    }
    if ($ports.Count -ne ($ports | Sort-Object -Unique).Count) { throw "Duplicate ports" }
    Write-Ok "Manifest valid."
} catch { Write-ErrorM ("Manifest error: " + $_); exit 1 }

# 3 - launch backend
$backend = "C:\LocalAI\native-engines.ps1"
if (-not (Test-Path -LiteralPath $backend)) { Write-ErrorM "Backend not found"; exit 1 }
Write-Info "Launching backend..."
& $backend
if ($LASTEXITCODE -ne 0) { Write-ErrorM ("Backend failed: " + $LASTEXITCODE); exit 1 }
Start-Sleep -Seconds 2

# 4 - launch gateway
$gwScript = "C:\LocalAI\start-gateway.ps1"
if (-not (Test-Path -LiteralPath $gwScript)) { Write-ErrorM "Gateway launcher missing"; exit 1 }
Write-Info "Launching gateway..."
& $gwScript
Start-Sleep -Seconds 4

# 5 - health check
$url = "http://127.0.0.1:8080/v1/models"
$r = $null
for ($i = 0; $i -lt 10; $i++) {
    try {
        $r = Invoke-RestMethod -Uri $url -Method GET -ErrorAction Stop
        if ($r -and $r.object -eq "list") { break }
    } catch { }
    Start-Sleep -Seconds 2
}

if ($r -and $r.object -eq "list") {
    Write-Ok ("Gateway OK - " + $r.data.Count + " agents registered.")
} else {
    Write-ErrorM "Gateway not responding on port 8080."
    exit 1
}

# 6 - hourly scheduled task
$task = "QodeshAutoHeal"
Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue |
    Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
$sp = $MyInvocation.MyCommand.Path
$ta = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument ("-NoProfile -ExecutionPolicy Bypass -File `"" + $sp + "`"")
$tr = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration ([TimeSpan]::MaxValue)
$pr = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" `
    -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $task -Action $task -Trigger $tr -Principal $pr `
    -Description "Hourly self-heal" -ErrorAction SilentlyContinue | Out-Null
Write-Ok ("Task " + $task + " registered.")
Write-Info "Bootstrap complete."