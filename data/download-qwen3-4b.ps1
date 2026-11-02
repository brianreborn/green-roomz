$ErrorActionPreference = 'Stop'
$dest = 'C:\LocalAI\Qwen3-4B-Q4_K_M.gguf'
$url = 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf'
$expectedSize = 2497280256
$expectedHash = '7485FE6F11AF29433BC51CAB58009521F205840F5B4AE3A32FA7F92E8534FDF5'
$log = Join-Path (Split-Path -Parent $PSScriptRoot) '\data\qwen3-4b-download.log'
$status = Join-Path (Split-Path -Parent $PSScriptRoot) '\data\qwen3-4b-download-status.json'
function Write-Status($obj) {
  $json = $obj | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($status, $json)
}
function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'), $msg
  Add-Content -Path $log -Value $line
  Write-Output $line
}
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
if (Test-Path $dest) {
  $len = (Get-Item $dest).Length
  if ($len -eq $expectedSize) {
    Log "existing file size matches ($len); hashing"
    Write-Status @{ phase='hashing'; size=$len }
    $hash = (Get-FileHash -Algorithm SHA256 -Path $dest).Hash
    if ($hash -eq $expectedHash) {
      Log "SKIP download; hash OK $hash"
      Write-Status @{ phase='ok'; skipped=$true; path=$dest; size=$len; sha256=$hash.ToLower() }
      exit 0
    }
    Log "hash mismatch $hash vs $expectedHash; deleting"
    Remove-Item -Force $dest
  } elseif ($len -gt $expectedSize) {
    Log "existing file too large ($len); deleting"
    Remove-Item -Force $dest
  } else {
    Log "resuming partial download size=$len"
  }
}
Write-Status @{ phase='downloading'; path=$dest }
Log "starting curl download $url -> $dest"
$curl = 'C:\Windows\System32\curl.exe'
$curlLog = Join-Path (Split-Path -Parent $PSScriptRoot) '\data\qwen3-4b-curl.err'
$argList = @('-L','--fail','--retry','8','--retry-all-errors','--retry-delay','3','-C','-','--output',$dest,$url)
$p = Start-Process -FilePath $curl -ArgumentList $argList -NoNewWindow -PassThru -Wait -RedirectStandardError $curlLog
if ($p.ExitCode -ne 0) {
  Log "curl exit $($p.ExitCode)"
  Write-Status @{ phase='error'; exitCode=$p.ExitCode }
  exit $p.ExitCode
}
if (-not (Test-Path $dest)) {
  Log 'download finished but file missing'
  Write-Status @{ phase='error'; reason='missing' }
  exit 2
}
$len = (Get-Item $dest).Length
Log "download complete size=$len expected=$expectedSize"
if ($len -ne $expectedSize) {
  Log "SIZE MISMATCH"
  Write-Status @{ phase='error'; reason='size'; size=$len; expected=$expectedSize }
  exit 3
}
Write-Status @{ phase='hashing'; size=$len }
$hash = (Get-FileHash -Algorithm SHA256 -Path $dest).Hash
Log "sha256=$hash"
if ($hash -ne $expectedHash) {
  Log 'HASH MISMATCH; deleting'
  Remove-Item -Force $dest
  Write-Status @{ phase='error'; reason='hash'; sha256=$hash }
  exit 4
}
Write-Status @{ phase='ok'; skipped=$false; path=$dest; size=$len; sha256=$hash.ToLower() }
Log 'DONE hash verified'
exit 0
