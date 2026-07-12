import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const routeSource = readFileSync(
  "src/app/api/anime/search/recommendations/route.ts",
  "utf8",
);
const searchCommandSource = readFileSync(
  "src/components/features/SearchCommand.tsx",
  "utf8",
);

test("search recommendations use current-season Japanese top-rated Bangumi picks", () => {
  assert.match(routeSource, /const season = currentSeason\(\)/);
  assert.match(routeSource, /getSeasonalBrowse\(user\.id, season\.season, season\.year\)/);
  assert.match(routeSource, /const POPULAR_LIMIT = 4/);
  assert.match(routeSource, /selectJapaneseSeasonalTopRated\(seasonal\)/);
  assert.match(routeSource, /item\.score != null/);
  assert.match(routeSource, /item\.score > 0/);
  assert.match(routeSource, /item\.tags\.includes\("日本"\)/);
  assert.match(routeSource, /\.sort\(\(a, b\) => \(b\.score \?\? 0\) - \(a\.score \?\? 0\)\)/);
  assert.match(routeSource, /if \(popular\.length >= POPULAR_LIMIT\) break/);
  assert.match(routeSource, /meta: `Bangumi \$\{item\.score!\.toFixed\(1\)\}`/);
  assert.doesNotMatch(routeSource, /本季热门/);
  assert.match(searchCommandSource, /title: "本季日本高分"/);
  assert.doesNotMatch(searchCommandSource, /title: "Bangumi 热门"/);
});

test("search fallback uses thumbnail Bangumi covers for compact results", () => {
  const searchSource = readFileSync("src/lib/search.ts", "utf8");

  assert.match(searchSource, /selectBangumiImageByRole\(r\.images, "thumb"\)/);
  assert.doesNotMatch(searchSource, /r\.images\?\.large \?\? r\.images\?\.common/);
});

test("local search hits route cinema entries directly to cinema detail", () => {
  const searchSource = readFileSync("src/lib/search.ts", "utf8");

  assert.match(searchSource, /mediaType:\s*animeTable\.mediaType/);
  assert.match(searchSource, /mediaType:\s*row\.mediaType/);
  assert.match(searchCommandSource, /mediaType:\s*"anime" \| "drama" \| "movie"/);
  assert.match(
    searchCommandSource,
    /hit\.mediaType === "anime" \? `\/anime\/\$\{hit\.id\}` : `\/cinema\/\$\{hit\.id\}`/,
  );
  assert.doesNotMatch(searchCommandSource, /router\.push\(`\/anime\/\$\{hit\.id\}`\)/);
});

test("remote search keeps loading feedback attached to the selected result", () => {
  assert.match(searchCommandSource, /function searchHitKey\(hit: SearchHit\)/);
  assert.match(searchCommandSource, /setOpeningKey\(searchHitKey\(hit\)\)/);
  assert.match(searchCommandSource, /busy=\{openingKey === searchHitKey\(hit\)\}/);
  assert.match(searchCommandSource, /locked=\{openingKey != null\}/);
  assert.doesNotMatch(searchCommandSource, /adding && i === active/);
});
