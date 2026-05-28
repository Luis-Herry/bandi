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
const seasonalSource = readFileSync(
  "src/components/features/SeasonalBrowseWeekday.tsx",
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

test("home responsive layout collapses dense grids before they overflow", () => {
  assert.doesNotMatch(globalsSource, /min-width:\s*1280px/);
  assert.doesNotMatch(heroSource, /break-words/);
  assert.match(heroSource, /text-balance/);
  assert.match(heroSource, /lg:items-center lg:justify-between/);
  assert.match(heroSource, /lg:flex/);
  assert.match(homeSource, /grid-cols-1 lg:grid-cols-12/);
  assert.match(homeSource, /col-span-1 lg:col-span-7/);
  assert.match(homeSource, /col-span-1 lg:col-span-5/);
  assert.match(todaySource, /grid-cols-1 sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(seasonalSource, /max\(156px, calc/);
  assert.match(rowItemSource, /flex-wrap sm:flex-nowrap/);
  assert.match(loadingSource, /grid-cols-1 sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(loadingSource, /grid-cols-1 lg:grid-cols-12/);
});
