# 追番中心 — 项目规范

> Windows 本地优先追番桌面应用，核心解决"今天看什么、看到第几集、下集什么时候更新"。
> 视觉定位：个人媒体中心，二游官网气质，深色玻璃拟态。

## 桌面主产品说明

- 本仓库是追番中心唯一现行主仓库；产品迭代、桌面运行、打包与验收都在这里完成
- GitHub 仓库：`https://github.com/Luis-Herry/bandi`
- 当前分发版本为 `0.1.10`；发布与打包状态以 `docs/desktop/packaging.md` 为准
- 桌面版通过 Electron 打包，内置 `vendor/node/node.exe` 和 `vendor/qbittorrent/qbittorrent.exe`
- 桌面数据库、配置、受管 qBit profile、日志和服务缓存写入 `%APPDATA%\anime-tracker\`；播放器截图写入 Windows“图片”目录下的 `Bandi` 文件夹。视频下载目录由首次引导或设置中心选择，默认建议为 Windows“视频”目录下的 `Bandi\Downloads`，支持任意可写本地子目录或 UNC 网络共享
- 桌面版把内置 qBittorrent 作为零配置后台下载服务：主进程自动选择回环端口、生成凭据、做 API 健康检查并在异常退出后恢复；正常界面隐藏 Web UI 地址、端口和账号。`public/qbit-guide/` 只供外部 qBittorrent 兼容模式使用。
- 桌面版不显示账号密码登录框：Electron 用每次启动生成的一次性令牌静默建立本机会话，只允许当前 Next 端口的 `127.0.0.1` 与 `localhost` 请求携带令牌。首次启动或从旧版升级时进入 `/onboarding`，确认下载目录后才进入首页。
- 桌面打包和分发细节以 `docs/desktop/packaging.md` 为准

## 项目概况

- **项目类型**：Windows 本地优先桌面应用（Electron + Next.js）
- **当前阶段**：Windows 桌面主产品与 macOS Local Web 持续迭代；iPhone/iPad 作为配对 Safari 客户端复用共享页面（2026-07-15）
- **运行环境**：Windows Electron；Next standalone 与受管 qBittorrent 由主进程启动

## 技术栈

| 层 | 选择 |
|---|------|
| 框架 | Next.js 15 (App Router, TypeScript) |
| 样式 | Tailwind CSS 4 + Radix UI |
| 动效 | Motion (Framer Motion) |
| 3D | React Three Fiber + drei（仅首页和登录页） |
| ORM | Drizzle ORM + better-sqlite3 |
| 认证 | NextAuth.js v5 (Credentials Provider) |
| 定时任务 | node-cron |
| 外部 API | Bangumi API（主）+ AniList GraphQL API（辅） |
| 下载管理 | qBittorrent Web API |

## 项目结构

```
bandi/
├── AGENTS.md                 # 项目规则
├── desktop/                  # Electron 主进程和桌面启动逻辑
├── scripts/                  # 桌面 standalone 准备和本地启动辅助脚本
├── vendor/                   # 内置 Node 与 qBittorrent
├── update-anime.bat          # 改完代码后的一键更新脚本（build + 杀旧 + 起新）
├── instrumentation.ts        # Next.js 启动钩子，注册 node-cron jobs
├── docs/
│   ├── design/
│   │   ├── design-brief.md   # 完整设计简报
│   │   ├── visual-system.md  # 视觉系统规范
│   │   └── references/       # UI 视觉参考图
│   └── tech/
│       └── prd.md            # 产品需求文档
├── src/
│   ├── app/
│   │   ├── (auth)/           # 登录等公开路由组
│   │   ├── (main)/           # 鉴权后主路由组（首页/library/anime/admin）
│   │   ├── api/              # API routes
│   │   ├── globals.css       # 全局样式 + 滚动条锁定修复
│   │   └── layout.tsx
│   ├── auth.ts / auth.config.ts  # NextAuth v5 配置
│   ├── middleware.ts         # 路由鉴权
│   ├── components/
│   │   ├── ui/               # 基础组件（GlassPanel, StatusBadge, Button...）
│   │   └── features/         # 业务组件（AnimeCard, EpisodeGrid, EpisodeProgressControl, PlayButton...）
│   ├── lib/                  # bangumi / anilist / qbit / rss / cron / zh-convert / colors / cn / preferences / session ...
│   ├── db/                   # schema + queries + seed + index
│   └── styles/
├── public/                   # 静态资源
├── data/                     # 本地开发 SQLite 数据库文件；桌面运行不用这里
└── download/                 # 本地开发下载根目录；桌面运行不用这里
```

## 核心页面（Phase 1）

| 页面 | 路由 | 状态 |
|------|------|------|
| 首页 | `/` | ✓ 已用 |
| 我的追番 | `/library` | ✓ 已用 |
| 番剧库 | `/browse` | ✓ 已用 |
| 番剧详情 | `/anime/[id]` | ✓ 已用 |
| 统计 | `/stats` | ✓ 已用 |
| 本机会话入口 | `/login` | ✓ 桌面静默 gate |
| 个人资料 | `/profile` | ✓ 已用 |
| 设置 | `/settings` | ✓ 已用 |
| 下载管理 | `/admin/downloads` | ✓ 已用 |
| 首次启动 | `/onboarding` | ✓ 桌面首次安装/升级 |
| 动漫本地库 | `/library/local` | ✓ 已用 |
| 内置播放器 | `/player/[animeId]/[episode]` | ✓ 已用 |
| 角色资料 | `/character/[bgmId]` | ✓ 可访问 |
| 制作人员资料 | `/staff/[bgmId]` | ✓ 可访问 |
| 影视本地库 | `/cinema` | ✓ 已用 |
| 影视资料库 | `/cinema-library` | ✓ 已用 |
| 影视详情 | `/cinema/[id]` | ✓ 已用 |

## 数据库表（Drizzle + SQLite）

- `users` — 用户认证（id, username, passwordHash）
- `anime` — 动漫/影视共享元数据（Bangumi/AniList/TMDB/豆瓣/IMDb 标识、标题封面、播出与集数、评分、watchProviders、mediaType、isAdult）
- `userAnime` — 用户追番关系（watchStatus, currentEpisode, rating, notes）
- `episodes` — 集数信息（number, title, airedAt, **isDownloaded**）
- `playbackProgress` — 内置播放器秒级位置、时长、完成状态与最近播放时间
- `watchEvents` — 追番进度与观看行为历史
- `rssSources` — RSS 源（name, url, filters, isActive, lastCheckedAt）
- `downloadQueue` — 下载队列（animeId, **episodeId**, title, magnetUrl, status, progress, speed, errorMessage）
- `appSettings` — KV 配置表，当前存 `download_preferences`（之后任何全局/单用户偏好都走这里，不再单独建表）

## API 路由

- `/api/auth/*` — NextAuth 认证
- `/api/anime/search` — 搜索（本地 + Bangumi fallback）
- `/api/anime/[id]` — 番剧详情
- `/api/anime/[id]/credits` — 番剧制作人员与角色资料
- `/api/anime/[id]/episodes/[ep]/sources` — 单集即时找资源（并发拉 RSS，按绝对/季内集号 + 番名季别匹配）
- `/api/anime/[id]/rss-aliases` — 单番 RSS 搜索别名管理
- `/api/anime/sync` — 从 Bangumi/AniList 同步数据
- `/api/anime/refresh` — 手动复核单番、季度、本地库或下载关联；补齐 Bangumi/长门身份、剧集、RSS 别名与可信中文简介
- `/api/browse/season` — 番剧库按季度读取长门番堂数据，缓存与本地资料兜底
- `/api/browse/add` — 番剧库条目加入想看
- `/api/library` — 追番列表 CRUD
- `/api/library/local/scan` — 动漫本地目录只读预览与确认导入；桌面端通过原生目录选择 IPC 传入路径
- `/api/library/[id]` — 单部追番更新（含 currentEpisode）
- `/api/library/[id]/episode` — 标记集数状态
- `/api/library/bulk-delete` — 批量删除用户追番关系
- `/api/play` — 找已下载文件 → 系统默认应用打开
- `/api/player/stream` / `/api/player/progress` / `/api/player/subtitles` / `/api/player/screenshots` — 本地视频流、秒级进度、外挂字幕与截图
- `/api/cinema/scan` / `/api/cinema/enrich` — 影视目录扫描与资料补全
- `/api/img` — 带域名与载荷校验的同源封面代理
- `/api/notifications/read` — 通知已读状态
- `/api/preferences` — 下载偏好（字幕组 / 关键字 / 画质）
- `/api/rss` / `/api/rss/[id]` / `/api/rss/[id]/test` — RSS 源管理 + 单源测试
- `/api/downloads` / `/api/downloads/[id]` / `/api/downloads/bulk-delete` — 下载队列 CRUD 与批量移除本地列表
- `/api/downloads/open-location` — Windows/macOS 宿主机打开下载根目录或定位单条本地视频；配对设备无权调用
- `/api/downloads/qbit/status` — qBittorrent 连通性检测
- `/api/downloads/qbit/external-status` — 桌面端按需只读诊断系统外部 qBittorrent `127.0.0.1:18080`
- `/api/cron/check-updates` — 定时检查番剧更新
- `/api/cron/check-rss` — 定时检查 RSS + 推送 qBit

## 外部依赖

- 桌面版默认启动内置 qBittorrent；`desktop/main.cjs` 从 `18180` 起自动选择可用回环端口，验证带认证的 `/api/v2/app/version` 后才判定就绪，并把运行配置路径通过 `QBIT_CONFIG_PATH` 交给 Next 服务。
- 桌面模式 `ANIME_DESKTOP_APP=1` 下，qBit 客户端从 `QBIT_CONFIG_PATH` 动态读取当前端口和凭据，支持主进程恢复时换端口；读取失败时才回退到启动时注入的 `QBIT_URL`，不尝试网页版的外部 qBit 候选。
- 番剧库季度目录以国内可直连的长门番堂为主；Bangumi 继续提供详情、人物、制作、关联、评分与评论等专属信息，并使用本地缓存 + 增量同步
- AniList 数据中文化方案：用日文名去 Bangumi 交叉匹配

## 设计红线

- 禁止蓝紫色、蓝紫粉三色组合、蓝紫渐变和廉价渐变作为主题表达；蓝色可以作为主题色，但要避免偏紫、霓虹和低质感渐变
- 禁止廉价发光效果（高饱和度大范围 glow、霓虹描边）；精制微光可以
- 禁止大圆角堆叠（border-radius 最大 12px，卡片用 8px）
- 禁止过度渐变（渐变只用于遮罩和微妙背景氛围）
- 禁止信息过满，每个区域保持足够留白
- 禁止 Emoji 出现在界面中
- 强调色从当前番剧封面动态提取，UI 骨架本身接近无色

## 工程约定

- 默认简体中文界面，代码和变量名用英文
- commit message 用英文
- 组件遵循设计系统，保持视觉统一和可复用
- Phase 1 聚焦桌面端；Electron 窗口默认宽度 1280px，当前最小宽度 1180px
- 3D 元素性能预算：60fps，粒子数 < 200
- 低配设备降级：`prefers-reduced-motion` + GPU 检测 → CSS fallback
- 不预埋多语言、多租户、插件系统

## 命令

```bash
npm run dev      # 开发服务器（HMR，启用 Node 环境代理）
npm run test     # 运行静态/行为回归测试
npm run build    # 构建生产版本到 .next/
npm start        # 生产启动（必须先 build；端口 3000；启用 Node 环境代理）
npm run desktop:prepare # 复制 standalone 所需静态资源
npm run desktop:start   # 校验输入指纹与构建完整性，按需 build 后启动 Electron
npm run desktop:dist    # 构建 Windows 安装包和便携版
npm run db:push  # 推送 schema 到数据库
npm run db:seed  # 填充测试数据
```

开发脚本（Windows）：

- **桌面 `追番中心-开发模式.lnk`** — 由 `scripts/create-shortcut.ps1` 生成，只启动浏览器开发/调试链路；日常使用安装版或 portable
- **项目根 `update-anime.bat`** — 开发模式更新：build → 杀占 3000 端口的旧进程 → 弹新窗口起 `npm start`。build 失败时**不会**杀旧服务

何时必须重 build：改了 `src/`、`*.config.*`、`package.json` deps、`NEXT_PUBLIC_*` 环境变量、Drizzle schema。其他情况只重启 `npm start` 即可。

## 应用更新与发布

- `runtime/app-update.cjs` 是桌面更新状态机与平台判定的事实来源；Electron 主进程只通过预加载桥暴露状态与明确动作，React 页面不能直接导入 Electron API。
- Windows Setup 与 portable 都允许后台下载，下载完成后不强制退出。`src/components/features/DesktopUpdateNotice.tsx` 通过根布局挂载为所有页面右下角的全局入口：Setup 显示“重启并更新”，portable 显示“退出并运行新版”。
- portable 更新 helper 必须先复制到 `%APPDATA%\anime-tracker\runtime\updates\`，同时等待当前 Electron 与其 NSIS 自解压 wrapper 退出，再校验目标文件并启动。helper 留下的结果文件只记录固定状态码和时间，不得写路径、哈希或凭据。
- 当前 macOS 未签名构建只显示“下载新版”并打开公开 Release。只有 `BANDI_MAC_RELEASE=1` 完成 Developer ID 签名、公证，且另行显式设置 `BANDI_MAC_AUTO_UPDATE=1`，才允许显示“重启并更新”。
- Mac 本机浏览器与配对 Safari 通过 `/api/app-version` 检测构建版本变化，只提示刷新页面，不获得桌面安装权限。
- `.github/workflows/draft-release.yml` 只能手动触发，并要求已经存在且与 `package.json` 一致的 tag。它只创建全新的 Draft Release；同 tag 已有任何 Release 时失败，不覆盖附件，也不包含自动公开步骤。
- Draft 创建不得向 `gh release create` 传 `--target`；远端 annotated tag、tag commit 前后复核与 `--verify-tag` 负责锁定发布源码。Draft 状态统一用 `gh release view` 获取，再通过 `databaseId` 查询 Release API，避免 Draft 在 tag REST 入口不可见。
- `.github/workflows/windows-n1-update-acceptance.yml` 只允许手动触发并保持 `contents: read`。Setup 与 portable 必须在独立 runner 验收；公开基线固定 SHA-256，目标必须是公开 latest，所有 GitHub/Actions 令牌在启动任何分发包前从子进程环境清除。
- N-1 验收按 Setup 与 portable 分 lane 记结论；一个 lane 已通过后不得因另一 lane 失败而重跑或撤销。只改 `scripts/acceptance/` 或验收 workflow 时，继续复用同一组已公开附件，不提升 semver、不重打产品包。
- portable 更新动作由旧版本中的 helper 执行。版本 N 修复的 helper 从 `N → N+1` 才能完整证明；旧版到 N 允许记录一次手动启动桥接，并把自动更新验证留给下一次正常产品发布，禁止为补验收制造空版本。
- 同一诊断假设只运行一次完整长耗时验收。失败后先读取 runner artifact、阶段标记和脱敏日志；缺少新证据时停止连续发版与连续打包，把未闭环条件写入文档和待办。
- 发布顺序固定为：版本与文档 → 测试/类型/构建 → commit/push → annotated tag/push → Draft workflow → 附件与摘要人工验收 → 单独公开 → GitHub API 反查。证书、密码、Token、Cookie 和签名私钥禁止进入仓库、日志或 Release notes。

## 运行约定 & 常见陷阱

> 本节是踩过坑后沉淀的项目特定知识，新会话动相关代码前先看一眼。

**集号 / 进度语义**
- `userAnime.currentEpisode` 是 **绝对集号**，别当成"已看集数"。`N` = 当前/最后看的那集是 EP.N；`0` = 还没开始
- `EpisodeProgressControl` 的 `maxEpisode` 是该季**最大集号**（S2 从 13 起到 24 就传 24），别当成集数
- `EpisodeGrid` 视觉规则：`EP < currentEpisode` 已看，`EP === currentEpisode` 当前在看（描边 + dot），其余未看
- 首页已看计数和漏看计算把 `currentEpisode` 计入已看范围；`currentEpisode = 1` 时已看为 1，第一集漏看目标为 EP.02。播放器完成一集后保存实际完成的绝对集号，不预先写下一集。
- 自动“看完”只在进度到达该季 completion episode 时触发。completion episode 优先取 `episodes.number` 的最大绝对集号；没有 episode rows 时才回退到 `anime.totalEpisodes`。用户看完本周更新集不等于看完整季，除非那集就是本季最后一集。
- 影视条目没有 episode rows / completion episode 时，进度控件必须禁用，`PATCH /api/library/[id]` 对正数进度返回 422；动漫继续保留未知上限的既有行为。
- 用户显式改 `watchStatus` 优先级最高；`dropped` 不被进度自动改写；如果已是 `completed` 但手动把进度调回 completion episode 之前，状态应回到 `watching`。
- PlayButton 默认播 `currentEpisode > 0 ? currentEpisode : 1`，**绝不 +1**
- 首页继续动作统一走 `selectContinueEpisode`：先取未完成且已下载的播放断点，再取 `number > currentEpisode`、已放送且已下载的第一集；没有本地下一集时隐藏播放入口。已放送未下载由 Hero 提供“找资源”，尚未放送只显示下集时间。

**本地扫描 / 影视分类**
- 动漫本地扫描与影视扫描分开：预览阶段只读，确认后才写库；重复扫描幂等；同一路径已有影视归属时跳过，禁止一份文件同时进入两区。
- 豆瓣 `type: tv` 同时覆盖真人电视剧和电视动画。所有仍属影视的 TV 在目录入库前读取详情；详情缺失时跳过，禁止猜成 `drama`。动画分类集合负责预标记，详情 `genres` 含“动画”或“動畫”时原地保留主键并将 `mediaType` 改为 `anime`。同名标题仅在动漫类型且年份一致时复用。
- 回归样本固定为豆瓣 `37315819`《穹庐下的魔女》：应保留 12 话和豆瓣资料，影视查询不得再返回；按豆瓣 ID 跨类型查重，避免刷新后重新导入成 `drama`。

**StatusBadge 双语义**
- `WatchStatus.completed` 标签是 "看完"，`DownloadStatus.completed` 标签是 "下载完成"
- 调用方必须显式传 `kind="watch"` 或 `kind="download"`，不要共用 tones 映射

**RSS / 下载链路**
- ANi 等字幕组发布是繁体；匹配时用 `src/lib/zh-convert.ts` 的 `expandZhVariants` 展开原文 + 简 + 繁
- 单一 RSS feed 是全量源，**不需要"分两次抓 RSS"**，只在匹配层做简繁
- 单集找源要同时支持绝对集号和季内集号：例如 Re0 第四季本地 episode rows 是 67-77，ANi 标题里的 `- 08` 也应匹配 EP.74。
- 单集找源必须过滤多集包、前/后半合集、SP/OVA/OAD/NCOP/NCED 包和纯 `Vol.` BD 卷；不要让 EP.73 这类单集搜索抓回 `26-38+SP26-38`。
- 番名匹配优先季别 alias，短 alias（例如 `Re`）不能单独放宽匹配；番名带篇章后缀时可剥离到季标题参与匹配。
- 第一季或数字季找源还要拒绝未请求的 Final Season、OAD/OVA/SP/NCOP/NCED、真人版和剧场版；`SxxEyy` 必须参与季别识别。不要让基础 alias 绕过这组互斥。
- magnet hash 既可能是 40 字符 hex 也可能是 32 字符 base32（`src/lib/qbit.ts` `extractMagnetHash` 都支持）
- 入队时由 `runCheckRss` 调用 `extractEpisodeNumber(title)` 反查 `episodes.id` 填入 `downloadQueue.episodeId`
- qBit 完成时由 `GET /api/downloads` 在跨 `downloading → completed` 边界且 `episodeId != null` 时回写 `episodes.isDownloaded = true`，**只写一次**避免每次轮询重复 IO
- `EpisodeSourceDialog` 走 POST `/api/downloads`，`episodeId` 来自 sources 接口，**不做标题解析兜底**（单一事实来源）
- qBit Safe Mode 以 `src/lib/download-safety.ts` 为事实来源：`POST /api/downloads` 和 `runCheckRss` 推送 magnet 时必须带 `buildSafeTorrentOptions({ category: "anime" })`，默认上传限制为 `128 KiB/s`，并设置 `ratioLimit = 0` 与 `seedingTimeLimit = 0`。
- qBit 完成时由 `GET /api/downloads` 在跨 `downloading → completed` 边界且 `episodeId != null` 时回写 `episodes.isDownloaded = true`，同时调用 `pauseTorrent(hash)` 暂停对应 torrent。
- 下载列表单条删除、批量移除和清空列表都只删除本地 `downloadQueue` 记录，不删除 qBittorrent 任务或本地文件；若被删记录是某集最后一条 `completed` 队列背书，要同步清掉 `episodes.isDownloaded`。
- 页面播放入口和“本集已下载”判重以 `downloadQueue.status = "completed"` 且 `episodeId` 匹配为准；`episodes.isDownloaded` 是完成轮询时写入并由 `applyCompletedDownloadState` 修正的缓存标记。原有“找资源 / RSS 搜索本集”入口必须保留。
- 同一条目可能存在多个相同 `episodes.number` 行；播放器页面、视频流、字幕、外部播放和进度必须共同使用 `getPreferredPlaybackEpisode`，优先选最新完成下载绑定的集行。未追踪成人/本地内容允许写 `playbackProgress`，但不能因此创建 `userAnime` 或改变观看状态。
- 下载目录与单条文件定位统一走 `/api/downloads/open-location`，请求体只接受队列 ID，不接受客户端路径。Windows 使用 Explorer，macOS 使用 Finder；macOS 配对设备隐藏入口并由 `requireLocalHostRouteUser` 拒绝宿主文件操作。

**资料刷新 / 简介语言**
- `selectPreferredSynopsis` 负责中文优先：已有简体或繁体简介继续保留；当前简介为外文时，仅使用标题、年份、季别严格匹配的豆瓣中文简介；没有可靠中文来源时保留原文。当前没有机器翻译链路。
- 长门番堂的季度与详情模型提供档期、话数、制作、声优、平台、PV 和官网，当前不提供单部剧情简介；Atom `summaryHtml` 只属于情报 Feed，不可当作番剧简介。
- 番剧库“刷新资料”除了刷新 Bangumi/长门季度缓存，还必须对本季度本地 anime rows 调用 `refreshAnimeMetadata({ scope: "season" })`。豆瓣建议接口在突发并发下会漏结果，季度中文补全保持串行；单番、本地库和下载范围可继续使用有界并发。

**UI / 交互**
- Radix Dialog / Dropdown 锁滚靠 `globals.css` 里 `html { overflow-y: scroll; scrollbar-gutter: stable }` + body `data-scroll-locked` 清掉 react-remove-scroll 的 padding，缺一不可。右侧黑缝和横向抖动的根因是滚动条槽位消失与 body padding-right 补偿叠加；不要删这组规则，也不要只靠局部 margin/padding 修。
- 外观主题不能只切换背景、surface、border。真正的主题切换必须让 `--accent` / `--accent-rgb` / `--accent-muted` / `--accent-subtle` / `--accent-contrast` 同步变化，并覆盖按钮、选中态、卡片 orbit ring、hover halo、进度条等所有主题强调色引用。蓝色主题色允许；禁止蓝紫倾向、蓝紫粉组合/渐变和廉价渐变。
- 豆瓣 `img*.doubanio.com` 图片必须经 `AnimeCover` → `/api/img` → `cover-cache.ts`，服务端请求带 `Referer: https://movie.douban.com/`；缓存写入前校验允许的 `Content-Type`、JPEG/PNG/WebP/GIF/AVIF 文件签名和 12 MiB 上限，响应使用真实 MIME 与 `nosniff`。卡片、影视详情 Hero、全局搜索三个入口要一起验。Hero 给 `AnimeCover` 传背景定位时使用 `!absolute`，否则 `.t-skel { position: relative }` 会把文案推到裁切区外。
- `ThemeSync` 负责在客户端导航后保持 `data-theme`，`AccentProvider` 只能写局部番剧变量，不能再改 `documentElement` 的全局 accent。番剧详情页封面动态色走 `--anime-*` 局部变量，离开详情页后不得污染全局主题。
- 占用 `w-14` 状态消息位放在控件**前面**而非后面，避免视觉上控件没贴右
- 卡片 orbit ring 的 `.anime-card-glow` 宿主放在非链接元素上，当前基准是 `article`；整卡点击用内部绝对定位 overlay link。Chrome 在链接元素或链接子树的 pseudo-element 上会让 `conic-gradient(from var(--glow-angle))` 丢失运行时角度，表现为绕圈卡住。
- Tailwind CSS 4 的 `translate-*` / `scale-*` 会写入独立 transform 属性；hover 位移要让 `transition-property` 覆盖 `translate`，或直接使用 `transform: translateY(...)`。只写 `transition-[opacity,transform]` 会让位移动画硬切。
- 首页“本季新番”按星期分组，每组是横向轨道：首屏 6 张，超过 6 张通过左右箭头或触控板横滑浏览全部条目。
- 通知菜单包含下载列表状态：`下载完成`、`下载失败`、`下载连接中断` 会计入未读，`下载中` / `等待下载` 作为被动状态展示；同一部番同时满足漏看和今日更新时，漏看提醒优先。
- 桌面窗口栏使用小型 Bandi 标识；下方主导航不重复 `BrandLogo`，左侧固定放 `SpaceSwitcher`。≥1100px 时页面导航独立锚定 `--app-page-gutter`，与下方内容左边界对齐；窄屏保留空间切换并把页面导航收进“更多”，低于 360px 时空间切换只显示图标。网页登录页继续使用 `BrandLogo`；桌面模式由 `DesktopSessionGate` 静默建立本机会话，不显示用户名、密码、注册或退出登录入口。
- 桌面窗口使用 `frame: false` + `thickFrame: true` + `roundedCorners: true`，由 `DesktopTitlebar` 提供可拖拽的主题化窗口栏与最小化/最大化/关闭控件。窗口栏贴合窗口顶部并使用完整主题背景填充，避免页面内容透出；不加整圈描边、阴影或自身圆角。控件必须保持 `no-drag`，主导航按 `--desktop-titlebar-shell-height` 下移，Windows 11 负责外窗圆角与系统阴影。
- Windows 应用图标走 `desktop/assets/app-icon.ico`；顶部状态窗口/导航和登录页品牌图走 `public/brand/app-logo.png`。改图标后先结束 packaged app 进程并清理 Explorer 图标缓存，再跑 `npm run desktop:dist`。
- 登录页背景由 `DuskBackdrop` 的三段视频序列驱动：`login-scene-1.mp4` 静音叠化循环等待，中央魔法核是透明点击热区；点击后播放 `login-scene-2.mp4`，音频首尾淡入淡出；结束后登录卡片浮现并切到静音循环的 `login-scene-3.mp4`。运行时视频放在 `public/media/`，`背景视频/` 只作本地源素材，不默认纳入 Git 或桌面分发包。
- 登录卡浮现时 `RevealBurst` 同步播放一次性光波环 + 中央十字耀斑（2.4s 自动卸载，2026-06-11 从网页版同步）：纯 CSS 渐变 + motion，`mix-blend-mode: plus-lighter` 叠在视频上；颜色固定琥珀金与视频资产咬合，不随主题 accent 变；`prefers-reduced-motion` 下不播放。不要为这个效果引入 three.js——网页版程序化魔法阵方案实验后已放弃（记录见登录页视频序列 handoff）。

**Windows / PowerShell**
- App Router 路径包含括号目录，如 `src/app/(main)/anime`；在 PowerShell 命令里必须给这类路径加引号，例如 `"src/app/(main)/anime"`。不加引号时 PowerShell 会把 `(main)` 当表达式执行，而 `main` 会解析到 `C:\Windows\system32\main.cpl`，导致“鼠标属性”窗口弹出。
- `git diff`、`rg`、`Get-Content`、测试命令里只要出现 `(main)`、`(auth)` 或其他带括号路径，一律逐个 quote，不要裸写路径。
- 发送任何 `shell_command` 前先扫描 `command` 字符串：只要路径片段含 `(` 或 `)`，必须整体加引号；PowerShell 原生命令优先用 `-LiteralPath`。发现裸写的 `src/app/(main)` / `src/app/(auth)`，先重写命令再运行。

**Next.js 构建**
- **禁止** `npm run build` 和 `npm start` 同时跑——会让 `.next` 出现 "Could not find a production build" 残缺，需要重 build
- Windows 后台 `npm start` wrapper 退出（exit 127）但底层 next 子进程通常仍在监听，看端口为准
- Node 24 默认 `fetch` 不读取 `HTTP_PROXY` / `HTTPS_PROXY`；本项目的 `npm run dev` 和 `npm start` 必须保留 `node --use-env-proxy node_modules/next/dist/bin/next ...`。如果 `curl https://api.bgm.tv` 走 `127.0.0.1:10808` 能通，但应用里 Bangumi 超时，优先检查启动脚本是否丢了 `--use-env-proxy`。
- Electron 启动 Next 时会沿用已有代理；父进程没有代理且 `127.0.0.1:10808` 可连接时启用本机 fallback。两条路径都必须把 `127.0.0.1,localhost,::1` 合并进 `NO_PROXY`，避免本地 Next/qBit 流量进入代理。
- 静默会话请求头只允许当前随机 Next 端口的 `http://127.0.0.1:<port>` 与 `http://localhost:<port>`；重定向可能在两种主机名间切换。禁止放宽到任意 localhost 端口、HTTPS、相似域名，也不要记录令牌值。
- 2026-05-28 本机确认 Windows TCP excluded range 含 `8064-8163`，`8080` 在其中；桌面主进程现已自动避开被占用或被系统保留的端口，用户无需编辑 `qbitPort`。

**外部依赖**
- 桌面版设置中心和下载管理页显示“下载服务”，隐藏 Web UI 地址、端口和账号；外部 qBittorrent 兼容模式仍可使用 `QbitSetupGuideDialog` 与 `public/qbit-guide/` 截图。
- 桌面受管 qBit 从 `127.0.0.1:18180` 起动态选端口；系统外部 qBit 诊断固定检查 `127.0.0.1:18080`。两套 profile、端口和任务不得混用。
- 旧配置里的 `8080`、`18080` 或其他低于 `18180` 的受管端口会自动归零并重新分配；外部诊断只发两个无凭据 GET，拒绝重定向，不读取任务和设置。
- 番剧库季度目录只等待国内可直连的长门番堂；长门更新失败时显示缓存或本地 fallback，fallback 会从 `anime.year` 和 `tags` 里的 `2026年4月` 这类年月标签推断季度。Bangumi 继续用于详情、人物、制作、关联、评分与评论等专属信息，不阻塞季度目录。
- Bangumi 简介可能只有日文；手动资料刷新用豆瓣严格匹配做简体中文兜底。长门不提供剧情简介，不能把其 Atom 摘要写入 `anime.synopsis`。
- AniList 数据中文化方案：用日文名去 Bangumi 交叉匹配
- RSS 源建议：保留 `https://api.animes.garden/feed.xml`，避免 `dmhy.org/topics/rss/rss.xml`（上游 `<enclosure length="1">` 字段错填，size 显示成 1.0 B；两个源内容大量重叠）
