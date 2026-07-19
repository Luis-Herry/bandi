# macOS Local Web 社区真机验证清单

> 正式发布包完成 Developer ID 签名与 Apple 公证后，状态统一标记为：**已构建和公证，等待真机验收**。当前仓库已具备条件式签名、公证和双架构更新配置；实际状态仍取决于对应 Release 的签名、公证输出，不能只凭 Windows 共享检查标记完成。

当前 Draft workflow 的 `signed_macos` 默认关闭，更新入口只显示“下载新版”并打开 GitHub Release。取得 Apple 证书后，维护者显式开启该输入；workflow 会同时设置 `BANDI_MAC_RELEASE=1` 与 `BANDI_MAC_AUTO_UPDATE=1`，要求 Developer ID 签名、公证、Gatekeeper、stapling 和包内更新标记全部通过。Apple Secret 缺失或签名构建失败时整轮停止，不会降级成未签名公开包。

公开的 `v0.1.11` 使用 `signed_macos=false` 构建，x64 与 arm64 均未进行 Developer ID 签名或 Apple 公证，只验收“下载新版”与同架构 DMG 手动安装流程。

这份清单需要在两类 Mac 真机各跑一次：Intel x64 与 Apple Silicon ARM64。每台机器只构建并验收自己的架构；iPhone 和 iPad 的局域网步骤也应分别记录实际设备与系统版本。测试使用空白 Bandi 数据目录、公开测试视频和有权下载的测试资源；不要使用个人媒体库、成人观看记录、真实密码或私人 RSS。

## 1. 记录环境

在终端执行并保存输出：

```bash
sw_vers
uname -m
node --version
npm --version
git rev-parse HEAD
git status --short
```

预期：

- Intel 显示 `x86_64`，Apple Silicon 显示 `arm64`。
- macOS 版本不低于 13。
- 仓库没有未说明的本地改动。

## 2. 安装依赖并运行共享检查

```bash
npm ci
npm test
npx tsc --noEmit
npm run build
npm run desktop:prepare
git diff --check
```

预期：全部退出码为 0。`tests/local-server-macos.test.ts` 中的 POSIX 路径用例在 Mac 上必须实际执行，不能显示 skipped。

## 3. 构建当前架构

Intel Mac：

```bash
npm run local-server:dist:x64
```

Apple Silicon Mac：

```bash
npm run local-server:dist:arm64
```

预期产物：

- `release/macos-x64/Bandi-Local-Web-*-macOS-x64.dmg` 与 `.zip`
- `release/macos-arm64/Bandi-Local-Web-*-macOS-arm64.dmg` 与 `.zip`

记录两个文件的 SHA-256：

```bash
shasum -a 256 release/macos-*/Bandi-Local-Web-*
```

面向公开更新的构建还必须生成与架构对应的 channel 清单：

- Intel x64：`latest-x64-mac.yml`
- Apple Silicon arm64：`latest-arm64-mac.yml`

DMG 是当前用户手动安装入口，ZIP 与架构清单为未来签名更新链路保留。清单、ZIP 和 DMG 必须来自同一 commit、同一版本和同一轮构建；未来开启签名后还必须来自同一轮签名与公证。禁止下载后手工重命名附件，也不能把另一架构 job 生成的清单覆盖到当前架构。

构建失败并提示 SourceForge 返回了 HTML 时，用浏览器从 qBittorrent 官方下载页取得当前架构清单指定的 DMG，再执行：

```bash
BANDI_QBIT_DMG_PATH="$HOME/Downloads/qbittorrent.dmg" npm run local-server:dist:x64
```

ARM64 将命令末尾改成 `local-server:dist:arm64`。脚本仍会强制 SHA-256 一致，下载错版本会停止。

## 4. 检查包内架构与第三方材料

挂载 DMG，将 `Bandi Local Web.app` 复制到“应用程序”，然后执行：

```bash
file "/Applications/Bandi Local Web.app/Contents/Resources/vendor/node/bin/node"
ls -lh "/Applications/Bandi Local Web.app/Contents/Resources/vendor/qbittorrent/"
codesign -dv --verbose=4 "/Applications/Bandi Local Web.app" 2>&1 | head -n 20
```

预期：

- Intel Node 显示 `x86_64`，ARM64 Node 显示 `arm64`。
- qBittorrent 目录同时包含 `qbittorrent.dmg`、对应版本源码归档与 `NOTICE.txt`。
- 未配置 Apple 凭据的开发包可以显示 ad-hoc 或未 notarize 状态；正式发布包必须显示维护者 Developer ID、hardened runtime 与 notarization。

首次打开若被 Gatekeeper 拦截，只使用“系统设置 → 隐私与安全性 → 仍要打开”完成开发包验收。不要执行移除 quarantine 属性的命令。记录系统给出的完整提示。

