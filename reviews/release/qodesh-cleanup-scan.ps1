#Requires -Version 5.1
<#
.SYNOPSIS
  Read-only disk inventory for qodesh C: cleanup suggestions.
  DO NOT DELETE anything. Report only. McAfee-safe: short loops, no Add-Type.

.NOTES
  Target: qodesh (machineId 19f2c19e-e100-49f0-8507-813d66727973)
  Parent runs via cursor Shell with machineId. Executor box cannot.
  Output: console + optional -OutFile markdown/json summary.
#>
param(
  [string]$OutFile = '',
  [int]$TopN = 40,
  [long]$MinFileBytes = 50MB
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

function GB([long]$b) {
  if ($null -eq $b -or $b -lt 0) { return 'n/a' }
  return ('{0:N2}' -f ($b / 1GB))
}
function FolderSize([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $sum = 0L
  try {
    Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
      ForEach-Object { $sum += $_.Length }
  } catch {}
  return $sum
}
function SafeSize([string]$Path) {
  $s = FolderSize $Path
  if ($null -eq $s) { return @{ Exists = $false; Bytes = 0 } }
  return @{ Exists = $true; Bytes = [long]$s }
}

$report = [ordered]@{
  Host        = $env:COMPUTERNAME
  WhenUtc     = (Get-Date).ToUniversalTime().ToString('o')
  FreeC_GB    = $null
  UsedC_GB    = $null
  TotalC_GB   = $null
  Volumes     = @()
  LocalAI     = [ordered]@{}
  UsersTop    = @()
  ProgramFilesTop = @()
  Downloads   = @()
  DuplicateArchives = @()
  WingetLarge = @()
  PrefetchHints = @()
  Notes       = @()
}

Write-Host '=== qodesh cleanup SCAN (READ-ONLY) ==='
Write-Host ("Host: {0}  UTC: {1}" -f $report.Host, $report.WhenUtc)

# --- volumes ---
Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | ForEach-Object {
  $row = [ordered]@{
    Name   = $_.Name
    FreeGB = [math]::Round(($_.Free / 1GB), 2)
    UsedGB = [math]::Round(($_.Used / 1GB), 2)
    Root   = $_.Root
  }
  $report.Volumes += $row
  Write-Host ("Drive {0}: free={1} GB used={2} GB" -f $row.Name, $row.FreeGB, $row.UsedGB)
}
$c = Get-PSDrive C -ErrorAction SilentlyContinue
if ($c) {
  $report.FreeC_GB  = [math]::Round(($c.Free / 1GB), 2)
  $report.UsedC_GB  = [math]::Round(($c.Used / 1GB), 2)
  $report.TotalC_GB = [math]::Round((($c.Free + $c.Used) / 1GB), 2)
}

# --- LocalAI tree ---
$lai = 'C:\LocalAI'
Write-Host "`n=== C:\LocalAI ==="
if (Test-Path -LiteralPath $lai) {
  $laiTotal = SafeSize $lai
  $report.LocalAI.TotalGB = [math]::Round(($laiTotal.Bytes / 1GB), 2)
  Write-Host ("LocalAI TOTAL: {0} GB" -f $report.LocalAI.TotalGB)

  $kids = Get-ChildItem -LiteralPath $lai -Force -ErrorAction SilentlyContinue
  $kidRows = @()
  foreach ($k in $kids) {
    $bytes = 0L
    if ($k.PSIsContainer) {
      $bytes = [long](FolderSize $k.FullName)
    } else {
      $bytes = [long]$k.Length
    }
    $kidRows += [pscustomobject]@{
      Name     = $k.Name
      IsDir    = [bool]$k.PSIsContainer
      GB       = [math]::Round(($bytes / 1GB), 3)
      Bytes    = $bytes
      LastWrite = $k.LastWriteTime.ToString('s')
    }
  }
  $kidRows = $kidRows | Sort-Object Bytes -Descending
  $report.LocalAI.Children = $kidRows
  $kidRows | Select-Object -First 30 | Format-Table Name, IsDir, GB, LastWrite -AutoSize | Out-String | Write-Host

  # GGUFs
  $ggufs = Get-ChildItem -LiteralPath $lai -File -Filter '*.gguf' -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending |
    Select-Object Name, @{N='GB';E={[math]::Round($_.Length/1GB,3)}}, Length, LastWriteTime
  $report.LocalAI.GGUFs = @($ggufs)
  Write-Host 'GGUFs:'
  $ggufs | Format-Table -AutoSize | Out-String | Write-Host

  # zip vs unpacked pairs under LocalAI
  $zips = Get-ChildItem -LiteralPath $lai -Recurse -File -Include *.zip,*.7z,*.rar,*.tar,*.gz,*.bz2,*.xz,*.img,*.iso,*.memstick* -ErrorAction SilentlyContinue |
    Select-Object FullName, @{N='GB';E={[math]::Round($_.Length/1GB,3)}}, Length, LastWriteTime
  $report.LocalAI.Archives = @($zips)
  Write-Host 'Archives under LocalAI:'
  $zips | Format-Table -AutoSize | Out-String | Write-Host

  foreach ($z in $zips) {
    $base = [IO.Path]::GetFileNameWithoutExtension($z.FullName)
    # strip double extensions like .tar.gz / .iso.bz2
    if ($base -match '\.(tar|iso)$') { $base = [IO.Path]::GetFileNameWithoutExtension($base) }
    $parent = Split-Path -Parent $z.FullName
    $siblingDir = Join-Path $parent $base
    $unpacked = Test-Path -LiteralPath $siblingDir
    # also check common llama unzip folder next to zip in LocalAI root
    $alt = Join-Path $lai $base
    if (-not $unpacked -and (Test-Path -LiteralPath $alt)) { $unpacked = $true; $siblingDir = $alt }
    if ($unpacked) {
      $uBytes = FolderSize $siblingDir
      $report.DuplicateArchives += [pscustomobject]@{
        Archive   = $z.FullName
        ArchiveGB = $z.GB
        Unpacked  = $siblingDir
        UnpackedGB = if ($uBytes) { [math]::Round(($uBytes/1GB),3) } else { $null }
        Hint      = 'ZIP present AND unpacked folder exists — candidate to remove archive only AFTER verify'
      }
    }
  }
} else {
  $report.Notes += 'C:\LocalAI missing'
  Write-Host 'C:\LocalAI NOT FOUND'
}

# --- Users / Downloads / Documents ---
Write-Host "`n=== Users / Downloads / Documents (top-level sizes) ==="
$userRoots = @(
  'C:\Users\brian',
  'C:\Users\brian\Downloads',
  'C:\Users\brian\Documents',
  'C:\Users\brian\Desktop',
  'C:\Users\brian\AppData\Local',
  'C:\Users\brian\AppData\Local\Temp',
  'C:\Users\brian\AppData\Roaming',
  'C:\Users\brian\Documents\green-roomz',
  'C:\Users\brian\Documents\Codex'
)
foreach ($p in $userRoots) {
  $sz = SafeSize $p
  if ($sz.Exists) {
    $row = [pscustomobject]@{ Path = $p; GB = [math]::Round(($sz.Bytes/1GB),2) }
    $report.UsersTop += $row
    Write-Host ("  {0,8} GB  {1}" -f $row.GB, $p)
  } else {
    Write-Host ("  (missing) {0}" -f $p)
  }
}

# Top files in Downloads
$dl = 'C:\Users\brian\Downloads'
if (Test-Path -LiteralPath $dl) {
  Write-Host "`n=== Downloads large files (>=50MB) ==="
  $dfiles = Get-ChildItem -LiteralPath $dl -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -ge $MinFileBytes } |
    Sort-Object Length -Descending |
    Select-Object -First $TopN FullName, @{N='GB';E={[math]::Round($_.Length/1GB,3)}}, Length, LastWriteTime
  $report.Downloads = @($dfiles)
  $dfiles | Format-Table -AutoSize | Out-String | Write-Host

  # zip vs folder in Downloads
  Get-ChildItem -LiteralPath $dl -File -Include *.zip,*.7z,*.rar,*.iso,*.img,*.bz2 -ErrorAction SilentlyContinue |
    ForEach-Object {
      $base = [IO.Path]::GetFileNameWithoutExtension($_.Name)
      $dir = Join-Path $dl $base
      if (Test-Path -LiteralPath $dir) {
        $report.DuplicateArchives += [pscustomobject]@{
          Archive    = $_.FullName
          ArchiveGB  = [math]::Round(($_.Length/1GB),3)
          Unpacked   = $dir
          UnpackedGB = [math]::Round(((FolderSize $dir)/1GB),3)
          Hint       = 'Downloads: archive + same-name folder'
        }
      }
    }
}

# --- Program Files top folders ---
Write-Host "`n=== Program Files top folders ==="
foreach ($pf in @('C:\Program Files','C:\Program Files (x86)')) {
  if (-not (Test-Path -LiteralPath $pf)) { continue }
  Get-ChildItem -LiteralPath $pf -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $bytes = FolderSize $_.FullName
    $report.ProgramFilesTop += [pscustomobject]@{
      Path = $_.FullName
      GB   = [math]::Round(($bytes/1GB),2)
      LastWrite = $_.LastWriteTime.ToString('s')
    }
  }
}
$report.ProgramFilesTop = @($report.ProgramFilesTop | Sort-Object GB -Descending | Select-Object -First $TopN)
$report.ProgramFilesTop | Format-Table -AutoSize | Out-String | Write-Host

