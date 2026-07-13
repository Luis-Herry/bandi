# Desktop Packaging

This is the canonical Windows Electron product repository as of 2026-07-12. The old Web repository is frozen as a read-only historical source and does not provide live runtime data.

## Repository And Release

- Repository: https://github.com/Luis-Herry/anime-tracker-desktop
- Visibility: public
- Latest GitHub release: https://github.com/Luis-Herry/anime-tracker-desktop/releases/tag/v0.1.3
- Current build: `0.1.3`
- Installer asset: `Bandi-Setup-0.1.3-x64.exe`
- Portable asset: `Bandi-0.1.3-x64-portable.exe`

`electron-builder` 在本地 `release/` 目录生成带中文产品名的文件；发布到 GitHub Release 时使用上面的 ASCII 附件名，避免托管平台净化文件名后与校验清单不一致。

## Runtime Layout

- App database: `%APPDATA%\anime-tracker\data\anime.db`
- Desktop config: `%APPDATA%\anime-tracker\config.json`
- qBittorrent profile: `%APPDATA%\anime-tracker\qbit-profile\`
- Logs: `%APPDATA%\anime-tracker\logs\`
- Downloads: user-selected writable local directory or UNC share; initial suggestion is `<Windows Videos>\Bandi\Downloads`
- Cover cache: `%APPDATA%\anime-tracker\cache\covers`
- YUC metadata cache: `%APPDATA%\anime-tracker\cache\yuc`
- Electron session data: `%APPDATA%\anime-tracker\cache\electron`
- Player screenshots: `<Windows Pictures>\Bandi`

Runtime paths are resolved through Electron's Windows known-folder APIs. The selected download directory is validated as a writable drive-qualified or UNC child directory before use.

The YUC cache stores normalized 长门番堂 facts and HTTP validators only. It keeps the last valid snapshot for temporary upstream failures and never persists raw page HTML.

## Desktop Session

- 桌面版不显示登录表单，也不注册用户名/密码登录 provider。Electron 每次启动生成一次性令牌，只对当前随机 Next 端口的 `http://127.0.0.1:<port>` 与 `http://localhost:<port>` 注入认证请求头，NextAuth 据此为本机用户建立 JWT 会话。相同端口的主机名重定向允许继续携带请求头，其他端口、协议和相似域名全部拒绝；令牌值不得写入日志或持久化到配置。
- 冻结 Web 仓库保留旧认证实现供历史追溯；桌面账户菜单保留个人中心和设置中心，隐藏退出登录。
- `users` 表与用户 ID 继续保留，保证追番、评分、播放进度和历史事件关联稳定。
- 新安装的内部本机密码随机生成且无法用于桌面登录；旧配置里遗留的 `appPassword` 字段不会再注入 Next 服务，桌面模式也不会注册密码登录 provider。

本机用户只在桌面数据库没有任何用户时创建。

## First Run

- `onboardingVersion < 1` 时，主进程打开 `/onboarding`；完成后才进入首页。
- 新安装默认建议 Windows“视频”目录下的 `Bandi\Downloads`；已有有效下载目录保持原值，引导页和设置中心允许选择任意可写本地子目录或 UNC 网络共享。
- 引导页自动检查目录写入、剩余空间、内置 qBit 和默认 RSS；端口、账号和网络恢复无需用户设置。
- 下载目录可通过 Electron 原生文件夹选择器确认，保存时同步更新 qBittorrent `save_path`。已有 torrent 和文件保持原位置，修改只影响新下载。
- 影视本地库扫描复用独立的原生媒体目录 IPC；取消选择不会修改路径或导入数据。
- 动漫本地库使用独立的原生目录选择 IPC，先只读预览识别结果，用户确认后再写库；取消选择和预览阶段都不改数据库。
- 画质、字幕和关闭窗口行为可在引导页快速调整；下载目录和托盘行为也能在设置中心修改。

## Window Chrome

