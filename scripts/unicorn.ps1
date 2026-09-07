# Open Green Unicorn (web / file-drop) against a live Roomz gateway.
# Console sibling: scripts\chat-mvp.cmd — both share http://127.0.0.1:8080.

param(
  [string]$BaseUrl = "http://127.0.0.1:8080"
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")
$unicorn = "$BaseUrl/unicorn"

try {
  $h = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 5
  if ($h.product -ne "Green-Roomz") { throw "not Green-Roomz" }
} catch {
  Write-Host "Gateway not reachable at $BaseUrl — start with scripts\start-windows-mvp.cmd first." -ForegroundColor Yellow
  Write-Host "Then run this again, or open $unicorn" -ForegroundColor DarkGray
  exit 1
}

try {
  $page = Invoke-WebRequest -Uri $unicorn -UseBasicParsing -TimeoutSec 5
  if ($page.StatusCode -ne 200) { throw "HTTP $($page.StatusCode)" }
} catch {
  Write-Host "GET /unicorn failed. Bounce serve onto current main so the Unicorn page is mounted." -ForegroundColor Yellow
  Write-Host $_.Exception.Message -ForegroundColor DarkGray
  exit 1
}

Write-Host "Opening $unicorn" -ForegroundColor Green
Write-Host "Console sibling: scripts\chat-mvp.cmd   GUI: llama.app at $BaseUrl" -ForegroundColor DarkCyan
Start-Process $unicorn
