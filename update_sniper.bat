@echo off
setlocal enabledelayedexpansion

:: ═══════════════════════════════════════════════════════════════
:: CoderSnap Auto-Updater
:: Downloads the latest version from GitHub (unlimited-final branch)
:: Copies extension files + build_release.bat to CoderSnap folder
:: ═══════════════════════════════════════════════════════════════

set "REPO=gagandocx/newSniper"
set "BRANCH=unlimited-final"
set "DEST=F:\Automation\Amazon\CoderSnap"
set "TEMP_ZIP=%TEMP%\sniper_latest.zip"
set "TEMP_EXTRACT=%TEMP%\sniper_extract"

echo.
echo  ========================================
echo   CoderSnap - Auto Updater
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
echo       (This may take a moment...)
curl -L --retry 3 --retry-delay 2 -o "%TEMP_ZIP%" "https://github.com/%REPO%/archive/refs/heads/%BRANCH%.zip"
if %errorlevel% neq 0 (
    echo [ERROR] Download failed. Check your internet connection.
    pause
    exit /b 1
)

:: Verify download isn't empty
for %%A in ("%TEMP_ZIP%") do (
    if %%~zA LSS 1000 (
        echo [ERROR] Downloaded file is too small — likely a GitHub error.
        echo         Try again in a minute.
        del "%TEMP_ZIP%" 2>nul
        pause
        exit /b 1
    )
)
echo       Done. (Downloaded successfully)

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

:: Use extension/ folder (the working source)
if not exist "%EXTRACTED%\extension" (
    echo [ERROR] Extension folder not found in download.
    pause
    exit /b 1
)
set "SOURCE=%EXTRACTED%\extension"

:: Read version from manifest.json
for /f "tokens=2 delims=:," %%V in ('findstr /C:"\"version\"" "%SOURCE%\manifest.json"') do (
    set "VERSION=%%~V"
    set "VERSION=!VERSION: =!"
    set "VERSION=!VERSION:"=!"
)

echo.
echo  Version detected: v!VERSION!
echo.

:: Create destination if it doesn't exist
if not exist "%DEST%" mkdir "%DEST%"

:: Create version-named folder
set "FINAL_DEST=%DEST%\v!VERSION!"

:: Clear old version folder if it exists
if exist "!FINAL_DEST!" (
    echo [INFO] Removing old v!VERSION! folder...
    rmdir /s /q "!FINAL_DEST!"
)

echo [4/4] Copying files to %DEST%...

:: Copy extension files to versioned folder
mkdir "!FINAL_DEST!" 2>nul
xcopy "%SOURCE%" "!FINAL_DEST!" /E /I /Q /Y >nul
echo       Extension files copied to: v!VERSION!\

:: Copy build_release.bat to CoderSnap root
if exist "%EXTRACTED%\build_release.bat" (
    copy /Y "%EXTRACTED%\build_release.bat" "%DEST%\build_release.bat" >nul
    echo       build_release.bat updated.
)

:: Copy update_sniper.bat to CoderSnap root (self-update)
if exist "%EXTRACTED%\update_sniper.bat" (
    copy /Y "%EXTRACTED%\update_sniper.bat" "%DEST%\update_sniper.bat" >nul
    echo       update_sniper.bat updated.
)

:: Cleanup temp files
del "%TEMP_ZIP%" 2>nul
rmdir /s /q "%TEMP_EXTRACT%" 2>nul

echo.
echo  ========================================
echo   SUCCESS! CoderSnap updated to v!VERSION!
echo  ========================================
echo.
echo  Your folder:
echo    %DEST%\
echo      v!VERSION!\          = extension files (load unpacked in Chrome)
echo      build_release.bat  = builds obfuscated zip for clients
echo      update_sniper.bat  = this updater (auto-updated)
echo.
echo  To use the extension yourself:
echo    chrome://extensions - Load unpacked - select v!VERSION!\
echo.
echo  To build for clients:
echo    Double-click build_release.bat
echo    Send CoderSnap_RELEASE.zip to clients
echo.
pause
