@echo off
setlocal EnableExtensions
REM Build sm11_monitor.exe for GeForce 8600 GT (sm_1.1) with CUDA 6.5 + VS2013.
set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio 12.0\VC\vcvarsall.bat"
set "CUDA_HOME=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v6.5"
if not exist "%VCVARS%" (
  echo missing VS2013 vcvarsall
  exit /b 1
)
if not exist "%CUDA_HOME%\bin\nvcc.exe" (
  echo missing CUDA 6.5 nvcc
  exit /b 1
)

REM VS2013 on this box has x86 + x86_amd64 cross, not native amd64 (no vcvars64.bat).
call "%VCVARS%" x86_amd64
if errorlevel 1 exit /b 1
set "PATH=%CUDA_HOME%\bin;%PATH%"
set "CCBIN=C:\Program Files (x86)\Microsoft Visual Studio 12.0\VC\bin\x86_amd64"

cd /d "%~dp0"
if not exist out mkdir out

"%CUDA_HOME%\bin\nvcc.exe" -O2 -m64 -arch=sm_11 -ccbin "%CCBIN%" -o out\sm11_monitor.exe sm11_monitor.cu -I"%CUDA_HOME%\include" -L"%CUDA_HOME%\lib\x64" -lcudart
if errorlevel 1 (
  echo m64 cross failed; trying Win32
  call "%VCVARS%" x86
  if errorlevel 1 exit /b 1
  "%CUDA_HOME%\bin\nvcc.exe" -O2 -m32 -arch=sm_11 -ccbin "C:\Program Files (x86)\Microsoft Visual Studio 12.0\VC\bin" -o out\sm11_monitor.exe sm11_monitor.cu -I"%CUDA_HOME%\include" -L"%CUDA_HOME%\lib\Win32" -lcudart
  if errorlevel 1 exit /b 1
)

echo built %~dp0out\sm11_monitor.exe
endlocal
