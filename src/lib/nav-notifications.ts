import {
  getMissedUpdates,
  getTodayUpdates,
  getUpcomingEpisodes,
} from "@/lib/db-helpers/library";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";

export type NavNotificationTone = "alert" | "accent" | "muted";

export interface NavNotificationItem {
  id: string;
  tone: NavNotificationTone;
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
  const seen = new Set<string>();
  const items: NavNotificationItem[] = [];

  for (const item of missed) {
    const key = `${item.anime.id}-${item.latestAiredEpisode}`;
    seen.add(key);
    items.push({
      id: `missed-${key}`,
      tone: "alert",
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
      countsAsUnread: true,
      isRead: false,
      title: "今日更新",
      description: `《${item.anime.title}》${ep(item.episode.number)} 今天可看${item.episode.isDownloaded ? "，本地已下载" : ""}`,
      href: `/anime/${item.anime.id}`,
      actionLabel: item.episode.isDownloaded ? "去播放" : "找资源",
    });
  }

  for (const item of upcoming) {
    const key = `${item.anime.id}-${item.episode.number}`;
    if (seen.has(key)) continue;
    items.push({
      id: `upcoming-${key}`,
      tone: "muted",
      countsAsUnread: false,
      isRead: false,
      title: "即将更新",
      description: `《${item.anime.title}》${weekdayLabel(item.episode.airedAt ?? new Date())}更新 ${ep(item.episode.number)}`,
      href: `/anime/${item.anime.id}`,
      actionLabel: "查看排期",
    });
  }

  return items;
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
