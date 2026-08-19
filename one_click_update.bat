@echo off
setlocal enabledelayedexpansion

:: ═══════════════════════════════════════════════════════════════
:: CoderSnap — ONE CLICK UPDATE + BUILD + DEPLOY
:: Downloads latest → Builds obfuscated release → Extracts ready to load
:: ═══════════════════════════════════════════════════════════════

set "REPO=gagandocx/newSniper"
set "BRANCH=unlimited-final"
set "DEST=F:\Automation\Amazon\CoderSnap"
set "TEMP_ZIP=%TEMP%\sniper_latest.zip"
set "TEMP_EXTRACT=%TEMP%\sniper_extract"

echo.
echo  ============================================
echo   CoderSnap — ONE CLICK UPDATE
echo   Download + Build + Deploy
echo  ============================================
echo.

:: ── Step 1: Download latest from GitHub ─────────────────────────
echo [1/5] Downloading latest version from GitHub...
curl -L --retry 3 --retry-delay 2 -H "Cache-Control: no-cache" -o "%TEMP_ZIP%" "https://github.com/%REPO%/archive/refs/heads/%BRANCH%.zip"
if %errorlevel% neq 0 (
    echo [ERROR] Download failed. Check internet connection.
    pause
    exit /b 1
)
for %%A in ("%TEMP_ZIP%") do (
    if %%~zA LSS 1000 (
        echo [ERROR] Download too small — GitHub error. Try again.
        del "%TEMP_ZIP%" 2>nul
        pause
        exit /b 1
    )
)
echo       Done.

:: ── Step 2: Extract ─────────────────────────────────────────────
echo [2/5] Extracting...
if exist "%TEMP_EXTRACT%" rmdir /s /q "%TEMP_EXTRACT%"
mkdir "%TEMP_EXTRACT%"
powershell -Command "Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_EXTRACT%' -Force"
if %errorlevel% neq 0 (
    echo [ERROR] Extraction failed.
    pause
    exit /b 1
)
for /d %%D in ("%TEMP_EXTRACT%\*") do set "EXTRACTED=%%D"
if not exist "%EXTRACTED%\extension" (
    echo [ERROR] Extension folder not found.
    pause
    exit /b 1
)
set "SOURCE=%EXTRACTED%\extension"

:: Read version from manifest
for /f "tokens=2 delims=:," %%V in ('findstr /C:"\"version\"" "%SOURCE%\manifest.json"') do (
    set "VERSION=%%~V"
    set "VERSION=!VERSION: =!"
    set "VERSION=!VERSION:"=!"
)
echo       Version: v!VERSION!
echo       Done.

:: ── Step 3: Copy raw extension (for your personal dev use) ──────
echo [3/5] Copying raw extension to v!VERSION!\...
set "RAW_DEST=%DEST%\v!VERSION!"
if exist "!RAW_DEST!" rmdir /s /q "!RAW_DEST!"
mkdir "!RAW_DEST!" 2>nul
xcopy "%SOURCE%" "!RAW_DEST!" /E /I /Q /Y >nul
echo       Done.

:: ── Step 4: Build obfuscated release ────────────────────────────
echo [4/5] Building obfuscated release (30-60 seconds)...
where javascript-obfuscator >nul 2>&1
if %errorlevel% neq 0 (
    echo       [SKIP] javascript-obfuscator not installed.
    echo       Skipping obfuscation — raw files only.
    echo       To enable: npm install -g javascript-obfuscator
    goto :skip_build
)

set "OUT=%DEST%\release\CoderSnap"
if exist "%DEST%\release" rmdir /s /q "%DEST%\release"
mkdir "!OUT!"
xcopy "%SOURCE%" "!OUT!" /E /I /Q /Y >nul
if exist "!OUT!\_metadata" rmdir /s /q "!OUT!\_metadata"

echo       - license.js
call javascript-obfuscator "!OUT!\license.js" --output "!OUT!\license.js" --compact true --string-array true --string-array-threshold 0.75 --control-flow-flattening true --control-flow-flattening-threshold 0.7 --dead-code-injection true --dead-code-injection-threshold 0.3 --identifier-names-generator hexadecimal --rename-globals false --self-defending false >nul 2>&1

