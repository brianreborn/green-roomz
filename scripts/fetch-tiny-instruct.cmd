@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem Green-Roomz: fetch ONE tiny Instruct GGUF into models\ (CPU only). Fail closed.
rem Default: bartowski Qwen2.5-0.5B-Instruct Q4_K_M (~0.40 GB). Never targets GPU.
rem Operator: Brian. Host: qodesh. Do not load onto 8600 GT.

set "GRZ_ROOT=%~dp0.."
if "%GRZ_ROOT:~-1%"=="\" set "GRZ_ROOT=%GRZ_ROOT:~0,-1%"
cd /d "%GRZ_ROOT%"

if not exist "%GRZ_ROOT%\models" mkdir "%GRZ_ROOT%\models"

rem Override with: set GRZ_TINY_URL=... && set GRZ_TINY_FILE=...
if not defined GRZ_TINY_URL set "GRZ_TINY_URL=https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf"
if not defined GRZ_TINY_FILE set "GRZ_TINY_FILE=Qwen2.5-0.5B-Instruct-Q4_K_M.gguf"

set "OUT=%GRZ_ROOT%\models\%GRZ_TINY_FILE%"
set "PARTIAL=%OUT%.partial"

echo Green-Roomz fetch-tiny-instruct (CPU only^)
echo   URL=%GRZ_TINY_URL%
echo   OUT=%OUT%

if exist "%OUT%" (
  echo Already present: %OUT%
  echo Skip download. Delete the file to re-fetch.
  exit /b 0
)

where curl.exe >nul 2>&1
if errorlevel 1 (
  echo FATAL: curl.exe not on PATH
  exit /b 1
)

echo Downloading...
curl.exe -L --fail --retry 3 --retry-delay 2 -o "%PARTIAL%" "%GRZ_TINY_URL%"
if errorlevel 1 (
  echo FATAL: curl failed fetching tiny instruct GGUF
  if exist "%PARTIAL%" del /q "%PARTIAL%"
  exit /b 1
)

if not exist "%PARTIAL%" (
  echo FATAL: partial download missing after curl
  exit /b 1
)

rem Reject empty / tiny garbage (real Q4_K_M 0.5B is ~398MB)
for %%A in ("%PARTIAL%") do set "SZ=%%~zA"
if not defined SZ set "SZ=0"
if !SZ! LSS 100000000 (
  echo FATAL: download too small ^(!SZ! bytes^) — refusing to install
  del /q "%PARTIAL%"
  exit /b 1
)

move /y "%PARTIAL%" "%OUT%" >nul
if errorlevel 1 (
  echo FATAL: could not move partial into models\
  exit /b 1
)

echo OK: %OUT% ^(!SZ! bytes^)
echo Next: serve with config\agents.windows-mvp.json ^(CPU llama; general-text points here^).
echo Nexus stays models\Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf ^(English JSON router^).
endlocal
exit /b 0
