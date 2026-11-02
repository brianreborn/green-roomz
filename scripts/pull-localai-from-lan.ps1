# Run this ON a LAN box. Pulls useful LocalAI artifacts from the source host's LocalAI share.
# Skip USB. Requires: both on the same private LAN, source host sharing C:\LocalAI (read), network Private.
# Source shares come from GRZ_LOCALAI_SOURCES (semicolon-separated UNC paths), set in the
# environment or in the gitignored config/local.env (see config/local.env.example).
# Re-run is safe (robocopy /XO /Z).

$ErrorActionPreference = 'Stop'
function Get-GrzSetting {
    # Env var first, then the gitignored private override (KEY=VALUE lines), then default.
    param([string]$Name, [string]$Default = '', [string]$File = (Join-Path (Split-Path -Parent $PSScriptRoot) 'config\local.env'))
    $v = [Environment]::GetEnvironmentVariable($Name)
    if ($v) { return $v }
    if ($File -and (Test-Path -LiteralPath $File)) {
        foreach ($line in Get-Content -LiteralPath $File) {
            if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $Matches[1] -eq $Name) { return $Matches[2] }
        }
    }
    return $Default
}
$SrcRoot = 'C:\LocalAI'
$Hosts = @((Get-GrzSetting -Name 'GRZ_LOCALAI_SOURCES') -split ';' | Where-Object { $_ })
if (-not $Hosts) { throw 'Set GRZ_LOCALAI_SOURCES (env or config/local.env), e.g. \\<HOST>\LocalAI;\\192.0.2.10\LocalAI' }
$Dst = 'C:\LocalAI'
if ($env:LOCALAI_DST) { $Dst = $env:LOCALAI_DST }

$Src = $null
foreach ($candidate in $Hosts) {
    if (Test-Path -LiteralPath $candidate) { $Src = $candidate; break }
}
if (-not $Src) {
    throw @"
Cannot see the source host's LocalAI share (tried: $($Hosts -join ', ')).
On the source host: set its Wi-Fi network profile to Private, then share C:\LocalAI read-only as 'LocalAI'.
Then from this PC: ping <HOST>
"@
}

function Invoke-Robo {
    param([string]$From, [string]$To, [string[]]$Files = $null)
    $parent = Split-Path -Parent $To
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    $roboArgs = @($From, $To)
    if ($Files) { $roboArgs += $Files }
    $roboArgs += @('/E', '/XO', '/Z', '/J', '/R:8', '/W:5', '/MT:8', '/NFL', '/NDL', '/NP', '/NJH')
    & robocopy @roboArgs | Out-Host
    $code = $LASTEXITCODE
    if ($code -ge 8) { throw "robocopy failed ($code): $From -> $To" }
}

Write-Host "Source  $Src"
Write-Host "Dest    $Dst"
New-Item -ItemType Directory -Force -Path $Dst | Out-Null

Write-Host ''
Write-Host '== GGUFs =='
Get-ChildItem -LiteralPath $Src -File -Filter '*.gguf' |
    Where-Object { $_.Length -gt 1MB } |
    ForEach-Object {
        Write-Host ("  {0}  {1:n1} GB" -f $_.Name, ($_.Length / 1GB))
        Invoke-Robo -From $Src -To $Dst -Files @($_.Name)
    }

$dirs = @(
    'llama-b10665-bin-win-vulkan-x64',
    'piper',
    'whisper',
    'stable-diffusion.cpp',
    'llama.cpp-0.3.0'
)
Write-Host ''
Write-Host '== runtimes =='
foreach ($rel in $dirs) {
    $from = Join-Path $Src $rel
    if (-not (Test-Path -LiteralPath $from)) { Write-Host "  skip $rel"; continue }
    Write-Host "  $rel"
    Invoke-Robo -From $from -To (Join-Path $Dst $rel)
}

$zip = 'llama-b10665-bin-win-vulkan-x64.zip'
if (Test-Path -LiteralPath (Join-Path $Src $zip)) {
    Invoke-Robo -From $Src -To $Dst -Files @($zip)
}

Write-Host ''
Write-Host '== EAGLE-3 sources =='
foreach ($rel in @('_tmp\Qwen3-4B_eagle3', '_tmp\Qwen3-4B')) {
    $from = Join-Path $Src $rel
    if (-not (Test-Path -LiteralPath $from)) { Write-Host "  skip $rel"; continue }
    Write-Host "  $rel"
    Invoke-Robo -From $from -To (Join-Path $Dst $rel)
}

Write-Host ''
$copied = Get-ChildItem -LiteralPath $Dst -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum
Write-Host ("$Dst  {0:n2} GB in {1} files" -f ($copied.Sum / 1GB), $copied.Count)
