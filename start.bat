@echo off
setlocal
cd /d "%~dp0"
title PixelithShop - Sunucu
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [HATA] Node.js bulunamadi.
  echo Node.js 20.9 veya daha yeni bir surum kurun: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

node "%~dp0scripts\launch.mjs"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [HATA] Sunucu %EXIT_CODE% koduyla kapandi.
  pause
)

exit /b %EXIT_CODE%