- Windows 原生标题栏和应用菜单已隐藏；`desktop/main.cjs` 使用无框窗口，同时保留 `thickFrame`、Windows 11 外窗圆角、系统阴影、窗口动画与边缘缩放。
- `src/components/features/DesktopTitlebar.tsx` 负责应用内拖拽区、当前页面标题和最小化/最大化/关闭控件；preload 只暴露对应的窄范围 IPC。
- 顶部栏贴合窗口上边缘并使用完整的主题背景填充，避免页面内容从栏后透出；栏本身不加整圈描边、阴影或圆角。主导航、首次引导和静默会话页共用 `--desktop-titlebar-shell-height` 保持垂直对齐；Windows 11 继续绘制外窗圆角与系统阴影。
- 主导航不重复品牌 Logo，左侧直接显示动漫/影视空间切换。≥1100px 时完整页面导航独立锚定 `--app-page-gutter`，与下方内容左边界对齐；更窄时页面导航进入“更多”菜单，空间切换保持可见，低于 360px 收成图标模式。
- 启动 Next 服务期间的内联启动页也带同一组窗口控件，避免启动阶段出现无法移动或关闭的无框窗口。

## Commands

```bash
npm run desktop:pack
npm run desktop:dist
npm run desktop:start
npm run desktop:check-build
```

`desktop:dist` builds Next standalone output, copies `public/` and `.next/static/` into the standalone server folder, then creates an NSIS installer exe and a portable Windows exe in `release/`.

`desktop:start` 面向本地开发快捷方式。它对 `src/`、根配置、依赖清单和 `.env*` 计算内容 SHA-256，校验 standalone server、两份一致的 `BUILD_ID`、server 运行树和关键 manifest；输入变化、文件删除或产物残缺时才执行 Next build。build 前后输入指纹不一致会停止启动，避免把编译期间的新改动错误标成已构建。`desktop:prepare` 对 `public/` 和 `.next/static/` 做镜像同步，已删除资源不会残留到 standalone。

The portable exe self-extracts on launch, so its first launch can be noticeably slower than the installed build. The installer is the recommended daily-use artifact.

## App Icon Assets

Windows app icons and the in-app brand mark use the same source image family:

- `public/brand/app-logo.png` is the rounded full-composition image used by `BrandLogo`, login, top navigation, and web metadata.
- `desktop/assets/app-icon.ico` is the multi-size Windows icon used by `BrowserWindow`, `win.icon`, `nsis.installerIcon`, `nsis.uninstallerIcon`, and `nsis.installerHeaderIcon`.
- `desktop/assets/app-icon.png`, `public/favicon.ico`, `public/favicon.png`, and `public/favicon.svg` mirror the same logo family for packaged resources, browser metadata, and legacy shortcut scripts.

Before rebuilding after icon changes, close any running packaged desktop app process and clear the current user's Explorer icon cache. `output/` remains ignored and must not be used as a release input.

## qBittorrent

The bundled qBittorrent copy is launched as a managed background download service with an isolated profile. The Electron main process selects an available loopback port from `18180`, generates local credentials, verifies the authenticated Web API, and persists the active connection in the desktop config.

The Next server receives `QBIT_CONFIG_PATH` and reads the current managed port and credentials on demand. This lets Electron recover qBittorrent on another port without restarting Next.js. The desktop download manager and settings center expose service health, transfer speed, and disk space while keeping Web UI infrastructure details out of the normal flow.

The system-installed external qBittorrent compatibility diagnostic uses `http://127.0.0.1:18080`. It is a separate profile and task set. Managed desktop mode must not probe, adopt, or mutate that external instance.

设置中心只在用户点击“立即诊断”后请求两个版本端点；请求固定回环、无 Cookie/Authorization/请求体、2.5 秒超时并拒绝重定向。受管端口只接受 `18180..65535`，旧 `8080/18080` 配置会重新分配，防止误接管系统 qBit。

`desktop/main.cjs` starts Next with `--use-env-proxy`. If the parent process has no proxy and `127.0.0.1:10808` is available, it supplies that local proxy for external metadata and cover requests. Existing or fallback proxy environments always merge `127.0.0.1,localhost,::1` into `NO_PROXY`, keeping the managed qBit and Next loopback traffic local.

