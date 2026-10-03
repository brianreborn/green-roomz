$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:8080/v1/chat/completions'
$dir = 'C:\Users\brian\Documents\Codex\2026-08-28\files-pasted-by-the-user-1\outputs\green-roomz\data'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function Invoke-Grz([string]$Name, [string]$Json) {
  $in = Join-Path $dir ($Name + '.req.json')
  $out = Join-Path $dir ($Name + '.res.json')
  $hdr = Join-Path $dir ($Name + '.hdr.txt')
  [System.IO.File]::WriteAllText($in, $Json)
  & curl.exe -sS -D $hdr -o $out -m 180 -H 'content-type: application/json' --data-binary "@$in" $base
  Write-Output ("---- " + $Name + " ----")
  Select-String -Path $hdr -Pattern 'HTTP/|x-green-roomz-|content-type'
  $raw = [System.IO.File]::ReadAllText($out)
  if ($raw.Length -gt 1200) { $raw.Substring(0, 1200) } else { $raw }
  Write-Output ''
}

$routeCode = '{"model":"tool-router-agent","messages":[{"role":"user","content":"Write a Python function hello() that returns 42."}]}'
$routeTr = '{"model":"tool-router-agent","messages":[{"role":"user","content":"Translate this sentence to Spanish: The morning light was quiet and kind."}]}'
$liveCode = '{"model":"qwenstral-code-speculator","messages":[{"role":"user","content":"Write a Python function hello() that returns 42. Code only."}],"max_tokens":48}'
$liveTr = '{"model":"general-text-speculator","messages":[{"role":"user","content":"Translate this sentence to Spanish: The morning light was quiet and kind."}],"max_tokens":48}'

Invoke-Grz 'route-code' $routeCode
Invoke-Grz 'route-translate' $routeTr
Invoke-Grz 'live-code' $liveCode
Get-Process llama-server -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Invoke-Grz 'live-translate' $liveTr
