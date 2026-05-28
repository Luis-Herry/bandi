@echo off
chcp 65001 >nul
title 更新追番中心
cd /d "%~dp0"
setlocal enabledelayedexpansion

echo ================================
echo  更新追番中心
echo ================================
echo.

REM ── 1. 构建生产版本 ─────────────────────────────────
echo [1/3] 构建生产版本（约 5-15 秒）...
call npm run build
if errorlevel 1 (
  echo.
  echo [失败] 构建未通过，旧服务保持运行不动。
  echo 修复代码后再跑一次本脚本。
  echo.
  pause
  exit /b 1
)
echo [构建] OK
echo.

REM ── 2. 关闭占用 3000 端口的旧进程 ───────────────────
echo [2/3] 关闭旧服务...
set "killed=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
  taskkill /F /PID %%P >nul 2>&1
  if not errorlevel 1 (
    echo   - 已结束 PID %%P
    set "killed=1"
  )
)
if "!killed!"=="0" echo   - 没有发现旧服务在跑
echo.

REM ── 3. 启动新服务（独立窗口） ──────────────────────
echo [3/3] 启动新服务...
start "追番中心 - 服务运行中" cmd /k "npm start"
echo   - 已请求在新窗口启动 npm start
echo   - 等待端口 3000 监听（最多 30 秒）...
echo.

REM 轮询端口 3000，最多等 30 秒
set "ready=0"
for /l %%i in (1,1,30) do (
  if "!ready!"=="0" (
    netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
    if not errorlevel 1 (
      set "ready=1"
    ) else (
      timeout /t 1 >nul
    )
  )
)

if "!ready!"=="1" (
  echo [启动] OK — http://localhost:3000 已就绪
) else (
  echo [警告] 30 秒内未检测到端口 3000 监听。
  echo        请看 "追番中心 - 服务运行中" 那个窗口是否有报错。
  echo        如果那个窗口闪退或没出现，手动跑：在项目根目录执行  npm start
)
echo.
echo ================================
echo  完成。本窗口可关闭。
echo  服务在 "追番中心 - 服务运行中" 那个窗口里持续运行。
echo ================================
echo.
pause
endlocal
