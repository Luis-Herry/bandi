# 在桌面创建「追番中心」快捷方式
# 用法: powershell -ExecutionPolicy Bypass -File "<repo>\scripts\create-shortcut.ps1"
# 输出文件固定为「追番中心-开发模式.lnk」，与正式安装版快捷方式区分。

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "追番中心-开发模式.lnk"
$targetPath = Join-Path $PSScriptRoot "start-bandi-desktop-dev.bat"
$workingDir = $repoRoot
$iconPath = Join-Path $repoRoot "public\favicon.ico"

if (-not (Test-Path $targetPath)) {
    Write-Host "[错误] 启动脚本不存在: $targetPath" -ForegroundColor Red
    exit 1
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $workingDir
$shortcut.WindowStyle = 1
$shortcut.Description = "追番中心开发模式 - 按需构建并启动 Electron"

if (Test-Path $iconPath) {
    $shortcut.IconLocation = $iconPath
    Write-Host "使用自定义图标: $iconPath" -ForegroundColor Gray
} else {
    Write-Host "未找到 favicon.ico，使用 cmd.exe 默认图标" -ForegroundColor Gray
}

$shortcut.Save()

Write-Host ""
Write-Host "桌面快捷方式已创建: $shortcutPath" -ForegroundColor Green
Write-Host ""
Write-Host "使用方式: 双击桌面「追番中心-开发模式」图标，源码有更新时才会重新构建，然后启动 Electron" -ForegroundColor Cyan
