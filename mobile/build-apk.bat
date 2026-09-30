@echo off
title Nuvyra-Craft Mobile - APK Builder
echo ========================================
echo   Nuvyra-Craft Mobile - Building APK...
echo ========================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1"
echo.
pause
