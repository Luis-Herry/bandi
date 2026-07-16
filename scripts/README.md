# 追番中心 - Desktop 开发启动脚本

这些脚本只用于开发/调试。现行产品是 Electron 桌面版，日常使用和分发都应运行 `release/` 内的安装版或 portable；打包说明见 `docs/desktop/packaging.md`。

## 一次性配置：生成桌面快捷方式

在仓库根目录的 PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\create-shortcut.ps1"
```

完成后桌面会出现「追番中心-开发模式.lnk」，避免与正式安装版快捷方式混淆。

## 日常使用

1. 双击桌面「追番中心-开发模式」图标
2. 启动器比较源码、根配置和 `.env*` 的内容 SHA-256，只在输入变化或构建残缺时运行 Next build
3. build 成功后镜像准备 standalone 资源并启动真实 Electron；Electron 会同时启动受管 qBittorrent

## 重要前提

- 第一次使用或源码、配置、依赖清单更新后，启动器会自动 build。
- 构建失败时不会启动残缺应用；已有 `release/` 安装包不受影响。
- 只想查看判断结果可运行 `npm run desktop:check-build`。
- 发布用 `npm run desktop:dist` 始终执行完整构建，不复用开发判断。
- `npm start` 会通过 `node --use-env-proxy` 启动 Next，让 Bangumi API 请求继承本机 `HTTP_PROXY` / `HTTPS_PROXY`。如果代理客户端没开，番剧库会先重试，再显示本地 fallback。

## qBittorrent 检查

桌面 Electron 模式由主进程从 `18180` 起自动选择回环端口、生成凭据并管理 qBittorrent。浏览器开发模式依赖外部 qBittorrent，当前诊断地址为 `127.0.0.1:18080`；两套 profile 和任务不得混用。

## 故障排查

### Bangumi 连接超时

先确认本机代理客户端正在运行，再对照：

```powershell
Get-ChildItem Env:*proxy*
curl.exe -4 -I https://api.bgm.tv/calendar
node --use-env-proxy -e "fetch('https://api.bgm.tv/calendar').then(r=>console.log(r.status))"
```

`curl` 能通但应用超时时，检查 `package.json` 的 `dev` / `start` 是否仍保留 `--use-env-proxy`。

### qBittorrent Web UI 连不上

Electron 桌面包先看设置中心的“下载服务”状态，主进程会自动避开不可绑定端口。只有保留的浏览器调试入口或外部 qBittorrent 兼容模式需要确认 Web UI 已启用；如果 `8080` 连不上但没有进程占用，检查 Windows 是否保留了这段端口：

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
netsh interface ipv6 show excludedportrange protocol=tcp
```

部分 Windows 环境会保留包含 `8080` 的端口段，导致 qBit / Node 监听时报 `EACCES`。Electron 模式会自动换端口；外部 qBit Web UI 使用 `18080`。

### 想换图标

- 开发模式桌面快捷方式读取 `public\favicon.ico`；替换后重新运行 `create-shortcut.ps1`。
- 正式 Windows 窗口、Setup 与 portable 读取 `desktop\assets\app-icon.ico`；同步同一图标族的 PNG/favicon 后，结束旧应用进程并运行 `npm run desktop:dist`。

## 文件清单

| 文件 | 作用 |
|------|------|
| `start-bandi-desktop-dev.bat` | 按需构建并启动 Electron（开发快捷方式入口） |
| `desktop-dev-start.mjs` | 比较输入内容指纹、校验构建完整性、准备 standalone 并启动 Electron |
| `start-anime-tracker.bat` | 保留的浏览器调试入口，依赖外部 qBit |
| `create-shortcut.ps1` | 生成桌面快捷方式（只需跑一次） |
| `README.md` | 本文件 |
