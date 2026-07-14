# Bandi Local Web for macOS

## Goal

Ship the existing Bandi product as a local service for macOS Intel and Apple
Silicon. The Mac owns SQLite, qBittorrent, downloads, media files, caches, and
the player stream. Safari or another browser is the interface. An iPhone or
iPad can join over the same LAN after an explicit pairing step.

## Release scope

- macOS 13 or later, with separate `x64` and `arm64` artifacts.
- One local owner. No username/password form, registration, cloud account, or
  cloud sync.
- Existing anime, cinema, RSS, download manager, local scans, subtitles,
  playback progress, screenshots, and HTTP Range player routes remain shared.
- A managed qBittorrent copy is installed from an official DMG bundled inside
  the Bandi application. Intel uses qBittorrent 5.0.5; Apple Silicon uses
  qBittorrent 5.2.3.
- Linux, Docker/NAS, public internet access, and PWA work are out of scope.

## Runtime contract

1. Bandi starts a private control server on `127.0.0.1`.
2. Bandi starts managed qBittorrent on a random loopback port from `18180`.
3. Bandi starts the Next standalone server on a random port from `31245`.
4. Local-only mode binds Next to `127.0.0.1` and opens the default browser with
   a one-time token in the URL fragment. The fragment is posted through
   NextAuth and removed from browser history.
5. LAN mode is opt-in, binds Next to `0.0.0.0`, and accepts a six-digit pairing
   code generated on the Mac. Disabling LAN access invalidates paired sessions.
   The connection uses local HTTP, so the setting explicitly limits use to a
   trusted home network and should stay off on shared or public Wi-Fi.
6. qBittorrent credentials and the control token stay inside the launcher and
   Next server environment. They are never returned to a browser.

## Local data

- Runtime root: `~/Library/Application Support/Bandi/`
- Database: `data/anime.db`
- Configuration: `config.json`
- qBittorrent profile: `qbit-profile/`
- Managed qBittorrent app: `managed-qbittorrent/qBittorrent.app`
- Logs: `logs/`
- Caches: `cache/`
- Default downloads: `~/Movies/Bandi/Downloads`
- Screenshots: `~/Pictures/Bandi`

## Acceptance

- A fresh x64 or arm64 build starts without a system Node.js or qBittorrent.
- The first browser session enters without a username/password form.
- The user can choose a writable download or media directory with the native
  macOS folder picker.
- A magnet can be queued, observed, paused/resumed, completed, and played from
  the existing Bandi download manager and player.
- MP4/WebM files support Safari Range playback; unsupported containers keep a
  clear format error instead of claiming iOS compatibility.
- LAN is unreachable before opt-in. A device without a valid pairing code
  cannot create a session after opt-in.
- Paired-device revocation and disabling LAN prevent future authenticated
  requests after the bounded session recheck interval.
- Windows Electron tests, build, and packaging contracts continue to pass.

## Verification boundary

Windows can verify shared code, configuration generation, asset checksums,
standalone build contents, auth/control tests, Range responses, and Windows
regressions. Final claims about Gatekeeper, code signing, native folder dialogs,
managed qBittorrent launch, Safari playback, and both Mach-O architectures need
the community hardware checklist in
`docs/desktop/macos-community-verification.md`. Intel x64, Apple Silicon ARM64,
and iOS/iPadOS Safari remain pending until public, sanitized reports are
collected.
