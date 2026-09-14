@echo off
title Green-Roomz serve
cd /d "%~dp0.."
if exist "data\local-env.cmd" call "data\local-env.cmd"
set "NODE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
rem New console (start-green-roomz.ps1) so this outlives the agent Job Object.
rem llama-server stays a child of node (not detached) so stop.cmd can reap it.
"%NODE%" .\bin\green-roomz.mjs serve
echo.
echo serve exited %ERRORLEVEL%
pause
