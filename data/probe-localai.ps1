$ErrorActionPreference = 'Continue'
Write-Output '=== LocalAI dir ==='
if (Test-Path 'C:\LocalAI') {
  Get-ChildItem 'C:\LocalAI' -File | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize | Out-String -Width 200
} else {
  Write-Output 'C:\LocalAI MISSING'
}
Write-Output '=== Qwen3-4B files ==='
Get-ChildItem 'C:\LocalAI' -Filter '*Qwen3-4B*' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName + ' size=' + $_.Length }
Get-ChildItem 'C:\LocalAI' -Filter '*qwen3-4b*' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName + ' size=' + $_.Length }
Write-Output '=== RAM ==='
$os = Get-CimInstance Win32_OperatingSystem
$totalGB = [math]::Round($os.TotalVisibleMemorySize/1MB,2)
$freeGB = [math]::Round($os.FreePhysicalMemory/1MB,2)
Write-Output ("totalGB={0} freeGB={1}" -f $totalGB, $freeGB)
Write-Output '=== disk C: ==='
$d = Get-PSDrive C
Write-Output ("usedGB={0} freeGB={1}" -f ([math]::Round($d.Used/1GB,2)), ([math]::Round($d.Free/1GB,2)))
Write-Output '=== tools ==='
foreach ($t in @('huggingface-cli','hf','curl','aria2c')) {
  $c = Get-Command $t -ErrorAction SilentlyContinue
  if ($c) { Write-Output ("{0} = {1}" -f $t, $c.Source) } else { Write-Output ("{0} = NOT FOUND" -f $t) }
}
Write-Output '=== python ==='
try { python --version 2>&1 | Out-String } catch { 'python missing' }
Write-Output '=== leftover procs ==='
Get-Process node,llama-server -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,WorkingSet64 | Format-Table -AutoSize | Out-String
Write-Output '=== project exists ==='
Test-Path ((Split-Path -Parent $PSScriptRoot) + '\bin\green-roomz.mjs')
Write-Output '=== node version ==='
& (Get-Command node -ErrorAction Stop).Source -v
Write-Output '=== convert_hf_to_gguf ==='
Get-ChildItem -Path 'C:\LocalAI',$env:USERPROFILE -Recurse -Filter 'convert_hf_to_gguf.py' -ErrorAction SilentlyContinue -Depth 5 | Select-Object -First 5 FullName
Write-Output '=== ports 18080 8184 8080 ==='
netstat -ano | Select-String ':18080|:8184|:8080 '
