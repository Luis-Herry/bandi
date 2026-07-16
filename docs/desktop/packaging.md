# Desktop Packaging

This is the canonical Bandi repository for the Windows Electron product and macOS Local Web distribution. The old Web repository is frozen as a read-only historical source and does not provide live runtime data.

## Repository And Release

- Repository: https://github.com/Luis-Herry/bandi
- Visibility: public
- Latest GitHub release: https://github.com/Luis-Herry/bandi/releases/tag/v0.1.10
- Latest release title: `Bandi v0.1.10`
- Latest release source commit: `239104da559037810ff2c964719f782e9ed71aa1`
- Release candidate version: none
- Local installer: `release/Bandi-Setup-0.1.10-x64.exe`
- Local portable build: `release/Bandi-0.1.10-x64-portable.exe`
- Latest release installer asset: `Bandi-Setup-0.1.10-x64.exe`
- Latest release portable asset: `Bandi-0.1.10-x64-portable.exe`

`electron-builder` 在本地 `release/` 目录直接生成最终 ASCII 附件名，避免托管平台净化文件名后与校验清单不一致。

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
npm run local-server:dist:x64
npm run local-server:dist:arm64
```

`desktop:dist` builds Next standalone output, copies `public/` and `.next/static/` into the standalone server folder, then creates an NSIS installer exe and a portable Windows exe in `release/`.

公开的 Windows Desktop 与 macOS Local Web 分发包不捆绑 FFmpeg 或 `ffmpeg-static`。兼容播放需要时，Bandi 会发现宿主系统已经安装的 FFmpeg：Windows 检查 PATH 与 WinGet Links，macOS 检查 PATH 与 Homebrew 常用路径；管理员也可以同时提供经过 SHA-256 固定的显式路径。系统组件缺失或校验失败时只停用兼容播放，原文件 Range 播放与外部播放器入口继续可用。

`desktop:start` 面向本地开发快捷方式。它对 `src/`、根配置、依赖清单和 `.env*` 计算内容 SHA-256，校验 standalone server、两份一致的 `BUILD_ID`、server 运行树和关键 manifest；输入变化、文件删除或产物残缺时才执行 Next build。build 前后输入指纹不一致会停止启动，避免把编译期间的新改动错误标成已构建。`desktop:prepare` 对 `public/` 和 `.next/static/` 做镜像同步，已删除资源不会残留到 standalone。

The portable exe self-extracts on launch, so its first launch can be noticeably slower than the installed build. The installer is the recommended daily-use artifact.

## macOS Local Web Packaging

- `local-server:dist:x64` 必须在 Intel Mac 上执行；`local-server:dist:arm64` 必须在 Apple Silicon Mac 上执行。脚本会拒绝宿主架构与目标架构不一致的构建，避免把错误架构的 `better-sqlite3` 放进安装包。
- 两个构建都生成 DMG 与 ZIP，最低系统版本为 macOS 13。输出分别进入 `release/macos-x64/` 与 `release/macos-arm64/`。
- 构建脚本下载并校验 Node.js v24.14.1、当前架构的官方 qBittorrent DMG 和对应源码归档。所有 SHA-256 固定在 `local-server/macos-assets.json`；`vendor/macos/` 是本机构建缓存，已从 Git 排除。
- Intel 包使用 qBittorrent v5.0.5，ARM64 包使用 v5.2.3。运行时把官方 `.app` 从随包 DMG 复制到当前用户的 Bandi 数据目录，不要求管理员权限，不修改 Gatekeeper quarantine 标记，也不改用户已有 qBittorrent。
- Bandi 默认把 Next 绑定到 `127.0.0.1`。用户在设置中开启局域网访问后，启动器重启 Next 并绑定 `0.0.0.0`；iPhone/iPad 仍需六位配对码，连续八次失败会让当前配对码失效。
- Windows Electron、macOS Local Web 和 iPhone/iPad Safari 共用 `src/` 页面与资料刷新逻辑。打开 Explorer/Finder、选择目录和外部播放器属于宿主机操作；配对设备不显示这些入口，服务端仍通过 `requireLocalHostRouteUser` 拒绝调用。
- 本机浏览器通过 URL fragment 中的单次令牌建立会话。fragment 不会进入 HTTP 请求或服务日志，客户端提交后立即从地址栏清除。qBittorrent 凭据和内部控制令牌只存在于启动器配置或子进程环境中。
- Apple 签名凭据不写入仓库。当前未签名、未公证的社区验证包可以在 Draft 人工核验后公开，但 Release notes 与 README 必须如实标明手动安装和待真机验收。启用 macOS 应用内自动安装或声明可信正式分发前，必须用维护者的 Developer ID Application 完成签名、notarization 与 stapling 复查。
- 当前 macOS Draft 默认不启用 `BANDI_MAC_RELEASE` 或 `BANDI_MAC_AUTO_UPDATE`，所有页面只显示“下载新版”并走手动安装。取得 Apple Developer ID 与公证凭据后，维护者通过 `signed_macos=true` 同时开启强制签名、公证和“重启并更新”；任何凭据或原生校验缺失都会停止整轮构建。

社区真机验证步骤见 `docs/desktop/macos-community-verification.md`。macOS Intel x64、Apple Silicon ARM64 与 iOS/iPadOS Safari 仍待社区真机验证。Windows 能完成的共享验证包括 `npm test`、TypeScript、Next build、资产哈希、配置生成、鉴权边界和包结构静态检查；Mach-O 架构、Gatekeeper、原生目录选择、qBittorrent 启动和 Safari 播放必须分别在两种 Mac 真机确认，iOS/iPadOS Safari 也要单独回传局域网配对与播放结果。

## Hot Update Release Contract

公开的 `0.1.6` 建立了更新基线。`0.1.7` 首次端到端验收发现两项真实缺口：portable 自解压运行时的 `app.isPackaged=false` 让更新模式落入 development，Setup 使用交互式 NSIS 安装。`0.1.8` 把 Electron Builder 的 portable 环境标记放到模式判断首位，并将 Setup 更新改为静默安装；后续公开版本从 `0.1.8` 建立新的自动更新验收基线。

`0.1.8 → 0.1.9` 的 Setup 真实更新链路已经通过。portable 验收确认旧内层 Electron 退出后，外层 NSIS wrapper 仍在清理自解压目录，位于该目录内的 helper 会与清理过程竞争，导致新版没有启动。`0.1.10` 将 helper 复制到稳定的应用数据目录，等待内层进程与外层 wrapper 都退出后再复核 size/SHA-256 并启动新版。由于更新动作由旧版本执行，`0.1.9 → 0.1.10` 的 portable 用户若没有自动看到新版窗口，需要手动运行已经下载的 `0.1.10` 文件一次；完整自动更新证明需要从 `0.1.10` 基线升级到更高版本。

GitHub Release 是 Windows Desktop 与 macOS Local Web 的唯一公开二进制来源。每个版本必须先建立 draft Release，等 Windows、macOS Intel、macOS Apple Silicon 和元数据校验全部通过后再一次性公开。draft 中的半成品不能被客户端当作可用更新。

### Distribution Surfaces

| 入口 | 安装与更新语义 | Release 附件 |
|------|----------------|--------------|
| Windows NSIS 安装版 | 后台下载 `latest.yml` 指向的安装包；完成后所有页面右下角显示“重启并更新”，只有用户主动点击或自行正常退出才进入安装流程 | NSIS `.exe`、同名 `.exe.blockmap`、`latest.yml` |
| Windows portable | 后台下载同架构新版 portable 并核对 size 与 SHA-256；完成后所有页面右下角显示“退出并运行新版”，不覆盖运行中的 exe，也不运行 NSIS installer | `-portable.exe`、`SHA256SUMS.txt` |
| macOS Intel x64 | 当前由全局提示显示“下载新版”，用户从 Release 获取 DMG 后手动安装；ZIP 与架构清单作为未来签名更新链路的预备产物 | x64 `.dmg`、x64 `.zip`、`latest-x64-mac.yml` |
| macOS Apple Silicon arm64 | 当前由全局提示显示“下载新版”，用户从 Release 获取 DMG 后手动安装；ZIP 与架构清单作为未来签名更新链路的预备产物 | arm64 `.dmg`、arm64 `.zip`、`latest-arm64-mac.yml` |
| macOS 本机浏览器与 iPhone/iPad Safari | 页面由 Mac 上的 Local Web 主机提供；主机更新并重启服务后显示“新版本已就绪，立即刷新”，Safari 刷新即可获得新页面，不向 Safari 下发桌面安装包 | 不新增浏览器二进制附件 |
| 未来原生 iOS App | 仅通过 App Store / TestFlight 分发和更新；不读取 GitHub Desktop 更新清单 | 不属于当前 Release |

macOS 两个原生架构不能共用一份由独立 job 生成的 `latest-mac.yml`。两个 job 都写同名文件会让后上传者覆盖前者，导致另一架构下载错误 ZIP。当前约定使用 `latest-x64` 与 `latest-arm64` 两个 channel，客户端按 `process.arch` 选择对应 channel；若将来改为 universal app，必须先解决 bundled Node、`better-sqlite3` 和 qBittorrent 的双架构资源，再单独评审合并 channel。

### Artifact Identity

- 更新清单、安装包、ZIP 和 blockmap 必须来自同一 commit、同一 `package.json` version 和同一轮构建。
- 发布附件名必须由 `electron-builder` 直接生成最终 ASCII 名称。禁止打包后手工重命名、复制成另一个名称，或让清单 URL 与实际附件名分离。
- Windows `latest.yml` 只能指向 NSIS installer；portable 不能进入自动安装路径。
- macOS channel 清单只能指向同架构 ZIP；DMG 保留为用户可见的手动安装入口。
- macOS 设置架构 channel 后必须显式保持 `allowDowngrade = false`；任何更新路径都只接受高于当前版本的 semver，禁止用旧清单回退应用与数据库运行时。
- Draft 组装 job 上传附件前必须逐项确认清单中的 URL、size 和 sha512 与附件一致，并生成面向用户复核的 `SHA256SUMS.txt`；人工公开前再复核一次草稿状态与附件摘要。
- 已公开的同版本附件和 channel 清单不可覆盖。撤回有问题的版本时发布更高 semver 修复版，避免已下载旧版的客户端停留在损坏版本。

### Signing And Notarization Gate

Draft workflow 的 `signed_macos` 输入默认关闭：Windows Setup 与 portable 保留应用内下载链路，公开 Release 如实标记未知发布者风险；macOS x64 与 arm64 继续显示“下载新版”并由用户手动安装。显式开启 `signed_macos` 时，两个原生架构都必须取得 Developer ID、完成公证与 stapling，并在包内启用对应架构的自动更新 channel；任一 Apple Secret 缺失或原生校验失败都会终止整轮 Draft，禁止回退生成未签名包。

Windows 证书签发后仍需另开变更，把准确 Common Name 配置为 electron-builder `win.publisherName`。macOS 的条件式 CI 路径已经接入；只有真实 Developer ID 签名、Hardened Runtime、公证、Gatekeeper 与 stapling 全部通过，两种 Mac 架构才能标记为 **已构建和公证，等待真机验收**。

当前 workflow 不读取 Windows 签名 Secret。只有显式开启 `signed_macos` 时才读取 `MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD`、`APPLE_API_KEY_BASE64`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER` 与 `APPLE_TEAM_ID`；值只存在于 GitHub Secrets 和单次 runner 临时目录。最终组装 Draft Release 的 job 使用 GitHub Actions 自动提供的 `GITHUB_TOKEN`，并映射为 `GH_TOKEN`；其余 job 统一保持 `contents: read`。证书、密码和 `.p8` 私钥不得进入仓库、日志、Release notes 或文档示例。

