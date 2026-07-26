@echo off
setlocal enabledelayedexpansion

:: ═══════════════════════════════════════════════════════════════
:: CoderSnap — Release Builder
:: Obfuscates code + recalculates integrity hashes + zips for distribution
::
:: PREREQUISITES:
::   npm install -g javascript-obfuscator
::
:: USAGE:
::   Just double-click this file or run: build_release.bat
::
:: OUTPUT:
::   CoderSnap_RELEASE.zip — ready to send to clients
:: ═══════════════════════════════════════════════════════════════

echo.
echo  ============================================
echo   CoderSnap Release Builder
echo  ============================================
echo.

:: Check if javascript-obfuscator is installed
where javascript-obfuscator >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] javascript-obfuscator not found!
    echo         Run: npm install -g javascript-obfuscator
    echo         Then try again.
    pause
    exit /b 1
)
echo [OK] javascript-obfuscator found.

:: ── Find the source folder ──────────────────────────────────────
:: Priority: extension\ folder first, then latest v* folder
set "SRC="

if exist "%~dp0extension\manifest.json" (
    set "SRC=%~dp0extension"
    goto :found_source
)

:: Look for v* folders (update_sniper.bat creates these)
for /d %%D in ("%~dp0v*") do (
    if exist "%%D\manifest.json" set "SRC=%%D"
)

if "!SRC!"=="" (
    echo.
    echo [ERROR] Cannot find extension files!
    echo         Looking in: %~dp0
    echo.
    echo         Make sure you have either:
    echo           extension\     folder, OR
    echo           v8.7.x.x\     folder
    echo.
    echo         with manifest.json inside it.
    echo.
    pause
    exit /b 1
)

:found_source
echo [OK] Source folder: !SRC!

set "OUT=%~dp0release\CoderSnap"
set "ZIP=%~dp0CoderSnap_RELEASE.zip"

:: ── Step 1: Clean and copy ──────────────────────────────────────
echo.
echo [1/5] Copying extension to release folder...
if exist "%~dp0release" rmdir /s /q "%~dp0release"
mkdir "!OUT!"
xcopy "!SRC!" "!OUT!" /E /I /Q /Y >nul
if exist "!OUT!\_metadata" rmdir /s /q "!OUT!\_metadata"
echo       Done.

:: ── Step 2: Obfuscate JS files ──────────────────────────────────
echo.
echo [2/5] Obfuscating JavaScript files...
echo       (This takes 30-60 seconds)
echo.

echo       - license.js
call javascript-obfuscator "!OUT!\license.js" --output "!OUT!\license.js" --compact true --self-defending false --string-array true --string-array-encoding rc4 --string-array-threshold 0.75 --control-flow-flattening true --control-flow-flattening-threshold 0.7 --dead-code-injection true --dead-code-injection-threshold 0.3 --identifier-names-generator hexadecimal --rename-globals false --transform-object-keys true --unicode-escape-sequence true
if %errorlevel% neq 0 (
    echo [ERROR] Failed to obfuscate license.js
    pause
    exit /b 1
)

echo       - fetch.js
call javascript-obfuscator "!OUT!\fetch.js" --output "!OUT!\fetch.js" --compact true --self-defending false --string-array true --string-array-encoding rc4 --string-array-threshold 0.75 --control-flow-flattening true --control-flow-flattening-threshold 0.5 --dead-code-injection true --dead-code-injection-threshold 0.2 --identifier-names-generator hexadecimal --rename-globals false --transform-object-keys true --unicode-escape-sequence true
if %errorlevel% neq 0 (
    echo [ERROR] Failed to obfuscate fetch.js
    pause
    exit /b 1
)

echo       - content.js
call javascript-obfuscator "!OUT!\content.js" --output "!OUT!\content.js" --compact true --self-defending false --string-array true --string-array-encoding rc4 --string-array-threshold 0.75 --control-flow-flattening true --control-flow-flattening-threshold 0.7 --dead-code-injection true --dead-code-injection-threshold 0.3 --identifier-names-generator hexadecimal --rename-globals false --transform-object-keys true --unicode-escape-sequence true
if %errorlevel% neq 0 (
    echo [ERROR] Failed to obfuscate content.js
    pause
    exit /b 1
)

