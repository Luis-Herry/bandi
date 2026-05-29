import {
  getMissedUpdates,
  getTodayUpdates,
  getUpcomingEpisodes,
} from "@/lib/db-helpers/library";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { anime, appSettings, downloadQueue } from "@/db/schema";

export type NavNotificationTone =
  | "alert"
  | "accent"
  | "muted"
  | "success"
  | "danger";
export type NavNotificationIcon =
  | "alert"
  | "calendar"
  | "download"
  | "offline"
  | "success";

export interface NavNotificationItem {
  id: string;
  tone: NavNotificationTone;
  icon: NavNotificationIcon;
  countsAsUnread: boolean;
  isRead: boolean;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
}

export interface NavNotificationSummary {
  unreadCount: number;
  items: NavNotificationItem[];
}

export const EMPTY_NAV_NOTIFICATIONS: NavNotificationSummary = {
  unreadCount: 0,
  items: [],
};

interface NavNotificationReadStore {
  version: 1;
  ids: string[];
}

const READ_STORE_PREFIX = "nav_notifications_read:";
const MAX_READ_IDS = 500;
const MAX_ID_LENGTH = 120;
const DOWNLOADS_HREF = "/admin/downloads";
const DOWNLOAD_NOTIFICATION_LIMIT = 3;

type DownloadStatus = "pending" | "downloading" | "completed" | "failed";

function ep(number: number) {
  return `EP.${String(number).padStart(2, "0")}`;
}

function weekdayLabel(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 1) return "明天";
  if (diffDays === 2) return "后天";
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
    target.getDay()
  ];
}

export function getNavNotifications(
  userId: string,
  limit = 5,
): NavNotificationSummary {
  const readIds = new Set(getReadNotificationIds(userId));
  const items = buildNavNotificationItems(userId).map((item) => ({
    ...item,
    isRead: readIds.has(item.id),
  }));

  return {
    unreadCount: items.filter((item) => item.countsAsUnread && !item.isRead)
      .length,
    items: items.slice(0, limit),
  };
}

export function getReadNotificationIds(userId: string): string[] {
  return readStoreFor(userId).ids;
}

export function getUnreadNavNotificationIds(userId: string): string[] {
  const readIds = new Set(getReadNotificationIds(userId));
  return buildNavNotificationItems(userId)
    .filter((item) => item.countsAsUnread && !readIds.has(item.id))
    .map((item) => item.id);
}

export function getCurrentNavNotificationIds(userId: string): string[] {
  return buildNavNotificationItems(userId).map((item) => item.id);
}

export function markNavNotificationsRead(userId: string, ids: unknown): string[] {
  const nextIds = normalizeNotificationIds(ids);
  if (nextIds.length === 0) return getReadNotificationIds(userId);

  const current = getReadNotificationIds(userId);
  const merged = normalizeNotificationIds([...nextIds, ...current]).slice(
    0,
    MAX_READ_IDS,
  );
  writeReadStore(userId, { version: 1, ids: merged });
  return merged;
}

