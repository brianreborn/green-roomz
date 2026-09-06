@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Green-Roomz per-user uninstall (PF6). Waits until runtime\llama-server.exe unlocks.
rem Removes LOCALAPPDATA\Green-Roomz and the per-user Start Menu folder only.

set "DEST=%LOCALAPPDATA%\Green-Roomz"
set "SM=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Green-Roomz"
set "EXE=%DEST%\runtime\llama-server.exe"

echo Stopping loopback gateway if this copy is running...
if exist "%DEST%\stop.cmd" call "%DEST%\stop.cmd"

rem Wait until llama-server.exe is not locked (up to ~15s)
if exist "%EXE%" (
  echo Waiting for runtime\llama-server.exe to unlock...
  set /a _n=0
  :wait_unlock
  ren "%EXE%" "llama-server.exe" >nul 2>&1
  if not errorlevel 1 goto :unlocked
  set /a _n+=1
  if %_n% GEQ 15 (
    echo WARN: llama-server.exe still locked; trying rmdir anyway
    goto :unlocked
  )
  ping -n 2 127.0.0.1 >nul
  goto :wait_unlock
)

:unlocked
echo Removing "%DEST%"
if exist "%DEST%" rmdir /s /q "%DEST%"

echo Removing Start Menu "%SM%"
if exist "%SM%\Green-Roomz.lnk" del /q "%SM%\Green-Roomz.lnk"
if exist "%SM%\Green-Roomz.url" del /q "%SM%\Green-Roomz.url"
if exist "%SM%" rmdir /s /q "%SM%"

echo Uninstalled per-user Green-Roomz.
echo Leftover check:
echo   dir "%LOCALAPPDATA%\Green-Roomz"
echo   dir "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Green-Roomz"
endlocal
