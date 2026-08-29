# parallel-fleet-bootstrap.ps1
# Launches backend (native-engines.ps1) and gateway (bin/green-roomz.mjs serve)
# using Start-Process, monitors them, and registers hourly task.

function Write-Info   { param($m) Write-Host ("[INFO]  " + $m) -ForegroundColor Cyan   }
function Write-Ok     { param($m) Write-Host ("[OK]    " + $m) -ForegroundColor Green  }
function Write-Warn   { param($m) Write-Host ("[WARN]  " + $m) -ForegroundColor Yellow }
function Write-ErrorM { param($m) Write-Host ("[ERROR] " + $m) -ForegroundColor Red    }

if ($env:OS -ne "Windows_NT") { Write-ErrorM "Windows only."; exit 1 }
$hostName = if ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { hostname }
Write-Info ("Host: " + $hostName)

$backendScript = "C:\LocalAI\native-engines.ps1"
$gatewayEntry  = "C:\LocalAI\android-pack\grz-termux\bin\green-roomz.mjs"
$manifestPath  = "C:\LocalAI\android-pack\grz-termux\config\agents.windows.json"
$gatewayPort   = 8080

# Kill stray processes
Write-Info "Terminating stray llama-server and node..."
Get-Process -Name llama-server -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name node         -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Launch backend
if (-not (Test-Path -LiteralPath $backendScript)) { Write-ErrorM ("Backend missing: " + $backendScript); exit 1 }
Write-Info ("Starting backend: " + $backendScript)
& $backendScript
Start-Sleep -Seconds 2

# Launch gateway via Start-Process
if (-not (Test-Path -LiteralPath $gatewayEntry)) { Write-ErrorM ("Gateway entry missing: " + $gatewayEntry); exit 1 }
Write-Info ("Starting gateway: " + $gatewayEntry)
$gwArgs = @($gatewayEntry, 'serve', '--manifest', $manifestPath)
Start-Process -FilePath "node" -ArgumentList $gwArgs -WindowStyle Hidden
Start-Sleep -Seconds 4

# Check health
$url = "http://127.0.0.1:" + $gatewayPort + "/v1/models"
$r = $null
for ($i = 0; $i -lt 10; $i++) {
    try {
        $r = Invoke-RestMethod -Uri $url -Method GET -ErrorAction Stop
        if ($r -and $r.object -eq "list") { break }
    } catch { }
    Start-Sleep -Seconds 2
}

if ($r -and $r.object -eq "list") {
    Write-Ok ("Gateway online on port " + $gatewayPort + " with " + $r.data.Count + " agents.")
} else {
    Write-Warn ("Gateway failed to respond on port " + $gatewayPort)
}

# Hourly task
$taskName   = "ParallelFleetBootstrap"
$scriptFull = $MyInvocation.MyCommand.Path
Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue |
    Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
$action    = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument ("-NoProfile -ExecutionPolicy Bypass -File `"" + $scriptFull + "`"")
$trigger   = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration ([TimeSpan]::MaxValue)
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" `
    -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Principal $principal -Description "Hourly parallel fleet bootstrap" `
    -ErrorAction SilentlyContinue | Out-Null
Write-Ok ("Task " + $taskName + " registered.")
Write-Info "Bootstrap finished."