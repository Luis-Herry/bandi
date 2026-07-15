import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  groupScannedFiles,
  parseAnimeMediaFileName,
} from "../src/lib/cinema-scan";

// Regression: QA-007 — the anime local library had no independent directory scanner.
// Found by /qa on 2026-07-11.
// Report: .gstack/qa-reports/qa-report-desktop-2026-07-11.md

test("anime scanner parses fansub and anime-scoped episode filenames", () => {
  const fansub = parseAnimeMediaFileName(
    "D:/Anime/Frieren/[Moozzi2] Sousou no Frieren - 01 [1080p SRTx2].mkv",
  );
  const scoped = parseAnimeMediaFileName(
    "D:/Anime/86 S2/86 S2 - 03 [1080p].mkv",
  );
  const fansubSeason = parseAnimeMediaFileName(
    "D:/Anime/86 S2/[Moozzi2] 86 S2 - 03 [1080p SRTx2].mkv",
  );
  const movie = parseAnimeMediaFileName(
    "D:/Anime Movies/Spirited Away (2001)/Spirited Away (2001).mkv",
  );
  const cjkSeason = parseAnimeMediaFileName(
    "D:/Media/Bandi Downloads/關於我轉生變成史萊姆這檔事 第四季 - 86 [1080p].mp4",
  );

  assert.deepEqual(
    { kind: fansub.kind, title: fansub.title, season: fansub.season, episode: fansub.episode },
    { kind: "tv", title: "Sousou no Frieren", season: 1, episode: 1 },
  );
  assert.deepEqual(
    { kind: scoped.kind, title: scoped.title, season: scoped.season, episode: scoped.episode },
    { kind: "tv", title: "86", season: 2, episode: 3 },
  );
  assert.deepEqual(
    {
      kind: fansubSeason.kind,
      title: fansubSeason.title,
      season: fansubSeason.season,
      episode: fansubSeason.episode,
    },
    { kind: "tv", title: "86", season: 2, episode: 3 },
  );
  assert.equal(movie.kind, "movie");
  assert.equal(movie.title, "Spirited Away");
  assert.equal(movie.year, 2001);
  assert.deepEqual(
    {
      kind: cjkSeason.kind,
      title: cjkSeason.title,
      season: cjkSeason.season,
      episode: cjkSeason.episode,
    },
    {
      kind: "tv",
      title: "關於我轉生變成史萊姆這檔事",
      season: 4,
      episode: 86,
    },
  );
});

test("anime local library exposes preview-confirm scanning and native anime folder copy", () => {
  const client = readFileSync(
    "src/app/(main)/library/local/LocalLibraryClient.tsx",
    "utf8",
  );
  const scanButton = readFileSync(
    "src/components/features/CinemaScanButton.tsx",
    "utf8",
  );
  const route = readFileSync("src/app/api/library/local/scan/route.ts", "utf8");
  const main = readFileSync("desktop/main.cjs", "utf8");
  const detail = readFileSync("src/app/(main)/anime/[id]/page.tsx", "utf8");

  assert.match(client, /AnimeLocalScanButton/);
  assert.match(scanButton, /\/api\/library\/local\/scan/);
  assert.match(scanButton, /kind: mode/);
  assert.match(route, /previewScannedAnimeTitles/);
  assert.match(route, /importScannedAnimeTitles/);
  assert.match(main, /选择本地动漫文件夹/);
  assert.match(main, /扫描本地库/);
  assert.doesNotMatch(detail, /9\.2|1,287 评分/);
});

test("anime scanner accepts standard Chinese season numbers and rejects malformed units", () => {
  const valid = [
    ["一", 1],
    ["十", 10],
    ["十一", 11],
    ["二十", 20],
    ["一百零二", 102],
    ["一百二十一", 121],
    ["一百二十三", 123],
    ["九百九十九", 999],
    ["2", 2],
    ["002", 2],
  ] as const;

  for (const [label, season] of valid) {
    const parsed = parseAnimeMediaFileName(
      `D:/Anime/Example 第${label}季/Example 第${label}季 - 03.mkv`,
    );
    assert.equal(parsed.season, season, label);
    assert.equal(parsed.title, "Example", label);
  }

  const s2Dash = parseAnimeMediaFileName(
    "D:/Anime/Example S2/Example S2 - 03.mkv",
  );
  const s2Episode = parseAnimeMediaFileName(
    "D:/Anime/Example S2/Example S2 EP04.mkv",
  );
  const s2Fansub = parseAnimeMediaFileName(
    "D:/Anime/Example S2/[Group] 05 [1080p SRTx2].mkv",
  );
  assert.deepEqual(
    [s2Dash, s2Episode, s2Fansub].map(({ title, season, episode }) => ({
      title,
      season,
      episode,
    })),
    [
      { title: "Example", season: 2, episode: 3 },
      { title: "Example", season: 2, episode: 4 },
      { title: "Example", season: 2, episode: 5 },
    ],
  );
  assert.equal(groupScannedFiles([s2Dash, s2Episode, s2Fansub]).length, 1);

  for (const label of ["零", "十十", "百百"]) {
    const dash = parseAnimeMediaFileName(
      `D:/Anime/Example/Example 第${label}季 - 03.mkv`,
    );
    const ep = parseAnimeMediaFileName(
      `D:/Anime/Example/Example 第${label}季 EP03.mkv`,
    );
    assert.equal(dash.season, 1, `${label} dash`);
    assert.equal(ep.season, 1, `${label} EP`);
  }
});
