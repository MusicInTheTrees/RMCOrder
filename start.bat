@echo off
title SpewOrderApp

echo  Starting SpewOrderApp...

start "SpewOrderApp-Backend"  /d "%~dp0server" /min cmd /k "node index.js"
start "SpewOrderApp-Frontend" /d "%~dp0"       /min cmd /k "npm run dev"

:wait_backend
timeout /t 1 /nobreak >nul
curl -s http://localhost:3001/health >nul 2>&1
if errorlevel 1 goto wait_backend

:wait_frontend
timeout /t 1 /nobreak >nul
curl -s http://localhost:5175 >nul 2>&1
if errorlevel 1 goto wait_frontend

start http://localhost:5175

echo  App is running at http://localhost:5175
echo  Press any key to stop both servers.
pause >nul

taskkill /FI "WINDOWTITLE eq SpewOrderApp-Backend*"  /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq SpewOrderApp-Frontend*" /T /F >nul 2>&1
echo  Stopped.
