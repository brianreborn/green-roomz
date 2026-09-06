@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Green-Roomz beta-0.2 no-admin per-user installer (CPU llama only).
rem Operator: Brian. Hosts: qodesh (Win11/Firefox), shalom (Win).
rem No UAC, no Program Files, no HKLM, no self-signed cert, no icacls.
rem Never vulkan/cuda. Never load GGUFs on the 8600 GT.

set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"
set "DEST=%LOCALAPPDATA%\Green-Roomz"
set "SM=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Green-Roomz"
set "LOG=%DEST%\data\install.log"
set "LLAMA_URL=https://github.com/ggml-org/llama.cpp/releases/download/b10702/llama-b10702-bin-win-cpu-x64.zip"
set "LLAMA_ZIP=%TEMP%\llama-b10702-bin-win-cpu-x64.zip"
set "NODE_MSI=https://nodejs.org/dist/latest-v22.x/"
set "NODE_DL=https://nodejs.org/en/download"
set "RC=0"

if not exist "%DEST%" mkdir "%DEST%"
if not exist "%DEST%\data" mkdir "%DEST%\data"
if not exist "%SM%" mkdir "%SM%"

call :log ===== install-windows.cmd start =====
call :log SRC=%SRC%
call :log DEST=%DEST%
call :log SM=%SM%

rem --- locate pack (extracted tree, inner folder, or sibling zip) ---
if exist "%SRC%\start.cmd" goto :have_src
if exist "%SRC%\green-roomz\start.cmd" (
  set "SRC=%SRC%\green-roomz"
  call :log SRC inner folder %SRC%
  goto :have_src
)
if exist "%SRC%\green-roomz.zip" (
  call :log extracting %SRC%\green-roomz.zip
  if exist "%TEMP%\grz-unpack-beta02" rmdir /s /q "%TEMP%\grz-unpack-beta02"
  mkdir "%TEMP%\grz-unpack-beta02"
  tar -xf "%SRC%\green-roomz.zip" -C "%TEMP%\grz-unpack-beta02"
  if exist "%TEMP%\grz-unpack-beta02\green-roomz\start.cmd" set "SRC=%TEMP%\grz-unpack-beta02\green-roomz"
  if exist "%TEMP%\grz-unpack-beta02\start.cmd" set "SRC=%TEMP%\grz-unpack-beta02"
  goto :have_src
)
if exist "%SRC%\green-roomz-slim.zip" (
  call :log extracting %SRC%\green-roomz-slim.zip
  if exist "%TEMP%\grz-unpack-beta02" rmdir /s /q "%TEMP%\grz-unpack-beta02"
  mkdir "%TEMP%\grz-unpack-beta02"
  tar -xf "%SRC%\green-roomz-slim.zip" -C "%TEMP%\grz-unpack-beta02"
  if exist "%TEMP%\grz-unpack-beta02\green-roomz\start.cmd" set "SRC=%TEMP%\grz-unpack-beta02\green-roomz"
  if exist "%TEMP%\grz-unpack-beta02\start.cmd" set "SRC=%TEMP%\grz-unpack-beta02"
  goto :have_src
)
call :log FATAL: cannot find start.cmd or a pack zip next to the installer
echo Put install-windows.cmd inside the extracted green-roomz pack and run it again.
exit /b 1

:have_src
if not exist "%SRC%\start.cmd" (
  call :log FATAL: start.cmd missing at %SRC%
  echo Missing start.cmd. Extract the portable pack first.
  exit /b 1
)
call :log using pack SRC=%SRC%

rem --- copy / refresh pack; never clobber dest\data (logs, operator-usage.json) ---
if /I "%SRC%"=="%DEST%" (
  call :log SRC equals DEST; skip copy, refresh metadata only
  goto :copied
)
call :log copying pack to DEST (exclude data and .git)
where robocopy >nul 2>&1
if errorlevel 1 goto :xcopy_pack
robocopy "%SRC%" "%DEST%" /E /XD data .git /XF llama-server *.so /R:1 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np
if errorlevel 8 (
  call :log FATAL robocopy errorlevel %ERRORLEVEL%
  echo Copy failed.
  exit /b 1
)
call :log robocopy finished
goto :copied

