@echo off
setlocal EnableExtensions
cd /d "%~dp0.."
mkdir data 2>nul
mkdir data\battery.lock 2>nul
if errorlevel 1 (
  echo LOCK_BUSY another battery holds data\battery.lock
  exit /b 99
)
echo LOCK_OK pid=%RANDOM% > data\battery.lock\holder.txt
call scripts\mvp-parity-battery.cmd
set EC=%ERRORLEVEL%
rmdir /s /q data\battery.lock
echo LOCK_RELEASED exit=%EC%
exit /b %EC%
