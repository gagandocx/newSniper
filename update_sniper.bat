@echo off
setlocal enabledelayedexpansion

:: ═══════════════════════════════════════════════════════════════
:: CoderSnap Auto-Updater
:: Downloads the latest version from GitHub (unlimited-final branch)
:: Only copies the extension/ folder — skips build scripts and zips
:: ═══════════════════════════════════════════════════════════════

set "REPO=gagandocx/newSniper"
set "BRANCH=unlimited-final"
set "DEST=F:\Automation\Amazon\newSniper\Unlocked"
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

:: Check if dist subfolder exists (obfuscated/protected version — always preferred)
if exist "%EXTRACTED%\dist" (
    set "SOURCE=%EXTRACTED%\dist"
    echo       [Using protected/obfuscated build]
) else if exist "%EXTRACTED%\extension" (
    set "SOURCE=%EXTRACTED%\extension"
    echo       [WARNING: dist/ not found, using source extension/]
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

:: Also copy CoderSnap.crx to destination if it exists
if exist "%EXTRACTED%\CoderSnap.crx" (
    copy /Y "%EXTRACTED%\CoderSnap.crx" "%DEST%\CoderSnap.crx" >nul
    copy /Y "%EXTRACTED%\CoderSnap.crx" "%FINAL_DEST%\CoderSnap.crx" >nul
    echo       [CRX] Copied CoderSnap.crx to %DEST%\
    echo       [CRX] Also in %FINAL_DEST%\CoderSnap.crx
) else (
    echo       [NOTE] CoderSnap.crx not found in download
)

:: Cleanup temp files
del "%TEMP_ZIP%" 2>nul
rmdir /s /q "%TEMP_EXTRACT%" 2>nul

echo.
echo  ========================================
echo   SUCCESS! CoderSnap updated to v%VERSION%
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
echo  (If already loaded, just click the refresh icon on the extension card)
echo.
pause
