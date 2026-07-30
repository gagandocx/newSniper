@echo off
setlocal enabledelayedexpansion

:: ═══════════════════════════════════════════════════════════════
:: CoderSnap — Release Builder
:: Obfuscates code + zips for distribution
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
    pause
    exit /b 1
)

:found_source
echo [OK] Source folder: !SRC!

set "OUT=%~dp0release\CoderSnap"
set "ZIP=%~dp0CoderSnap_RELEASE.zip"

:: ── Step 1: Clean and copy ──────────────────────────────────────
echo.
echo [1/3] Copying extension to release folder...
if exist "%~dp0release" rmdir /s /q "%~dp0release"
mkdir "!OUT!"
xcopy "!SRC!" "!OUT!" /E /I /Q /Y >nul
if exist "!OUT!\_metadata" rmdir /s /q "!OUT!\_metadata"
echo       Done.

:: ── Step 2: Obfuscate JS files ──────────────────────────────────
echo.
echo [2/3] Obfuscating JavaScript files...
echo       (This takes 30-60 seconds)
echo.

:: ── HEAVY obfuscation: license.js, fetch.js, content.js ─────────
:: These don't make direct API calls — safe to use RC4 string encoding

echo       - license.js
call javascript-obfuscator "!OUT!\license.js" --output "!OUT!\license.js" --compact true --self-defending false --string-array true --string-array-encoding rc4 --string-array-threshold 0.75 --control-flow-flattening true --control-flow-flattening-threshold 0.7 --dead-code-injection true --dead-code-injection-threshold 0.3 --identifier-names-generator hexadecimal --rename-globals false --transform-object-keys true --unicode-escape-sequence true
if %errorlevel% neq 0 ( echo [ERROR] Failed & pause & exit /b 1 )

echo       - fetch.js
call javascript-obfuscator "!OUT!\fetch.js" --output "!OUT!\fetch.js" --compact true --self-defending false --string-array true --string-array-encoding rc4 --string-array-threshold 0.75 --control-flow-flattening true --control-flow-flattening-threshold 0.5 --dead-code-injection true --dead-code-injection-threshold 0.2 --identifier-names-generator hexadecimal --rename-globals false --transform-object-keys true --unicode-escape-sequence true
if %errorlevel% neq 0 ( echo [ERROR] Failed & pause & exit /b 1 )

echo       - content.js
call javascript-obfuscator "!OUT!\content.js" --output "!OUT!\content.js" --compact true --self-defending false --string-array true --string-array-encoding rc4 --string-array-threshold 0.75 --control-flow-flattening true --control-flow-flattening-threshold 0.7 --dead-code-injection true --dead-code-injection-threshold 0.3 --identifier-names-generator hexadecimal --rename-globals false --transform-object-keys true --unicode-escape-sequence true
if %errorlevel% neq 0 ( echo [ERROR] Failed & pause & exit /b 1 )

:: ── MEDIUM obfuscation: auth.js, brain.js, tokenCapture.js ──────
:: These interact with chrome.runtime.sendMessage and specific string
:: patterns (action names, model IDs). Use string-array WITHOUT rc4
:: encoding to keep runtime strings working correctly.

echo       - auth.js
call javascript-obfuscator "!OUT!\auth.js" --output "!OUT!\auth.js" --compact true --self-defending false --string-array true --string-array-threshold 0.75 --control-flow-flattening true --control-flow-flattening-threshold 0.4 --identifier-names-generator hexadecimal --rename-globals false
if %errorlevel% neq 0 ( echo [ERROR] Failed & pause & exit /b 1 )

echo       - brain.js
call javascript-obfuscator "!OUT!\brain.js" --output "!OUT!\brain.js" --compact true --self-defending false --string-array true --string-array-threshold 0.5 --control-flow-flattening true --control-flow-flattening-threshold 0.3 --identifier-names-generator hexadecimal --rename-globals false
if %errorlevel% neq 0 ( echo [ERROR] Failed & pause & exit /b 1 )

echo       - tokenCapture.js
call javascript-obfuscator "!OUT!\tokenCapture.js" --output "!OUT!\tokenCapture.js" --compact true --self-defending false --string-array true --string-array-threshold 0.5 --identifier-names-generator hexadecimal --rename-globals false
if %errorlevel% neq 0 ( echo [ERROR] Failed & pause & exit /b 1 )

:: ── LIGHT obfuscation: background.js ────────────────────────────
:: Service worker makes direct API calls (Groq, Telegram, Google).
:: String encoding BREAKS 'Bearer ', 'Authorization', API URLs.
:: Only rename variables — keep all strings intact.

echo       - background.js (light — keeps API strings intact)
call javascript-obfuscator "!OUT!\background.js" --output "!OUT!\background.js" --compact true --self-defending false --string-array false --control-flow-flattening false --dead-code-injection false --identifier-names-generator hexadecimal --rename-globals false
if %errorlevel% neq 0 ( echo [ERROR] Failed & pause & exit /b 1 )

:: ── LIGHT obfuscation: other files ──────────────────────────────

echo       - notif_block.js
call javascript-obfuscator "!OUT!\notif_block.js" --output "!OUT!\notif_block.js" --compact true --self-defending false --string-array true --identifier-names-generator hexadecimal --rename-globals false

echo       - Createapp.js
call javascript-obfuscator "!OUT!\Createapp.js" --output "!OUT!\Createapp.js" --compact true --self-defending false --string-array true --identifier-names-generator hexadecimal --rename-globals false

echo.
echo       All files obfuscated.

:: ── Step 3: Create zip ──────────────────────────────────────────
echo.
echo [3/3] Creating distribution zip...
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
echo     [x] Server heartbeat (30-min re-verify)
echo     [x] Anti-debugging (DevTools detection)
echo     [x] License gate + email binding
echo     [x] 1-year expiry
echo.
pause
