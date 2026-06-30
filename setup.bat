@echo off
setlocal enabledelayedexpansion
cls
title SpewOrderApp - First Time Setup

echo.
echo  ================================================================
echo    SpewOrderApp  ^|  First-Time Setup
echo  ================================================================
echo.
echo  This will install everything needed to run SpewOrderApp.
echo  Your computer needs an internet connection.
echo  Setup takes about 5-10 minutes.
echo.
echo  Press any key to begin (or close this window to cancel)...
pause >nul

REM ================================================================
REM  STEP 1 of 4 -- Node.js
REM ================================================================
echo.
echo  [1/4]  Checking for Node.js...

where node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%v in ('node --version 2^>nul') do echo         Already installed: %%v
) else (
    echo         Node.js not found. Installing now (this may take 2-3 minutes)...
    echo.
    winget install --id OpenJS.NodeJS.LTS -e --source winget ^
        --accept-source-agreements --accept-package-agreements --silent
    if !ERRORLEVEL! NEQ 0 (
        echo.
        echo  !! INSTALL FAILED
        echo     Could not install Node.js automatically.
        echo.
        echo     Please install it manually, then run this setup again:
        echo     https://nodejs.org/en/download
        echo.
        pause
        exit /b 1
    )
    echo         Node.js installed successfully.
    REM Add default install location to PATH for this session
    set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;!PATH!"
)

REM ================================================================
REM  STEP 2 of 4 -- Git
REM ================================================================
echo.
echo  [2/4]  Checking for Git...

where git >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    for /f "tokens=*" %%v in ('git --version 2^>nul') do echo         Already installed: %%v
) else (
    echo         Git not found. Installing now (this takes about a minute)...
    echo.
    winget install --id Git.Git -e --source winget ^
        --accept-source-agreements --accept-package-agreements --silent
    if !ERRORLEVEL! NEQ 0 (
        echo.
        echo  !! WARNING: Could not install Git automatically.
        echo     Git is not required to run the app, but is useful for
        echo     receiving future updates. You can install it later from:
        echo     https://git-scm.com
        echo.
    ) else (
        echo         Git installed successfully.
        set "PATH=%ProgramFiles%\Git\cmd;!PATH!"
    )
)

REM ================================================================
REM  STEP 3 of 4 -- Install app dependencies
REM ================================================================
echo.
echo  [3/4]  Installing app packages (first time only -- may take 2-4 minutes)...
echo.

cd /d "%~dp0"

call npm install --prefer-offline 2>&1
if !ERRORLEVEL! NEQ 0 (
    echo.
    echo  !! ERROR: Could not install frontend packages.
    echo     Check your internet connection and try again.
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0server"

call npm install --prefer-offline 2>&1
if !ERRORLEVEL! NEQ 0 (
    echo.
    echo  !! ERROR: Could not install backend packages.
    echo     Check your internet connection and try again.
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"
echo.
echo         Packages installed.

REM ================================================================
REM  STEP 4 of 4 -- Google credentials
REM ================================================================
echo.
echo  [4/4]  Checking Google credentials...

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
    echo  SpewOrderApp uses Google Sheets, Drive, and Gmail.
    echo  You need a Google Cloud project with OAuth credentials.
    echo.
    echo  INSTRUCTIONS:
    echo.
    echo   1.  A browser window will open to Google Cloud Console.
    echo       Sign in with the Google account that owns the app.
    echo.
    echo   2.  Create a project (top-left dropdown) or select an existing one.
    echo.
    echo   3.  In the left menu, go to:
    echo          APIs ^& Services  -^>  Library
    echo       Enable these three APIs:
    echo          - Google Sheets API
    echo          - Google Drive API
    echo          - Gmail API
    echo.
    echo   4.  Go to:  APIs ^& Services  -^>  Credentials
    echo       Click  "Create Credentials"  -^>  "OAuth 2.0 Client ID"
    echo       Application type:  Web application
    echo       Add this Authorized redirect URI (exact):
    echo          http://localhost:3001/auth/callback
    echo       Click Create.
    echo.
    echo   5.  A popup shows your Client ID and Client Secret.
    echo       Copy them. A Notepad window will open -- paste them in.
    echo.
    echo   6.  Save the Notepad file and close it.
    echo       Then come back here and press any key.
    echo.
    echo  Press any key to open Google Cloud Console...
    pause >nul

    start https://console.cloud.google.com/apis/credentials
    timeout /t 2 /nobreak >nul
    notepad "%~dp0server\.env"

    echo.
    echo  After saving your credentials, press any key to continue...
    pause >nul
) else (
    echo         Credentials already configured.
)

REM ================================================================
REM  Create desktop shortcut
REM ================================================================
echo.
echo  Creating desktop shortcut...

set "DESKTOP=%USERPROFILE%\Desktop"
set "TARGET=%~dp0start.bat"
REM Remove trailing backslash from workdir
set "WORKDIR=%~dp0"
if "!WORKDIR:~-1!"=="\" set "WORKDIR=!WORKDIR:~0,-1!"

set "PS_FILE=%TEMP%\speworderapp_shortcut.ps1"
(
    echo $ws = New-Object -ComObject WScript.Shell
    echo $s = $ws.CreateShortcut("%DESKTOP%\SpewOrderApp.lnk"^)
    echo $s.TargetPath = "%TARGET%"
    echo $s.WorkingDirectory = "%WORKDIR%"
    echo $s.WindowStyle = 1
    echo $s.Description = "Launch SpewOrderApp"
    echo $s.IconLocation = "%SystemRoot%\System32\imageres.dll,14"
    echo $s.Save(^)
) > "%PS_FILE%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_FILE%" >nul 2>&1
del "%PS_FILE%" >nul 2>&1

if exist "%DESKTOP%\SpewOrderApp.lnk" (
    echo         Shortcut created on Desktop: "SpewOrderApp"
) else (
    echo         Note: Could not create shortcut automatically.
    echo         You can start the app by double-clicking start.bat in this folder.
)

REM ================================================================
REM  Done!
REM ================================================================
echo.
echo  ================================================================
echo    Setup Complete!
echo  ================================================================
echo.
echo  TO START THE APP:
echo    Double-click "SpewOrderApp" on your Desktop.
echo.
echo  FIRST LOGIN:
echo    The first time you open the app, click "Login with Google"
echo    and sign in. This only happens once per computer.
echo.
echo  FUTURE UPDATES:
echo    If you have Git installed, open a terminal in this folder
echo    and run:  git pull
echo    Then run setup.bat again to update packages.
echo.
echo  ----------------------------------------------------------------
echo.
set /p "LAUNCH=Start the app now? (Y/N): "
if /i "!LAUNCH!"=="Y" (
    call "%~dp0start.bat"
) else (
    echo.
    echo  All done! Use the Desktop shortcut whenever you're ready.
    pause
)
