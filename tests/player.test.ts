import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildPlayerEpisodeNavigation,
  getPlaybackCompletionState,
  parseHttpRange,
  pickLargestVideoFile,
  srtToWebVtt,
} from "../src/lib/player";

test("player helper picks the largest playable video file", () => {
  const picked = pickLargestVideoFile([
    { name: "subtitle.ass", size: 4_096, progress: 1 },
    { name: "Episode 08.mkv", size: 700_000_000, progress: 1 },
    { name: "Preview.mp4", size: 30_000_000, progress: 1 },
  ]);

  assert.equal(picked?.name, "Episode 08.mkv");
});

test("player helper parses single byte ranges for video streaming", () => {
  assert.deepEqual(parseHttpRange("bytes=100-199", 1_000), {
    start: 100,
    end: 199,
    status: 206,
  });
  assert.deepEqual(parseHttpRange("bytes=900-", 1_000), {
    start: 900,
    end: 999,
    status: 206,
  });
});

test("playback completion state requires a high ratio or a short remaining tail", () => {
  assert.equal(
    getPlaybackCompletionState({ positionSeconds: 1_295, durationSeconds: 1_440 })
      .completed,
    false,
  );
  assert.equal(
    getPlaybackCompletionState({ positionSeconds: 1_300, durationSeconds: 1_440 })
      .completed,
    true,
  );
  assert.equal(
    getPlaybackCompletionState({ positionSeconds: 1_360, durationSeconds: 1_440 })
      .completed,
    true,
  );
});

test("player helper builds navigation from playable episode rows", () => {
  const nav = buildPlayerEpisodeNavigation(
    [
      { number: 72, isPlayable: true },
      { number: 73, isPlayable: false },
      { number: 74, isPlayable: true },
      { number: 75, isPlayable: true },
    ],
    74,
  );

  assert.equal(nav.previousPlayableEpisode, 72);
  assert.equal(nav.nextPlayableEpisode, 75);
  assert.deepEqual(nav.playableEpisodeNumbers, [72, 74, 75]);
});

test("player helper converts srt captions into webvtt", () => {
  const converted = srtToWebVtt(
    [
      "1",
      "00:00:01,500 --> 00:00:03,000",
      "第一句字幕",
      "",
      "2",
      "00:01:04,250 --> 00:01:06,750",
      "第二句字幕",
    ].join("\n"),
  );

  assert.match(converted, /^WEBVTT/);
  assert.match(converted, /00:00:01.500 --> 00:00:03.000/);
  assert.match(converted, /第一句字幕/);
  assert.match(converted, /00:01:04.250 --> 00:01:06.750/);
});

test("player schema and routes expose web playback progress", () => {
  const schemaSource = readFileSync("src/db/schema.ts", "utf8");
  const progressRouteSource = readFileSync(
    "src/app/api/player/progress/route.ts",
    "utf8",
  );
  const streamRouteSource = readFileSync(
    "src/app/api/player/stream/route.ts",
    "utf8",
  );

  assert.match(schemaSource, /playbackProgress/);
  assert.match(schemaSource, /position_seconds/);
  assert.match(schemaSource, /duration_seconds/);
  assert.match(progressRouteSource, /PATCH/);
  assert.match(progressRouteSource, /getPlaybackCompletionState/);
  assert.match(streamRouteSource, /Content-Range/);
  assert.match(streamRouteSource, /createReadStream/);
});

test("play buttons open the internal player and keep an external fallback", () => {
  const playButtonSource = readFileSync(
    "src/components/features/PlayButton.tsx",
    "utf8",
  );
  const playerPageSource = readFileSync(
    "src/app/(main)/player/[animeId]/[episode]/PlayerClient.tsx",
    "utf8",
  );

  assert.match(playButtonSource, /\/player\/\$\{animeId\}\/\$\{targetEpisode\}/);
  assert.match(playerPageSource, /\/api\/player\/stream/);
  assert.match(playerPageSource, /\/api\/player\/progress/);
  assert.match(playerPageSource, /\/api\/play/);
  assert.match(playerPageSource, /currentTime/);
});

