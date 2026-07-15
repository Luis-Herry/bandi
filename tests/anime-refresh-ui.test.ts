import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const button = readFileSync(
  "src/components/features/AnimeDataRefreshButton.tsx",
  "utf8",
);
const browse = readFileSync("src/app/(main)/browse/BrowseClient.tsx", "utf8");
const downloads = readFileSync(
  "src/app/(main)/admin/downloads/Client.tsx",
  "utf8",
);
const localLibrary = readFileSync(
  "src/app/(main)/library/local/LocalLibraryClient.tsx",
  "utf8",
);
const detail = readFileSync("src/app/(main)/anime/[id]/page.tsx", "utf8");
const refreshService = readFileSync("src/lib/anime-metadata-refresh.ts", "utf8");
const refreshRoute = readFileSync("src/app/api/anime/refresh/route.ts", "utf8");

test("manual anime metadata refresh is reachable from every requested surface", () => {
  assert.match(button, /fetch\("\/api\/anime\/refresh"/);
  assert.match(button, /正在刷新/);
  assert.match(browse, /scope="season"/);
  assert.match(downloads, /scope="downloads"/);
  assert.match(localLibrary, /scope="local-library"/);
  assert.match(detail, /scope="anime"/);
  assert.match(
    refreshRoute,
    /refreshAnimeMetadata\(\{\s*scope: "season",\s*year,\s*season,/,
  );
});

test("refresh feedback distinguishes updated, unchanged, partial, and review states", () => {
  assert.match(button, /资料刷新完成/);
  assert.match(button, /资料已是最新/);
  assert.match(button, /资料已部分刷新/);
  assert.match(button, /需要手动确认关联/);
  assert.match(button, /补中文简介/);
});

test("local refresh repairs season-misassigned files and preserves playback progress", () => {
  assert.match(refreshService, /repairMisassignedLocalDownloads\(\)/);
  assert.match(refreshService, /resolveUniqueEpisodeRangeCandidate/);
  assert.match(refreshService, /movePlaybackProgress\(tx/);
  assert.match(refreshService, /sourceEpisode\.airedAt == null/);
  assert.match(refreshService, /tx\.delete\(episodes\)/);
});

test("season refresh serializes Chinese synopsis fallback lookups", () => {
  assert.match(refreshService, /scope === "season" \? 1 : 3/);
  assert.match(refreshService, /matchesRefreshQuarter/);
});