function buildNavNotificationItems(userId: string): NavNotificationItem[] {
  const missed = getMissedUpdates(userId, 20);
  const today = getTodayUpdates(userId).filter((item) => !item.watched);
  const upcoming = getUpcomingEpisodes(userId, 7);
  const downloadItems = getDownloadNotificationItems();
  const downloadAlerts = downloadItems.filter((item) => item.tone === "danger");
  const downloadCompleted = downloadItems.filter(
    (item) => item.title === "下载完成",
  );
  const downloadPassive = downloadItems.filter(
    (item) => item.tone !== "danger" && item.title !== "下载完成",
  );
  const seen = new Set<string>();
  const items: NavNotificationItem[] = [...downloadAlerts];

  for (const item of missed) {
    const key = `${item.anime.id}-${item.latestAiredEpisode}`;
    seen.add(key);
    items.push({
      id: `missed-${key}`,
      tone: "alert",
      icon: "alert",
      countsAsUnread: true,
      isRead: false,
      title: "有新集待看",
      description: `《${item.anime.title}》已更新到 ${ep(item.latestAiredEpisode)}，当前看到 ${ep(item.userAnime.currentEpisode)}`,
      href: `/anime/${item.anime.id}`,
      actionLabel: item.latestEpisodeIsDownloaded ? "播放或找资源" : "查看详情",
    });
  }

  for (const item of today) {
    const key = `${item.anime.id}-${item.episode.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `today-${key}`,
      tone: "accent",
      icon: "download",
      countsAsUnread: true,
      isRead: false,
      title: "今日更新",
      description: `《${item.anime.title}》${ep(item.episode.number)} 今天可看${item.episode.isDownloaded ? "，本地已下载" : ""}`,
      href: `/anime/${item.anime.id}`,
      actionLabel: item.episode.isDownloaded ? "去播放" : "找资源",
    });
  }

  items.push(...downloadCompleted);

  for (const item of upcoming) {
    const key = `${item.anime.id}-${item.episode.number}`;
    if (seen.has(key)) continue;
    items.push({
      id: `upcoming-${key}`,
      tone: "muted",
      icon: "calendar",
      countsAsUnread: false,
      isRead: false,
      title: "即将更新",
      description: `《${item.anime.title}》${weekdayLabel(item.episode.airedAt ?? new Date())}更新 ${ep(item.episode.number)}`,
      href: `/anime/${item.anime.id}`,
      actionLabel: "查看排期",
    });
  }

  items.push(...downloadPassive);

  return items;
}

function getDownloadNotificationItems(): NavNotificationItem[] {
  const rows = db
    .select({
      id: downloadQueue.id,
      title: downloadQueue.title,
      status: downloadQueue.status,
      progress: downloadQueue.progress,
      errorMessage: downloadQueue.errorMessage,
      updatedAt: downloadQueue.updatedAt,
      animeTitle: anime.title,
    })
    .from(downloadQueue)
    .leftJoin(anime, eq(downloadQueue.animeId, anime.id))
    .orderBy(desc(downloadQueue.updatedAt))
    .limit(8)
    .all();

  return rows
    .map((row) =>
      downloadRowToNotification({
        ...row,
        status: row.status as DownloadStatus,
      }),
    )
    .filter((item): item is NavNotificationItem => item !== null)
    .slice(0, DOWNLOAD_NOTIFICATION_LIMIT);
}

function downloadRowToNotification(row: {
  id: number;
  title: string;
  status: DownloadStatus;
  progress: number;
  errorMessage: string | null;
  updatedAt: Date | number | null;
  animeTitle: string | null;
}): NavNotificationItem | null {
  const subject = row.animeTitle ? `《${row.animeTitle}》` : row.title;
  const release = row.animeTitle ? `：${row.title}` : "";
  const timeKey = notificationTimeKey(row.updatedAt);

  if (row.status === "completed") {
    return {
      id: `download-completed-${row.id}-${timeKey}`,
      tone: "success",
      icon: "success",
      countsAsUnread: true,
      isRead: false,
      title: "下载完成",
      description: `${subject} 下载完成${release}`,
      href: DOWNLOADS_HREF,
      actionLabel: "查看下载",
    };
  }

  if (row.status === "failed") {
    const interrupted = isQbitConnectionError(row.errorMessage);
    return {
      id: `download-failed-${row.id}-${timeKey}`,
      tone: "danger",
      icon: interrupted ? "offline" : "alert",
      countsAsUnread: true,
      isRead: false,
      title: interrupted ? "下载连接中断" : "下载失败",
      description: `${subject} ${interrupted ? "连接 qBittorrent 失败" : "下载失败"}${row.errorMessage ? `：${qbitErrorLabel(row.errorMessage)}` : ""}`,
      href: DOWNLOADS_HREF,
      actionLabel: "查看下载",
    };
  }

  if (row.status === "downloading") {
    return {
      id: `download-active-${row.id}`,
      tone: "accent",
      icon: "download",
      countsAsUnread: false,
      isRead: false,
      title: "下载中",
      description: `${subject} 下载进度 ${row.progress}%`,
      href: DOWNLOADS_HREF,
      actionLabel: "查看进度",
    };
  }

  if (row.status === "pending") {
    return {
      id: `download-pending-${row.id}`,
      tone: "muted",
      icon: "download",
      countsAsUnread: false,
      isRead: false,
      title: "等待下载",
      description: `${subject} 正在等待推送到 qBittorrent`,
      href: DOWNLOADS_HREF,
      actionLabel: "查看队列",
    };
  }

  return null;
}

function isQbitConnectionError(error: string | null): boolean {
  if (!error) return false;
  return (
    error === "webui_unreachable" ||
    error === "qbit_add_failed" ||
    error.startsWith("auth_") ||
    error.startsWith("auth_http_") ||
    error.startsWith("http_")
  );
}

function qbitErrorLabel(error: string): string {
  if (error === "webui_unreachable") return "Web UI 无法连接";
  if (error === "auth_failed" || error === "auth_cookie_missing") {
    return "认证失败";
  }
  if (error.startsWith("auth_http_")) return "认证接口异常";
  if (error.startsWith("http_")) return "接口异常";
  if (error === "qbit_add_failed") return "推送失败";
  return error;
}

function notificationTimeKey(value: Date | number | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

function readStoreFor(userId: string): NavNotificationReadStore {
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, readStoreKey(userId)))
    .get();
  const value = row?.value;
  if (!value || typeof value !== "object") return { version: 1, ids: [] };

  const raw = value as Partial<NavNotificationReadStore>;
  return {
    version: 1,
    ids: normalizeNotificationIds(raw.ids).slice(0, MAX_READ_IDS),
  };
}

function writeReadStore(userId: string, store: NavNotificationReadStore) {
  db.insert(appSettings)
    .values({
      key: readStoreKey(userId),
      value: store,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: store,
        updatedAt: sql`(unixepoch())`,
      },
    })
    .run();
}

function readStoreKey(userId: string) {
  return `${READ_STORE_PREFIX}${userId}`;
}

function normalizeNotificationIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of ids) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!id || id.length > MAX_ID_LENGTH || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}
