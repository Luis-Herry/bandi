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
  assert.match(gridSource, /displayCurrentEpisode/);
  assert.match(gridSource, /setDisplayCurrentEpisode/);
  assert.match(gridSource, /displayCurrentEpisode > 0 && ep\.number < displayCurrentEpisode/);
  assert.match(gridSource, /ep\.number === displayCurrentEpisode/);
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
  assert.match(clientSource, /import \{ PlayButton \}/);
  assert.match(clientSource, /episodeNumber: number \| null/);
  assert.match(clientSource, /row\.status === "completed"/);
  assert.match(clientSource, /const playerHref =/);
  assert.match(clientSource, /href=\{playerHref\}/);
  assert.match(clientSource, /aria-label=\{`播放 \$\{row\.anime\.title\} EP\.\$\{episodeLabel\}`\}/);
  assert.match(clientSource, /episode=\{row\.episodeNumber\}/);
  assert.match(clientSource, /播放 EP/);
});
