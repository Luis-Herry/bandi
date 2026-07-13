# Desktop Packaging Rules

- Desktop-only code lives in `desktop/`, `scripts/prepare-standalone.mjs`, `vendor/qbittorrent/`, and `docs/desktop/`.
- Keep the web app surface in `src/` framework-agnostic. Do not import Electron APIs from React components, route handlers, or shared libraries.
- This repository is the canonical desktop product source. Keep desktop development, packaging, and release verification here.
- Runtime state is split deliberately. Keep `data/anime.db`, generated config, `qbit-profile/`, and `logs/` under `%APPDATA%\anime-tracker\`; use `K:\BandiData\downloads`, `H:\BandiData\cache\covers`, `H:\BandiData\cache\electron`, and `H:\BandiData\screenshots` for media and caches. Do not silently fall back to C: when these paths are unavailable.
- Never copy `.env*`, the original `data/`, the original `download/`, `.next/`, `node_modules/`, `.git/`, or temporary screenshot/log files into release artifacts.
- qBittorrent is vendored as an unmodified third-party binary. Keep its notice file beside the binary and do not patch the executable.
- Managed qBittorrent owns a loopback port selected from `18180` upward. Keep the external system-qBit diagnostic on `127.0.0.1:18080`; never mix the two profiles or task sets.
- Silent-session headers may reach only the current Next port on `127.0.0.1` or `localhost`. Redirects can switch between those hostnames; reject other ports, schemes, and lookalike hosts, and never log the token value.