`preflight`、Windows、macOS x64、macOS arm64 全部成功后，最终 job 才获得 `contents: write`：它会校验 update manifest 的 URL、size 与 sha512，生成 `SHA256SUMS.txt`，创建全新的 Draft Release，并在上传后再次确认 `draft=true` 及远端附件 name、size、SHA-256 与本地产物完全一致。同 tag 已存在任何 Release 时直接失败，既有草稿和已公开附件都不会被修改。workflow 没有 push/tag 自动触发，也没有公开 Release 的步骤。

`v0.1.6` 的三个平台构建与最终附件校验已在 GitHub Actions 运行 `29484451345` 通过；Draft 创建步骤因仓库 Actions token 返回 HTTP 403 而停止。维护者随后用本机 GitHub 身份下载同一轮已验证产物，重新运行仓库附件校验器，创建 Draft，上传全部 13 个附件，并在公开前后分别通过 GitHub API 复核 name、size 与 SHA-256。该恢复流程没有重建、重命名或覆盖附件。

403 的根因是 `gh release create --target <older-commit>`：tag 对应提交到 workflow HEAD 之间改过 Actions 文件，GitHub 因而要求内置 `GITHUB_TOKEN` 不提供的 Workflows write 权限。`0.1.7` 已删除多余的 `--target`；现有 `--verify-tag`、远端 tag commit 前后复核继续锁定发布源码。Draft 查询也改为 `gh release view` 和 release ID，确保不可见 Draft 同样能触发“已存在即停止”和远端附件复核。

