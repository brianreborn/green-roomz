@echo off
setlocal EnableExtensions
cd /d "%~dp0.."
set "GRZ_ROOT=%CD%"
set "GRZ_MANIFEST=%CD%\config\agents.windows-mvp.json"
set "GRZ_LLAMA=%CD%\runtime\llama-b10702-bin-win-cpu-x64\llama-server.exe"
echo GRZ_ROOT=%GRZ_ROOT%
echo GRZ_MANIFEST=%GRZ_MANIFEST%
echo GRZ_LLAMA=%GRZ_LLAMA%
if not exist "%GRZ_LLAMA%" (
  echo FAIL: missing llama-server.exe
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-windows-media.ps1
if errorlevel 2 echo WARN: optional media artifacts are missing; text gateway will still start.
node bin\green-roomz.mjs serve --manifest config\agents.windows-mvp.json --host 127.0.0.1 --port 8080
endlocal
