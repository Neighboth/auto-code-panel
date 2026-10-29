@echo off
setlocal
cd /d "%~dp0"
title PixelithShop - Sifirlama
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

node "%~dp0scripts\reset.mjs" %*
set "EXIT_CODE=%ERRORLEVEL%"

if /I "%~1"=="-y" exit /b %EXIT_CODE%
if /I "%~1"=="--yes" exit /b %EXIT_CODE%

echo.
pause
exit /b %EXIT_CODE%
