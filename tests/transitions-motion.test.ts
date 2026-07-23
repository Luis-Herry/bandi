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
const pageHeaderSource = readFileSync(
  "src/components/features/PageHeader.tsx",
  "utf8",
);
const toastHostSource = readFileSync(
  "src/components/features/ToastHost.tsx",
  "utf8",
);
const motionSwitchSource = readFileSync(
  "src/components/ui/MotionSwitch.tsx",
  "utf8",
);
const spinningCounterSource = readFileSync(
  "src/components/ui/SpinningCounter.tsx",
  "utf8",
);
const subscriptionSource = readFileSync(
  "src/components/features/AnimeSubscriptionButton.tsx",
  "utf8",
);
const switchConsumerSources = [
  readFileSync("src/components/features/DesktopOnboarding.tsx", "utf8"),
  readFileSync("src/components/features/DesktopDownloadSettings.tsx", "utf8"),
  readFileSync("src/components/features/MatchRuleDialog.tsx", "utf8"),
  readFileSync("src/components/features/RssEditDialog.tsx", "utf8"),
  readFileSync(
    "src/app/(main)/player/[animeId]/[episode]/PlayerClient.tsx",
    "utf8",
  ),
].join("\n");

test("transition utilities expose the selected motion recipes", () => {
  assert.match(globalsSource, /--resize-dur/);
  assert.match(globalsSource, /--page-slide-dur/);
  assert.match(globalsSource, /--shimmer-dur/);
  assert.match(globalsSource, /--stagger-dur/);
  assert.match(globalsSource, /--toast-open/);
  assert.match(globalsSource, /--like-pop/);
  assert.match(globalsSource, /--learn-shift/);
  assert.match(globalsSource, /--reel-dur/);
  assert.match(globalsSource, /--toggle-dur/);
  assert.match(globalsSource, /@keyframes t-shimmer/);
  assert.match(globalsSource, /\.t-resize/);
  assert.match(globalsSource, /\.t-page-slide/);
  assert.match(globalsSource, /\.t-shimmer::before/);
  assert.match(globalsSource, /\.t-toast\.is-open/);
  assert.match(globalsSource, /\.t-like\[data-liked="true"\]/);
  assert.match(globalsSource, /\.t-learn:hover \.t-learn-chevron/);
  assert.match(globalsSource, /\.t-reel-strip/);
  assert.match(globalsSource, /\.t-toggle-thumb/);
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
  assert.match(uiExportsSource, /export \{ SpinningCounter \}/);
  assert.match(uiExportsSource, /export \{ MotionSwitch/);
  assert.match(
    globalsSource,
    /\.desktop-titlebar-window-button\s*\{[^}]*var\(--duration-quick\)[^}]*var\(--ease-default\)/s,
  );
});

test("toast remains mounted for its exit transition", () => {
  assert.match(toastHostSource, /className=\{cn\(\s*"t-toast"/);
  assert.match(toastHostSource, /open && "is-open"/);
  assert.match(toastHostSource, /readToastCloseDuration\(\)/);
  assert.match(toastHostSource, /TOAST_VISIBLE_MS \+ readToastCloseDuration\(\)/);
  assert.doesNotMatch(toastHostSource, /toast-slide-in/);
  assert.doesNotMatch(globalsSource, /@keyframes toast-slide-in/);
});

test("settings and player switches share the spring toggle recipe", () => {
  assert.match(motionSwitchSource, /data-on=\{checked \? "true" : "false"\}/);
  assert.match(motionSwitchSource, /initialized && "is-init"/);
  assert.equal(
    (switchConsumerSources.match(/<MotionSwitch/g) ?? []).length,
    6,
  );
  assert.doesNotMatch(switchConsumerSources, /<Switch\.Root/);
  assert.doesNotMatch(switchConsumerSources, /<Switch\.Thumb/);
});

test("subscription and static links use restrained confirmation motion", () => {
  assert.match(subscriptionSource, /className="t-like-heart"/);
  assert.match(subscriptionSource, /data-liked="true"/);
  assert.match(subscriptionSource, /likeAnimating && "is-like-animating"/);
  assert.doesNotMatch(subscriptionSource, /t-like-particles/);
  assert.equal((homeSource.match(/className="t-learn /g) ?? []).length, 2);
  assert.match(homeSource, /t-learn-arm-top/);
  assert.match(homeSource, /t-learn-arm-bot/);
});

test("annual KPI cards use spinning counters with vertical SVG blur", () => {
  assert.match(spinningCounterSource, /<feGaussianBlur/);
  assert.match(spinningCounterSource, /--reel-spin-blur/);
  assert.match(spinningCounterSource, /stdDeviation", `0 \$\{amount/);
  assert.match(statsSource, /<SpinningCounter value=\{value\} \/>/);
  assert.match(
    statsSource,
    /<NumberPop value=\{report\.overview\.activeDays\} dirY=\{-1\} \/>/,
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
  assert.match(statsSource, /<PageHeader/);
  assert.match(pageHeaderSource, /t-stagger is-shown min-w-0/);
  assert.match(pageHeaderSource, /t-stagger-line t-stagger-line--2 mt-2/);
});
