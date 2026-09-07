# Green-Roomz Windows MVP console chat — multi-turn, model pick, streaming, Ctrl-C stop.
# CPU gateway on localhost only. No API key. Never loads GGUFs on 8600 GT.
# Operator: Brian. Host: qodesh.

param(
  [string]$BaseUrl = "http://127.0.0.1:8080",
  [string]$Model = "general-text-speculator",
  [switch]$NoStream
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Hint([string]$msg) {
  Write-Host $msg -ForegroundColor DarkCyan
}

function Get-Models {
  try {
    $r = Invoke-RestMethod -Uri "$BaseUrl/v1/models" -Method GET -TimeoutSec 10
    if ($r.data) { return @($r.data | ForEach-Object { $_.id }) }
  } catch {
    return @()
  }
  return @()
}

function Send-Chat([object[]]$Messages, [string]$ModelId, [bool]$Stream) {
  $bodyObj = @{
    model = $ModelId
    stream = $Stream
    messages = $Messages
  }
  $json = $bodyObj | ConvertTo-Json -Depth 20 -Compress
  $uri = "$BaseUrl/v1/chat/completions"

  if (-not $Stream) {
    $resp = Invoke-RestMethod -Uri $uri -Method POST -ContentType "application/json; charset=utf-8" -Body $json -TimeoutSec 600
    $text = $resp.choices[0].message.content
    if (-not $text) { $text = "" }
    Write-Host $text
    return $text
  }

  # Streaming SSE via HttpClient so Ctrl-C / cancel aborts the request.
  $handler = New-Object System.Net.Http.HttpClientHandler
  $client = New-Object System.Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromMinutes(30)
  $cts = New-Object System.Threading.CancellationTokenSource
  $content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, "application/json")
  $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, $uri)
  $req.Content = $content

  $sb = New-Object System.Text.StringBuilder
  try {
    $task = $client.SendAsync($req, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead, $cts.Token)
    $resp = $task.GetAwaiter().GetResult()
    if (-not $resp.IsSuccessStatusCode) {
      $errBody = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      throw "HTTP $([int]$resp.StatusCode): $errBody"
    }
    $stream = $resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
    while (-not $reader.EndOfStream) {
      $line = $reader.ReadLine()
      if ($null -eq $line) { break }
      if (-not $line.StartsWith("data:")) { continue }
      $payload = $line.Substring(5).Trim()
      if ($payload -eq "[DONE]") { break }
      if (-not $payload) { continue }
      try {
        $chunk = $payload | ConvertFrom-Json
        $delta = $chunk.choices[0].delta.content
        if ($delta) {
          [void]$sb.Append($delta)
          Write-Host -NoNewline $delta
        }
      } catch {
        # skip malformed SSE lines
      }
    }
    Write-Host ""
  } finally {
    if ($reader) { $reader.Dispose() }
    if ($stream) { $stream.Dispose() }
    if ($resp) { $resp.Dispose() }
    if ($req) { $req.Dispose() }
    if ($content) { $content.Dispose() }
    if ($client) { $client.Dispose() }
    if ($cts) { $cts.Dispose() }
  }
  return $sb.ToString()
}

Write-Host "Green-Roomz MVP chat  ($BaseUrl)" -ForegroundColor Green
Write-Host "CPU only — never GGUF on 8600 GT. Ctrl-C stops a stream; /quit exits." -ForegroundColor DarkGray
Write-Hint "Commands: /models  /model <alias>  /system <text>  /clear  /stream on|off  /quit"

$healthOk = $false
try {
  $h = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 5
  if ($h.product -eq "Green-Roomz") { $healthOk = $true; Write-Host "health: $($h.status)" -ForegroundColor DarkGreen }
} catch {
  Write-Host "WARN: gateway not reachable at $BaseUrl — start with start.cmd (windows-mvp manifest) first." -ForegroundColor Yellow
}

$available = Get-Models
if ($available.Count -gt 0) {
  Write-Hint ("models: " + ($available -join ", "))
  if ($available -notcontains $Model) {
    if ($available -contains "general-text-speculator") { $Model = "general-text-speculator" }
    else { $Model = $available[0] }
  }
}

$messages = New-Object System.Collections.Generic.List[object]
$stream = -not $NoStream

Write-Host "model=$Model  stream=$stream" -ForegroundColor Cyan

while ($true) {
  Write-Host ""
  $user = Read-Host "you"
  if ($null -eq $user) { break }
  $user = $user.Trim()
  if (-not $user) { continue }

  if ($user -eq "/quit" -or $user -eq "/exit" -or $user -eq "/q") { break }
  if ($user -eq "/clear") { $messages.Clear(); Write-Hint "history cleared"; continue }
  if ($user -eq "/models") {
    $available = Get-Models
    if ($available.Count -eq 0) { Write-Hint "(none — is serve up?)" } else { Write-Hint ($available -join ", ") }
    continue
  }
  if ($user -match '^/model\s+(\S+)') {
    $Model = $Matches[1]
    Write-Hint "model=$Model"
    continue
  }
  if ($user -match '^/system\s+(.+)$') {
    $sys = $Matches[1]
    # Replace existing system message if first; else insert at front.
    if ($messages.Count -gt 0 -and $messages[0].role -eq "system") {
      $messages[0] = @{ role = "system"; content = $sys }
    } else {
      $messages.Insert(0, @{ role = "system"; content = $sys })
    }
    Write-Hint "system set"
    continue
  }
  if ($user -match '^/stream\s+(on|off)$') {
    $stream = ($Matches[1] -eq "on")
    Write-Hint "stream=$stream"
    continue
  }
  if ($user.StartsWith("/")) {
    Write-Hint "unknown command"
    continue
  }

  $messages.Add(@{ role = "user"; content = $user })
  Write-Host -NoNewline "assistant: " -ForegroundColor Green
  try {
    $reply = Send-Chat -Messages $messages.ToArray() -ModelId $Model -Stream $stream
    if ($reply) {
      $messages.Add(@{ role = "assistant"; content = $reply })
    } else {
      # empty / aborted — drop the last user turn so history stays clean
      if ($messages.Count -gt 0 -and $messages[$messages.Count - 1].role -eq "user") {
        $messages.RemoveAt($messages.Count - 1)
      }
    }
  } catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($messages.Count -gt 0 -and $messages[$messages.Count - 1].role -eq "user") {
      $messages.RemoveAt($messages.Count - 1)
    }
  }
}

Write-Host "bye."
