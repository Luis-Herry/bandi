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

test("player start changes status without marking an unfinished episode watched", () => {
  const playerProgressSource = readFileSync(
    "src/app/api/player/progress/route.ts",
    "utf8",
  );

  assert.match(playerProgressSource, /shouldMarkStarted/);
  assert.doesNotMatch(
    playerProgressSource,
    /currentEpisode = Math\.max\(currentEpisode, ep\.number\)/,
  );
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

test("anime continue actions share one episode selection rule", () => {
  const helperSource = readFileSync("src/lib/db-helpers/library.ts", "utf8");
  const detailSource = readFileSync(
    "src/app/(main)/anime/[id]/page.tsx",
    "utf8",
  );

  assert.equal(
    helperSource.match(/selectContinueEpisode\(\{/g)?.length,
    2,
  );
  assert.match(detailSource, /import \{ selectContinueEpisode \}/);
  assert.match(detailSource, /selectContinueEpisode\(\{/);
  assert.doesNotMatch(detailSource, /e\.number > watchedThroughEpisode/);
});

test("home hero distinguishes playback, RSS search, and future airing states", () => {
  const helperSource = readFileSync("src/lib/db-helpers/library.ts", "utf8");
  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");
  const heroSource = readFileSync("src/components/features/HomeHero.tsx", "utf8");

  assert.match(helperSource, /selectHeroEpisodeAvailability/);
  assert.match(helperSource, /sourceEpisodeNumber/);
  assert.match(helperSource, /nextAiringEpisodeNumber/);
  assert.match(helperSource, /nextAiringAt/);
  assert.match(homeSource, /nextAiringAt\.toISOString\(\)/);
  assert.match(heroSource, /EpisodeSourceDialog/);
  assert.match(heroSource, /找资源 EP\./);
  assert.match(heroSource, /下集 EP\./);
  assert.match(heroSource, /formatHeroAiringTime/);
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
  assert.doesNotMatch(helperSource, /return a\.status === "airing"/);
});

test("home hero keeps a persistent, responsive thumbnail rail", () => {
  const heroSource = readFileSync("src/components/features/HomeHero.tsx", "utf8");

  assert.match(heroSource, /thumbnailViewportRef/);
  assert.match(heroSource, /thumbnailRefs/);
  assert.match(heroSource, /const THUMBNAILS_PER_GROUP = 5/);
  assert.match(heroSource, /getThumbnailGroupStart\(idx, slides\.length\)/);
  assert.match(
    heroSource,
    /groupStartThumbnail\.offsetLeft - firstThumbnail\.offsetLeft/,
  );
  assert.match(heroSource, /viewport\.scrollTo\(\{/);
  assert.match(heroSource, /behavior: shouldReduceMotion \? "auto" : "smooth"/);
  assert.match(heroSource, /new ResizeObserver\(alignThumbnailGroup\)/);
  assert.match(heroSource, /resizeObserver\.observe\(viewport\)/);
  assert.match(heroSource, /resizeObserver\.disconnect\(\)/);
  assert.match(heroSource, /onFocusCapture=\{\(\) => setPaused\(true\)\}/);
  assert.match(heroSource, /event\.currentTarget\.contains\(event\.relatedTarget/);
  assert.match(heroSource, /slides\.map\(\(s, slideIndex\) =>/);
  assert.match(heroSource, /<motion\.button/);
  assert.match(heroSource, /active \? 1\.06 : 1/);
  assert.match(heroSource, /relative h-12 w-20 shrink-0/);
  assert.match(heroSource, /min-\[1280px\]:h-\[52px\]/);
  assert.match(heroSource, /min-\[1440px\]:h-14/);
  assert.match(
    heroSource,
    /<\/motion\.div>\s*<div className="pointer-events-auto mt-6/,
  );
  assert.doesNotMatch(heroSource, /THUMBNAIL_GROUP_SIZE/);
  assert.doesNotMatch(heroSource, /visibleThumbnailSlides/);
  assert.doesNotMatch(heroSource, /centeredLeft/);
  assert.doesNotMatch(
    heroSource,
    /activeThumbnail\.offsetLeft\s*-\s*\(viewport\.clientWidth/,
  );
  assert.doesNotMatch(heroSource, /transition-all/);
  assert.doesNotMatch(heroSource, /w-\[120px\] h-\[72px\]/);
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

test("downloads admin can open the configured root and each local item", () => {
  const clientSource = readFileSync(
    "src/app/(main)/admin/downloads/Client.tsx",
    "utf8",
  );
  const pageSource = readFileSync(
    "src/app/(main)/admin/downloads/page.tsx",
    "utf8",
  );
  const routeSource = readFileSync(
    "src/app/api/downloads/open-location/route.ts",
    "utf8",
  );

  assert.match(clientSource, /打开下载目录/);
  assert.match(clientSource, /getDesktopBridge\(\)/);
  assert.match(clientSource, /bridge\?\.openDownloadDirectory/);
  assert.match(clientSource, /result\.opened === "file"/);
  assert.match(clientSource, /更改保存位置请前往设置中心/);
  assert.match(clientSource, /aria-label="打开本地目录"/);
  assert.match(clientSource, /title="打开本地目录"/);
  assert.match(clientSource, /title="删除"/);
  assert.match(clientSource, /canOpenLocalDirectory &&/);
  assert.match(pageSource, /user\?\.isLocalHost === true/);
  assert.match(pageSource, /canOpenLocalDirectory=\{canOpenLocalDirectory\}/);
  assert.match(routeSource, /requireLocalHostRouteUser\(\)/);
  assert.match(routeSource, /resolveDownloadRoot\(\)/);
  assert.match(routeSource, /parseLocalFileDownloadUrl/);
  assert.match(routeSource, /getTorrentFiles/);
  assert.match(routeSource, /opened: selectFile \? "file" : "directory"/);
  assert.doesNotMatch(routeSource, /body\.(?:path|directory|target)/);
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
