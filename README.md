# 追番中心 Desktop

追番中心的 Windows 桌面版分发仓库。它把 Next.js 应用打包进 Electron，并随包携带 Node 运行时和 qBittorrent 副本，面向朋友分发使用。

## Repository

- GitHub: https://github.com/Luis-Herry/anime-tracker-desktop
- Visibility: private
- Main branch: `main`
- Release: https://github.com/Luis-Herry/anime-tracker-desktop/releases/tag/v0.1.0

## Download

Release `v0.1.0` includes:

- `anime-tracker-desktop-setup-v0.1.0-x64.exe` — Windows installer
- `anime-tracker-desktop-portable-v0.1.0-x64.exe` — portable build
- `README-desktop.txt` — short user-facing note

The installer is the recommended friend-facing artifact. The portable exe self-extracts on first launch and may take longer before local ports become available.

## Desktop Runtime

- App database: `%APPDATA%/追番中心/data/anime.db`
- Downloads: `%APPDATA%/追番中心/download/`
- qBittorrent profile: `%APPDATA%/追番中心/qbit-profile/`
- Logs: `%APPDATA%/追番中心/logs/`
- Default app login: `admin` / `PUBLIC_HISTORY_REDACTED`
- Bundled qBittorrent Web UI: `127.0.0.1:8080`

The download manager and settings center include a `不会设置看这里` guide with the real qBittorrent screenshots from `public/qbit-guide/`.

## Development

```bash
npm install
npm run test
npm run build
```

Run the desktop app locally:

```bash
npm run desktop:start
```

Build distributable Windows artifacts:

```bash
npm run desktop:dist
```

Artifacts are generated in `release/` and ignored by Git.

## Bundled Third-Party Binaries

- `vendor/node/node.exe`
- `vendor/qbittorrent/qbittorrent.exe`

Keep the notice files beside the binaries. Do not patch the qBittorrent executable.

