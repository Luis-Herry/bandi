import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const browseSource = readFileSync("src/app/(main)/browse/BrowseClient.tsx", "utf8");
const browsePageSource = readFileSync("src/app/(main)/browse/page.tsx", "utf8");
const browseHelperSource = readFileSync("src/lib/db-helpers/browse.ts", "utf8");

test("browse region filters only expose Japan and China", () => {
  const match = browseSource.match(/const REGION_VOCAB = \[([\s\S]*?)\];/);
  assert.ok(match);
  const regions = [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);

  assert.deepEqual(regions, ["日本", "中国"]);
});

test("browse distinguishes Bangumi outage from an empty season", () => {
  assert.match(browsePageSource, /isBangumiUnavailableError/);
  assert.match(browsePageSource, /getLocalSeasonalBrowseFallback/);
  assert.match(browsePageSource, /dataStatus=\{dataStatus\}/);
  assert.match(browseSource, /dataStatus: "fresh" \| "fallback" \| "unavailable"/);
  assert.match(browseSource, /Bangumi 暂时连接失败/);
  assert.match(browseSource, /显示本地已有数据/);
  assert.match(browseSource, /本地也没有这个季度的数据/);
});

test("browse local fallback infers season from year-month tags", () => {
  assert.match(browseHelperSource, /tagsMatchSeason/);
  assert.match(browseHelperSource, /monthToBgmSeason/);
  assert.match(browseHelperSource, /\\d\{4\}.*年.*\\d\{1,2\}.*月/);
  assert.match(browseHelperSource, /eq\(anime\.year, year\)/);
});
