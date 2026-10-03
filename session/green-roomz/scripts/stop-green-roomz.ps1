$ErrorActionPreference = 'SilentlyContinue'
$stopped = @()
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
  if ($_.CommandLine -and $_.CommandLine -like '*green-roomz.mjs*') {
    Stop-Process -Id $_.ProcessId -Force
    $stopped += "node:$($_.ProcessId)"
  }
}
Get-Process llama-server -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.Id -Force
  $stopped += "llama-server:$($_.Id)"
}
if ($stopped.Count) { Write-Output ("stopped " + ($stopped -join ' ')) } else { Write-Output 'nothing-running' }
