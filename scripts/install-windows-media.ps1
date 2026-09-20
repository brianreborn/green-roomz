[CmdletBinding()]
param(
  [switch]$InstallWsl,
  [switch]$InstallFestival,
  [switch]$DownloadVision,
  [switch]$DownloadImageRuntime,
  [string]$Distribution = 'Ubuntu',
  [string]$ImageRuntimeUrl = $env:GRZ_IMAGE_RUNTIME_URL
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$localAi = if ($env:GRZ_LOCALAI_ROOT) { $env:GRZ_LOCALAI_ROOT } else { 'C:\LocalAI' }

function Is-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-WslDistribution {
  $rows = @(wsl.exe --list --quiet 2>$null | ForEach-Object { ($_ -replace "`0", '').Trim() } | Where-Object { $_ })
  return $rows
}

if ($InstallWsl) {
  if (-not (Is-Administrator)) {
    throw 'Installing WSL requires an elevated PowerShell. Re-run this script as Administrator with -InstallWsl.'
  }
  $distros = @(Get-WslDistribution)
  if ($distros.Count -eq 0) {
    Write-Host "WSL feature is already available; installing missing distribution $Distribution only."
    winget.exe install --id Canonical.$Distribution --source winget --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { throw "${Distribution} installation failed with exit code $LASTEXITCODE." }
    $distros = @(Get-WslDistribution)
    if ($distros.Count -eq 0) {
      Write-Warning "$Distribution package installed but WSL has not registered it yet. Launch the installed $Distribution app once, then rerun -InstallFestival."
    }
  } else {
    Write-Host ("WSL already has: " + ($distros -join ', '))
  }
}

if ($InstallFestival) {
  $distros = @(Get-WslDistribution)
  if ($distros -notcontains $Distribution) {
    throw "WSL distribution '$Distribution' is not installed. Run this script with -InstallWsl first, then reboot if Windows requests it."
  }
  $packages = 'festival festvox-kallpc16k festlex-oald festlex-poslex'
  Write-Host "Installing Festival/FestVox/Festlex in WSL $Distribution..."
  wsl.exe --distribution $Distribution --user root -- bash -lc "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y $packages"
  if ($LASTEXITCODE -ne 0) { throw "Festival package installation failed with exit code $LASTEXITCODE" }
  wsl.exe --distribution $Distribution --user root -- bash -lc 'command -v festival && festival --version'
  if ($LASTEXITCODE -ne 0) { throw 'Festival installation completed without a usable festival executable.' }
}

if ($DownloadVision) {
  & (Join-Path $PSScriptRoot 'prepare-windows-media.ps1') -DownloadVision
  if ($LASTEXITCODE -notin @(0, 2)) { throw "Vision preparation failed with exit code $LASTEXITCODE" }
}

if ($DownloadImageRuntime) {
  if ([string]::IsNullOrWhiteSpace($ImageRuntimeUrl)) {
    throw 'Set GRZ_IMAGE_RUNTIME_URL to a compatible stable-diffusion.cpp Windows archive before using -DownloadImageRuntime.'
  }
  $target = Join-Path $localAi 'stable-diffusion.cpp'
  $archive = Join-Path $env:TEMP 'green-roomz-stable-diffusion-runtime.zip'
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Write-Host "Downloading image runtime from $ImageRuntimeUrl"
  & curl.exe -L --fail --retry 8 --retry-all-errors --retry-delay 3 -C - -o "$archive.partial" $ImageRuntimeUrl
  if ($LASTEXITCODE -ne 0) { throw "Image runtime download failed with exit code $LASTEXITCODE" }
  Move-Item -Force "$archive.partial" $archive
  Expand-Archive -Force -Path $archive -DestinationPath $target
  Remove-Item -Force $archive
  $server = Get-ChildItem $target -Filter 'sd-server.exe' -Recurse -File | Select-Object -First 1
  if (-not $server) { throw "Image runtime archive extracted, but sd-server.exe was not found under $target." }
  Write-Host "Image runtime installed: $($server.FullName)"
}

Write-Host 'Windows media dependency installation complete.'
