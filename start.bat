@echo off
title SpewOrderApp

echo Starting SpewOrderApp...

:: Start backend
start "SpewOrderApp Backend" /min cmd /c "cd server && npm start"

:: Wait for backend to be ready (poll /health)
:wait_backend
timeout /t 1 /nobreak >nul
curl -s http://localhost:3001/health >nul 2>&1
if errorlevel 1 goto wait_backend
echo Backend ready.

:: Start frontend in background
start "SpewOrderApp Frontend" /min cmd /c "npm run dev"

:: Wait for frontend to be ready
:wait_frontend
timeout /t 1 /nobreak >nul
curl -s http://localhost:5175 >nul 2>&1
if errorlevel 1 goto wait_frontend
echo Frontend ready.

:: Open browser
start http://localhost:5175

echo SpewOrderApp is running. Close this window to stop both servers.
pause
