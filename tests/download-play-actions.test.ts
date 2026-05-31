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

test("desktop downloads page keeps qbit setup guide and 8080 default copy", () => {
  const downloadsSource = readFileSync(
    "src/app/(main)/admin/downloads/Client.tsx",
    "utf8",
  );

  assert.match(downloadsSource, /QbitSetupGuideDialog/);
  assert.match(downloadsSource, /不会设置看这里/);
  assert.match(downloadsSource, /默认 127\.0\.0\.1:8080/);
  assert.match(downloadsSource, /qbitPort/);
  assert.doesNotMatch(downloadsSource, /端口优先用 18080/);
});

test("today update cards expose RSS search and downloaded playback actions", () => {
  const sectionSource = readFileSync(
    "src/components/features/TodayOrUpcomingSection.tsx",
    "utf8",
  );
  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");

  assert.match(sectionSource, /import \{ PlayButton \}/);
  assert.match(sectionSource, /EpisodeSourceDialog/);
  assert.match(sectionSource, /isDownloaded: boolean/);
  assert.match(sectionSource, /setSourceEpisode/);
  assert.match(sectionSource, /找资源/);
  assert.match(sectionSource, /播放/);
  assert.match(homeSource, /isDownloaded: u\.episode\.isDownloaded/);
});

test("missed update cards search or play the latest aired episode", () => {
  const actionSource = readFileSync(
    "src/components/features/MissedUpdateActions.tsx",
    "utf8",
  );
  const helperSource = readFileSync("src/lib/db-helpers/library.ts", "utf8");
  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");

  assert.match(helperSource, /latestEpisodeIsDownloaded/);
  assert.match(actionSource, /EpisodeSourceDialog/);
  assert.match(actionSource, /episodeNumber=\{episodeNumber\}/);
  assert.match(actionSource, /isDownloaded &&/);
  assert.match(actionSource, /找资源/);
  assert.match(actionSource, /label="播放"/);
  assert.match(homeSource, /MissedUpdateActions/);
  assert.match(homeSource, /episodeNumber=\{m\.latestAiredEpisode\}/);
  assert.match(homeSource, /isDownloaded=\{m\.latestEpisodeIsDownloaded\}/);
});
