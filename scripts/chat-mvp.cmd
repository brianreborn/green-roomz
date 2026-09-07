@echo off
setlocal EnableExtensions
rem Green-Roomz Windows MVP console chat wrapper (CPU localhost).
rem Usage: chat-mvp.cmd [model-alias]
rem Env: GRZ_BASE_URL (default http://127.0.0.1:8080)
set "PS1=%~dp0chat-mvp.ps1"
if not exist "%PS1%" (
  echo Missing chat-mvp.ps1 next to this script.
  exit /b 1
)
set "BASE=http://127.0.0.1:8080"
if defined GRZ_BASE_URL set "BASE=%GRZ_BASE_URL%"
set "MODEL=general-text-speculator"
if not "%~1"=="" set "MODEL=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -BaseUrl "%BASE%" -Model "%MODEL%"
endlocal
