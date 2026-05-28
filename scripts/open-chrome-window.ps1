# 等待 N 秒后用「新 Chrome 窗口」打开本地服务
# 用法: powershell -NoProfile -WindowStyle Hidden -File "open-chrome-window.ps1" -Url "http://localhost:3000" -DelaySec 4

param(
    [string]$Url = "http://localhost:3000",
    [int]$DelaySec = 4
)

Start-Sleep -Seconds $DelaySec

# 1) 优先用 App Paths 注册表查 Chrome
$chrome = $null
try {
    $reg = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
    $val = (Get-ItemProperty -Path $reg -ErrorAction Stop)."(default)"
    if ($val -and (Test-Path $val)) { $chrome = $val }
} catch {}

# 2) 注册表没有就遍历已知安装路径
if (-not $chrome) {
    $candidates = @(
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { $chrome = $p; break }
    }
}

# 3) 找到 Chrome 就用 --new-window 开；找不到回退到系统默认浏览器
if ($chrome) {
    Start-Process -FilePath $chrome -ArgumentList "--new-window", $Url
} else {
    Start-Process $Url
}
