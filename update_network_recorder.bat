@echo off
setlocal enabledelayedexpansion

:: ═══════════════════════════════════════════════════════════════
:: Network Recorder Auto-Updater
:: Downloads latest network_recorder from GitHub (unlimited-final branch)
:: ═══════════════════════════════════════════════════════════════

set "REPO=gagandocx/newSniper"
set "BRANCH=unlimited-final"
set "DEST=F:\Automation\Amazon\CoderSnap\Network"
set "TEMP_ZIP=%TEMP%\recorder_latest.zip"
set "TEMP_EXTRACT=%TEMP%\recorder_extract"

echo.
echo  ========================================
echo   Network Recorder - Auto Updater
echo  ========================================
echo.

:: Download the zip
echo [1/3] Downloading latest from GitHub...
curl -L --retry 3 --retry-delay 2 -H "Cache-Control: no-cache" -o "%TEMP_ZIP%" "https://github.com/%REPO%/archive/refs/heads/%BRANCH%.zip"
if %errorlevel% neq 0 (
    echo [ERROR] Download failed.
    pause
    exit /b 1
)
echo       Done.

:: Extract
echo [2/3] Extracting...
if exist "%TEMP_EXTRACT%" rmdir /s /q "%TEMP_EXTRACT%"
mkdir "%TEMP_EXTRACT%"
powershell -Command "Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_EXTRACT%' -Force"
if %errorlevel% neq 0 (
    echo [ERROR] Extraction failed.
    pause
    exit /b 1
)
echo       Done.

:: Find extracted folder
for /d %%D in ("%TEMP_EXTRACT%\*") do set "EXTRACTED=%%D"

:: Check network_recorder folder exists
if not exist "%EXTRACTED%\network_recorder" (
    echo [ERROR] network_recorder folder not found in download.
    pause
    exit /b 1
)

:: Clear old files and copy new ones
echo [3/3] Copying to %DEST%...
if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"
xcopy "%EXTRACTED%\network_recorder" "%DEST%" /E /I /Q /Y >nul
echo       Done.

:: Cleanup
del "%TEMP_ZIP%" 2>nul
rmdir /s /q "%TEMP_EXTRACT%" 2>nul

echo.
echo  ========================================
echo   SUCCESS! Network Recorder updated
echo  ========================================
echo.
echo  Your folder: %DEST%
echo.
echo  To use:
echo    chrome://extensions - Load unpacked - select %DEST%
echo.
pause
