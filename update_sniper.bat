@echo off
setlocal enabledelayedexpansion

:: ═══════════════════════════════════════════════════════════════
:: ShiftSniper Auto-Updater
:: Downloads the latest unlimited version from GitHub
:: Destination: F:\Automation\Amazon\newSniper\Unlocked
:: ═══════════════════════════════════════════════════════════════

set "REPO=gagandocx/newSniper"
set "BRANCH=unlimited-final"
set "DEST=F:\Automation\Amazon\newSniper\Unlocked"
set "TEMP_ZIP=%TEMP%\sniper_latest.zip"
set "TEMP_EXTRACT=%TEMP%\sniper_extract"

echo.
echo  ========================================
echo   ShiftSniper Unlimited - Auto Updater
echo  ========================================
echo.

:: Check if curl is available
where curl >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] curl not found. Please install curl or use Windows 10+.
    pause
    exit /b 1
)

:: Download the zip of the branch from GitHub
echo [1/4] Downloading latest version from GitHub...
curl -L -o "%TEMP_ZIP%" "https://github.com/%REPO%/archive/refs/heads/%BRANCH%.zip"
if %errorlevel% neq 0 (
    echo [ERROR] Download failed. Check your internet connection.
    pause
    exit /b 1
)
echo       Done.

:: Clean old extraction folder
echo [2/4] Preparing extraction...
if exist "%TEMP_EXTRACT%" rmdir /s /q "%TEMP_EXTRACT%"
mkdir "%TEMP_EXTRACT%"

:: Extract the zip
echo [3/4] Extracting files...
powershell -Command "Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_EXTRACT%' -Force"
if %errorlevel% neq 0 (
    echo [ERROR] Extraction failed.
    pause
    exit /b 1
)
echo       Done.

:: Find the extracted folder name (GitHub adds repo-branch prefix)
for /d %%D in ("%TEMP_EXTRACT%\*") do set "EXTRACTED=%%D"

:: Check if extension subfolder exists
if exist "%EXTRACTED%\extension" (
    set "SOURCE=%EXTRACTED%\extension"
) else (
    echo [ERROR] Extension folder not found in download.
    pause
    exit /b 1
)

:: Read version from manifest.json
for /f "tokens=2 delims=:," %%V in ('findstr /C:"\"version\"" "%SOURCE%\manifest.json"') do (
    set "VERSION=%%~V"
    set "VERSION=!VERSION: =!"
    set "VERSION=!VERSION:"=!"
)

echo.
echo  Version detected: v%VERSION%
echo.

:: Create version-named folder in destination
set "FINAL_DEST=%DEST%\v%VERSION%"

:: Clear destination if it exists, then copy
if exist "%FINAL_DEST%" (
    echo [INFO] Removing old v%VERSION% folder...
    rmdir /s /q "%FINAL_DEST%"
)

echo [4/4] Copying to %FINAL_DEST%...
mkdir "%FINAL_DEST%" 2>nul
xcopy "%SOURCE%\*" "%FINAL_DEST%\" /E /I /Q /Y >nul
if %errorlevel% neq 0 (
    echo [ERROR] Copy failed.
    pause
    exit /b 1
)

:: Cleanup temp files
del "%TEMP_ZIP%" 2>nul
rmdir /s /q "%TEMP_EXTRACT%" 2>nul

echo.
echo  ========================================
echo   SUCCESS! Extension updated to v%VERSION%
echo  ========================================
echo.
echo  Location: %FINAL_DEST%
echo.
echo  To install/update in Chrome:
echo    1. Open chrome://extensions
echo    2. Enable Developer Mode (top-right)
echo    3. Click "Load unpacked"
echo    4. Select: %FINAL_DEST%
echo.
echo  (If already loaded, just click the refresh icon)
echo.
pause