`v0.1.7` 的 Draft workflow 运行 `29491609424` 完成 Windows、macOS x64、macOS arm64 构建，并自动创建、上传和反查 13 个 Draft 附件。人工复核附件名称、大小、SHA-256、更新清单和 Release notes 后单独公开；公开 API 再次确认 `draft=false`、`prerelease=false`、13 个附件与 public latest 指向。

GitHub 公共标准 runner 固定为 `windows-2025`、Intel `macos-15-intel` 与 Apple Silicon `macos-15`；两个 Mac job 都在对应原生架构构建，避免交叉构建原生模块。

### Release Acceptance

每次更新发布至少验证：

1. tag `vX.Y.Z` 与 `package.json` version 完全一致。
2. `npm test`、`npx tsc --noEmit`、`npm run build`、`npm run desktop:prepare` 和 `git diff --check` 全部通过。
3. Windows 安装版从 N-1 检查、下载、停止后台服务、静默安装、重启到 N；portable 下载并校验同架构新版，退出旧进程后启动新文件，原文件保持可回退。当前未签名附件安装时如实记录系统警告。
4. macOS x64 与 arm64 分别验证 DMG、ZIP 和各自 channel 清单；未提供 Apple 凭据时只验收“下载新版”手动流程。首个签名版本只能建立新基线，其后的签名版本才能完成真实 macOS N-1 自动更新验收。
5. bundled Node 与 `better-sqlite3` 架构正确；`signed_macos=true` 时另外强制通过 `codesign --verify --deep --strict`、`spctl --assess` 和 `xcrun stapler validate`。
6. 更新前后的数据库、下载目录、追番进度、配对设备撤销状态和受管 qBittorrent 配置保持一致。
7. Mac 更新并重启 Local Web 后，本机 Safari 与已配对 iPhone/iPad 刷新可恢复页面；宿主文件操作继续只对本机会话开放。
8. Release notes 只记录版本、commit、测试、签名、公证、架构和校验和，不包含本地路径、媒体名、数据库内容、RSS、magnet、token 或凭据。

