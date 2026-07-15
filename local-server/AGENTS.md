# macOS Local Server Rules

- This directory owns the macOS local-service launcher only. Shared pages,
  routes, database logic, downloader API, and player logic stay in `src/`.
- Support both `x64` and `arm64`; never label a cross-built native module as a
  verified artifact. Packaging must run under the target architecture.
- Bind the product server to `127.0.0.1` by default. `0.0.0.0` is allowed only
  after the user enables LAN access, and LAN sessions require pairing.
- Keep launcher control and qBittorrent ports on loopback. Never expose their
  credentials, tokens, or configuration file contents to browser clients.
- Finder, native folder selection, and external-player actions are host-only.
  Hide them from paired iPhone/iPad sessions and keep the server-side
  `requireLocalHostRouteUser` check even when the client already hides them.
- qBittorrent remains an unmodified official third-party application. Bundle
  its DMG with a pinned checksum, copy it with macOS `ditto`, and retain license
  notices. Do not remove quarantine attributes or bypass Gatekeeper.
- Runtime state belongs under Electron `userData`. Release inputs must not
  include local databases, configs, logs, media titles, download history, or
  environment files.
- Platform-sensitive behavior needs pure helper tests on Windows plus a real
  macOS x64/arm64 checklist. Report Mac-only checks as pending until a friend
  returns the evidence.
