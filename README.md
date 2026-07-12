# 追番中心桌面版

追番中心的 Windows 桌面主仓库。自 2026-07-12 起，产品迭代、数据运行、打包和验收都以本仓库为准；`<legacy-repository>` 冻结为历史来源，只在追溯旧实现时只读参考。应用随包携带 Node 运行时和 qBittorrent 下载器，安装后可直接使用。

## Repository

- GitHub: https://github.com/Luis-Herry/anime-tracker-desktop
- Visibility: private
- Main branch: `main`
- Published release: https://github.com/Luis-Herry/anime-tracker-desktop/releases/tag/v0.1.0
- Latest local build: `0.1.3`（尚未发布，产物在 `release/`）

## 主要能力

- 我的追番、番剧库、番剧详情、影视本地库、影视库、统计和设置中心。
- RSS 搜源、下载队列、qBittorrent 状态检测、内置 Web 播放器、外部播放器兜底和顶部下载通知。
- 影视本地库支持扫描导入、TMDB/豆瓣/DMM 资料补全、电视剧追更、电影题材筛选和 R级题材 tab。
- 动漫本地库提供独立目录扫描：桌面原生选目录、只读预览、确认导入；重复扫描保持幂等，已归影视的同路径文件会跳过。
- 豆瓣公开目录会复核动画分类：`type: tv` 只代表电视媒介，命中动画集合或详情 `genres` 含“动画”的条目会归入动漫类型，避免混入真人电视剧。
- 桌面版内置独立 qBittorrent profile，自动选回环端口、生成本机凭据、健康检查和异常恢复；正常使用无需配置 Web UI。
- 桌面版通过一次性令牌静默建立本机会话；首次安装或旧版升级只需确认下载目录、资源偏好和托盘行为。
- 运行数据按用途分盘：视频下载到 `K:\BandiData\downloads`，封面缓存、Electron 会话缓存和播放器截图写入 H 盘；数据库、配置、日志和受管 qBit profile 留在 `%APPDATA%\anime-tracker`。
- 影视扫描和下载目录设置使用 Windows 原生目录选择器；qBit 服务状态、速度和磁盘空间直接在应用内查看。
- 下载安全模式默认限制上传为 `128 KiB/s`，下载完成后暂停对应 torrent，减少后台做种对同机网络的影响。
- 下载列表支持单条移除、批量移除和清空列表；这些操作只清理追番中心本地列表，不删除 qBittorrent 任务或本地文件。
- 内置 Web 播放器支持本地视频 Range 拖动、秒级进度恢复、外挂字幕、截图保存，并保留外部播放器入口。
- R级与其他未追踪本地内容可以直接播放并保存秒级进度；重复集号优先使用最新完成下载绑定的文件，不会自动加入追踪列表。
- Web 端 `transitions-dev` 动效基线已同步：卡片 tilt、Radix 开合、tabs、skeleton、通知/数字反馈、错误反馈和折叠区保持一致。

## 下载使用

在仓库的 [Releases](https://github.com/Luis-Herry/anime-tracker-desktop/releases) 页面下载已发布的桌面版分发包。当前公开 Release 仍为 `v0.1.0`；本地 `0.1.3` 产物尚未上传，包含：

- `Windows installer`（`追番中心-Setup-0.1.3-x64.exe`）：安装版，适合日常使用。
- `Windows portable`（`追番中心-0.1.3-x64-portable.exe`）：便携版，适合免安装试用。
- `Desktop readme`（`README-桌面版.txt`）：桌面版使用说明。

首次启动时，桌面应用会自动启动本地 Next 服务和内置 qBittorrent。引导页确认下载目录后进入首页；连接异常时，下载管理页和设置中心会给出服务状态及下一步。

## 桌面运行路径

- App database: `%APPDATA%\anime-tracker\data\anime.db`
- Desktop config: `%APPDATA%\anime-tracker\config.json`
- qBittorrent profile: `%APPDATA%\anime-tracker\qbit-profile\`
- Logs: `%APPDATA%\anime-tracker\logs\`
- Downloads: `K:\BandiData\downloads`
- Cover cache: `H:\BandiData\cache\covers`
- Electron session data: `H:\BandiData\cache\electron`
- Player screenshots: `H:\BandiData\screenshots`
- Bundled qBittorrent Web UI: 运行时从 `18180` 起自动选择可用回环端口，普通界面不暴露地址和凭据
- External qBittorrent diagnostic: `http://127.0.0.1:18080`，只用于兼容模式诊断，不参与桌面受管 qBit 的自动连接
- App icon assets: `desktop/assets/app-icon.ico` and `public/brand/app-logo.png`

## 下载服务

- 内置 qBittorrent 由 Electron 主进程管理，启动成功需通过带认证的 API 健康检查。
- 下载引擎异常退出后会有限重试恢复；窗口关闭到托盘时继续下载，选择完整退出时同步停止服务。
- 设置中心与下载管理页显示服务健康、下载/上传速度和磁盘空间，空闲速度显示 `0 B/s`。
- `QbitSetupGuideDialog` 与 `public/qbit-guide/` 只服务外部 qBittorrent 兼容模式。
- 本机代理存在时，桌面 Next 子进程会保留代理并强制让 `127.0.0.1`、`localhost`、`::1` 走本地直连。

桌面主进程会自动避开已占用或被 Windows 保留的端口，正常使用无需编辑 `qbitPort`。

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
npm run desktop:start # 校验内容指纹与构建完整性，按需 build 后启动 Electron
npm run desktop:check-build # 只查看当前是否需要重建
npm run desktop:dist  # 生成 Windows 安装包和便携版
```

`release/`、`.next/`、`node_modules/`、`data/`、`download/` 和运行验证目录不会提交到 Git。

共享历史实现需要回灌到桌面版时，按功能逐项审查后至少运行：

```bash
npm run test
npm run build
npm run desktop:prepare
```

禁止从冻结 Web 仓库做整仓覆盖式同步。涉及桌面主进程、封面网络或真实用户链路时，还要运行 `npm run desktop:dist` 并在 `release/win-unpacked/追番中心.exe` 中完成真实窗口验收。2026-07-11 的 0.1.3 收口证据见 [`docs/handoff/desktop-real-user-qa-closeout-2026-07-11.md`](docs/handoff/desktop-real-user-qa-closeout-2026-07-11.md)。

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
