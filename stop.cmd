@echo off
setlocal EnableExtensions
rem PF1: reap gateway + owned child PIDs only (by PID, never by image name).
set "GRZ_ROOT=%~dp0"
if "%GRZ_ROOT:~-1%"=="\" set "GRZ_ROOT=%GRZ_ROOT:~0,-1%"
set "PIDFILE=%GRZ_ROOT%\data\serve.pid"
set "CHILDREN=%GRZ_ROOT%\data\children.json"

if exist "%PIDFILE%" (
  for /f "usebackq delims=" %%P in ("%PIDFILE%") do taskkill /F /PID %%P >nul 2>&1
)

if exist "%CHILDREN%" (
  for /f "usebackq tokens=2 delims=:," %%P in (`findstr /i "\"pid\"" "%CHILDREN%"`) do (
    for /f "tokens=* delims= " %%Q in ("%%P") do taskkill /F /PID %%Q >nul 2>&1
  )
)

rem Fallback: owned ports only (8080 + 8181-8187), never every llama image
for %%P in (8080 8181 8182 8183 8184 8185 8186 8187) do (
  for /f "tokens=5" %%A in ('netstat -ano 2^>nul ^| findstr ":%%P" ^| findstr LISTENING') do (
    taskkill /F /PID %%A >nul 2>&1
  )
)

if exist "%PIDFILE%" del /q "%PIDFILE%" >nul 2>&1
if exist "%CHILDREN%" del /q "%CHILDREN%" >nul 2>&1
echo stopped
endlocal