# --- Large files anywhere under key roots (shallow-ish via known roots) ---
Write-Host "`n=== Large files (>=200MB) under LocalAI / Users / ProgramData ==="
$bigRoots = @('C:\LocalAI','C:\Users\brian','C:\ProgramData')
$big = @()
foreach ($r in $bigRoots) {
  if (-not (Test-Path -LiteralPath $r)) { continue }
  Get-ChildItem -LiteralPath $r -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -ge 200MB } |
    Sort-Object Length -Descending |
    Select-Object -First 25 |
    ForEach-Object {
      $big += [pscustomobject]@{
        GB = [math]::Round(($_.Length/1GB),3)
        Path = $_.FullName
        LastWrite = $_.LastWriteTime.ToString('s')
      }
    }
}
$big = $big | Sort-Object GB -Descending | Select-Object -First $TopN
$report.LargeFiles = @($big)
$big | Format-Table -AutoSize | Out-String | Write-Host

# --- winget list (installed packages; size not always available) ---
Write-Host "`n=== winget list (installed; for uninstall-id suggestions) ==="
try {
  $wl = & winget list --accept-source-agreements 2>$null
  if ($wl) {
    $report.WingetRawLines = @($wl | Select-Object -First 200)
    $wl | Select-Object -First 80 | ForEach-Object { Write-Host $_ }
  }
} catch {
  $report.Notes += 'winget list failed'
  Write-Host 'winget list failed'
}