### N-1 Acceptance Stop Contract

更新验收必须有可达的退出条件，避免 runner 超时被误解为“继续生成下一个版本”。

- Setup 与 portable 是两条独立证据链。某条链已经通过后保留结论；另一条链失败只修对应链路，不重跑已通过平台，也不重建无关 macOS 产物。
- 先区分产品载荷变更与验收工具变更。`runtime/`、`desktop/` 或打包配置进入客户端时需要更高 semver 和新产物；只修改 `scripts/acceptance/` 或 workflow 时，复用同一组不可变的公开附件重新验收。
- portable 的退出、替换和启动由旧版本 helper 执行。版本 N 中的 helper 修复只能在 `N → N+1` 生效；`N-1 → N` 仍可能需要手动运行已下载文件一次。此时终态是“修复已发布、一次性桥接已说明、下一正常版本待验”，不得创建无产品改动的版本追赶验证。
- 每个失败假设只跑一次完整长耗时任务。失败后先检查阶段标记、runner artifact、进程树、known folder 和结果文件；没有新诊断就停止重跑。当前实测量级为本地 `desktop:dist` 约 14 分钟、Intel macOS 构建约 12 分钟、portable N-1 runner 约 20 分钟，任何串行重跑都要先说明它能新增哪条证据。
- 验收脚本必须给下载、退出、安装、重启和健康检查各自设置超时，并在失败时保留脱敏诊断。总 job 超时只负责兜底，不能代替阶段级退出条件。
- 发现真实产品缺口后，允许以“已通过 lane + 已定位失败 lane + 已发布修复 + 明确的未来触发条件”结束本轮。下一轮从已记录的公开基线继续，不回放整段发布历史。

