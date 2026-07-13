# Product

## Register

product

## Users

Luis is the primary user: a UI/UX designer using the Windows desktop app as a personal anime tracking and media-center tool. The product may later be shared with friends, while the current workflow remains personal and local-first.

## Product Purpose

Bandi helps the user answer three questions quickly: 今天看什么, 看到第几集, 下集什么时候更新. Success means the user can open one desktop app, understand current updates and watch progress within a few seconds, manage RSS and the bundled qBittorrent service without setup noise, and start the built-in player when an episode is ready.

## Brand Personality

克制, 沉浸, 清晰. The interface should feel like a personal media center with a refined anime-site atmosphere: dark, glassy, image-led, and quiet enough that anime covers carry the color.

## Anti-references

Avoid looking like a generic resource index, noisy torrent site, blue-purple neon dashboard, cheap gradient theme, or overpacked admin panel. Avoid emoji in UI, excessive glow, oversized rounded cards, and decoration that competes with the anime artwork.

## Design Principles

- Put the viewing decision first: the app should surface the next useful action before secondary metadata.
- Let anime artwork carry identity: product chrome stays restrained and uses cover-derived accent color only where it clarifies state or action.
- Keep operational flows direct: tracking, finding sources, download state, and playback should avoid extra choices when the system can infer the next step.
- Preserve local reliability: external API, RSS, and qBittorrent failures should degrade to cached or explanatory states without blocking normal browsing.
- Keep runtime storage predictable: videos use the directory selected during onboarding, while the database, config, logs, caches, and managed qBit profile remain in the Windows user profile.
- Design dense screens for scanning: controls, episode states, metadata, and notes must stay readable across breakpoints without hiding core functionality.

## Accessibility & Inclusion

Use readable contrast on the dark surface, visible focus states for keyboard users, practical pointer targets, and reduced-motion fallbacks for decorative or ambient animation. Window resizing must keep core actions available throughout the supported desktop range.
