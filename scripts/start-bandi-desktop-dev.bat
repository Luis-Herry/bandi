@echo off
title Bandi Desktop Development
cd /d "%~dp0.."

echo ============================================
echo   Bandi Desktop - Development Launcher
echo ============================================
echo Checks source content and rebuilds only when required.
echo.

call npm run desktop:start
if errorlevel 1 (
  echo.
  echo [ERROR] Desktop development launch failed.
  pause
  exit /b 1
)
