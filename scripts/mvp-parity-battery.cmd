@echo off
setlocal EnableExtensions
rem Thin wrapper -> mvp-parity-battery.ps1 (cases A-G). Prefer cmd.exe entrypoint.
cd /d "%~dp0.."
set "BASE=http://127.0.0.1:8080"
if defined GRZ_BASE_URL set "BASE=%GRZ_BASE_URL%"
echo === Green-Roomz MVP parity battery (A-G via ps1) ===
echo BASE=%BASE%
echo ROOT=%CD%
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0mvp-parity-battery.ps1" %*
set "EC=%ERRORLEVEL%"
echo.
echo EXIT=%EC%
exit /b %EC%
