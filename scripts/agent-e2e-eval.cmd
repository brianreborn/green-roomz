@echo off
setlocal
cd /d "%~dp0.."
node .\scripts\agent-e2e-eval.mjs %*