### v0.1.10 Release Record

- Published: `2026-07-16`
- Release: https://github.com/Luis-Herry/bandi/releases/tag/v0.1.10
- Source commit: `239104da559037810ff2c964719f782e9ed71aa1`
- Draft workflow: `29518757017`；Windows、macOS x64 与 macOS arm64 原生构建、13 个附件上传及远端摘要反查通过
- Tests: `471` total，`470` passed，`1` platform-expected skip；TypeScript、Next production build、standalone preparation 与本地 Windows `desktop:dist` 通过
- Windows: Setup SHA-256 `3a40b42b1ce707a1c66949b9d7049bfb4f2e06255079c39f4ca3b4d4608e8325`；portable SHA-256 `a6d71165b818db77992764ccff5ccec1332d223f581276b17fdf57f21d2a5a65`；两包均未签名
- N-1 acceptance: Setup `0.1.8 → 0.1.9` 在运行 `29515559280` 完整通过；portable 验收定位到 NSIS wrapper 清理竞态，修复已随 `0.1.10` 发布。`0.1.9 → 0.1.10` 可能需要手动运行已下载文件一次，完整自动更新将在下一正常版本以 `0.1.10` 为基线验收
- Security review: Release notes、附件和打包目录未包含凭据、个人路径、用户数据库、下载内容、个人媒体或成人用户数据；GitHub secret scanning 保持 `0` 个 open alerts
- macOS: x64/arm64 均未签名、未公证，当前显示“下载新版”并手动安装；已构建，等待真机验收

### v0.1.8 Release Record

- Published: `2026-07-16`
- Release: https://github.com/Luis-Herry/bandi/releases/tag/v0.1.8
- Source commit: `9d2f2a8c881f9d3d5d65ae940b82cbd8f62fb773`
- Draft workflow: `29505453375`；Windows、macOS x64 与 macOS arm64 原生构建、13 个附件上传及远端摘要反查通过
- Tests: `471` total，`470` passed，`1` platform-expected skip；TypeScript、Next production build、standalone preparation 与本地 Windows `desktop:dist` 通过
- Windows: Setup SHA-256 `3725a4a033b00f7a346a477cc9504272dddfa7d8108a51585d496f7c6d3dc55c`；portable SHA-256 `c66b295f78ab0bcdc9ec0f4f905dcc4ab7653d7a920f422962d69865b35bca1e`；两包均未签名
- Portable smoke: 直接运行外层 portable，未手工注入 Electron Builder 环境变量；应用桥报告 `mode=portable`、`currentVersion=0.1.8`
- Security review: Release notes 敏感模式 0 命中；附件名唯一；打包目录未包含用户数据库、运行时配置、下载内容、个人媒体或成人用户数据
- macOS: x64/arm64 均未签名、未公证，当前显示“下载新版”并手动安装；已构建，等待真机验收

