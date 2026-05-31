import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/* ===== users ===== */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/* ===== anime ===== */

export const anime = sqliteTable(
  "anime",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bangumiId: integer("bangumi_id").unique(),
    anilistId: integer("anilist_id"),
    title: text("title").notNull(),
    titleJa: text("title_ja"),
    coverUrl: text("cover_url"),
    synopsis: text("synopsis"),
    type: text("type", { enum: ["TV", "Movie", "OVA", "Web"] }).notNull(),
    status: text("status", { enum: ["airing", "completed", "upcoming"] })
      .notNull()
      .default("airing"),
    totalEpisodes: integer("total_episodes"),
    airingDay: integer("airing_day"), // 0..6 (Sun..Sat), nullable
    airingTime: text("airing_time"),   // "HH:mm", nullable
    season: text("season", {
      enum: ["winter", "spring", "summer", "fall"],
    }),
    year: integer("year"),
    tags: text("tags", { mode: "json" }).$type<string[]>(),
    accentColor: text("accent_color"), // 缓存提取色，#rrggbb
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("anime_status_idx").on(t.status)],
);

/* ===== userAnime ===== */

export const userAnime = sqliteTable(
  "user_anime",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    animeId: integer("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    watchStatus: text("watch_status", {
      enum: ["watching", "planning", "completed", "onhold", "dropped"],
    })
      .notNull()
      .default("watching"),
    currentEpisode: integer("current_episode").notNull().default(0),
    rating: integer("rating"), // 0.5..5
    notes: text("notes"),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("user_anime_user_anime_idx").on(t.userId, t.animeId),
  ],
);

/* ===== episodes ===== */

export const episodes = sqliteTable(
  "episodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    animeId: integer("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title"),
    airedAt: integer("aired_at", { mode: "timestamp" }),
    isDownloaded: integer("is_downloaded", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [index("episodes_anime_number_idx").on(t.animeId, t.number)],
);

/* ===== watchEvents ===== */

export const watchEvents = sqliteTable(
  "watch_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    animeId: integer("anime_id")
      .notNull()
      .references(() => anime.id, { onDelete: "cascade" }),
    episodeId: integer("episode_id").references(() => episodes.id, {
      onDelete: "set null",
    }),
    episode: integer("episode").notNull(),
    action: text("action", { enum: ["watch", "unwatch"] }).notNull(),
    minutes: integer("minutes").notNull(),
    watchedAt: integer("watched_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("watch_events_user_watched_at_idx").on(t.userId, t.watchedAt),
    index("watch_events_anime_episode_idx").on(t.animeId, t.episode),
  ],
);

/* ===== rssSources ===== */

export interface RssFilters {
  keywords?: string[];
  quality?: string; // 1080p / 720p / ...
  group?: string;   // 发布组
}

export const rssSources = sqliteTable("rss_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  filters: text("filters", { mode: "json" }).$type<RssFilters>(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/* ===== downloadQueue ===== */

export const downloadQueue = sqliteTable("download_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  animeId: integer("anime_id").references(() => anime.id, {
    onDelete: "set null",
  }),
  episodeId: integer("episode_id").references(() => episodes.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  magnetUrl: text("magnet_url").notNull(),
  status: text("status", {
    enum: ["pending", "downloading", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
  progress: integer("progress").notNull().default(0), // 0..100
  speed: text("speed"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/* ===== appSettings ===== */
/**
 * 通用 KV 配置表。
 * 当前用途：存放下载偏好（key="download_preferences"）。
 * 之后若要加任何全局/单用户级偏好都走这里，不再单独建表。
 */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/* ===== type helpers ===== */

export type User = typeof users.$inferSelect;
export type Anime = typeof anime.$inferSelect;
export type UserAnime = typeof userAnime.$inferSelect;
export type Episode = typeof episodes.$inferSelect;
export type WatchEvent = typeof watchEvents.$inferSelect;
export type RssSource = typeof rssSources.$inferSelect;
export type DownloadItem = typeof downloadQueue.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
