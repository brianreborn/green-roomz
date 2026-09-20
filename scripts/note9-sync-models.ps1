[CmdletBinding()]
param([string]$Device = '27841130ae1c7ece')
$ErrorActionPreference = 'Stop'
$root = 'C:\LocalAI'
$target = '/data/local/tmp/grz/models'
$items = @(
  @{ Source = "$root\Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf"; Name = 'Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf' },
  @{ Source = "$root\qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"; Name = 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf' },
  @{ Source = "$root\qwen2.5-vl-3b-instruct-q4_k_m.gguf"; Name = 'qwen2.5-vl-3b-instruct-q4_k_m.gguf' },
  @{ Source = "$root\qwen2.5-vl-3b-mmproj-f16.gguf"; Name = 'qwen2.5-vl-3b-mmproj-f16.gguf' },
  @{ Source = "$root\qwen3-embedding-0.6b-q8_0.gguf"; Name = 'qwen3-embedding-0.6b-q8_0.gguf' },
  @{ Source = "$root\qwen3guard-gen-0.6b-q4_k_m.gguf"; Name = 'qwen3guard-gen-0.6b-q4_k_m.gguf' },
  @{ Source = "$root\whisper\models\ggml-small.bin"; Name = 'ggml-small.bin' },
  @{ Source = "$root\piper\voices\en_US-lessac-medium.onnx"; Name = 'en_US-lessac-medium.onnx' },
  @{ Source = "$root\stable-diffusion.cpp\models\sd15-q4_0.gguf"; Name = 'sd15-q4_0.gguf' }
)
$log = Join-Path (Split-Path -Parent $PSScriptRoot) 'data\note9-model-sync.log'
function Log($s) { $line = "[{0}] {1}" -f (Get-Date -Format o), $s; Add-Content -Path $log -Value $line; Write-Output $line }
$missing = @($items | Where-Object { -not (Test-Path $_.Source) })
if ($missing.Count) { throw ('Missing local sources: ' + (($missing | ForEach-Object Source) -join '; ')) }
$rerank = Get-Item "$root\qwen3-reranker-0.6b-q8_0.gguf"
if ($rerank.Length -lt 1000000) { Log "SKIP corrupt reranker size=$($rerank.Length) bytes" }
adb -s $Device shell "mkdir -p $target"
foreach ($item in $items) {
  $hash = (Get-FileHash -Algorithm SHA256 $item.Source).Hash.ToLower()
  $remote = "$target/$($item.Name)"
  $remoteHash = ((adb -s $Device shell "sha256sum '$remote' 2>/dev/null" | Out-String).Trim() -split '\s+')[0]
  if ($remoteHash -eq $hash) { Log "OK existing $($item.Name) sha256=$hash"; continue }
  Log "PUSH $($item.Name) size=$((Get-Item $item.Source).Length)"
  adb -s $Device push $item.Source $remote
  if ($LASTEXITCODE -ne 0) { throw "adb push failed for $($item.Name) exit=$LASTEXITCODE" }
  $remoteHash = ((adb -s $Device shell "sha256sum '$remote'" | Out-String).Trim() -split '\s+')[0]
  if ($remoteHash -ne $hash) { throw "checksum mismatch for $($item.Name): $remoteHash != $hash" }
  Log "VERIFIED $($item.Name) sha256=$hash"
}
Log 'model sync complete; runtimes still require separate installation'
