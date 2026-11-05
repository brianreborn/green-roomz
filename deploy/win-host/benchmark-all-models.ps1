# benchmark-all-models.ps1 - Benchmarks GGUF models using JSON output
$ErrorActionPreference = "Continue"

$BenchExe = 'C:\LocalAI\llama-b10665-bin-win-vulkan-x64\llama-bench.exe'
if (-not (Test-Path -LiteralPath $BenchExe)) {
    Write-Error "llama-bench.exe not found at $BenchExe"
    exit 1
}

$Models = Get-ChildItem -Path "C:\LocalAI" -Filter "*.gguf" -File
if ($Models.Count -eq 0) {
    Write-Host "No GGUF models found in C:\LocalAI" -ForegroundColor Yellow
    exit 0
}

Write-Host "Found $($Models.Count) models to benchmark..." -ForegroundColor Cyan
$Results = @()

foreach ($m in $Models) {
    Write-Host "Benchmarking $($m.Name)..." -ForegroundColor Gray
    $Output = & $BenchExe -m $m.FullName -p 64 -n 16 -ngl 20 -t 6 -r 1 --no-warmup -fa on -o json 2>$null
    if ($LASTEXITCODE -eq 0 -and $Output) {
        try {
            $json = $Output | ConvertFrom-Json
            $entry = if ($json -is [array]) { $json[0] } else { $json }
            $ppAvg = if ($entry.samples -and $entry.samples[0].pp) { $entry.samples[0].pp.avg } else { 0 }
            $tgAvg = if ($entry.samples -and $entry.samples[0].tg) { $entry.samples[0].tg.avg } else { 0 }
            $Results += [PSCustomObject]@{
                Model     = $m.Name
                SizeGB    = [math]::Round($m.Length / 1GB, 2)
                PromptTPS = [math]::Round([double]$ppAvg, 1)
                GenTPS    = [math]::Round([double]$tgAvg, 1)
                Status    = "âœ… PASS"
            }
        } catch {
            $Results += [PSCustomObject]@{
                Model     = $m.Name
                SizeGB    = [math]::Round($m.Length / 1GB, 2)
                PromptTPS = 0
                GenTPS    = 0
                Status    = "âš ï¸ Parse Error"
            }
        }
    } else {
        $Results += [PSCustomObject]@{
            Model     = $m.Name
            SizeGB    = [math]::Round($m.Length / 1GB, 2)
            PromptTPS = 0
            GenTPS    = 0
            Status    = "âŒ Load Failed"
        }
    }
}

$Results | Format-Table -AutoSize