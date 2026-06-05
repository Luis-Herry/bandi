import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");
const layoutSource = readFileSync("src/app/(main)/layout.tsx", "utf8");
const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");
const globalsSource = readFileSync("src/app/globals.css", "utf8");
const loadingSource = readFileSync("src/app/(main)/loading.tsx", "utf8");
const todaySource = readFileSync(
  "src/components/features/TodayOrUpcomingSection.tsx",
  "utf8",
);
const coverSource = readFileSync(
  "src/components/features/AnimeCover.tsx",
  "utf8",
);
const seasonalSource = readFileSync(
  "src/components/features/SeasonalBrowseWeekday.tsx",
  "utf8",
);
const browseCardSource = readFileSync(
  "src/components/features/BrowseCard.tsx",
  "utf8",
);
const seasonalStateSource = readFileSync(
  "src/lib/seasonal-update-state.ts",
  "utf8",
);
const rowItemSource = readFileSync(
  "src/components/features/AnimeRowItem.tsx",
  "utf8",
);
const heroSource = readFileSync("src/components/features/HomeHero.tsx", "utf8");
const notificationMenuPath = "src/components/features/NotificationMenu.tsx";
const notificationMenuSource = existsSync(notificationMenuPath)
  ? readFileSync(notificationMenuPath, "utf8")
  : "";
const notificationHelperPath = "src/lib/nav-notifications.ts";
const notificationHelperSource = existsSync(notificationHelperPath)
  ? readFileSync(notificationHelperPath, "utf8")
  : "";
const notificationReadRoutePath = "src/app/api/notifications/read/route.ts";
const notificationReadRouteSource = existsSync(notificationReadRoutePath)
  ? readFileSync(notificationReadRoutePath, "utf8")
  : "";

test("Nav notification button opens a real menu backed by home feed data", () => {
  assert.match(navSource, /NotificationMenu/);
  assert.match(navSource, /notifications: NavNotificationSummary/);
  assert.match(layoutSource, /getNavNotifications/);
  assert.match(layoutSource, /notifications=\{notifications\}/);
  assert.match(notificationHelperSource, /export function getNavNotifications/);
  assert.match(notificationHelperSource, /getMissedUpdates/);
  assert.match(notificationHelperSource, /nextMissedEpisode/);
  assert.match(notificationHelperSource, /nextMissedEpisodeIsDownloaded/);
  assert.match(notificationHelperSource, /missedAnimeIds/);
  assert.match(notificationHelperSource, /if \(missedAnimeIds\.has\(item\.anime\.id\)\) continue/);
  assert.match(notificationHelperSource, /getTodayUpdates/);
  assert.match(notificationHelperSource, /getUpcomingEpisodes/);
});

test("notification menu exposes unread count, item actions, and empty state", () => {
  assert.match(notificationMenuSource, /unreadCount/);
  assert.match(notificationMenuSource, /aria-label=\{`通知，\$\{unreadCount\} 条未读`\}/);
  assert.match(notificationMenuSource, /最新通知/);
  assert.match(notificationMenuSource, /暂无新通知/);
  assert.match(notificationMenuSource, /item\.actionLabel/);
});

test("notification menu can mark one item or every item as read", () => {
  assert.match(notificationMenuSource, /全部已读/);
  assert.match(notificationMenuSource, /markAllAsRead/);
  assert.match(notificationMenuSource, /markItemAsRead/);
  assert.match(notificationMenuSource, /item\.isRead/);
  assert.match(notificationHelperSource, /getReadNotificationIds/);
  assert.match(notificationHelperSource, /markNavNotificationsRead/);
  assert.match(notificationReadRouteSource, /markNavNotificationsRead/);
});

