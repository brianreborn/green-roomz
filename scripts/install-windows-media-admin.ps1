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
$installer = Join-Path $PSScriptRoot 'install-windows-media.ps1'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$forward = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $installer)
if ($InstallWsl) { $forward += '-InstallWsl' }
if ($InstallFestival) { $forward += '-InstallFestival' }
if ($DownloadVision) { $forward += '-DownloadVision' }
if ($DownloadImageRuntime) { $forward += '-DownloadImageRuntime' }
if ($Distribution -ne 'Ubuntu') { $forward += @('-Distribution', $Distribution) }
if ($ImageRuntimeUrl) { $forward += @('-ImageRuntimeUrl', $ImageRuntimeUrl) }

if (-not $isAdmin) {
  Write-Host 'Requesting Administrator approval for Green-Roomz media installation...'
  $child = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WorkingDirectory $PSScriptRoot -ArgumentList $forward -Wait -PassThru
  exit $child.ExitCode
}

& powershell.exe @forward
exit $LASTEXITCODE
