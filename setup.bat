@echo off
setlocal enabledelayedexpansion
cls
title SpewOrderApp - Setup

echo.
echo  ================================================================
echo    SpewOrderApp  -  First-Time Setup
echo  ================================================================
echo.
echo  Your computer needs an internet connection.
echo  This takes about 5-10 minutes the first time.
echo.

REM ================================================================
REM  STEP 1 / 4   Node.js
REM ================================================================
call :progress 1 "Installing Node.js"

where node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%v in ('node --version 2^>nul') do echo   Already installed: %%v
) else (
    echo   Node.js not found. Installing via Windows Package Manager...
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
    if !ERRORLEVEL! NEQ 0 (
        echo.
        echo   ERROR: Could not install Node.js automatically.
        echo   Install it manually from https://nodejs.org then run setup again.
        pause
        exit /b 1
    )
    set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;!PATH!"
    echo   Node.js installed.
)

REM ================================================================
REM  STEP 2 / 4   Git
REM ================================================================
call :progress 2 "Installing Git"

where git >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%v in ('git --version 2^>nul') do echo   Already installed: %%v
) else (
    echo   Git not found. Installing via Windows Package Manager...
    winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements
    if !ERRORLEVEL! NEQ 0 (
        echo   WARNING: Could not install Git. You can install it later from https://git-scm.com
    ) else (
        set "PATH=%ProgramFiles%\Git\cmd;!PATH!"
        echo   Git installed.
    )
)

REM ================================================================
REM  STEP 3 / 4   Install packages
REM ================================================================
call :progress 3 "Installing app packages"

REM Strip trailing backslash from %~dp0 ? PowerShell chokes on path ending in \"
set "_BASE=%~dp0"
if "!_BASE:~-1!"=="\" set "_BASE=!_BASE:~0,-1!"

echo   Frontend packages...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_spinner.ps1" -Dir "!_BASE!" -Msg "Frontend"
if errorlevel 1 (
    echo.
    echo   ERROR: Frontend package install failed.
    echo   Check your internet connection and run setup again.
    pause
    exit /b 1
)

echo   Backend packages...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_spinner.ps1" -Dir "!_BASE!\server" -Msg "Backend "
if errorlevel 1 (
    echo.
    echo   ERROR: Backend package install failed.
    echo   Check your internet connection and run setup again.
    pause
    exit /b 1
)

REM ================================================================
REM  STEP 4 / 4   Google credentials
REM ================================================================
call :progress 4 "Configuring Google credentials"

if not exist "%~dp0server\.env" (
    echo GOOGLE_CLIENT_ID=PASTE_YOUR_CLIENT_ID_HERE> "%~dp0server\.env"
    echo GOOGLE_CLIENT_SECRET=PASTE_YOUR_CLIENT_SECRET_HERE>> "%~dp0server\.env"
)

findstr /C:"PASTE_YOUR_CLIENT_ID_HERE" "%~dp0server\.env" >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo.
    echo  ----------------------------------------------------------------
    echo    GOOGLE CREDENTIALS NEEDED  (one-time setup)
    echo  ----------------------------------------------------------------
    echo.
    echo   SpewOrderApp needs Google Sheets, Drive, and Gmail access.
    echo.
    echo   STEPS:
    echo    1. A browser window will open to Google Cloud Console.
    echo       Sign in with the Google account that will own the app.
    echo.
    echo    2. Create or select a project (top-left dropdown).
    echo.
    echo    3. Go to:  APIs and Services - Library
    echo       Enable:  Google Sheets API, Google Drive API, Gmail API
    echo.
    echo    4. Go to:  APIs and Services - Credentials
    echo       Click:   Create Credentials - OAuth 2.0 Client ID
    echo       Type:    Web application
    echo       Add redirect URI:  http://localhost:3001/auth/callback
    echo       Click Create.
    echo.
    echo    5. Copy your Client ID and Client Secret.
    echo       A Notepad file will open - paste them in and save.
    echo.
    echo   Press any key to open Google Cloud Console...
    pause >nul

    start https://console.cloud.google.com/apis/credentials
    timeout /t 2 /nobreak >nul
    notepad "%~dp0server\.env"

    echo.
    echo   After saving your credentials, press any key to continue...
    pause >nul
) else (
    echo   Credentials already configured.
)

REM ================================================================
REM  Desktop shortcut
REM ================================================================
echo.
echo   Creating desktop shortcut...

set "_TARGET=%~dp0start.bat"
set "_WORK=%~dp0"
if "!_WORK:~-1!"=="\" set "_WORK=!_WORK:~0,-1!"

set "_PS=%TEMP%\spew_shortcut.ps1"
(
    echo $ws = New-Object -ComObject WScript.Shell
    echo $s = $ws.CreateShortcut("$env:USERPROFILE\Desktop\SpewOrderApp.lnk"^)
    echo $s.TargetPath = "%_TARGET%"
    echo $s.WorkingDirectory = "%_WORK%"
    echo $s.WindowStyle = 1
    echo $s.Description = "Launch SpewOrderApp"
    echo $s.IconLocation = "%SystemRoot%\System32\imageres.dll,14"
    echo $s.Save(^)
) > "%_PS%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%_PS%" >nul 2>&1
del "%_PS%" >nul 2>&1

echo   Done. "SpewOrderApp" shortcut is on your Desktop.

REM ================================================================
REM  Launch
REM ================================================================
echo.
echo  ================================================================
echo    Setup complete! Launching the app now...
echo  ================================================================
echo.
timeout /t 2 /nobreak >nul
call "%~dp0start.bat"
goto :eof

REM ================================================================
REM  :progress  --  print step header with progress bar
REM ================================================================
:progress
echo.
echo  ----------------------------------------------------------------
if "%~1"=="1" echo   [#####               ]  25%%  Step 1/4: %~2
if "%~1"=="2" echo   [##########          ]  50%%  Step 2/4: %~2
if "%~1"=="3" echo   [###############     ]  75%%  Step 3/4: %~2
if "%~1"=="4" echo   [####################] 100%%  Step 4/4: %~2
echo  ----------------------------------------------------------------
echo.
goto :eof