# Heuristic: Prefetch last-run (approximate "unused lately")
Write-Host "`n=== Prefetch age hints (EXE last referenced; noisy) ==="
$pfDir = 'C:\Windows\Prefetch'
if (Test-Path -LiteralPath $pfDir) {
  Get-ChildItem -LiteralPath $pfDir -Filter *.pf -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime |
    Select-Object -First 30 Name, LastWriteTime |
    ForEach-Object {
      $report.PrefetchHints += $_
      Write-Host ("  {0}  {1}" -f $_.LastWriteTime.ToString('s'), $_.Name)
    }
} else {
  Write-Host 'Prefetch not readable'
}

# FreeBSD / memstick / ISO keep list probe
Write-Host "`n=== Keep-list probe (FreeBSD memstick / ISO / img) ==="
$keepHits = Get-ChildItem -Path 'C:\','C:\Users\brian','C:\LocalAI' -Recurse -Force -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '(?i)freebsd|memstick|opnsense|\.img$|\.iso$' } |
  Select-Object -First 40 FullName, @{N='GB';E={[math]::Round($_.Length/1GB,3)}}, LastWriteTime
$report.KeepListHits = @($keepHits)
$keepHits | Format-Table -AutoSize | Out-String | Write-Host
$report.Notes += 'Operator: FreeBSD memstick KEPT — do not suggest delete'
$report.Notes += 'Operator: recycle emptied; LocalAI\_tmp + duplicate zips already deleted'
$report.Notes += 'REPORT ONLY — no deletes performed by this script'

Write-Host "`n=== Duplicate archive vs unpacked ==="
$report.DuplicateArchives | Format-List | Out-String | Write-Host

Write-Host "`n=== DONE (read-only) ==="
Write-Host ("C: free GB = {0}" -f $report.FreeC_GB)

if ($OutFile) {
  $dir = Split-Path -Parent $OutFile
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  ($report | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $OutFile -Encoding UTF8
  Write-Host ("Wrote JSON: {0}" -f $OutFile)
}

# Also emit a compact markdown sibling if OutFile ends with .json
if ($OutFile -and $OutFile -match '\.json$') {
  $md = $OutFile -replace '\.json$','.md'
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('# qodesh cleanup scan (raw)')
  [void]$sb.AppendLine(("Generated UTC: {0}" -f $report.WhenUtc))
  [void]$sb.AppendLine(("C: free **{0} GB** / used {1} GB / total {2} GB" -f $report.FreeC_GB, $report.UsedC_GB, $report.TotalC_GB))
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('## LocalAI children')
  if ($report.LocalAI.Children) {
    [void]$sb.AppendLine('| Name | Dir | GB | LastWrite |')
    [void]$sb.AppendLine('|------|-----|----|-----------|')
    foreach ($r in $report.LocalAI.Children) {
      [void]$sb.AppendLine(("| `{0}` | {1} | {2} | {3} |" -f $r.Name, $r.IsDir, $r.GB, $r.LastWrite))
    }
  }
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('## Notes')
  foreach ($n in $report.Notes) { [void]$sb.AppendLine("- $n") }
  $sb.ToString() | Set-Content -LiteralPath $md -Encoding UTF8
  Write-Host ("Wrote MD: {0}" -f $md)
}
