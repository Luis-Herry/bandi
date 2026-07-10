import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const globalsSource = readFileSync("src/app/globals.css", "utf8");
const uiExportsSource = readFileSync("src/components/ui/index.ts", "utf8");
const searchCommandSource = readFileSync(
  "src/components/features/SearchCommand.tsx",
  "utf8",
);
const cinemaScanSource = readFileSync(
  "src/components/features/CinemaScanButton.tsx",
  "utf8",
);
const automationSettingsSource = readFileSync(
  "src/components/features/AutomationSettingsClient.tsx",
  "utf8",
);
const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");
const browseSource = readFileSync(
  "src/app/(main)/browse/BrowseClient.tsx",
  "utf8",
);
const statsSource = readFileSync("src/app/(main)/stats/page.tsx", "utf8");

test("transition utilities expose the selected motion recipes", () => {
  assert.match(globalsSource, /--resize-dur/);
  assert.match(globalsSource, /--page-slide-dur/);
  assert.match(globalsSource, /--shimmer-dur/);
  assert.match(globalsSource, /--stagger-dur/);
  assert.match(globalsSource, /@keyframes t-shimmer/);
  assert.match(globalsSource, /\.t-resize/);
  assert.match(globalsSource, /\.t-page-slide/);
  assert.match(globalsSource, /\.t-shimmer::before/);
  assert.match(globalsSource, /\.t-badge\s*\{[^}]*display:\s*inline-flex/);
  assert.match(globalsSource, /\.t-badge\s*\{[^}]*height:\s*16px/);
  assert.match(globalsSource, /\.t-badge\s*\{[^}]*line-height:\s*1/);
  assert.match(globalsSource, /\.t-stagger-line/);
  assert.doesNotMatch(
    globalsSource,
    /\.t-stagger-line\s*\{[^}]*display:\s*block/,
  );
  assert.match(uiExportsSource, /export \{ ShimmerText \}/);
  assert.match(uiExportsSource, /export \{ ResizePanel \}/);
  assert.match(
    globalsSource,
    /\.desktop-titlebar-window-button\s*\{[^}]*var\(--duration-quick\)[^}]*var\(--ease-default\)/s,
  );
});

test("search dialog uses side-by-side page motion and long-wait shimmer copy", () => {
  assert.match(searchCommandSource, /function renderSearchResultsPage/);
  assert.match(searchCommandSource, /function renderRecommendationsPage/);
  assert.match(searchCommandSource, /className="t-page-slide"/);
  assert.match(searchCommandSource, /data-page=\{searchPageId\}/);
  assert.match(searchCommandSource, /<ShimmerText text="正在搜索" \/>/);
  assert.match(searchCommandSource, /<ShimmerText text="正在整理推荐" \/>/);
  assert.match(searchCommandSource, /t-stagger is-shown px-6 py-10 text-center/);
});

test("scan panel and save flows keep motion on long or height-changing states", () => {
  assert.match(cinemaScanSource, /<ResizePanel innerClassName="space-y-2">/);
  assert.match(cinemaScanSource, /<ShimmerText text="扫描中" \/>/);
  assert.match(automationSettingsSource, /<ShimmerText text="加载 RSS 源中/);
  assert.match(automationSettingsSource, /<ShimmerText text="加载下载偏好中/);
  assert.match(automationSettingsSource, /<ShimmerText text="检测下载服务中/);
  assert.match(automationSettingsSource, /shimmer=\{saving\}/);
});

test("page title and empty states use restrained text reveal", () => {
  assert.match(homeSource, /t-stagger is-shown/);
  assert.match(homeSource, /t-stagger-line t-stagger-line--1 flex items-center/);
  assert.match(browseSource, /t-stagger-line t-stagger-line--1 text-\[34px\]/);
  assert.match(browseSource, /GlassPanel className="t-stagger is-shown p-10 text-center"/);
  assert.match(statsSource, /t-stagger is-shown min-w-0/);
  assert.match(statsSource, /t-stagger-line t-stagger-line--2 mt-2/);
});
