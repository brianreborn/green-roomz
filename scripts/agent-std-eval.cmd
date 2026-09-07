@echo off
setlocal EnableExtensions
cd /d "%~dp0.."
echo === Green-Roomz standardized agent eval (IFEval-slice / schema / honesty) ===
echo BASE=%GRZ_BASE_URL%
if not defined GRZ_BASE_URL echo BASE=http://127.0.0.1:8080
node "%~dp0agent-std-eval.mjs" %*
set "EC=%ERRORLEVEL%"
echo EXIT=%EC%
exit /b %EC%
