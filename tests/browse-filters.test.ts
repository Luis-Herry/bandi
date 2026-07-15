import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const browseSource = readFileSync("src/app/(main)/browse/BrowseClient.tsx", "utf8");
const browsePageSource = readFileSync("src/app/(main)/browse/page.tsx", "utf8");
const browseHelperSource = readFileSync("src/lib/db-helpers/browse.ts", "utf8");
const browseSeasonRouteSource = readFileSync(
  "src/app/api/browse/season/route.ts",
  "utf8",
);
const browseLoadingSource = readFileSync("src/app/(main)/browse/loading.tsx", "utf8");

test("browse region filters only expose Japan and China", () => {
  const match = browseSource.match(/const REGION_VOCAB = \[([\s\S]*?)\];/);
  assert.ok(match);
  const regions = [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);

  assert.deepEqual(regions, ["日本", "中国"]);
});

test("browse quarters use month labels and expose a Bangumi-style year filter", () => {
  assert.match(browsePageSource, /const VALID_SEASONS: BgmSeason\[\] = \["WINTER", "SPRING", "SUMMER", "FALL"\]/);
  assert.match(browsePageSource, /const YEAR_OPTION_COUNT = 10/);
  assert.match(browsePageSource, /const quarters = VALID_SEASONS\.map\(\(season\) => \(\{ season, year \}\)\)/);
  assert.match(browsePageSource, /buildYearOptions\(now\.year, year\)/);
  assert.match(browseSource, /const SEASON_START_MONTH: Record<BgmSeason, number>/);
  assert.match(browseSource, /WINTER: 1/);
  assert.match(browseSource, /SPRING: 4/);
  assert.match(browseSource, /SUMMER: 7/);
  assert.match(browseSource, /FALL: 10/);
  assert.match(browseSource, /formatQuarterLabel\(q\.year, q\.season\)/);
  assert.match(browseSource, /return `\$\{year\}年\$\{SEASON_START_MONTH\[season\]\}月`/);
  assert.match(browseSource, />\s*年份\s*</);
  assert.match(browseSource, /yearOptions\.map/);
  assert.match(browseSource, /\{option\}年/);
  assert.match(browseSource, /params\.set\("year", String\(nextYear\)\)/);
  assert.doesNotMatch(browseSource, /本季/);
  assert.doesNotMatch(browseSource, /SEASON_CN/);
  assert.match(browseLoadingSource, /年份 \+ 4 行 chip \+ 搜索/);
});

test("browse quarter tabs use a full-width divider and fit four quarters on phones", () => {
  assert.match(
    browseSource,
    /mb-6 border-b border-\[color:var\(--border-subtle\)\]/,
  );
  assert.match(
    browseSource,
    /no-scrollbar grid w-full grid-cols-4 items-center gap-0 overflow-visible touch-pan-y sm:flex sm:max-w-full sm:min-w-0 sm:gap-1 sm:overflow-x-auto sm:touch-pan-x/,
  );
  assert.match(
    browseSource,
    /relative h-10 min-w-0 px-1 text-center text-\[12px\][^"]*sm:shrink-0 sm:px-4 sm:text-\[13px\]/,
  );
  assert.doesNotMatch(
    browseSource,
    /overflow-x-auto border-b border-\[color:var\(--border-subtle\)\]/,
  );
  assert.match(
    browseLoadingSource,
    /no-scrollbar grid w-full grid-cols-4 items-center gap-1 overflow-visible pb-2 touch-pan-y sm:flex sm:max-w-full sm:min-w-0 sm:gap-3 sm:overflow-x-auto sm:touch-pan-x/,
  );
});

test("browse uses YUC as the primary quarterly source and keeps a local fallback", () => {
  assert.match(browsePageSource, /getSeasonalBrowseResult/);
  assert.doesNotMatch(browseHelperSource, /getSubjectsBySeason/);
  assert.match(browseHelperSource, /buildSeasonalBrowseItems\(\s*userId,\s*\[\]/);
  assert.match(browseHelperSource, /getLocalSeasonalBrowseFallback/);
  assert.match(browseHelperSource, /getYucEntriesForQuarter/);
  assert.match(browsePageSource, /dataStatus=\{dataStatus\}/);
  assert.match(browseSource, /dataStatus: "fresh" \| "fallback" \| "unavailable"/);
  assert.match(browseSource, /数据来源 长门番堂/);
  assert.match(browseSource, /长门番堂暂时无法更新/);
  assert.match(browseSource, /本地也没有这个季度的数据/);
  assert.doesNotMatch(browseSource, /Bangumi 暂时连接失败/);
});

test("browse keeps rating controls visible and progressively enriches Bangumi scores", () => {
  assert.match(browseSource, /const scoredCount = filteredItems\.filter/);
  assert.match(browseSource, /const hasScores = scoredCount > 0/);
  assert.doesNotMatch(browseSource, /\{hasScores && \(/);
  assert.match(browseSource, /mode: "scores"/);
  assert.match(browseSource, /评分加载中/);
  assert.match(browseSource, /需连接 Bangumi/);
  assert.match(browseSource, /当前结果暂无评分/);
  assert.match(browseSource, /部有评分/);
  assert.match(
    browseSource,
    /role="status"[\s\S]*?className="whitespace-nowrap text-\[11px\]/,
  );
  assert.doesNotMatch(browseSource, /min-w-\[84px\]/);
  assert.match(browseSource, /bangumiId: scorePatch\?\.bangumiId \?\? it\.bangumiId/);
  assert.match(browseSource, /disabled=\{!hasScores\}/);
  assert.match(browseSeasonRouteSource, /getSubjectsBySeason\(season, yearRaw\)/);
  assert.match(browseSeasonRouteSource, /getYucEntriesForQuarter\(yearRaw, season\)/);
  assert.match(browseSeasonRouteSource, /optional Bangumi scores unavailable/);
});

test("browse local fallback infers season from year-month tags", () => {
  assert.match(browseHelperSource, /tagsMatchSeason/);
  assert.match(browseHelperSource, /monthToBgmSeason/);
  assert.match(browseHelperSource, /\\d\{4\}.*年.*\\d\{1,2\}.*月/);
  assert.match(browseHelperSource, /eq\(anime\.year, year\)/);
});

test("browse cards use card-sized Bangumi covers from seasonal data", () => {
  assert.match(
    browseHelperSource,
    /selectBangumiImageByRole\(subject\.images, "card"\)/,
  );
  assert.doesNotMatch(
    browseHelperSource,
    /s\.images\?\.large \?\? s\.images\?\.common \?\? s\.images\?\.medium/,
  );
});
