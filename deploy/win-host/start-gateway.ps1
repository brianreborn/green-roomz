# start-gateway.ps1
$gwDir = 'C:\LocalAI\android-pack\grz-termux'
$gw = 'C:\LocalAI\android-pack\grz-termux\bin\green-roomz.mjs'
$manifest = 'C:\LocalAI\android-pack\grz-termux\config\agents.windows.json'
$outLog = 'C:\LocalAI\gateway.log'
$errLog = 'C:\LocalAI\gateway.err'

Start-Process -FilePath 'node' `
    -ArgumentList @($gw, 'serve', '--manifest', $manifest) `
    -WorkingDirectory $gwDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden

Write-Host "[OK] Launched node gateway with logging to $outLog and $errLog"