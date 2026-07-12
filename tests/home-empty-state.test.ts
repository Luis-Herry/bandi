import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("empty home points primary CTA to browse and opens search as secondary action", () => {
  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");
  const searchButtonSource = readFileSync(
    "src/components/features/SearchOpenButton.tsx",
    "utf8",
  );
  const searchCommandSource = readFileSync(
    "src/components/features/SearchCommand.tsx",
    "utf8",
  );
  const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");

  assert.match(homeSource, /<a href="\/browse">前往番剧库<\/a>/);
  assert.doesNotMatch(homeSource, /<a href="\/library">前往追番库<\/a>/);
  assert.match(homeSource, /<SearchOpenButton \/>/);
  assert.match(searchButtonSource, /variant="secondary"/);
  assert.match(searchButtonSource, /bandi:open-search/);
  assert.match(searchCommandSource, /bandi:open-search/);
  assert.match(navSource, /bandi:open-search/);
  assert.match(homeSource, /Ctrl K/);
  assert.doesNotMatch(homeSource, /⌘K/);
});

test("empty home capability copy reflects the current product structure", () => {
  const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");

  assert.match(homeSource, /在番剧库发现本季新番/);
  assert.match(homeSource, /今日更新、漏看提醒和继续观看/);
  assert.match(homeSource, /扫描本地动画和影视文件/);
  assert.match(homeSource, /RSS 找源和下载管理/);
  assert.doesNotMatch(homeSource, /自动从 Bangumi\/AniList 同步集数与放送日期/);
  assert.doesNotMatch(homeSource, /配置 RSS 自动下载到 qBittorrent/);
});
