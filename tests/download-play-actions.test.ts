import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("episode grid keeps RSS search and adds local playback for downloaded episodes", () => {
  const source = readFileSync("src/components/features/EpisodeGrid.tsx", "utf8");

  assert.match(source, /import \{ PlayButton \}/);
  assert.match(source, /setOpenEp\(ep\.number\)/);
  assert.match(source, /isDownloaded \?/);
  assert.match(source, /episode=\{ep\.number\}/);
  assert.match(source, /播放 EP/);
});

test("episode progress edits update the episode grid without a manual refresh", () => {
  const gridSource = readFileSync("src/components/features/EpisodeGrid.tsx", "utf8");
  const progressSource = readFileSync(
    "src/components/features/EpisodeProgressControl.tsx",
    "utf8",
  );

  assert.match(progressSource, /anime-progress-change/);
  assert.match(progressSource, /currentEpisode: next/);
  assert.match(gridSource, /anime-progress-change/);
  assert.match(gridSource, /anime-watch-status-change/);
  assert.match(gridSource, /animeStatus/);
  assert.match(gridSource, /canSearchSources/);
  assert.match(gridSource, /displayCurrentEpisode/);
  assert.match(gridSource, /setDisplayCurrentEpisode/);
  assert.match(gridSource, /displayWatchedThrough/);
  assert.match(gridSource, /ep\.number <= displayWatchedThrough/);
  assert.match(gridSource, /ep\.number === displayCurrentEpisode/);
});

test("new library additions default to planning at episode zero", () => {
  const libraryRouteSource = readFileSync("src/app/api/library/route.ts", "utf8");
  const watchMenuSource = readFileSync(
    "src/components/features/WatchStatusMenu.tsx",
    "utf8",
  );
  const subscriptionSource = readFileSync(
    "src/components/features/AnimeSubscriptionButton.tsx",
    "utf8",
  );

  assert.match(libraryRouteSource, /: "planning"/);
  assert.match(libraryRouteSource, /currentEpisode: 0/);
  assert.match(watchMenuSource, /updateStatus\("planning"\)/);
  assert.match(subscriptionSource, /watchStatus: "planning"/);
});

test("player progress starts planning titles at the current episode", () => {
  const playerProgressSource = readFileSync(
    "src/app/api/player/progress/route.ts",
    "utf8",
  );

  assert.match(playerProgressSource, /shouldMarkStarted/);
  assert.match(playerProgressSource, /currentEpisode = Math\.max\(currentEpisode, ep\.number\)/);
  assert.match(playerProgressSource, /watchStatus = "watching"/);
});

test("today update cards expose RSS search and downloaded playback actions", () => {
  const sectionSource = readFileSync(
    "src/components/features/TodayOrUpcomingSection.tsx",
    "utf8",
  );
  const helperSource = readFileSync("src/lib/db-helpers/library.ts", "utf8");
  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");

  assert.match(sectionSource, /import \{ PlayButton \}/);
  assert.match(sectionSource, /EpisodeSourceDialog/);
  assert.match(sectionSource, /isDownloaded: boolean/);
  assert.match(sectionSource, /setSourceEpisode/);
  assert.match(sectionSource, /找资源/);
  assert.match(sectionSource, /播放/);
  assert.match(sectionSource, /size="sm"/);
  assert.doesNotMatch(sectionSource, /buttonClassName="h-7 px-2\.5 text-\[11px\]"/);
  assert.doesNotMatch(sectionSource, /inline-flex h-7 items-center justify-center/);
  assert.match(helperSource, /getCompletedDownloadEpisodeIds/);
  assert.match(helperSource, /isDownloaded: downloadedEpisodeIds\.has\(r\.ep\.id\)/);
  assert.match(homeSource, /isDownloaded: u\.episode\.isDownloaded/);
});

test("continue watching uses the missed-reminder playback button style", () => {
  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");
  const continuePlayButton = /episode=\{playEp\}[\s\S]*?label=\{`播放 EP\.\$\{String\(playEp\)\.padStart\(2, "0"\)\}`\}[\s\S]*?variant="primary"[\s\S]*?size="sm"/;

  assert.match(homeSource, continuePlayButton);
  assert.doesNotMatch(homeSource, /buttonClassName="h-7 px-2\.5 text-\[11px\]"/);
  assert.match(homeSource, /watchedAiredCount/);
  assert.match(homeSource, /已看 \$\{watchedAiredCount\} \/ 已播 \$\{airedCount\}/);
  assert.match(homeSource, /watchedAiredCount \/ airedCount/);
  assert.doesNotMatch(homeSource, /currentEpisode \/ denom/);
});

