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