echo       - background.js (minified only — contains integrity checker)
call javascript-obfuscator "!OUT!\background.js" --output "!OUT!\background.js" --compact true --self-defending false --string-array false --control-flow-flattening false --dead-code-injection false --identifier-names-generator hexadecimal --rename-globals false
if %errorlevel% neq 0 (
    echo [ERROR] Failed to obfuscate background.js
    pause
    exit /b 1
)

echo       - auth.js
call javascript-obfuscator "!OUT!\auth.js" --output "!OUT!\auth.js" --compact true --self-defending false --string-array true --string-array-encoding rc4 --control-flow-flattening true --control-flow-flattening-threshold 0.4 --identifier-names-generator hexadecimal --rename-globals false

echo       - notif_block.js
call javascript-obfuscator "!OUT!\notif_block.js" --output "!OUT!\notif_block.js" --compact true --self-defending false --string-array true --identifier-names-generator hexadecimal --rename-globals false

echo       - Createapp.js
call javascript-obfuscator "!OUT!\Createapp.js" --output "!OUT!\Createapp.js" --compact true --self-defending false --string-array true --identifier-names-generator hexadecimal --rename-globals false

echo.
echo       All files obfuscated.

:: ── Step 3: Calculate SHA-256 hashes ────────────────────────────
echo.
echo [3/5] Calculating integrity hashes...

for /f "delims=" %%H in ('powershell -Command "(Get-FileHash '!OUT!\license.js' -Algorithm SHA256).Hash.ToLower()"') do set "HASH_LICENSE=%%H"
for /f "delims=" %%H in ('powershell -Command "(Get-FileHash '!OUT!\fetch.js' -Algorithm SHA256).Hash.ToLower()"') do set "HASH_FETCH=%%H"
for /f "delims=" %%H in ('powershell -Command "(Get-FileHash '!OUT!\content.js' -Algorithm SHA256).Hash.ToLower()"') do set "HASH_CONTENT=%%H"

echo       license.js: !HASH_LICENSE!
echo       fetch.js:   !HASH_FETCH!
echo       content.js: !HASH_CONTENT!

:: ── Step 4: Update hashes in background.js ──────────────────────
echo.
echo [4/5] Updating integrity hashes in background.js...

:: Replace the old hashes with new ones in the obfuscated background.js
powershell -Command ^
    "$content = Get-Content '!OUT!\background.js' -Raw; ^
    $content = $content -replace 'f33c5fe19a716f91519c293273b671f1686574c5b5591743982e5891ce53b9d6', '!HASH_LICENSE!'; ^
    $content = $content -replace 'fb0720bb286b0d81a6fe2e7c00df608b07940f0b699ae56ce7002239c77a8ab6', '!HASH_FETCH!'; ^
    $content = $content -replace '59f26f8f5a27b20dae904d13536fb14c2be1b5fcf9bc7562c57b9d246ee91699', '!HASH_CONTENT!'; ^
    Set-Content '!OUT!\background.js' -Value $content -NoNewline"

echo       Hashes updated in background.js

:: ── Step 5: Create zip ──────────────────────────────────────────
echo.
echo [5/5] Creating distribution zip...
if exist "!ZIP!" del "!ZIP!"
powershell -Command "Compress-Archive -Path '%~dp0release\CoderSnap' -DestinationPath '!ZIP!' -Force"
echo       Created: CoderSnap_RELEASE.zip

:: ── Done! ───────────────────────────────────────────────────────
echo.
echo  ============================================
echo   BUILD COMPLETE!
echo  ============================================
echo.
echo   Output: CoderSnap_RELEASE.zip
for %%A in ("!ZIP!") do echo   Size:   %%~zA bytes
echo.
echo   This zip is ready to send to clients.
echo   They extract it and Load Unpacked in Chrome.
echo.
echo   Security layers active:
echo     [x] Code obfuscated (unreadable)
echo     [x] SHA-256 file integrity check
echo     [x] Server heartbeat (30-min re-verify)
echo     [x] Anti-debugging (DevTools detection)
echo     [x] License gate + email binding
echo     [x] 1-year expiry
echo.
pause