## 5. 首次启动与本机边界

1. 打开 Bandi，确认菜单栏出现 Bandi 图标，默认浏览器自动打开。
2. 地址栏应短暂含 `#token=...`，页面载入后 fragment 必须消失；任何截图或日志都不要保留 token。
3. 页面只出现一次“正在打开 Bandi”，随后进入首次引导；不能出现用户名、密码、注册、云同步或第二套启动提示。
4. 选择一个空测试下载目录并完成引导。退出再启动，确认无需重新登录且目录保持。
5. qBittorrent 主窗口不能弹出；Dock 中不应常驻第二个 qBittorrent 应用窗口。
6. 菜单栏“退出 Bandi”后，Next 与受管 qBittorrent 进程都应结束。

检查监听地址：

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -E 'Bandi|node|qbittorrent'
```

局域网访问关闭时，Bandi Next 与 qBittorrent 都应只监听 `127.0.0.1`。记录端口即可，禁止公开配置文件里的凭据。

## 6. 下载与内置播放器

1. 用有权下载的公开测试 magnet 加入一条小任务。
2. 在 Bandi 下载管理中确认等待、下载速度、暂停、继续、完成状态正常。
3. 完成后 torrent 自动暂停；从下载管理和作品详情都能进入内置播放器。
4. 在 Mac 下载管理页点“打开下载目录”，确认 Finder 打开当前保存位置；对完成任务点“打开本地目录”，确认 Finder 定位对应文件。
5. 在番剧库、下载管理、本地库和动漫详情分别确认“刷新资料”入口可用，且更新、无变化、部分成功或需确认反馈与实际结果一致。
6. 用 H.264/AAC MP4 验证 Safari 播放、拖动 Range、刷新恢复进度、倍速、全屏、截图、`.vtt` / `.srt` 字幕。
7. 用 Safari 不支持的 MKV 或编码验证清晰的格式反馈与系统播放器入口；不能声称所有容器都能在 iOS Safari 播放。
8. 更改下载目录，再添加第二个测试任务；新任务进入新目录，旧文件保持原位。

截图应进入 `~/Pictures/Bandi`。SQLite、配置、缓存、日志和受管 qBittorrent 应进入 `~/Library/Application Support/Bandi/`。

## 7. 验证当前手动更新

当前公开的 `v0.1.11` macOS 产物没有 Developer ID 签名与公证，应用内只显示“下载新版”。验证已公开版本时只从公开 Release 下载；验证未来候选版本时先用 Draft 附件完成包体与手动安装检查，人工确认后公开，再复验公开 URL 和应用内提示。两种阶段都禁止使用构建机器上的 unpacked app 或临时复制文件。Release 公开前先确认附件包括 x64 与 arm64 各自的 DMG、ZIP、channel 清单和 `SHA256SUMS.txt`，且清单中的 URL、size、sha512 与 ZIP 一致。

1. 候选版本在 GitHub Draft Release 页面下载；当前 `v0.1.11` 在公开 Release 页面下载。按测试 Mac 架构选择对应 DMG，并用 `SHA256SUMS.txt` 核对文件；Intel 只取 x64，Apple Silicon 只取 arm64。
2. 在干净测试 Mac 上手动安装 DMG，记录未签名版本触发的 Gatekeeper 提示和实际放行步骤；当前阶段不能标记为“已签名”或“已公证”。
3. 完成首次引导，记录一个合成追番进度、公开测试下载和测试下载目录；关闭再启动一次，确认数据库、设置和受管 qBittorrent 状态保持。
4. 候选版本经人工确认后另行公开 Release。上一版本发现该公开版本时，全局提示应显示“下载新版”；点击后打开公开 Release，应用保持运行，不自动退出。直接复验 `v0.1.11` 时从这一步开始。
5. 从公开 Release 下载正确架构的 DMG，用户自行选择退出时机并手动安装。再次启动后确认版本已更新，原数据库、下载目录、追番进度、测试文件和设置保持，受管 qBittorrent 只恢复一份实例。
6. 已配对 iPhone/iPad 刷新 Mac 提供的 Local Web 页面即可获得新版界面。Safari 不下载 DMG/ZIP，也不显示桌面安装操作。
7. 未来原生 iOS App 的版本检查与更新只走 TestFlight / App Store，不复用 GitHub Desktop channel。

失败时记录目标版本、当前版本、架构、附件文件名、HTTP 状态和脱敏后的最短日志。禁止公开完整更新 URL 查询参数、token、Cookie、配置文件或数据库。

### 未来：取得 Apple 证书后验证自动更新

只有 Developer ID Application 签名、Hardened Runtime、公证和 stapling 全部通过，并在构建时同时显式设置 `BANDI_MAC_RELEASE=1` 与 `BANDI_MAC_AUTO_UPDATE=1`，才启用这一组验收：

1. 用已签名、公证的 N-1 版本确认 Intel 客户端读取 `latest-x64-mac.yml`，Apple Silicon 客户端读取 `latest-arm64-mac.yml`。
2. 触发更新检查，确认版本、下载进度和错误反馈准确；下载完成后只显示“重启并更新”，不强制退出。
3. 用户点击后确认 Bandi 依次停止 Next、受管 qBittorrent、控制服务和 parent lease，再退出并安装。
4. 重启后复验版本与本地数据，并在断网状态检查已 staple 的 Gatekeeper 结果。

## 8. iPhone / iPad 局域网配对

使用与 Mac 同一 Wi-Fi 的 iPhone 或 iPad：

1. 局域网访问关闭时，Mac 菜单栏不能提供 iPhone 地址，手机也不能访问本机服务。
2. 确认设置中明确提示只在可信家庭网络开启；测试期间不要连接酒店、公司访客或其他共享 Wi-Fi。
3. 在 Mac 设置中开启并保存“允许 iPhone / iPad 访问”。Bandi 会重启本地 Web 服务，并重新打开设置页。
4. 复制局域网地址到 Safari。手机应看到六位配对界面，不能看到账号密码表单。
5. 输入错误码，确认被拒绝；生成新码并输入正确值，确认进入首页。
6. 在手机播放同一 MP4，验证拖动、进度保存和字幕。下载任务与文件仍落在 Mac。
7. 打开手机下载管理页，确认没有“打开下载目录”和单条“打开本地目录”；直接请求宿主目录 API 应返回 `403 host_session_required`。
8. 在 Mac 移除这台设备，手机最迟 30 秒后失去受保护页面与 API 访问。
9. 再次配对，然后关闭局域网访问；全部设备会被清空，手机会话最迟 30 秒后失效，Next 恢复只监听 `127.0.0.1`。
10. 连续输入八次错误配对码，原配对码必须失效。

## 9. 隐私与日志复核

验收只查看测试数据目录：

```bash
stat -f '%Sp %N' "$HOME/Library/Application Support/Bandi/config.json"
grep -RniE 'token=|BANDI_CONTROL_TOKEN|qbitPassword|authSecret' "$HOME/Library/Application Support/Bandi/logs" || true
```

预期：配置文件只允许当前用户读取，日志中没有启动令牌、内部控制令牌、qBittorrent 密码或认证 secret。检查完成后在 Finder 中移除本轮测试生成的公开测试视频和 Bandi 测试数据；不要把该目录打包、提交或发送给维护者。

## 10. 提交 GitHub Issue

完成清单后，通过 [macOS / iOS 社区真机验证 Issue Form](https://github.com/Luis-Herry/bandi/issues/new?template=macos-community-verification.yml) 提交结果。Intel x64、Apple Silicon ARM64、iPhone 和 iPad 可以分别提交，失败项优先回传，便于维护者按设备与系统版本定位。

提交前必须再次检查公开内容，移除或替换以下信息：

- 本地绝对路径与 macOS 用户名。
- 真实媒体名称、文件名、观看记录和成人内容记录。
- magnet、tracker、私人 RSS 地址与下载任务名称。
- 配对码、启动令牌、Cookie、密码、API Key、qBittorrent 凭据和配置文件。
- 未经处理的数据库、日志、截图或 `~/Library/Application Support/Bandi/` 内容。

Issue Form 会收集芯片架构、macOS 版本、安装、Gatekeeper、下载、Safari 播放和局域网配对结果。需要附日志时只保留与失败直接相关的最短片段，并用 `<redacted>` 替换敏感值。

建议先在本地保存下面的纯文本记录，再复制到 Issue：

每台 Mac 回传一份文本：

```text
Architecture: x64 | arm64
macOS:
Commit:
Build: PASS | FAIL
Shared tests: PASS | FAIL
Gatekeeper: PASS | FAIL + exact prompt
Code signing: PASS | FAIL + Developer ID subject (no certificate export)
Notarization and staple: PASS | FAIL
Update from N-1: PASS | FAIL
Update channel: latest-x64 | latest-arm64
Silent local session: PASS | FAIL
Managed qBittorrent: PASS | FAIL + version
Download lifecycle: PASS | FAIL
Safari MP4/Range/subtitles/screenshots: PASS | FAIL
iPhone/iPad pairing/revocation: PASS | FAIL
Loopback/LAN listeners: PASS | FAIL
Artifact SHA-256:
Notes:
```

失败项附最短复现步骤和脱敏日志片段。不要回传 `config.json`、数据库、浏览器 Cookie、真实媒体标题、RSS 地址、magnet、token、密码或成人内容记录。