test("player page uses the AmberMotion theater control shell", () => {
  const playerPageSource = readFileSync(
    "src/app/(main)/player/[animeId]/[episode]/PlayerClient.tsx",
    "utf8",
  );
  const cssSource = readFileSync("src/app/globals.css", "utf8");

  assert.match(playerPageSource, /group\/theater/);
  assert.match(playerPageSource, /from-black\/90 via-black\/40 to-transparent/);
  assert.match(playerPageSource, /FULLSCREEN_CONTROLS_IDLE_MS/);
  assert.match(playerPageSource, /fullscreenchange/);
  assert.match(playerPageSource, /isTheaterFullscreen &&\s*isPlaying/);
  assert.match(playerPageSource, /controlsVisible/);
  assert.match(playerPageSource, /translate-y-full/);
  assert.match(playerPageSource, /cursor-none/);
  assert.match(playerPageSource, /Volume2/);
  assert.match(playerPageSource, /Maximize/);
  assert.match(playerPageSource, /requestFullscreen/);
  assert.match(playerPageSource, /player-live-dot/);
  assert.match(playerPageSource, /player-center-control/);
  assert.match(playerPageSource, /!\s*isPlaying && !videoError/);
  assert.match(playerPageSource, /aria-label="播放"/);
  assert.match(playerPageSource, /player-center-control player-primary-control/);
  assert.match(playerPageSource, /h-9 w-9 items-center justify-center rounded-full/);
  assert.match(playerPageSource, /bg-\[color:var\(--accent\)\]/);
  assert.match(playerPageSource, /text-\[color:var\(--accent-contrast\)\]/);
  assert.match(playerPageSource, /flex h-6 w-6 items-center justify-center text-white/);
  assert.match(playerPageSource, /shouldShowVideoPoster/);
  assert.match(playerPageSource, /poster=\{shouldShowVideoPoster/);
  assert.match(playerPageSource, /player-volume-range/);
  assert.match(playerPageSource, /player-seek-range/);
  assert.match(playerPageSource, /BackButton/);
  assert.match(playerPageSource, /const detailHref =/);
  assert.match(
    playerPageSource,
    /mediaType === "anime" \? `\/anime\/\$\{animeId\}` : `\/cinema\/\$\{animeId\}`/,
  );
  assert.match(playerPageSource, /fallbackHref=\{detailHref\}/);
  assert.match(playerPageSource, /href=\{detailHref\}/);
  assert.match(playerPageSource, />详情页<\/a>/);
  assert.match(playerPageSource, /\{progressPercent\}%/);
  assert.doesNotMatch(playerPageSource, /progressStatusLabel/);
  assert.doesNotMatch(playerPageSource, /\{progressPercent\}% ·/);
  assert.doesNotMatch(playerPageSource, /group-hover\/theater:translate-y-0/);
  assert.doesNotMatch(playerPageSource, /border-t border-white\/5 bg-\[rgba\(18,19,22,0\.96\)\] px-5 py-3/);
  assert.doesNotMatch(playerPageSource, /<CheckCircle2 size=\{12\}/);
  assert.match(cssSource, /@keyframes player-live-dot-breathe/);
  assert.match(cssSource, /\.player-volume-range/);
  assert.match(cssSource, /\.player-seek-range::-webkit-slider-thumb/);
  assert.match(
    cssSource,
    /\.player-seek-range::-webkit-slider-thumb[\s\S]*background: var\(--accent\)/,
  );
});

test("player page exposes anime watcher controls beyond basic playback", () => {
  const playerPageSource = readFileSync(
    "src/app/(main)/player/[animeId]/[episode]/PlayerClient.tsx",
    "utf8",
  );
  const pageSource = readFileSync(
    "src/app/(main)/player/[animeId]/[episode]/page.tsx",
    "utf8",
  );
  const subtitleRouteSource = readFileSync(
    "src/app/api/player/subtitles/route.ts",
    "utf8",
  );

  assert.match(pageSource, /playerEpisodes/);
  assert.match(pageSource, /mediaType=\{row\.anime\.mediaType\}/);
  assert.match(pageSource, /downloadQueue/);
  assert.match(pageSource, /playbackProgress/);
  assert.match(playerPageSource, /episodePanelOpen/);
  assert.match(playerPageSource, /autoPlayEnabled/);
  assert.match(playerPageSource, /playbackRate/);
  assert.match(playerPageSource, /captureScreenshot/);
  assert.match(playerPageSource, /subtitleTracks/);
  assert.match(playerPageSource, /handleKeyDown/);
  assert.match(playerPageSource, /navigateToEpisode/);
  assert.match(playerPageSource, /pagehide/);
  assert.match(playerPageSource, /visibilitychange/);
  assert.match(playerPageSource, /saveProgress\(true, true\)/);
  assert.match(subtitleRouteSource, /srtToWebVtt/);
  assert.match(subtitleRouteSource, /text\/vtt/);
});

test("player polish saves screenshots locally and keeps desktop controls clean", () => {
  const playerPageSource = readFileSync(
    "src/app/(main)/player/[animeId]/[episode]/PlayerClient.tsx",
    "utf8",
  );
  const cssSource = readFileSync("src/app/globals.css", "utf8");
  const screenshotRouteSource = readFileSync(
    "src/app/api/player/screenshots/route.ts",
    "utf8",
  );

  assert.match(playerPageSource, /\/api\/player\/screenshots/);
  assert.match(playerPageSource, /FileReader/);
  assert.match(playerPageSource, /setSettingsPanelOpen\(false\)/);
  assert.match(playerPageSource, /setEpisodePanelOpen\(false\)/);
  assert.match(playerPageSource, /关闭播放设置遮罩/);
  assert.match(playerPageSource, /关闭选集遮罩/);
  assert.match(playerPageSource, /IconTooltip/);
  assert.match(playerPageSource, /字幕/);
  assert.match(playerPageSource, /截图/);
  assert.match(playerPageSource, /全屏/);
  assert.equal((playerPageSource.match(/aria-label="截图"/g) ?? []).length, 1);
  assert.doesNotMatch(playerPageSource, />从头播放<\/Button>/);
  assert.doesNotMatch(playerPageSource, /resetToStart/);
  assert.doesNotMatch(playerPageSource, /displayTitle/);
  assert.doesNotMatch(playerPageSource, /episodeLabel/);
  assert.doesNotMatch(playerPageSource, /skipSettings/);
  assert.doesNotMatch(playerPageSource, /setQuickSkipSegment/);
  assert.doesNotMatch(playerPageSource, /OP \/ ED/);
  assert.doesNotMatch(playerPageSource, /Scissors/);
  assert.doesNotMatch(playerPageSource, /ChevronDown/);
  assert.doesNotMatch(playerPageSource, /PictureInPicture/);
  assert.doesNotMatch(playerPageSource, /requestPictureInPicture/);
  assert.match(screenshotRouteSource, /process\.env\.SCREENSHOT_DIR/);
  assert.match(screenshotRouteSource, /screenshot_directory_unavailable/);
  assert.doesNotMatch(screenshotRouteSource, /process\.cwd\(\)/);
  assert.match(screenshotRouteSource, /writeFileSync/);
  assert.match(screenshotRouteSource, /explorer\.exe/);
  assert.match(cssSource, /\.player-volume-range::-webkit-slider-thumb/);
  assert.match(cssSource, /opacity: 0/);
  assert.match(cssSource, /background: #fff/);
});

test("player labels cinema episodes as 集 while keeping anime as 话", () => {
  const playerPageSource = readFileSync(
    "src/app/(main)/player/[animeId]/[episode]/PlayerClient.tsx",
    "utf8",
  );

  assert.match(
    playerPageSource,
    /const episodeUnit = mediaType === "anime" \? "话" : "集"/,
  );
  assert.match(playerPageSource, /episodeHeading/);
  assert.doesNotMatch(
    playerPageSource,
    /第 \{String\(episodeNumber\)\.padStart\(2, "0"\)\} 话/,
  );
});

test("continue watching cards can display saved playback time", () => {
  const helperSource = readFileSync("src/lib/db-helpers/library.ts", "utf8");
  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");

  assert.match(helperSource, /playbackProgress/);
  assert.match(helperSource, /playbackPositionSeconds/);
  assert.match(homeSource, /formatPlaybackTime/);
  assert.match(homeSource, /playbackProgressRatio/);
});
