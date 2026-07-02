import {
  sqliteTable,
  text,
  integer,
  real,
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

/**
 * "在哪看"缓存（看剧 / 电影模块）。来源 TMDB watch-providers + JustWatch，
 * 流媒体只做标记 + deep link 跳转，不代为分发内容。
 */
export interface WatchProviderEntry {
  providerId: number;
  providerName: string; // 映射后中文名：爱奇艺 / 腾讯视频 / 优酷 / 芒果TV ...
  type: "flatrate" | "rent" | "buy" | "free" | "ads";
  logoPath?: string;
  /** 平台播放链接（来源豆瓣 vendors 时有；douban:// 小程序链接会被过滤掉只留 http(s)） */
  url?: string;
}

export interface WatchProvidersCache {
  region: string; // "CN" / "US" / "TW" ...
  link?: string; // TMDB 返回的 JustWatch deep link
  providers: WatchProviderEntry[];
  fetchedAt: number; // unix 秒
}

/**
 * 读 `anime.watchProviders` 的向后兼容归一化。
 *
 * 历史行存的是单个 `WatchProvidersCache`（单区，region=CN，豆瓣 vendors）；
 * 「在哪看」双线改造后存数组 `[国内豆瓣(CN), 海外TMDb(US/TW...)]`。读取一律归一成
 * 数组：旧单对象包成单元素数组，空值给空数组。**不改磁盘数据、不需 SQL 迁移**
 * （JSON 字段只改形状）。所有读 watchProviders 的地方都走这里。
 */
export function normalizeWatchProviders(
  raw: WatchProvidersCache | WatchProvidersCache[] | null | undefined,
): WatchProvidersCache[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

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
    // ===== 看剧 / 电影模块（mediaType 改造）=====
    // 品类：与 type（TV/Movie/OVA/Web，格式）正交。anime 默认值回填现有行。
    mediaType: text("media_type", {
      enum: ["anime", "drama", "movie"],
    })
      .notNull()
      .default("anime"),
    tmdbId: integer("tmdb_id"), // TMDB 外部 id
    doubanId: text("douban_id"), // 豆瓣条目 id
    imdbId: text("imdb_id"), // IMDB id（tt...），供豆瓣中文名交叉匹配
    tmdbRating: real("tmdb_rating"), // TMDB 评分（豆瓣兜底）
    doubanRating: real("douban_rating"), // 豆瓣评分缓存（锦上添花，不强依赖）
    doubanRatingFetchedAt: integer("douban_rating_fetched_at", {
      mode: "timestamp",
    }), // 豆瓣评分抓取时间戳，过期再刷
    watchProviders: text("watch_providers", {
      mode: "json",
    }).$type<WatchProvidersCache | WatchProvidersCache[]>(), // "在哪看"缓存（双线：[国内豆瓣, 海外TMDb]；旧行为单对象，读取用 normalizeWatchProviders 归一）
    // 成人内容标记（真人番号片 + 成人动漫 OVA）。独立成人分区据此查询，
    // 主 cinema 本地库 / 影视库 / 刮削队列都按 isAdult=false 排除，避免混入。
    isAdult: integer("is_adult", { mode: "boolean" }).notNull().default(false),
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

/* ===== playbackProgress ===== */

export const playbackProgress = sqliteTable(
  "playback_progress",
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
    episodeNumber: integer("episode_number").notNull(),
    positionSeconds: integer("position_seconds").notNull().default(0),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    completed: integer("completed", { mode: "boolean" })
      .notNull()
      .default(false),
    lastPlayedAt: integer("last_played_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("playback_progress_user_episode_idx").on(
      t.userId,
      t.animeId,
      t.episodeId,
    ),
    index("playback_progress_user_recent_idx").on(t.userId, t.lastPlayedAt),
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
export type PlaybackProgress = typeof playbackProgress.$inferSelect;
export type RssSource = typeof rssSources.$inferSelect;
export type DownloadItem = typeof downloadQueue.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
