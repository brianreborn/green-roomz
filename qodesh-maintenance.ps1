# qodesh-maintenance.ps1
# Proactive health-check for the qodesh Windows LocalAI stack.
# Fully non-interactive. Run as Administrator.

function Write-Info   { param($m) Write-Host ("[INFO]  " + $m) -ForegroundColor Cyan   }
function Write-Ok     { param($m) Write-Host ("[OK]    " + $m) -ForegroundColor Green  }
function Write-Warn   { param($m) Write-Host ("[WARN]  " + $m) -ForegroundColor Yellow }
function Write-ErrorM { param($m) Write-Host ("[ERROR] " + $m) -ForegroundColor Red    }

# 1 - Kill stray llama-server
Write-Info "Stopping stray llama-server..."
Get-Process -Name llama-server -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
Write-Ok "Stray processes stopped."

# 2 - Firewall ports 8080 and 8081
foreach ($p in @(8080, 8081)) {
    $ruleName = "LocalAI port " + $p
    if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound `
            -Action Allow -Protocol TCP -LocalPort $p `
            -Profile Any -ErrorAction SilentlyContinue | Out-Null
        Write-Info ("Created firewall rule for port " + $p)
    } else {
        Write-Info ("Firewall rule for port " + $p + " already exists.")
    }
}
Write-Ok "Firewall rules ready."

# 3 - AMD Vulkan driver check
$driverInfo = Get-ItemProperty -Path "HKLM:\SOFTWARE\AMD\ATI\ACE\" -ErrorAction SilentlyContinue
if ($driverInfo -and $driverInfo.DriverVersion) {
    $ver = [version]$driverInfo.DriverVersion
    if ($ver -ge [version]"23.6") {
        Write-Ok ("AMD Vulkan driver " + $ver + " OK.")
    } else {
        Write-Warn ("AMD driver " + $ver + " is older than 23.6 - upgrade recommended.")
    }
} else {
    Write-Warn "Could not read AMD driver version from registry."
}

# 4 - Launch backend
$backendPath = "C:\LocalAI\native-engines.ps1"
if (-not (Test-Path -LiteralPath $backendPath)) { Write-ErrorM ("Backend not found: " + $backendPath); exit 1 }
Write-Info ("Launching backend: " + $backendPath)
& $backendPath
Start-Sleep -Seconds 2

# 5 - Wait for ports
function Wait-ForPort {
    param([int]$port, [int]$maxSec = 15)
    $elapsed = 0
    while ($elapsed -lt $maxSec) {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { return $true }
        Start-Sleep -Milliseconds 500
        $elapsed += 0.5
    }
    return $false
}
$ok80 = Wait-ForPort 8080
$ok81 = Wait-ForPort 8081
if ($ok80 -and $ok81) {
    Write-Ok "Ports 8080 and 8081 listening."
} else {
    Write-ErrorM "One or both ports failed to bind."
    exit 1
}

# 6 - Benchmark
$benchPath = "C:\LocalAI\benchmark-all-models.ps1"
if (Test-Path -LiteralPath $benchPath) {
    Write-Info "Running benchmark suite..."
    & $benchPath
    if ($LASTEXITCODE -eq 0) { Write-Ok "Benchmark done." }
    else { Write-Warn ("Benchmark exit code: " + $LASTEXITCODE) }
} else {
    Write-Warn ("Benchmark not found: " + $benchPath)
}

# 7 - Scheduled task (hourly)
$taskName = "QodeshMaintenance"
$thisScript = $MyInvocation.MyCommand.Path
Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue |
    Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
$action    = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument ("-NoProfile -ExecutionPolicy Bypass -File `"" + $thisScript + "`"")
$trigger   = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 365)
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" `
    -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Principal $principal -Description "Hourly qodesh health-check" `
    -ErrorAction SilentlyContinue | Out-Null
Write-Ok ("Task " + $taskName + " installed.")
Write-Info "Maintenance complete."