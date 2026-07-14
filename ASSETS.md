# 资产与商标说明

追番中心的项目自有源码、文档和原创资产按根目录 [`LICENSE`](LICENSE) 中的 GPL-3.0-only 条款发布。第三方组件、数据、图片、视频、字体、商标和网站内容继续适用各自的许可与权利声明。

## 项目资产

- `public/brand/`、`desktop/assets/` 与浏览器图标包含追番中心的应用标识；macOS Local Web 安装包从 `public/brand/app-logo.png` 生成应用图标与菜单栏图标。
- `public/media/login-scene-*.mp4` 是登录页使用的抽象视觉背景，不包含人物或用户媒体。
- `docs/screenshots/` 是使用合成数据制作的产品截图，用于介绍和说明界面。
- `public/qbit-guide/` 是外部 qBittorrent 兼容模式的说明截图；qBittorrent 名称、界面与商标归对应权利人所有。
- 公开分发包不含 `vendor/ffmpeg/`。该目录只会出现在文件名带 `LOCAL-ONLY-DO-NOT-RELEASE` 的个人本地测试包中，保存精确锁定的 `ffmpeg-static` v5.3.0 当前平台二进制、binary-specific 许可与构建说明；它不属于 Bandi 原创资产，也不得公开再分发。

兼容播放产生的 HLS 分片写入应用数据目录下的 `cache/media-compat/<随机任务 ID>/`。目录名不包含本地路径、媒体名称或用户信息；任务受会话归属校验，响应禁止缓存，并在过期或服务退出时清理。这些运行时缓存不会进入源码仓库或分发包。

GPL-3.0-only 不授予任何项目名称或标识的商标权。合理引用项目名称、链接仓库和展示未造成官方背书误解的截图不受影响。

## 第三方内容

应用运行时可能从 Bangumi、长门番堂、AniList、TMDB、豆瓣、RSS、r18.dev、JAV321 等来源加载元数据、封面或外部链接。这些内容不随源码仓库分发，也不会因出现在运行界面中取得 GPL 授权。

产品截图可能展示第三方作品名称或经过抽象处理的界面占位内容，仅用于说明应用功能。再使用截图时，应同时遵守对应内容权利人的要求。

完整第三方边界、随包运行时许可和数据来源说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
