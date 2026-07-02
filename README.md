# 追番中心桌面版

追番中心的 Windows 桌面版分发仓库。它把本地 Web 应用封装成桌面应用，并随包携带 Node 运行时和 qBittorrent 下载器副本，方便朋友直接安装使用。

## Repository

- GitHub: https://github.com/Luis-Herry/anime-tracker-desktop
- Visibility: private
- Main branch: `main`
- Release: https://github.com/Luis-Herry/anime-tracker-desktop/releases/tag/v0.1.0

## 主要能力

- 我的追番、番剧库、番剧详情、影视本地库、影视库、统计和设置中心。
- RSS 搜源、下载队列、qBittorrent 状态检测、内置 Web 播放器、外部播放器兜底和顶部下载通知。
- 影视/本地库支持扫描导入、TMDB/豆瓣/DMM 资料补全、电视剧追更、电影题材筛选和 R级题材 tab。
- 桌面版内置独立 qBittorrent profile，减少对用户已有 qBittorrent 配置的影响。
- 下载管理页和设置中心提供“不会设置看这里”图文引导，按截图配置 Web UI。
- qBittorrent Web UI 默认连接 `127.0.0.1:8080`，默认用户名 `admin`。
- 下载安全模式默认限制上传为 `128 KiB/s`，下载完成后暂停对应 torrent，减少后台做种对同机网络的影响。
- 下载列表支持单条移除、批量移除和清空列表；这些操作只清理追番中心本地列表，不删除 qBittorrent 任务或本地文件。
- 内置 Web 播放器支持本地视频 Range 拖动、秒级进度恢复、外挂字幕、截图保存，并保留外部播放器入口。
- Web 端 `transitions-dev` 动效基线已同步：卡片 tilt、Radix 开合、tabs、skeleton、通知/数字反馈、错误反馈和折叠区保持一致。

## 下载使用

在仓库的 [Releases](https://github.com/Luis-Herry/anime-tracker-desktop/releases) 页面下载桌面版分发包。Release `v0.1.0` 包含：

- `Windows installer`（`追番中心-Setup-0.1.0-x64.exe`）：安装版，适合日常使用。
- `Windows portable`（`追番中心-0.1.0-x64-portable.exe`）：便携版，适合免安装试用。
- `Desktop readme`（`README-桌面版.txt`）：桌面版使用说明。

首次启动时，桌面应用会启动内置服务，并尝试拉起内置 qBittorrent。若连接失败，进入下载管理页或设置中心，点击“不会设置看这里”按截图检查 Web UI 设置。

## 桌面运行路径

- App database: `%APPDATA%/追番中心/data/anime.db`
- Downloads: `%APPDATA%/追番中心/download/`
- qBittorrent profile: `%APPDATA%/追番中心/qbit-profile/`
- Logs: `%APPDATA%/追番中心/logs/`
- Default app login: `admin` / `PUBLIC_HISTORY_REDACTED`
- Bundled qBittorrent Web UI: `127.0.0.1:8080`
- App icon assets: `desktop/assets/app-icon.ico` and `public/brand/app-logo.png`

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

## 下载通知与列表清理

- 顶部通知菜单会显示 `下载完成`、`下载失败`、`下载连接中断`，并保留 `下载中` / `等待下载` 这类被动状态。
- “删除所选”“清空列表”只移除本地下载队列记录。已完成记录被移除后，如果对应集数没有其他完成记录支撑，追番中心会同步取消该集的“已下载”缓存标记。
- 本地播放入口以完成状态的下载队列记录为依据；详情页、首页今日更新和漏看提醒仍保留“找资源”入口。

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

每次从网页版同步到桌面版后，至少运行：

```bash
npm run test
npm run build
npm run desktop:prepare
```

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
