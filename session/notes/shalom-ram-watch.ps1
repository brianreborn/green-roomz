# Live RAM + llama working-set sampler for the watch console.
$ErrorActionPreference = 'SilentlyContinue'
while ($true) {
  $os = Get-CimInstance Win32_OperatingSystem
  $freeGB = [math]::Round($os.FreePhysicalMemory / 1048576, 2)
  $totalGB = [math]::Round($os.TotalVisibleMemorySize / 1048576, 2)
  $parts = New-Object System.Collections.Generic.List[string]
  Get-Process | Where-Object { $_.ProcessName -match 'llama' } | ForEach-Object {
    $ws = [math]::Round($_.WorkingSet64 / 1MB)
    [void]$parts.Add("$($_.ProcessName):$($_.Id):${ws}MB")
  }
  $ts = Get-Date -Format 'HH:mm:ss'
  $proc = if ($parts.Count) { [string]::Join(',', $parts) } else { '-' }
  Write-Output "$ts  shalom  free $freeGB / $totalGB GB  llama $proc"
  Start-Sleep -Seconds 5
}
