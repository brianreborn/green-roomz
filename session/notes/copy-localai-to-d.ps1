# Copy useful Green-Roomz LocalAI artifacts to D:\LocalAI
# GGUFs, Vulkan/CPU runtimes, Piper/Whisper/SD, EAGLE-3 convert output + source weights.
# Skips: eagle3-venv, zip extracts, curl logs, helper scripts.
# Requires NTFS or exFAT on D: (several GGUFs are >4 GB). Re-run is safe (robocopy /XO).

$ErrorActionPreference = 'Stop'
$Src = 'C:\LocalAI'
$Dst = 'D:\LocalAI'

if (-not (Test-Path -LiteralPath $Src)) { throw "Missing $Src" }
if (-not (Test-Path -LiteralPath 'D:\')) { throw 'D: is not available. Plug in the drive first.' }

$drive = New-Object System.IO.DriveInfo('D:\')
$fmt = $drive.DriveFormat
if ($fmt -eq 'FAT32') {
    throw "D: is FAT32. Format as NTFS or exFAT. qwen2.5-coder-7b is 4.4 GB and will not copy to FAT32."
}

function Invoke-Robo {
    param([string]$From, [string]$To, [string[]]$Files = $null, [string[]]$ExtraArgs = @())
    $parent = Split-Path -Parent $To
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    $args = @($From, $To)
    if ($Files) { $args += $Files }
    $args += @('/E', '/XO', '/J', '/R:3', '/W:5', '/MT:8', '/NFL', '/NDL', '/NP', '/NJH')
    $args += $ExtraArgs
    & robocopy @args | Out-Host
    $code = $LASTEXITCODE
    if ($code -ge 8) { throw "robocopy failed ($code): $From -> $To" }
    return $code
}

Write-Host "Source  $Src"
Write-Host "Dest    $Dst"
Write-Host ("D: {0}, {1:n1} GB free" -f $fmt, ($drive.AvailableFreeSpace / 1GB))
New-Item -ItemType Directory -Force -Path $Dst | Out-Null

Write-Host '`n== GGUFs =='
Get-ChildItem -LiteralPath $Src -File -Filter '*.gguf' |
    Where-Object { $_.Length -gt 1MB } |
    ForEach-Object {
        Write-Host ("  {0}  {1:n1} GB" -f $_.Name, ($_.Length / 1GB))
        Invoke-Robo -From $Src -To $Dst -Files @($_.Name) | Out-Null
    }

$dirs = @(
    'llama-b10665-bin-win-vulkan-x64',
    'piper',
    'whisper',
    'stable-diffusion.cpp',
    'llama.cpp-0.3.0'
)
Write-Host '`n== runtimes =='
foreach ($rel in $dirs) {
    $from = Join-Path $Src $rel
    if (-not (Test-Path -LiteralPath $from)) {
        Write-Host "  skip missing $rel"
        continue
    }
    Write-Host "  $rel"
    Invoke-Robo -From $from -To (Join-Path $Dst $rel) | Out-Null
}

$zip = Join-Path $Src 'llama-b10665-bin-win-vulkan-x64.zip'
if (Test-Path -LiteralPath $zip) {
    Write-Host '  llama-b10665-bin-win-vulkan-x64.zip'
    Invoke-Robo -From $Src -To $Dst -Files @('llama-b10665-bin-win-vulkan-x64.zip') | Out-Null
}

Write-Host '`n== EAGLE-3 convert (output already in GGUFs; copy source weights) =='
foreach ($rel in @('_tmp\Qwen3-4B_eagle3', '_tmp\Qwen3-4B')) {
    $from = Join-Path $Src $rel
    if (-not (Test-Path -LiteralPath $from)) {
        Write-Host "  skip missing $rel"
        continue
    }
    Write-Host "  $rel"
    Invoke-Robo -From $from -To (Join-Path $Dst $rel) | Out-Null
}

Write-Host '`n== done =='
$copied = (Get-ChildItem -LiteralPath $Dst -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum)
Write-Host ("D:\LocalAI  {0:n2} GB in {1} files" -f (($copied.Sum / 1GB)), $copied.Count)
Write-Host 'On the Compaq, copy D:\LocalAI to C:\LocalAI (or point GREEN_ROOMZ / agents.windows.json at D:\LocalAI).'