echo       - fetch.js
call javascript-obfuscator "!OUT!\fetch.js" --output "!OUT!\fetch.js" --compact true --string-array true --string-array-threshold 0.75 --control-flow-flattening true --control-flow-flattening-threshold 0.5 --dead-code-injection true --dead-code-injection-threshold 0.2 --identifier-names-generator hexadecimal --rename-globals false --self-defending false >nul 2>&1

echo       - content.js
call javascript-obfuscator "!OUT!\content.js" --output "!OUT!\content.js" --compact true --string-array true --string-array-threshold 0.75 --control-flow-flattening true --control-flow-flattening-threshold 0.7 --dead-code-injection true --dead-code-injection-threshold 0.3 --identifier-names-generator hexadecimal --rename-globals false --self-defending false >nul 2>&1

echo       - auth.js
call javascript-obfuscator "!OUT!\auth.js" --output "!OUT!\auth.js" --compact true --string-array true --string-array-threshold 0.5 --control-flow-flattening false --identifier-names-generator hexadecimal --rename-globals false --self-defending false >nul 2>&1

echo       - background.js
call javascript-obfuscator "!OUT!\background.js" --output "!OUT!\background.js" --compact true --string-array false --control-flow-flattening false --identifier-names-generator hexadecimal --rename-globals false --self-defending false >nul 2>&1

echo       - brain.js
call javascript-obfuscator "!OUT!\brain.js" --output "!OUT!\brain.js" --compact true --string-array true --string-array-threshold 0.5 --control-flow-flattening true --control-flow-flattening-threshold 0.3 --identifier-names-generator hexadecimal --rename-globals false --self-defending false >nul 2>&1

echo       - tokenCapture.js
call javascript-obfuscator "!OUT!\tokenCapture.js" --output "!OUT!\tokenCapture.js" --compact true --string-array true --string-array-threshold 0.5 --identifier-names-generator hexadecimal --rename-globals false --self-defending false >nul 2>&1

echo       - notif_block.js
call javascript-obfuscator "!OUT!\notif_block.js" --output "!OUT!\notif_block.js" --compact true --string-array true --identifier-names-generator hexadecimal --rename-globals false --self-defending false >nul 2>&1

echo       - Createapp.js (copied as-is)
copy /Y "%SOURCE%\Createapp.js" "!OUT!\Createapp.js" >nul

echo       - clickHelper.js (copied as-is)
copy /Y "%SOURCE%\clickHelper.js" "!OUT!\clickHelper.js" >nul

:: Create zip
set "ZIP=%DEST%\CoderSnap_RELEASE.zip"
if exist "!ZIP!" del "!ZIP!"
powershell -Command "Compress-Archive -Path '!OUT!' -DestinationPath '!ZIP!' -Force"
echo       Release zip created.

:: ── Step 5: Extract release to ready-to-load folder ─────────────
echo [5/5] Extracting release to READY folder...
set "READY=%DEST%\READY"
if exist "!READY!" rmdir /s /q "!READY!"
mkdir "!READY!" 2>nul
xcopy "!OUT!" "!READY!" /E /I /Q /Y >nul
echo       Done.

goto :done

:skip_build
set "READY=%DEST%\v!VERSION!"
echo       Using raw (unobfuscated) files as READY folder.

:done
:: Cleanup
del "%TEMP_ZIP%" 2>nul
rmdir /s /q "%TEMP_EXTRACT%" 2>nul

echo.
echo  ============================================
echo   ALL DONE! CoderSnap v!VERSION!
echo  ============================================
echo.
echo   Your folders:
echo     %DEST%\v!VERSION!\    = Raw source (dev)
if defined OUT echo     %DEST%\READY\           = Obfuscated (for clients)
if defined ZIP echo     %DEST%\CoderSnap_RELEASE.zip = Client zip
echo.
echo   To reload in Chrome:
echo     chrome://extensions - Reload CoderSnap
echo     (Or Load unpacked from: %DEST%\READY\)
echo.
pause