### v0.1.7 Release Record

- Published: `2026-07-16`
- Release: https://github.com/Luis-Herry/bandi/releases/tag/v0.1.7
- Source commit: `b79395c4ccaa26b7cabd077234d008847125b291`
- Draft workflow: `29491609424`；Windows、macOS x64 与 macOS arm64 原生构建、13 个附件上传及远端摘要反查通过
- Tests: `471` total，`470` passed，`1` platform-expected skip；TypeScript、Next production build 与 standalone preparation 通过
- Windows N-1 finding: Setup 能检查、下载并触发安装，但调用了交互式 NSIS；portable 真包被误判为 development。两项均在 `0.1.8` 修复，`0.1.7` 不作为自动更新基线
- Security review: GitHub secret scanning 0 alerts；Release notes、13 个附件名与 Actions 日志未发现凭据、个人路径、数据库、媒体库或成人用户数据
- macOS: x64/arm64 均未签名、未公证，当前显示“下载新版”并手动安装；已构建，等待真机验收

### v0.1.6 Release Record

- Published: `2026-07-16`
- Release: https://github.com/Luis-Herry/bandi/releases/tag/v0.1.6
- Source commit: `375c3087ffb6075bf1c41000969fbe4e8f1305dd`
- Public assets: `13`，包含 Windows Setup、portable、两套 macOS DMG/ZIP、更新清单、blockmap 与 `SHA256SUMS.txt`
- Tests: `467` total，`466` passed，`1` platform-expected skip；TypeScript、Next production build、Windows packaging 与 packaged-app smoke 通过
- Windows: unsigned；Setup 显示全局“重启并更新”，portable 显示全局“退出并运行新版”，下载完成不强制退出
- macOS: x64/arm64 均未签名、未公证，当前显示“下载新版”并手动安装；已构建，等待真机验收

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

## Metadata Refresh And Synopsis Language

`/api/anime/refresh` owns the manual reconciliation entry points used by browse, downloads, the local anime library, and anime detail. It can merge duplicate local rows, reconnect downloads, refresh Bangumi episodes and YUC identity, expand RSS aliases, and prefer a reliable Chinese synopsis. A Chinese synopsis comes from existing local data or a Douban subject whose title, original title, year, and explicit season agree with the anime row; otherwise the existing Bangumi text stays visible. YUC provides schedule and production facts but no per-show story synopsis.

The browse quarter action refreshes Bangumi and YUC caches first, then runs metadata refresh for local anime rows in the selected quarter. Douban synopsis fallback stays sequential in this bulk path because burst requests to the suggestion endpoint can silently omit valid titles. Single-anime, local-library, and download scopes keep bounded concurrency.

## Douban Catalog Classification

Douban `type: tv` includes live-action television and TV animation. Every TV hit that still belongs to cinema must load its Douban detail before import; missing or empty genres stay out of the cinema catalog for that refresh. Animation collection feeds are hints, and a failed movie-animation feed falls back to per-title detail. Existing rows are matched by exact Douban ID across media types; title fallback is limited to anime rows with the same year. Reclassification preserves the primary key and existing dependencies, and it never inserts 1..N placeholders into an anime row that already has absolute episode numbers.

## Real-window Release Verification

For changes to Electron lifecycle, image networking, source matching, or UI layout, run `npm run desktop:dist` and verify `release/win-unpacked/追番中心.exe` with real pointer/keyboard input. The minimum route order is cinema cards → cinema detail Hero → global search thumbnails → qBit status → maximize/restore → tray hide/reopen → full exit → log and database checks.

Release verification must use synthetic data and a disposable database. Publish the test, type-check, build, package and checksum results in the GitHub Release notes without including local paths, media titles, database counts or download activity.
