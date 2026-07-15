# Metadata refresh implementation notes

## Acceptance criteria

- Rating controls visually align with the filter panel's right edge without layout jitter.
- Local scans match simplified/traditional Chinese titles and do not create duplicate skeleton anime when one trusted local row already exists.
- A manual metadata refresh can reconcile local/download rows with YUC and Bangumi, preserve downloaded-file playback links, and fill cover/detail/episode metadata when authoritative sources are available.
- Browse, download manager, local library, and anime detail expose a clear refresh/check action with visible loading, success, partial-success, and failure feedback.
- The browse quarter action runs the same local metadata and Chinese synopsis reconciliation instead of stopping after cache refresh.
- Shared macOS pages receive the same behavior, while paired iPhone/iPad sessions never receive host file-manager actions.
- Existing tests, new regressions, production build, and real `%APPDATA%\anime-tracker` samples verify the behavior.

## Initial evidence

- Local import title matching uses a single normalized string and does not expand simplified/traditional Chinese variants.
- New local skeletons are written as `completed`, and their maximum absolute episode number is stored as `totalEpisodes`.
- YUC-created rows can have cover and identity metadata while keeping `bangumiId` and `episodes` empty.
- The live database contains split rows for `穹庐下的魔女` and `画完这个再去死`: one tracked YUC row plus one local-download row.

## Deviations

- The first backup-copy rehearsal still missed the traditional-Chinese Slime title because Bangumi search received only the original query. The lookup now expands simplified and traditional search terms before applying the existing strict identity checks.
- YUC pages for some old quarters and the not-yet-published 2026 October page returned empty/404 responses. The refresh kept last-good cache data and used exact Bangumi title/Japanese-title matching for the affected rows.
- A first quarter-level synopsis rehearsal refreshed caches but skipped local metadata reconciliation. The quarter route now refreshes matching local rows after the source caches complete.
- Concurrent Douban suggestion queries silently omitted valid subjects. Quarter-level fallback is sequential; a fresh database copy then resolved Douban `37248425` and replaced the Japanese synopsis for anime `831`.

## Verification

- `npx tsc --noEmit`: passed.
- `npm run test`: 438 tests, 437 passed, 1 skipped, 0 failed. The skipped case requires POSIX filesystem semantics and is expected on Windows.
- `npm run build`: passed; `/api/anime/refresh` is present in the production route manifest.
- Fresh quarter-refresh rehearsal on a consistent database copy: 10 matching anime checked, 4 Japanese synopses replaced with Chinese source copy, and anime `831` linked to Douban `37248425` without touching the live database.
- Backup-copy full refresh: 18 local anime checked, 2 duplicate anime rows merged, 4 Bangumi identities linked, 67 episode rows added, 5 duplicate download rows removed, and 0 warnings.
- Live database backup: `%APPDATA%\anime-tracker\backups\metadata-refresh-live-20260714-115825\anime-before.db`.
- Live before/after: 322 → 320 anime rows, 1424 → 1491 episode rows, 310 → 305 download rows, 5 → 0 duplicate download URLs, 0 foreign-key violations, and 0 orphaned download/episode references.
- Desktop UI: local library shows covers and the refresh action; Slime S4 shows Bangumi/YUC metadata plus EP.73–96 with local EP.86 preserved; browse shows a right-aligned rating status and quarter refresh; downloads show covers and the data-check action.
- `npm run desktop:dist`: passed and regenerated `追番中心-Setup-0.1.5-x64.exe` (`SHA256 22A5A4FA08ACB8A4E8D6393F20D1AD121CC0FFC08B332AFFB97DE3E655004536`) plus `追番中心-0.1.5-x64-portable.exe` (`SHA256 20803B0F58D91B21F61D884EAEB2DA3FD44DB571BABEFB9891D56F13CC130101`).
- Shared macOS/iOS behavior is covered by static regressions on Windows. Native Finder actions, Apple Silicon/Intel packages, and paired Safari behavior still require the target Mac/iPhone/iPad verification matrix before an Apple release.
