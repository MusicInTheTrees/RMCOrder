@echo off
title RMC Ordering

echo Starting RMC Ordering...

:: Start backend
start "RMC Ordering Backend" /min cmd /c "cd server && npm start"

:: Wait for backend to be ready (poll /health)
:wait_backend
timeout /t 1 /nobreak >nul
curl -s http://localhost:3001/health >nul 2>&1
if errorlevel 1 goto wait_backend
echo Backend ready.

:: Start frontend in background
start "RMC Ordering Frontend" /min cmd /c "npm run dev"

:: Wait for frontend to be ready
:wait_frontend
timeout /t 1 /nobreak >nul
curl -s http://localhost:5175 >nul 2>&1
if errorlevel 1 goto wait_frontend
echo Frontend ready.

:: Open browser
start http://localhost:5175

echo RMC Ordering is running. Close this window to stop both servers.
pause
