$ErrorActionPreference = 'Continue'
$root = 'C:\Users\brian\Documents\Codex\2026-08-28\files-pasted-by-the-user-1\outputs\green-roomz'
$node = 'C:\Program Files\nodejs\node.exe'
Set-Location $root

function Probe {
  $os = Get-CimInstance Win32_OperatingSystem
  $totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
  $freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
  Write-Output ("RAM total={0}GB free={1}GB" -f $totalGB, $freeGB)
  $leftover = Get-Process llama-server, llama-bench -ErrorAction SilentlyContinue
  if ($leftover) {
    $leftover | ForEach-Object { Write-Output ("LEFTOVER {0} pid={1} wsMB={2}" -f $_.ProcessName, $_.Id, [math]::Round($_.WorkingSet64 / 1MB, 1)) }
  } else {
    Write-Output 'leftover llama-server/llama-bench=none'
  }
  $ports = Get-NetTCPConnection -LocalPort 18080, 8183, 8080, 8081 -State Listen -ErrorAction SilentlyContinue
  if ($ports) {
    $ports | ForEach-Object { Write-Output ("LISTEN port={0} pid={1}" -f $_.LocalPort, $_.OwningProcess) }
  } else {
    Write-Output 'listen 18080/8183/8080/8081=none'
  }
}

Write-Output '=== PROBE BEFORE ==='
Probe
Write-Output ("node=" + (& $node --version))

Write-Output '=== TESTS ==='
& $node --test .\test\*.test.mjs
$testExit = $LASTEXITCODE
Write-Output ("TEST_EXIT=" + $testExit)

Write-Output '=== VALIDATE ==='
& $node .\bin\green-roomz.mjs validate
$validateExit = $LASTEXITCODE
Write-Output ("VALIDATE_EXIT=" + $validateExit)

Write-Output '=== FINGERPRINT ==='
& $node .\bin\green-roomz.mjs fingerprint
$fpExit = $LASTEXITCODE
Write-Output ("FINGERPRINT_EXIT=" + $fpExit)

Write-Output '=== PROBE AFTER ==='
Probe
Write-Output ("DONE testExit={0} validateExit={1} fingerprintExit={2}" -f $testExit, $validateExit, $fpExit)
exit $testExit