test("home hero candidates do not admit stale same-year airing rows", () => {
  const helperSource = readFileSync("src/lib/db-helpers/library.ts", "utf8");
  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");
  const heroSource = readFileSync("src/components/features/HomeHero.tsx", "utf8");

  assert.match(helperSource, /isCurrentSeasonTrackedAnime/);
  assert.match(helperSource, /tagsMatchCurrentSeason/);
  assert.match(helperSource, /episodesMatchCurrentSeason/);
  assert.match(helperSource, /limit\?: number/);
  assert.match(helperSource, /Number\.isFinite\(limit\)/);
  assert.match(homeSource, /getHeroCandidates\(user\.id\)/);
  assert.doesNotMatch(homeSource, /getHeroCandidates\(user\.id,\s*5\)/);
  assert.match(heroSource, /const AUTOPLAY_MS = 6000/);
  assert.match(heroSource, /const THUMBNAIL_GROUP_SIZE = 5/);
  assert.match(
    heroSource,
    /Math\.floor\(idx \/ THUMBNAIL_GROUP_SIZE\) \* THUMBNAIL_GROUP_SIZE/,
  );
  assert.match(
    heroSource,
    /slides\.slice\(\s*thumbnailGroupStart,\s*thumbnailGroupStart \+ THUMBNAIL_GROUP_SIZE,\s*\)/,
  );
  assert.match(heroSource, /visibleThumbnailSlides\.map/);
  assert.doesNotMatch(helperSource, /return a\.status === "airing"/);
});

test("missed update cards search or play the next missed episode", () => {
  const actionSource = readFileSync(
    "src/components/features/MissedUpdateActions.tsx",
    "utf8",
  );
  const helperSource = readFileSync("src/lib/db-helpers/library.ts", "utf8");
  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");

  assert.match(helperSource, /nextMissedEpisode/);
  assert.match(helperSource, /missedCount/);
  assert.match(helperSource, /latestEpisodeIsDownloaded/);
  assert.match(helperSource, /nextMissedEpisodeIsDownloaded/);
  assert.match(helperSource, /isDownloaded: downloadedEpisodeIds\.has\(e\.id\)/);
  assert.match(actionSource, /EpisodeSourceDialog/);
  assert.match(actionSource, /episodeNumber=\{episodeNumber\}/);
  assert.match(actionSource, /isDownloaded \? \(/);
  assert.doesNotMatch(actionSource, /\{isDownloaded &&/);
  assert.match(actionSource, /找资源/);
  assert.match(actionSource, /label=\{`播放 EP\.\$\{episodeLabel\}`\}/);
  assert.match(actionSource, /size="sm"/);
  assert.doesNotMatch(actionSource, /h-7 px-2\.5 text-\[11px\]/);
  assert.match(homeSource, /MissedUpdateActions/);
  assert.match(homeSource, /episodeNumber=\{m\.nextMissedEpisode\}/);
  assert.match(homeSource, /isDownloaded=\{m\.nextMissedEpisodeIsDownloaded\}/);
});

test("downloads admin completed rows can open the internal player", () => {
  const clientSource = readFileSync(
    "src/app/(main)/admin/downloads/Client.tsx",
    "utf8",
  );
  const downloadsRouteSource = readFileSync(
    "src/app/api/downloads/route.ts",
    "utf8",
  );

  assert.match(downloadsRouteSource, /episodeNumber: episodes\.number/);
  assert.match(downloadsRouteSource, /leftJoin\(episodes, eq\(downloadQueue\.episodeId, episodes\.id\)\)/);
  assert.match(downloadsRouteSource, /backfillMissingDownloadEpisodeRefs\(\)/);
  assert.match(downloadsRouteSource, /syncMissingDownloadSources\(\{/);
  assert.match(downloadsRouteSource, /extractEpisodeNumber\(row\.title\)/);
  assert.match(downloadsRouteSource, /set\(\{ episodeId: ep\.id \}\)/);
  assert.match(downloadsRouteSource, /set\(\{ isDownloaded: true \}\)/);
  assert.match(downloadsRouteSource, /promoteStartedByDownloadedEpisode/);
  assert.match(downloadsRouteSource, /watchStatus: "watching"/);
  assert.match(downloadsRouteSource, /currentEpisode: ep\.number/);
  assert.match(clientSource, /import \{ PlayButton \}/);
  assert.match(clientSource, /episodeNumber: number \| null/);
  assert.match(clientSource, /row\.status === "completed"/);
  assert.match(clientSource, /const playerHref =/);
  assert.match(clientSource, /href=\{playerHref\}/);
  assert.match(clientSource, /aria-label=\{`播放 \$\{row\.anime\.title\} EP\.\$\{episodeLabel\}`\}/);
  assert.match(clientSource, /episode=\{row\.episodeNumber\}/);
  assert.match(clientSource, /播放 EP/);
});

test("downloads refresh prunes completed rows whose backing source disappeared", () => {
  const downloadsRouteSource = readFileSync(
    "src/app/api/downloads/route.ts",
    "utf8",
  );

  assert.match(downloadsRouteSource, /getStatus\(\)/);
  assert.match(downloadsRouteSource, /qbitConnected: qbitStatus\.connected/);
  assert.match(downloadsRouteSource, /parseLocalFileDownloadUrl\(row\.magnetUrl\)/);
  assert.match(downloadsRouteSource, /!existsSync\(localPath\)/);
  assert.match(downloadsRouteSource, /!isVideoFileName\(path\.basename\(localPath\)\)/);
  assert.match(downloadsRouteSource, /extractMagnetHash\(row\.magnetUrl\)/);
  assert.match(downloadsRouteSource, /qbitConnected && hash && !liveHashes\.has\(hash\)/);
  assert.match(downloadsRouteSource, /db\.delete\(downloadQueue\)/);
  assert.match(downloadsRouteSource, /inArray\(downloadQueue\.id, staleIds\)/);
  assert.match(downloadsRouteSource, /resetDownloadedFlagsWithoutCompletedRows\(episodeIds\)/);
});