默认关闭主窗口后下载继续在系统托盘运行；用户关闭该选项后，关闭窗口会完整退出并停止内置服务。托盘“退出”会先关闭 qBittorrent Web API，再停止本地 Next 服务。qBittorrent 异常退出后使用有界指数退避自动恢复。

`QbitSetupGuideDialog` and `public/qbit-guide/` remain packaged for external qBittorrent compatibility mode. Managed desktop mode hides that guide automatically.

qBit transfer and disk metrics come from `sync/maindata`; numeric zero is rendered as `0 B/s` instead of an unavailable placeholder.

Safe download behavior is enabled at the application layer:

- `buildSafeTorrentOptions({ category: "anime" })` applies a `128 KiB/s` upload cap and qBit sharing limits.
- Downloads that newly cross into `completed` are paused through qBit after the local episode flag is updated.
- Local list deletion and bulk deletion never delete qBittorrent tasks or downloaded files.

## Bundled Node Runtime

The app includes `vendor/node/node.exe` so the Next standalone server runs on the same normal Node.js ABI as local verification. This avoids rebuilding `better-sqlite3` for Electron.

## Canonical Maintenance Verification

When an implementation is recovered from an older snapshot, inspect and port the smallest functional unit into this repository. Do not bulk-copy `src/` or overwrite Desktop-only files.

Preserve these Desktop-owned files and contracts:

- `desktop/main.cjs`
- `desktop/proxy-env.cjs`
- `package.json`
- `next.config.ts`
- `scripts/prepare-standalone.mjs`
- `vendor/node/`
- `vendor/qbittorrent/`
- `public/qbit-guide/`
- `src/components/features/QbitSetupGuideDialog.tsx`

After any shared-code recovery or Desktop change, run:

```bash
npm run test
npx tsc --noEmit
git diff --check
npm run build
npm run desktop:prepare
```

`tests/desktop-boundary.test.ts` protects the standalone packaging config, bundled runtime resources, managed qBit health/recovery/tray lifecycle, external-mode guide fallback, desktop silent session, first-run onboarding, configurable download directory, and tray preference.
It also protects Windows app icon configuration and the icon asset paths above.

## Cover Networking

DMM and Douban covers use the same-origin `/api/img` route and `src/lib/cover-cache.ts`. Douban requests add `Referer: https://movie.douban.com/`; direct browser images with `no-referrer` receive 418. Before a response enters the persistent cache, the server validates the allowlisted `Content-Type`, JPEG/PNG/WebP/GIF/AVIF signature, and 12 MiB size ceiling. `/api/img` returns the verified MIME with `X-Content-Type-Options: nosniff`. Release verification must cover the cinema grid, cinema detail Hero, and global search thumbnails because they are separate rendering paths.

## Local Playback Identity

Completed `downloadQueue` rows are the playback identity. When duplicate `episodes.number` rows exist, every playback entry point uses `getPreferredPlaybackEpisode` and selects the episode row bound to the newest completed download. Untracked adult/local content may save `playbackProgress`, while `userAnime` creation and watch-status changes remain opt-in.

## Douban Catalog Classification

Douban `type: tv` includes live-action television and TV animation. Every TV hit that still belongs to cinema must load its Douban detail before import; missing or empty genres stay out of the cinema catalog for that refresh. Animation collection feeds are hints, and a failed movie-animation feed falls back to per-title detail. Existing rows are matched by exact Douban ID across media types; title fallback is limited to anime rows with the same year. Reclassification preserves the primary key and existing dependencies, and it never inserts 1..N placeholders into an anime row that already has absolute episode numbers.

## Real-window Release Verification

For changes to Electron lifecycle, image networking, source matching, or UI layout, run `npm run desktop:dist` and verify `release/win-unpacked/追番中心.exe` with real pointer/keyboard input. The minimum route order is cinema cards → cinema detail Hero → global search thumbnails → qBit status → maximize/restore → tray hide/reopen → full exit → log and database checks.

Release verification must use synthetic data and a disposable database. Publish the test, type-check, build, package and checksum results in the GitHub Release notes without including local paths, media titles, database counts or download activity.
