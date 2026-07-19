param(
    [string]$DesktopPath = [Environment]::GetFolderPath("Desktop")
)

$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$productName = -join @(
    [char]0x8FFD,
    [char]0x756A,
    [char]0x4E2D,
    [char]0x5FC3
)
$runtimeDir = Join-Path $repoRoot "release\win-unpacked"
$targetPath = Join-Path $runtimeDir "$productName.exe"
$shortcutPath = Join-Path $DesktopPath "$productName.lnk"

if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
    throw "Direct runtime is missing: $targetPath. Run npm run desktop:pack first."
}
if ([string]::IsNullOrWhiteSpace($DesktopPath)) {
    throw "Desktop path is unavailable."
}
[System.IO.Directory]::CreateDirectory($DesktopPath) | Out-Null

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $runtimeDir
$shortcut.WindowStyle = 1
$shortcut.Description = "$productName - Bandi direct local runtime (no installation)"
$shortcut.IconLocation = "$targetPath,0"
$shortcut.Save()

$saved = $shell.CreateShortcut($shortcutPath)
if (
    -not (Test-Path -LiteralPath $shortcutPath -PathType Leaf) -or
    $saved.TargetPath -ne $targetPath -or
    $saved.WorkingDirectory -ne $runtimeDir
) {
    throw "Direct desktop shortcut verification failed: $shortcutPath"
}

Write-Output "DIRECT_SHORTCUT=$shortcutPath"
Write-Output "DIRECT_TARGET=$targetPath"
