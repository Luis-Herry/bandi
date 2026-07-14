# 第三方声明

本文件记录追番中心源码、随包运行时、外部数据来源和第三方依赖之间的权利边界。各第三方项目、数据、商标与素材继续归其权利人所有。本文件提供归属信息，不替代对应许可证或服务条款。

## 追番中心源码

本项目自行编写的源代码依仓库根目录 [LICENSE](LICENSE) 中的 GPL-3.0-only 条款发布。该许可不覆盖下列第三方二进制、依赖、元数据、图片、视频、商标或网站内容。

## qBittorrent

Windows 分发包包含未经修改的 qBittorrent v5.2.3 Windows x64 运行时。macOS Local Web 分发包按芯片携带官方 DMG：Apple Silicon ARM64 使用 v5.2.3，Intel x64 使用 v5.0.5。Bandi 通过回环地址上的本地 API 和独立 profile 管理这些进程。

- 项目：[qBittorrent](https://www.qbittorrent.org/)
- 版本源码：[release-5.2.3](https://github.com/qbittorrent/qBittorrent/tree/release-5.2.3)
- Intel 版本源码：[release-5.0.5](https://github.com/qbittorrent/qBittorrent/tree/release-5.0.5)
- 二进制分发许可：GPLv3+
- 源码许可：GPLv2+，包含 `COPYING` 中说明的 OpenSSL linking exception
- Windows 本地许可与作者信息：`vendor/qbittorrent/COPYING*`、`vendor/qbittorrent/AUTHORS`
- Windows 匹配源码包：`vendor/qbittorrent/qbittorrent-5.2.3.tar.xz`
- macOS 匹配源码包与来源校验：打包后位于 `Contents/Resources/vendor/qbittorrent/`，版本与当前架构一致
- 来源与 SHA-256：Windows 见 `vendor/qbittorrent/NOTICE.txt`；macOS 见 `local-server/macos-assets.json` 和随包 `NOTICE.txt`

再分发安装包或 portable 时，必须保留上述许可、作者信息、NOTICE 和匹配源码包。追番中心的根许可证不会改变 qBittorrent 的许可条件。

## Node.js

Windows 与 macOS 分发包包含 Node.js v24.14.1 运行时，用于启动随包 Next.js standalone 服务。macOS 按 Intel x64 与 Apple Silicon ARM64 分别使用官方对应架构归档。

- 项目：[Node.js](https://nodejs.org/)
- 版本许可：[Node.js v24.14.1 LICENSE](https://github.com/nodejs/node/blob/v24.14.1/LICENSE)
- 主要许可：MIT，并包含 Node.js 上游列出的第三方组件声明
- 本地来源说明：`vendor/node/NOTICE.txt`
- 本地完整许可：`vendor/node/LICENSE`

再分发时必须让 `vendor/node/NOTICE.txt`、`vendor/node/LICENSE` 与 Node.js 运行时一同提供，并保留其中的第三方版权与许可文本。

## FFmpeg 与 ffmpeg-static

公开的 Windows Desktop 与 macOS Local Web 分发包不包含 FFmpeg 或 `ffmpeg-static`。Bandi 默认继续使用原文件 Range 播放；浏览器无法解码时，宿主机可以使用 PATH 中已安装的 FFmpeg（Windows 也检查 WinGet Links，macOS 也检查 Homebrew 常用路径），或由宿主机管理员同时设置 `BANDI_FFMPEG_PATH` 与 `BANDI_FFMPEG_SHA256`。Bandi 会校验文件可执行性、SHA-256 稳定性、FFmpeg 6–8 版本范围以及 `libx264` / AAC 编码能力，失败时只停用兼容播放，不影响原文件播放。

源码开发依赖精确锁定的 `ffmpeg-static` v5.3.0（binary release `b6.1.1`）只用于自动化测试和标有 `LOCAL-ONLY-DO-NOT-RELEASE` 的个人本地构建。这类构建把可兼容的 H.264 / HEVC 视频优先重新封装为 fMP4 HLS，其余视频按需转换为 H.264 / AAC；浏览器和配对设备不会获得可执行文件路径或命令执行接口。

- npm 包与安装脚本：[eugeneware/ffmpeg-static v5.3.0](https://github.com/eugeneware/ffmpeg-static/tree/v5.3.0)
- 二进制 release：[b6.1.1](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1)
- FFmpeg 项目与源码：[ffmpeg.org](https://ffmpeg.org/) / [FFmpeg 6.1.1](https://github.com/FFmpeg/FFmpeg/tree/n6.1.1)
- npm 包许可：GPL-3.0-or-later
- 二进制许可：取决于对应平台构建的 FFmpeg 配置；本项目要求具备 `libx264` 与 AAC 编码器，因此按 GPL 条件处理再分发
- FFmpeg 官方合规建议：[License and Legal Considerations](https://ffmpeg.org/legal.html)
- GPLv3 网络分发条款：[GNU GPLv3 第 6 节](https://www.gnu.org/licenses/gpl-3.0.html#section6)
- 本地专用包内说明：`vendor/ffmpeg/LICENSE.binary.txt`、`vendor/ffmpeg/README.binary.txt`、`vendor/ffmpeg/LICENSE.ffmpeg-static.txt`、`vendor/ffmpeg/README.ffmpeg-static.md`

`ffmpeg-static` 的安装脚本会从 GitHub Release 下载平台二进制，但不会自行验证摘要。Bandi 在构建和首次使用兼容播放时校验固定 SHA-256，并再次检查 FFmpeg 版本输出、`libx264` 与 AAC 编码能力；校验失败时拒绝启动兼容播放。当前固定摘要为：

| 平台 | SHA-256 |
| --- | --- |
| Windows x64 | `04E1307997530F9CF2FE35CBA2CA7E8875CA91DA02F89D6C7243DF819C94AD00` |
| macOS Intel x64 | `EBDDDC936F61E14049A2D4B549A412B8A40DEEFF6540E58A9F2A2DA9E6B18894` |
| macOS Apple Silicon ARM64 | `A90E3DB6A3FD35F6074B013F948B1AA45B31C6375489D39E572BEA3F18336584` |

`npm run media:source-offer` 会在被 Git 忽略的 `release/ffmpeg-source-offer/` 生成 `ffmpeg-static` 5.3.0 下载/打包脚本源码、FFmpeg 6.1.1 源码、固定摘要、平台二进制说明与来源清单。该目录明确标记为 `candidate_only`：`ffmpeg-static` 自身不包含各平台 FFmpeg 二进制的完整编译脚本；现有静态二进制还链接 `libx264`、`libx265` 等外部库，候选包尚未包含每个实际链接组件的精确源码、补丁及控制编译/安装脚本，不能称为完整 Corresponding Source。

因此 `desktop:dist` 与 `local-server:dist:*` 永久走不含 FFmpeg 的公开边界。`desktop:dist:local-ffmpeg` 与 `local-server:dist:*:local-ffmpeg` 生成的目录、文件名和包内警告都带 `LOCAL-ONLY-DO-NOT-RELEASE`，只允许个人本机测试，禁止上传 GitHub Release、Issue、网盘或镜像。只有完整 Corresponding Source 与匹配二进制在同一下载位置通过独立核验后，才能另行设计可公开捆绑的发行命令。

## Electron 与 Chromium

桌面壳使用 Electron，Electron 又包含 Chromium 及其第三方组件。`electron-builder` 生成的分发目录应保留：

- `LICENSE.electron.txt`
- `LICENSES.chromium.html`

这些文件适用于对应的 Electron、Chromium 和上游组件，不会改变追番中心源码的许可。

## npm 依赖

项目依赖 Next.js、React、Radix UI、Motion、React Three Fiber、Drizzle ORM、better-sqlite3、OpenCC、Cheerio 等 npm 软件包。直接依赖及锁定版本见 `package.json` 和 `package-lock.json`；每个软件包继续适用其自身的 MIT、Apache-2.0、ISC、BSD、MPL、LGPL 或其他声明许可。

源码发布应保留 `package-lock.json`。`npm run desktop:prepare` 会扫描实际进入 Next.js standalone 的包并生成 `THIRD_PARTY_LICENSES.txt`；二进制分发必须携带该文件。生成器遇到缺少许可文本且无法安全补全的包时会停止打包，避免只复制运行文件却漏掉许可声明。

## 外部数据与信息来源

追番中心会按功能访问下列公开网站或 API。仓库许可证不授予这些服务的数据、图片、商标或页面内容的再许可权。

| 来源 | 在应用中的用途 | 归属与使用边界 |
| --- | --- | --- |
| [长门番堂](https://yuc.wiki/) | 季度番剧、动画电影、播出时间、话数、播放入口、制作信息、PV、官网与 Atom/RSS 更新 | 站点标注 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)；页面、Feed 与链接中的第三方素材仍归对应权利人所有；追番中心与其没有隶属或背书关系 |
| [Bangumi](https://bangumi.tv/) / [API](https://bangumi.github.io/api/) | 动画条目、人物、制作人员、评分、封面与季度目录 | 数据、图片和商标遵循 Bangumi 及内容权利人的条款 |
| [AniList](https://anilist.co/) / [API](https://docs.anilist.co/) | 动画元数据补充与交叉匹配 | 数据、图片和商标遵循 AniList 的 API 条款 |
| [TMDB](https://www.themoviedb.org/) / [API](https://developer.themoviedb.org/) | 电影、电视剧、人物、海报和播放服务信息 | 使用者需遵守 TMDB API 条款与品牌规范；商业用途需要相应授权 |
| [豆瓣电影](https://movie.douban.com/) | 中文影视元数据、分类、评分与封面补充 | 页面数据、图片和商标归豆瓣及相关权利人所有；访问仍受其服务条款约束 |
| [Anime Garden](https://animes.garden/) | 用户可配置的 RSS 搜源入口 | Feed、发布标题和外部下载链接归各自提供者及权利人所有 |
| [r18.dev](https://r18.dev/) / [JAV321](https://www.jav321.com/) | 用户本地成人影视条目的资料补充 | 页面数据、图片和商标归对应网站及内容权利人所有；应用不随源码分发其内容 |
| Mikan、Nyaa、动漫花园等外部 RSS | 开发样例或用户自行配置的 RSS 来源 | Feed、种子、magnet 和发布标题归各自提供者及权利人所有；用户需自行确认访问与下载权限 |

计划商业使用或再分发时，请先确认长门番堂 `CC BY-NC-SA 4.0` 的非商业与相同方式共享条件；无法满足时应关闭该数据源或取得单独授权。根目录的源码许可不会放宽这项数据许可。

TMDB 要求在使用其 API 时展示以下声明：

> This product uses the TMDB API but is not endorsed or certified by TMDB.

应用只保存实现本地功能所需的元数据和链接，不会因缓存、代理或截图而取得第三方内容的所有权。用户和再分发者需要自行确认其使用方式符合所在地法律、服务条款及内容许可。

## 商标与无背书声明

qBittorrent、Node.js、Electron、Chromium、长门番堂、Bangumi、AniList、TMDB、豆瓣及其他名称和标志属于各自权利人。提及这些名称只用于说明兼容性和数据来源，不表示任何官方合作、认证或背书。
