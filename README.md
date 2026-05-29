# 追番中心桌面版

追番中心的 Windows 桌面版分发仓库。它把本地 Web 应用封装成桌面应用，并随包携带 Node 运行时和 qBittorrent 下载器副本，方便朋友直接安装使用。

## Repository

- GitHub: https://github.com/Luis-Herry/anime-tracker-desktop
- Visibility: private
- Main branch: `main`
- Release: https://github.com/Luis-Herry/anime-tracker-desktop/releases/tag/v0.1.0

## 主要能力

- 我的追番、番剧库、番剧详情、统计和设置中心。
- RSS 搜源、下载队列、qBittorrent 状态检测和本地播放入口。
- 桌面版内置独立 qBittorrent profile，减少对用户已有 qBittorrent 配置的影响。
- 下载管理页和设置中心提供“不会设置看这里”图文引导，按截图配置 Web UI。
- qBittorrent Web UI 默认连接 `127.0.0.1:8080`，默认用户名 `admin`。

## 下载使用

在仓库的 [Releases](https://github.com/Luis-Herry/anime-tracker-desktop/releases) 页面下载桌面版分发包。Release `v0.1.0` 包含：

- `Windows installer`（`anime-tracker-desktop-setup-v0.1.0-x64.exe`）：安装版，适合日常使用。
- `Windows portable`（`anime-tracker-desktop-portable-v0.1.0-x64.exe`）：便携版，适合免安装试用。
- `Desktop readme`（`README-desktop.txt`）：桌面版使用说明。

首次启动时，桌面应用会启动内置服务，并尝试拉起内置 qBittorrent。若连接失败，进入下载管理页或设置中心，点击“不会设置看这里”按截图检查 Web UI 设置。

## 桌面运行路径

- App database: `%APPDATA%/追番中心/data/anime.db`
- Downloads: `%APPDATA%/追番中心/download/`
- qBittorrent profile: `%APPDATA%/追番中心/qbit-profile/`
- Logs: `%APPDATA%/追番中心/logs/`
- Default app login: `admin` / `PUBLIC_HISTORY_REDACTED`
- Bundled qBittorrent Web UI: `127.0.0.1:8080`

## qBittorrent Web UI 设置

推荐配置：

| 项目 | 值 |
|---|---|
| Web 用户界面 | 勾选启用 |
| IP 地址 | `127.0.0.1` |
| 端口 | `8080` |
| 用户名 | `admin` |
| 本地主机跳过身份验证 | 勾选 |

如果本机 `8080` 被系统或其他软件占用，可以修改桌面版本地配置中的 `qbitPort` 后重启应用。

## 本地开发

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run test          # 运行测试
npm run build         # 构建 Next.js 生产版本
npm start             # 启动生产服务
npm run desktop:start # 本地启动 Electron 桌面应用
npm run desktop:dist  # 生成 Windows 安装包和便携版
```

`release/`、`.next/`、`node_modules/`、`data/`、`download/` 和运行验证目录不会提交到 Git。

## 目录说明

```text
desktop/             Electron 主进程与桌面启动逻辑
src/                 Next.js 应用源码
public/              静态资源，包含 qBittorrent 设置引导截图
vendor/node/         内置 Node 运行时
vendor/qbittorrent/  内置 qBittorrent 下载器
docs/desktop/        桌面版打包说明
```

## Bundled Third-Party Binaries

- `vendor/node/node.exe`
- `vendor/qbittorrent/qbittorrent.exe`

Keep the notice files beside the binaries. Do not patch the qBittorrent executable.
