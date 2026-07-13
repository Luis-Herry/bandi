# Desktop Packaging Rules

- Desktop-only code lives in `desktop/`, `scripts/prepare-standalone.mjs`, `vendor/qbittorrent/`, and `docs/desktop/`.
- Keep the web app surface in `src/` framework-agnostic. Do not import Electron APIs from React components, route handlers, or shared libraries.
- This repository is the canonical desktop product source. Keep desktop development, packaging, and release verification here.
- Keep `data/anime.db`, generated config, `qbit-profile/`, logs, and service caches under `%APPDATA%\anime-tracker\`. Store screenshots in the Windows Pictures known folder under `Bandi`. Let onboarding or Settings own the writable local/UNC download directory; use the Windows Videos known folder under `Bandi\Downloads` only as the initial suggestion.
- Never copy `.env*`, the original `data/`, the original `download/`, `.next/`, `node_modules/`, `.git/`, or temporary screenshot/log files into release artifacts.
- qBittorrent is vendored as an unmodified third-party binary. Keep its notice file beside the binary and do not patch the executable.
- Managed qBittorrent owns a loopback port selected from `18180` upward. Keep the external system-qBit diagnostic on `127.0.0.1:18080`; never mix the two profiles or task sets.
- Silent-session headers may reach only the current Next port on `127.0.0.1` or `localhost`. Redirects can switch between those hostnames; reject other ports, schemes, and lookalike hosts, and never log the token value.
