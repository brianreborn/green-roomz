$dest = 'C:\LocalAI\Qwen3-4B-Q4_K_M.gguf'
$status = Join-Path (Split-Path -Parent $PSScriptRoot) '\data\qwen3-4b-download-status.json'
$expected = 2497280256
if (Test-Path $dest) {
  $len = (Get-Item $dest).Length
  $pct = [math]::Round(100.0 * $len / $expected, 1)
  Write-Output ("size={0} pct={1} expected={2}" -f $len, $pct, $expected)
} else {
  Write-Output 'size=0 file-missing'
}
if (Test-Path $status) { Get-Content $status -Raw }
Get-Process curl,curl.exe -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,CPU | Format-Table -AutoSize | Out-String
