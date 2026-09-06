@echo off
setlocal EnableExtensions
rem PF-aware MVP bounce (Documents\green-roomz) + parity battery.
rem Hard rules: CPU llama only; never GGUF on 8600; never taskkill /IM llama-server.exe; no git push.
cd /d "%~dp0.."
set "GRZ_ROOT=%CD%"
set "GRZ_MANIFEST=%CD%\config\agents.windows-mvp.json"
set "GRZ_LLAMA=%CD%\runtime\llama-b10702-bin-win-cpu-x64\llama-server.exe"

echo === PF stop (PID on owned ports only) ===
if exist "%CD%\stop.cmd" (
  call "%CD%\stop.cmd"
) else (
  echo stop.cmd missing — manual PID kill only
)
timeout /t 3 /nobreak >nul

echo === Start MVP serve (background via start) ===
start "green-roomz-mvp" /MIN cmd /c "set GRZ_ROOT=%GRZ_ROOT%&& set GRZ_MANIFEST=%GRZ_MANIFEST%&& set GRZ_LLAMA=%GRZ_LLAMA%&& \"%ProgramFiles%\nodejs\node.exe\" bin\green-roomz.mjs serve --manifest config\agents.windows-mvp.json --host 127.0.0.1 --port 8080 >> data\serve.log 2>&1"

echo Waiting for /health ...
set /a N=0
:wait
set /a N+=1
curl.exe -sS -m 3 http://127.0.0.1:8080/health >nul 2>&1
if not errorlevel 1 goto ready
if %N% GEQ 60 (
  echo TIMEOUT waiting for gateway
  exit /b 2
)
timeout /t 2 /nobreak >nul
goto wait

:ready
echo Gateway up. Running parity battery...
call scripts\mvp-parity-battery.cmd
set EC=%ERRORLEVEL%
echo Battery exit=%EC%
exit /b %EC%