:xcopy_pack
set "EXCL=%TEMP%\grz-xcopy-exclude.txt"
> "%EXCL%" echo data\
>> "%EXCL%" echo .git\
xcopy /E /I /Y /Q /EXCLUDE:%EXCL% "%SRC%\*" "%DEST%\"
if errorlevel 1 (
  call :log FATAL xcopy errorlevel %ERRORLEVEL%
  echo Copy failed.
  exit /b 1
)
call :log xcopy finished

:copied
if not exist "%DEST%\data" mkdir "%DEST%\data"
if not exist "%DEST%\runtime" mkdir "%DEST%\runtime"
if not exist "%DEST%\start.cmd" (
  call :log FATAL start.cmd not at DEST
  echo Install copy did not place start.cmd
  exit /b 1
)

rem --- write uninstall next to the install (template copy, then fallback emit) ---
if exist "%SRC%\uninstall-windows.cmd" copy /y "%SRC%\uninstall-windows.cmd" "%DEST%\uninstall-windows.cmd" >nul
if exist "%~dp0uninstall-windows.cmd" copy /y "%~dp0uninstall-windows.cmd" "%DEST%\uninstall-windows.cmd" >nul
if not exist "%DEST%\uninstall-windows.cmd" call :emit_uninstall
if exist "%SRC%\INSTALL-WINDOWS.md" copy /y "%SRC%\INSTALL-WINDOWS.md" "%DEST%\INSTALL-WINDOWS.md" >nul
if exist "%SRC%\SMOKE-WINDOWS.md" copy /y "%SRC%\SMOKE-WINDOWS.md" "%DEST%\SMOKE-WINDOWS.md" >nul
call :log uninstall-windows.cmd at %DEST%\uninstall-windows.cmd

rem --- CPU llama fetch (official ggml-org win-cpu-x64 b10702 only) ---
if exist "%DEST%\runtime\llama-server.exe" (
  call :log llama-server.exe already present, skip fetch
  goto :llama_ok
)
call :log Fetching official llama.cpp Windows CPU zip b10702 (not vulkan/cuda)
echo Fetching official llama.cpp Windows CPU zip b10702 (not vulkan/cuda^)...
curl.exe -L --fail "%LLAMA_URL%" -o "%LLAMA_ZIP%"
if errorlevel 1 (
  call :log FATAL curl failed fetching CPU zip
  echo curl failed fetching the official CPU zip
  echo   %LLAMA_URL%
  echo Install fails closed until CPU llama-server.exe is present.
  exit /b 1
)
tar -xf "%LLAMA_ZIP%" -C "%DEST%\runtime"
if exist "%DEST%\runtime\llama-server.exe" goto :llama_ok
for /d %%D in ("%DEST%\runtime\*") do (
  if exist "%%D\llama-server.exe" (
    copy /y "%%D\llama-server.exe" "%DEST%\runtime\" >nul
    if exist "%%D\*.dll" copy /y "%%D\*.dll" "%DEST%\runtime\" >nul
  )
)
if exist "%DEST%\runtime\llama-server.exe" (
  call :log llama-server.exe expanded into runtime
  goto :llama_ok
)
call :log FATAL llama-server.exe still missing after CPU zip expand
echo Missing llama-server.exe after expand. Fetch:
echo   %LLAMA_URL%
echo and expand llama-server.exe + dlls into runtime\
exit /b 1

:llama_ok
rem no vulkan, no CUDA, no C:\LocalAI fallback from this installer

rem --- Start Menu shortcut: same .lnk path every run (idempotent, no elevation) ---
rem .lnk via cscript/WScript.Shell so Firefox on qodesh does not hijack a .url.
if exist "%SM%\Green-Roomz.url" del /q "%SM%\Green-Roomz.url"
set "LNK=%SM%\Green-Roomz.lnk"
set "VBS=%TEMP%\grz-shortcut.vbs"
set "TARGET=%DEST%\start.cmd"
> "%VBS%" echo Set o = CreateObject("WScript.Shell")
>> "%VBS%" echo Set s = o.CreateShortcut("%LNK%")
>> "%VBS%" echo s.TargetPath = "%TARGET%"
>> "%VBS%" echo s.WorkingDirectory = "%DEST%"
>> "%VBS%" echo s.WindowStyle = 1
>> "%VBS%" echo s.Description = "Green-Roomz gateway (CPU llama, per-user)"
>> "%VBS%" echo s.Save
cscript //nologo "%VBS%"
if errorlevel 1 goto :url_fallback
if exist "%LNK%" (
  del /q "%VBS%" 2>nul
  call :log Start Menu .lnk %LNK%
  goto :shortcut_ok
)

