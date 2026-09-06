@echo off
setlocal EnableExtensions
rem Green-Roomz portable pack — Windows cmd.exe launcher (CPU only).
chcp 65001 >nul
set "GRZ_ROOT=%~dp0"
if "%GRZ_ROOT:~-1%"=="\" set "GRZ_ROOT=%GRZ_ROOT:~0,-1%"
set "GRZ_EXE=.exe"
set "PATH=%GRZ_ROOT%\runtime;%PATH%"
set "GRZ_LLAMA=%GRZ_ROOT%\runtime\llama-server.exe"
cd /d "%GRZ_ROOT%"

where node >nul 2>&1
if errorlevel 1 (
  echo Need Node.js on PATH (engines field says ^>=22; Node 20 has been used successfully^)
  exit /b 1
)

if not exist "%GRZ_ROOT%\runtime\llama-server.exe" goto :fetch_cpu
goto :have_exe

:fetch_cpu
echo Fetching official llama.cpp Windows CPU zip b10702 (not vulkan/cuda^)...
if not exist "%GRZ_ROOT%\runtime" mkdir "%GRZ_ROOT%\runtime"
curl.exe -L --fail "https://github.com/ggml-org/llama.cpp/releases/download/b10702/llama-b10702-bin-win-cpu-x64.zip" -o "%TEMP%\llama-win-cpu.zip"
if errorlevel 1 (
  echo curl failed fetching the official CPU zip
  echo Missing llama-server.exe. Fetch:
  echo   https://github.com/ggml-org/llama.cpp/releases/download/b10702/llama-b10702-bin-win-cpu-x64.zip
  echo and expand llama-server.exe + dlls into runtime\
  exit /b 1
)
tar -xf "%TEMP%\llama-win-cpu.zip" -C "%GRZ_ROOT%\runtime"
if exist "%GRZ_ROOT%\runtime\llama-server.exe" goto :have_exe
rem Nested folder fallback
for /d %%D in ("%GRZ_ROOT%\runtime\*") do (
  if exist "%%D\llama-server.exe" (
    copy /y "%%D\llama-server.exe" "%GRZ_ROOT%\runtime\" >nul
    if exist "%%D\*.dll" copy /y "%%D\*.dll" "%GRZ_ROOT%\runtime\" >nul
  )
)
if exist "%GRZ_ROOT%\runtime\llama-server.exe" goto :have_exe
echo Missing llama-server.exe after expand. Fetch the CPU zip and expand into runtime\
exit /b 1

:have_exe
if not exist "%GRZ_ROOT%\runtime\llama-server.exe" (
  echo Missing llama-server.exe. Fetch:
  echo   https://github.com/ggml-org/llama.cpp/releases/download/b10702/llama-b10702-bin-win-cpu-x64.zip
  echo and expand llama-server.exe + dlls into runtime\
  exit /b 1
)

echo Green-Roomz portable pack
echo GRZ_ROOT=%GRZ_ROOT% GRZ_EXE=%GRZ_EXE% GRZ_LLAMA=%GRZ_LLAMA%
echo gateway http://127.0.0.1:8080
node bin\green-roomz.mjs serve --manifest config\agents.cursor.json --host 127.0.0.1 --port 8080
endlocal
