@echo off
title Green-Roomz serve
cd /d "%~dp0.."
if exist "data\local-env.cmd" call "data\local-env.cmd"
set "NODE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" .\bin\green-roomz.mjs serve
echo.
echo serve exited %ERRORLEVEL%
pause