:url_fallback
call :log WARN cscript .lnk failed; writing .url fallback
> "%SM%\Green-Roomz.url" echo [InternetShortcut]
>> "%SM%\Green-Roomz.url" echo URL=%DEST%\start.cmd
>> "%SM%\Green-Roomz.url" echo WorkingDirectory=%DEST%
if exist "%LNK%" del /q "%LNK%"
call :log Start Menu .url %SM%\Green-Roomz.url
del /q "%VBS%" 2>nul

:shortcut_ok
echo.
echo Green-Roomz per-user install
echo   DEST=%DEST%
echo   Start Menu=%SM%
echo   Start=start.cmd
echo   Stop=stop.cmd
echo   Uninstall=%DEST%\uninstall-windows.cmd
echo   Console log=%DEST%\data\serve.log
echo   Install log=%LOG%
echo   operator-usage.json drop=%DEST%\data\operator-usage.json
echo.

rem --- Node is a user-installed prereq; never download a runtime that needs admin ---
where node >nul 2>&1
if not errorlevel 1 (
  call :log node on PATH
  goto :node_ok
)
if exist "%ProgramFiles%\nodejs\node.exe" (
  call :log FATAL node at Program Files but not on PATH
  echo Node.js is at "%ProgramFiles%\nodejs\node.exe" but not on PATH.
  echo Add it to PATH, open a new cmd window, then re-run install or start.cmd.
  exit /b 1
)
if exist "%LocalAppData%\Programs\node\node.exe" (
  call :log FATAL node at LocalAppData Programs but not on PATH
  echo Node.js found under LocalAppData\Programs but not on PATH. Open a new terminal after fixing PATH.
  exit /b 1
)
call :log FATAL Node.js missing
echo Need Node.js on PATH (engines field says ^>=22; Node 20 has been used successfully^).
echo This installer will NOT download Node (the official MSI is an admin install you run yourself^).
echo Official Node LTS MSI:
echo   %NODE_DL%
echo   %NODE_MSI%
echo Pick Windows x64 LTS MSI, install it, open a new cmd window, then run:
echo   "%DEST%\start.cmd"
exit /b 1

:node_ok
call :log ===== install-windows.cmd ok =====
echo Done. Start via Start Menu "Green-Roomz" or:
echo   "%DEST%\start.cmd"
exit /b 0

:log
>>"%LOG%" echo %DATE% %TIME% %*
echo %*
goto :eof

:emit_uninstall
call :log emitting uninstall-windows.cmd fallback
> "%DEST%\uninstall-windows.cmd" echo @echo off
>> "%DEST%\uninstall-windows.cmd" echo setlocal EnableExtensions DisableDelayedExpansion
>> "%DEST%\uninstall-windows.cmd" echo rem Green-Roomz per-user uninstall. No admin. No Program Files. No HKLM.
>> "%DEST%\uninstall-windows.cmd" echo set "DEST=%%LOCALAPPDATA%%\Green-Roomz"
>> "%DEST%\uninstall-windows.cmd" echo set "SM=%%APPDATA%%\Microsoft\Windows\Start Menu\Programs\Green-Roomz"
>> "%DEST%\uninstall-windows.cmd" echo if exist "%%DEST%%\stop.cmd" call "%%DEST%%\stop.cmd"
>> "%DEST%\uninstall-windows.cmd" echo if exist "%%DEST%%" rmdir /s /q "%%DEST%%"
>> "%DEST%\uninstall-windows.cmd" echo if exist "%%SM%%" rmdir /s /q "%%SM%%"
>> "%DEST%\uninstall-windows.cmd" echo echo Uninstalled per-user Green-Roomz.
>> "%DEST%\uninstall-windows.cmd" echo endlocal
goto :eof
