@echo off
title Anime Tracker
cd /d "%~dp0.."

echo ============================================
echo   Anime Tracker - Starting
echo ============================================
echo.

if not exist ".next" (
  echo [ERROR] .next folder not found
  echo Please run: npm run build
  echo.
  pause
  exit /b 1
)

REM Clean up any leftover process holding port 3000 from a previous crashed/orphaned run
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
echo [OK] Port 3000 is clear

tasklist /FI "IMAGENAME eq qbittorrent.exe" 2>NUL | findstr /I "qbittorrent.exe" >NUL
if errorlevel 1 (
  echo [WARN] qBittorrent NOT running - downloads will NOT work
  echo        Please start qBittorrent first
  echo.
) else (
  echo [OK] qBittorrent is running
  echo.
)

REM Wait 4 seconds then pop a NEW Chrome window (separate process, not a new tab)
start "" /B powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0open-chrome-window.ps1" -Url "http://localhost:3000" -DelaySec 4

echo Starting server...
echo A new Chrome window will open at http://localhost:3000 in 4 seconds
echo Close this window to stop the server
echo.

call npm start

echo.
echo [Server stopped] Press any key to close
pause >nul