test("notifications include download queue status and qbit interruption signals", () => {
  assert.match(notificationHelperSource, /downloadQueue/);
  assert.match(notificationHelperSource, /getDownloadNotificationItems/);
  assert.match(notificationHelperSource, /下载完成/);
  assert.match(notificationHelperSource, /下载失败/);
  assert.match(notificationHelperSource, /下载连接中断/);
  assert.match(notificationHelperSource, /\/admin\/downloads/);
  assert.match(notificationHelperSource, /download-completed-/);
  assert.match(notificationHelperSource, /download-failed-/);
  assert.match(notificationMenuSource, /Download/);
  assert.match(notificationMenuSource, /WifiOff/);
  assert.match(notificationReadRouteSource, /getCurrentNavNotificationIds/);
});

test("home responsive layout collapses dense grids before they overflow", () => {
  assert.doesNotMatch(globalsSource, /min-width:\s*1280px/);
  assert.doesNotMatch(heroSource, /break-words/);
  assert.match(heroSource, /text-balance/);
  assert.match(heroSource, /lg:items-center lg:justify-between/);
  assert.match(heroSource, /lg:flex/);
  assert.match(heroSource, /-mt-16 lg:h-\[640px\]/);
  assert.match(layoutSource, /flex-1 pt-16/);
  assert.doesNotMatch(heroSource, /-mt-28/);
  assert.doesNotMatch(layoutSource, /pt-28/);
  assert.match(homeSource, /grid-cols-1 gap-6 lg:grid-cols-2/);
  assert.doesNotMatch(homeSource, /lg:col-span-7/);
  assert.doesNotMatch(homeSource, /lg:col-span-5/);
  assert.match(todaySource, /grid-cols-1 sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(todaySource, /seasonEpisodeNumber: number/);
  assert.match(todaySource, /currentEpisode=\{u\.seasonEpisodeNumber\}/);
  assert.doesNotMatch(todaySource, /currentEpisode=\{u\.episodeNumber\}/);
  assert.match(seasonalSource, /max\(156px, calc/);
  assert.match(rowItemSource, /flex-wrap sm:flex-nowrap/);
  assert.match(loadingSource, /grid-cols-1 sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(loadingSource, /grid-cols-1 gap-6 lg:grid-cols-2/);
});

test("Bangumi covers load directly after entering the viewport", () => {
  assert.match(coverSource, /bypassOptimization/);
  assert.match(coverSource, /lain\\.bgm\\.tv\|bangumi\\.tv/);
  assert.match(coverSource, /resizeBangumiImageUrl/);
  assert.match(coverSource, /imageRole = "card"/);
  assert.match(coverSource, /node\?\.complete && node\.naturalWidth > 0/);
  assert.match(coverSource, /referrerPolicy="no-referrer"/);
  assert.match(coverSource, /保持图片节点可见/);
  assert.match(coverSource, /IntersectionObserver/);
  assert.match(coverSource, /rootMargin: "600px 0px"/);
  assert.match(coverSource, /if \(!resolvedSrc \|\| !shouldLoad \|\| loaded \|\| failed\) return/);
  assert.match(coverSource, /bypassOptimization &&/);
  assert.match(coverSource, /<img/);
  assert.doesNotMatch(coverSource, /unoptimized=\{bypassOptimization\}/);
});

test("seasonal update state belongs to each anime card", () => {
  assert.doesNotMatch(homeSource, /SeasonalUpdateLegend/);
  assert.doesNotMatch(seasonalSource, /SeasonalUpdateLegend/);
  assert.match(homeSource, /attachSeasonalUpdateStates/);
  assert.match(seasonalStateSource, /applyCompletedDownloadState/);
  assert.match(seasonalStateSource, /targetDownloaded: latestAired\.isDownloaded/);
  assert.match(seasonalSource, /updateState=\{it\.updateState\}/);
  assert.match(browseCardSource, /updateState\?: SeasonalUpdateState/);
  assert.match(browseCardSource, /已更新/);
  assert.doesNotMatch(browseCardSource, /今天更新/);
  assert.match(browseCardSource, /即将更新/);
  assert.match(browseCardSource, /未更新/);
});
