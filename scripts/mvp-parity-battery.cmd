@echo off
setlocal EnableExtensions
rem Green-Roomz Windows MVP parity battery wrapper (CPU localhost).
rem Usage: scripts\mvp-parity-battery.cmd
rem Env: GRZ_BASE_URL (default http://127.0.0.1:8080), GRZ_MODEL (default general-text-speculator)
rem Writes: data\mvp-parity-last.json  Exit 1 on any FAIL (fail closed).
set "PS1=%~dp0mvp-parity-battery.ps1"
if not exist "%PS1%" (
  echo Missing mvp-parity-battery.ps1 next to this script.
  exit /b 1
)
set "BASE=http://127.0.0.1:8080"
if defined GRZ_BASE_URL set "BASE=%GRZ_BASE_URL%"
set "MODEL=general-text-speculator"
if defined GRZ_MODEL set "MODEL=%GRZ_MODEL%"
if not "%~1"=="" set "MODEL=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -BaseUrl "%BASE%" -Model "%MODEL%"
set "EC=%ERRORLEVEL%"
endlocal & exit /b %EC%
