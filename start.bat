@echo off
setlocal enabledelayedexpansion
title SpewOrderApp
cls

echo.
echo  ================================================================
echo    SpewOrderApp
echo  ================================================================
echo.

REM ---- Sanity checks ------------------------------------------------

if not exist "%~dp0server\.env" (
    echo  ERROR: Configuration file not found.
    echo.
    echo  Please run setup.bat first to set up the app.
    echo.
    pause
    exit /b 1
)

findstr /C:"PASTE_YOUR_CLIENT_ID_HERE" "%~dp0server\.env" >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo  Google credentials are not configured yet.
    echo.
    echo  Opening the configuration file in Notepad...
    echo  Replace PASTE_YOUR_CLIENT_ID_HERE and PASTE_YOUR_CLIENT_SECRET_HERE
    echo  with your actual Google API credentials, then save and close Notepad.
    echo.
    echo  (If you need help getting credentials, run setup.bat)
    echo.
    pause
    notepad "%~dp0server\.env"
    echo.
    echo  Press any key to continue starting the app...
    pause >nul
)

where node >nul 2>&1
if !ERRORLEVEL! NEQ 0 (
    echo  ERROR: Node.js is not installed.
    echo.
    echo  Please run setup.bat to install it.
    echo.
    pause
    exit /b 1
)

REM ---- Start backend ------------------------------------------------

echo  Starting backend server...
start "SpewOrderApp-Backend" /min cmd /c "cd /d %~dp0server && node index.js"

REM Poll until backend responds
:wait_backend
timeout /t 1 /nobreak >nul
curl -s http://localhost:3001/health >nul 2>&1
if !ERRORLEVEL! NEQ 0 goto wait_backend
echo  Backend ready on port 3001.

REM ---- Start frontend -----------------------------------------------

echo  Starting frontend...
start "SpewOrderApp-Frontend" /min cmd /c "cd /d %~dp0 && npm run dev"

REM Poll until Vite is ready
:wait_frontend
timeout /t 1 /nobreak >nul
curl -s http://localhost:5175 >nul 2>&1
if !ERRORLEVEL! NEQ 0 goto wait_frontend
echo  Frontend ready on port 5175.

REM ---- Open browser -------------------------------------------------

echo.
echo  Opening browser...
start http://localhost:5175

echo.
echo  ================================================================
echo    SpewOrderApp is running at http://localhost:5175
echo  ================================================================
echo.
echo  Keep this window open while using the app.
echo  Press any key here to STOP the app and close all servers.
echo.
pause >nul

REM ---- Shutdown -----------------------------------------------------

echo.
echo  Stopping servers...
taskkill /FI "WINDOWTITLE eq SpewOrderApp-Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq SpewOrderApp-Frontend*" /T /F >nul 2>&1
echo  Stopped. Goodbye!
timeout /t 2 /nobreak >nul
