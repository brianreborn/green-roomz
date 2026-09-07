@echo off
setlocal EnableExtensions
rem Green Unicorn — open the web/file-drop client on the live Roomz gateway.
rem Same origin as chat-mvp. Both can run at once.
set "PS1=%~dp0unicorn.ps1"
if not exist "%PS1%" (
  echo Missing unicorn.ps1 next to this script.
  exit /b 1
)
set "BASE=http://127.0.0.1:8080"
if defined GRZ_BASE_URL set "BASE=%GRZ_BASE_URL%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -BaseUrl "%BASE%"
endlocal
