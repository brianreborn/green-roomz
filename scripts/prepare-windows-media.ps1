[CmdletBinding()]
param(
  [switch]$DownloadVision,
  [switch]$DownloadImageGeneration,
  [string]$VisionModelUrl = $env:GRZ_VISION_MODEL_URL,
  [string]$VisionProjectorUrl = $env:GRZ_VISION_PROJECTOR_URL,
  [string]$ImageRuntimeUrl = $env:GRZ_IMAGE_RUNTIME_URL,
  [string]$ImageModelUrl = $env:GRZ_IMAGE_MODEL_URL
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$localAi = if ($env:GRZ_LOCALAI_ROOT) { $env:GRZ_LOCALAI_ROOT } else { 'C:\LocalAI' }
$report = [ordered]@{ vision = @(); image_generation = @() }

function Test-Artifact([string]$Kind, [string]$Path, [string]$Url, [switch]$Download) {
  $result = [ordered]@{ kind = $Kind; path = $Path; present = Test-Path -LiteralPath $Path }
  if (-not $result.present -and $Download) {
    if ([string]::IsNullOrWhiteSpace($Url)) {
      throw "$Kind is missing at '$Path'. Set the matching download URL parameter/environment variable before using -Download$($Kind -replace ' ', '')."
    }
    $partial = "$Path.partial"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    Write-Host "Downloading $Kind -> $Path"
    & curl.exe -L --fail --retry 8 --retry-all-errors --retry-delay 3 -C - -o $partial $Url
    if ($LASTEXITCODE -ne 0) { throw "Download failed for $Kind ($LASTEXITCODE): $Url" }
    Move-Item -Force $partial $Path
    $result.present = Test-Path -LiteralPath $Path
  }
  if (-not $result.present) { $result.missing = $true }
  return [pscustomobject]$result
}

$report.vision += Test-Artifact 'vision model' (Join-Path $localAi 'qwen2.5-vl-3b-instruct-q4_k_m.gguf') $VisionModelUrl -Download:$DownloadVision
$report.vision += Test-Artifact 'vision projector' (Join-Path $localAi 'qwen2.5-vl-3b-mmproj-f16.gguf') $VisionProjectorUrl -Download:$DownloadVision
$report.image_generation += Test-Artifact 'image runtime' (Join-Path $localAi 'stable-diffusion.cpp\bin\sd-server.exe') $ImageRuntimeUrl -Download:$DownloadImageGeneration
$report.image_generation += Test-Artifact 'image model' (Join-Path $localAi 'stable-diffusion.cpp\models\sd15-q4_0.gguf') $ImageModelUrl -Download:$DownloadImageGeneration

$report | ConvertTo-Json -Depth 4
$missing = @($report.vision + $report.image_generation | Where-Object { $_.missing })
if ($missing.Count) {
  Write-Warning ("Media preflight missing: " + (($missing | ForEach-Object { "$($_.kind) at $($_.path)" }) -join '; '))
  exit 2
}
Write-Host 'Media preflight OK: vision and image-generation artifacts are present.'
