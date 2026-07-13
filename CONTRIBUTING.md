# 参与贡献

感谢你愿意让追番中心更好用。这个项目围绕一个很具体的体验展开：打开桌面应用后，几秒内知道今天看什么、看到第几集、下一集何时更新，并能安全地完成找源、下载和本地播放。

## 提交前先看

- Bug、交互问题和小范围改进可以直接创建 Issue。
- 大功能、数据库结构调整、下载行为变化和视觉改版，请先创建 Issue 说明目标、用户场景和验收方式。
- 安全问题遵循 [SECURITY.md](SECURITY.md)，不要把密钥、利用细节或真实用户数据放进公开 Issue。
- 搜索现有 Issue 和 Pull Request，避免重复劳动。

## 本地环境

推荐使用 Windows 10/11 x64、Node.js 24 和 npm。首次安装依赖：

```powershell
npm ci
```

启动浏览器开发模式：

```powershell
npm run dev
```

启动桌面开发链路：

```powershell
npm run desktop:start
```

桌面运行会写入 `%APPDATA%\anime-tracker`，并使用 Windows 用户目录与当前配置的下载目录。请使用测试目录，不要拿真实媒体库验证破坏性改动。运行 `npm run db:seed` 前确认 `DATABASE_URL` 指向可丢弃的开发数据库。

## 改动原则

- 优先解决清晰的用户问题，保持改动范围小且可验证。
- 保留桌面本地优先边界：服务监听回环地址，凭据随机生成，应用数据目录或用户所选下载目录不可用时明确报错。
- 文件扫描先预览、后确认；删除、迁移和数据库写入要有回滚路径。
- 不提交 `.env`、数据库、日志、Cookie、真实下载任务、magnet、tracker 或个人媒体库截图。
- 测试使用合成标题、示例域名、假哈希和临时目录。
- 不直接修改 `vendor/qbittorrent/qbittorrent.exe`。升级 Node.js 或 qBittorrent 时同步更新版本、来源、校验值、许可证和对应源码材料。
- 外部数据解析器要保留来源归属，遵守服务条款，并为上游格式变化提供可解释的降级状态。

## 验证

所有改动至少运行：

```powershell
npm run test
npx tsc --noEmit
```

修改 `src/`、Next.js 配置或依赖时再运行：

```powershell
npm run build
```

修改 Electron 主进程、桌面运行路径、随包资源或安装行为时还需运行：

```powershell
npm run desktop:dist
```

桌面验收请使用新生成的 `release/win-unpacked/追番中心.exe`，核对窗口、托盘、首次引导、下载服务和退出流程。不要提交 `release/`、`.next/` 或本地验证产物。

## Pull Request 清单

PR 描述请包含：

- 解决的用户问题和可观察结果。
- 影响的页面、API、数据或桌面链路。
- 已运行的测试与结果。
- UI 改动的截图或录屏，先遮盖个人数据和第三方下载活动。
- 已知限制、回滚方式和需要维护者决定的事项。

Commit message 使用简洁英文。一个 PR 尽量只解决一个主题，避免顺手重构无关代码。

## 许可与内容权利

提交代码即表示你有权贡献这些内容，并同意按仓库根目录 [LICENSE](LICENSE) 的条款发布。第三方代码、数据、图片、视频、字体和二进制必须保留原有许可与归属；详情见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。无法确认再分发权利的素材请勿提交。
