# 第三方声明

本文件记录追番中心源码、随包运行时、外部数据来源和第三方依赖之间的权利边界。各第三方项目、数据、商标与素材继续归其权利人所有。本文件提供归属信息，不替代对应许可证或服务条款。

## 追番中心源码

本项目自行编写的源代码依仓库根目录 [LICENSE](LICENSE) 中的 GPL-3.0-only 条款发布。该许可不覆盖下列第三方二进制、依赖、元数据、图片、视频、商标或网站内容。

## qBittorrent

桌面分发包包含未经修改的 qBittorrent v5.2.3 Windows x64 运行时，并通过回环地址上的本地 API 作为独立后台进程管理。

- 项目：[qBittorrent](https://www.qbittorrent.org/)
- 版本源码：[release-5.2.3](https://github.com/qbittorrent/qBittorrent/tree/release-5.2.3)
- 二进制分发许可：GPLv3+
- 源码许可：GPLv2+，包含 `COPYING` 中说明的 OpenSSL linking exception
- 本地许可与作者信息：`vendor/qbittorrent/COPYING*`、`vendor/qbittorrent/AUTHORS`
- 匹配源码包：`vendor/qbittorrent/qbittorrent-5.2.3.tar.xz`
- 来源与 SHA-256：`vendor/qbittorrent/NOTICE.txt`

再分发安装包或 portable 时，必须保留上述许可、作者信息、NOTICE 和匹配源码包。追番中心的根许可证不会改变 qBittorrent 的许可条件。

## Node.js

桌面分发包包含 Node.js v24.14.1 Windows x64 运行时，用于启动随包 Next.js standalone 服务。

- 项目：[Node.js](https://nodejs.org/)
- 版本许可：[Node.js v24.14.1 LICENSE](https://github.com/nodejs/node/blob/v24.14.1/LICENSE)
- 主要许可：MIT，并包含 Node.js 上游列出的第三方组件声明
- 本地来源说明：`vendor/node/NOTICE.txt`
- 本地完整许可：`vendor/node/LICENSE`

再分发时必须让 `vendor/node/NOTICE.txt`、`vendor/node/LICENSE` 与 Node.js 运行时一同提供，并保留其中的第三方版权与许可文本。

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
