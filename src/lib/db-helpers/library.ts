/**
 * Server-side read helpers for "我的追番" / 详情页 / 首页 信息流.
 *
 * All functions assume the seed schema. They return plain JSON-friendly
 * objects so server components can pass them straight to client children.
 *
 * NOTE: builder-1 owns mutation API routes. These helpers only READ.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  anime,
  downloadQueue,
  episodes,
  playbackProgress,
  userAnime,
  type Anime,
  type Episode,
  type UserAnime,
} from "@/db/schema";
import {
  applyCompletedDownloadState,
  getCompletedDownloadEpisodeIds,
} from "@/lib/download-cleanup";
import { dedupeEpisodesByNumber } from "@/lib/episode-normalize";
import { getLocalLibraryAnimeIds } from "@/lib/cinema-import";

export interface LibraryItem {
  anime: Anime;
  userAnime: UserAnime;
  airedCount: number;
  watchedAiredCount: number;
}

/**
 * All `userAnime` rows for a user, joined with anime + an aired-count.
 *
 * 只返回 mediaType='anime' 的追踪记录——影视（drama/movie）的个人维度走
 * 影视个人维度（本地库 / 清单），两边互不污染。所有调用方（我的追番列表、首页
 * 今日更新/继续观看/漏看/本季 feed）都只关心动漫，过滤在这里收口。
 */
export function getLibrary(userId: string): LibraryItem[] {
  const rows = db
    .select({
      ua: userAnime,
      a: anime,
    })
    .from(userAnime)
    .innerJoin(anime, eq(userAnime.animeId, anime.id))
    .where(and(eq(userAnime.userId, userId), eq(anime.mediaType, "anime")))
    .orderBy(desc(userAnime.updatedAt))
    .all();

  if (rows.length === 0) return [];

  const animeIds = rows.map((r) => r.a.id);
  const epRows = db
    .select({
      animeId: episodes.animeId,
      number: episodes.number,
      airedAt: episodes.airedAt,
    })
    .from(episodes)
    .where(inArray(episodes.animeId, animeIds))
    .all();

  const now = Date.now();
  const currentByAnime = new Map(
    rows.map((r) => [r.a.id, r.ua.currentEpisode]),
  );
  const airedByAnime = new Map<number, number>();
  const watchedAiredByAnime = new Map<number, number>();
  for (const e of epRows) {
    if (e.airedAt && e.airedAt.getTime() <= now) {
      airedByAnime.set(e.animeId, (airedByAnime.get(e.animeId) ?? 0) + 1);
      if (e.number <= (currentByAnime.get(e.animeId) ?? 0)) {
        watchedAiredByAnime.set(
          e.animeId,
          (watchedAiredByAnime.get(e.animeId) ?? 0) + 1,
        );
      }
    }
  }

  return rows.map((r) => ({
    anime: r.a,
    userAnime: r.ua,
    airedCount: airedByAnime.get(r.a.id) ?? 0,
    watchedAiredCount: watchedAiredByAnime.get(r.a.id) ?? 0,
  }));
}

/** Counts grouped by watch_status, plus a total. */
export function getLibraryStats(userId: string) {
  const items = getLibrary(userId);
  const stats = {
    total: items.length,
    watching: 0,
    planning: 0,
    completed: 0,
    onhold: 0,
    dropped: 0,
    seasonal: 0, // currently-airing rows the user is watching
  };
  for (const it of items) {
    stats[it.userAnime.watchStatus] += 1;
    if (
      it.userAnime.watchStatus === "watching" &&
      it.anime.status === "airing"
    ) {
      stats.seasonal += 1;
    }
  }
  return stats;
}

export interface AnimeDetail {
  anime: Anime;
  userAnime: UserAnime | null;
  episodes: Episode[];
  /** 该番剧在下载队列中已完成（status='completed'）的条目数 */
  completedDownloads: number;
  /** 该番剧在下载队列中所有状态的条目数 */
  totalDownloads: number;
}

export function getAnimeDetail(
  animeId: number,
  userId: string,
): AnimeDetail | null {
  const a = db.select().from(anime).where(eq(anime.id, animeId)).get();
  if (!a) return null;
  const ua =
    db
      .select()
      .from(userAnime)
      .where(and(eq(userAnime.userId, userId), eq(userAnime.animeId, animeId)))
      .get() ?? null;
  const storedEpisodes = db
    .select()
    .from(episodes)
    .where(eq(episodes.animeId, animeId))
    .orderBy(asc(episodes.number))
    .all();
  const eps = applyCompletedDownloadState(
    dedupeEpisodesByNumber(storedEpisodes),
  );
  const displayAnime =
    eps.length > 0 && a.totalEpisodes !== eps.length
      ? { ...a, totalEpisodes: eps.length }
      : a;

  const dlCounts = db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`sum(case when ${downloadQueue.status} = 'completed' then 1 else 0 end)`,
    })
    .from(downloadQueue)
    .where(eq(downloadQueue.animeId, animeId))
    .get();

  return {
    anime: displayAnime,
    userAnime: ua,
    episodes: eps,
    completedDownloads: Number(dlCounts?.completed ?? 0),
    totalDownloads: Number(dlCounts?.total ?? 0),
  };
}

/* ─── Home feed helpers ─────────────────────────────────────── */

export interface TodayUpdate {
  anime: Anime;
  episode: Episode;
  seasonEpisodeNumber: number;
  seasonEpisodeTotal: number | null;
  watched: boolean;
}

/** Episodes whose airedAt falls within today (local date). */
export function getTodayUpdates(userId: string): TodayUpdate[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const userRows = db
    .select({ animeId: userAnime.animeId, current: userAnime.currentEpisode })
    .from(userAnime)
    .innerJoin(anime, eq(userAnime.animeId, anime.id))
    .where(and(eq(userAnime.userId, userId), eq(anime.mediaType, "anime")))
    .all();
  const animeIds = userRows.map((r) => r.animeId);
  if (animeIds.length === 0) return [];

  const currentByAnime = new Map(userRows.map((r) => [r.animeId, r.current]));

  const eps = db
    .select({
      ep: episodes,
      a: anime,
    })
    .from(episodes)
    .innerJoin(anime, eq(episodes.animeId, anime.id))
    .where(inArray(episodes.animeId, animeIds))
    .all();
  const downloadedEpisodeIds = getCompletedDownloadEpisodeIds(
    eps.map((r) => r.ep.id),
  );
  const seasonEpisodeMeta = buildSeasonEpisodeMeta(
    eps.map((r) => r.ep),
    new Map(eps.map((r) => [r.a.id, r.a.totalEpisodes])),
  );

  return eps
    .filter(
      (r) =>
        r.ep.airedAt &&
        r.ep.airedAt.getTime() >= start.getTime() &&
        r.ep.airedAt.getTime() < end.getTime(),
    )
    .map((r) => {
      const meta = seasonEpisodeMeta.get(r.ep.id);
      return {
        anime: r.a,
        episode: {
          ...r.ep,
          isDownloaded: downloadedEpisodeIds.has(r.ep.id),
        },
        seasonEpisodeNumber: meta?.number ?? r.ep.number,
        seasonEpisodeTotal: meta?.total ?? r.a.totalEpisodes,
        watched: (currentByAnime.get(r.a.id) ?? 0) >= r.ep.number,
      };
    });
}

export interface UpcomingEpisode {
  anime: Anime;
  episode: Episode;
  seasonEpisodeNumber: number;
  seasonEpisodeTotal: number | null;
}

/**
 * 未来 N 天内（不含今天）即将更新的 episode。
 * 用作"今日更新"今天没货时的兜底视图。
 */
export function getUpcomingEpisodes(
  userId: string,
  days = 7,
): UpcomingEpisode[] {
  const userRows = db
    .select({ animeId: userAnime.animeId })
    .from(userAnime)
    .innerJoin(anime, eq(userAnime.animeId, anime.id))
    .where(and(eq(userAnime.userId, userId), eq(anime.mediaType, "anime")))
    .all();
  const animeIds = userRows.map((r) => r.animeId);
  if (animeIds.length === 0) return [];

  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const end = new Date(tomorrow);
  end.setDate(end.getDate() + days);

  const rows = db
    .select({ ep: episodes, a: anime })
    .from(episodes)
    .innerJoin(anime, eq(episodes.animeId, anime.id))
    .where(inArray(episodes.animeId, animeIds))
    .all();
  const seasonEpisodeMeta = buildSeasonEpisodeMeta(
    rows.map((r) => r.ep),
    new Map(rows.map((r) => [r.a.id, r.a.totalEpisodes])),
  );

  return rows
    .filter(
      (r) =>
        r.ep.airedAt &&
        r.ep.airedAt.getTime() >= tomorrow.getTime() &&
        r.ep.airedAt.getTime() < end.getTime(),
    )
    .sort((a, b) => a.ep.airedAt!.getTime() - b.ep.airedAt!.getTime())
    .map((r) => {
      const meta = seasonEpisodeMeta.get(r.ep.id);
      return {
        anime: r.a,
        episode: r.ep,
        seasonEpisodeNumber: meta?.number ?? r.ep.number,
        seasonEpisodeTotal: meta?.total ?? r.a.totalEpisodes,
      };
    });
}

function buildSeasonEpisodeMeta(
  rows: Episode[],
  totalByAnime: Map<number, number | null>,
): Map<number, { number: number; total: number | null }> {
  const grouped = new Map<number, Episode[]>();
  for (const row of rows) {
    const list = grouped.get(row.animeId) ?? [];
    list.push(row);
    grouped.set(row.animeId, list);
  }

  const out = new Map<number, { number: number; total: number | null }>();
  for (const [animeId, list] of grouped) {
    const normalized = dedupeEpisodesByNumber(
      [...list].sort((a, b) => a.number - b.number),
    );
    const declaredTotal = totalByAnime.get(animeId);
    const total =
      declaredTotal && declaredTotal > 0 ? declaredTotal : normalized.length;
    normalized.forEach((row, index) => {
      out.set(row.id, {
        number: index + 1,
        total: total > 0 ? total : null,
      });
    });
  }
  return out;
}

export interface ContinueWatching {
  anime: Anime;
  userAnime: UserAnime;
  airedCount: number;
  watchedAiredCount: number;
  playbackEpisodeNumber: number | null;
  playbackPositionSeconds: number | null;
  playbackDurationSeconds: number | null;
  playbackCompleted: boolean;
}

/** Currently watching, sorted by recently updated. */
export function getContinueWatching(userId: string, limit = 4): ContinueWatching[] {
  const lib = getLibrary(userId).filter(
    (it) => it.userAnime.watchStatus === "watching",
  );
  if (lib.length === 0) return [];

  const progressRows = db
    .select()
    .from(playbackProgress)
    .where(
      and(
        eq(playbackProgress.userId, userId),
        inArray(playbackProgress.animeId, lib.map((it) => it.anime.id)),
      ),
    )
    .orderBy(desc(playbackProgress.lastPlayedAt))
    .all();
  const latestProgressByAnime = new Map<number, (typeof progressRows)[number]>();
  for (const progress of progressRows) {
    if (latestProgressByAnime.has(progress.animeId)) continue;
    latestProgressByAnime.set(progress.animeId, progress);
  }

  return lib
    .map((it) => {
      const progress = latestProgressByAnime.get(it.anime.id);
      return {
        ...it,
        playbackEpisodeNumber: progress?.episodeNumber ?? null,
        playbackPositionSeconds: progress?.positionSeconds ?? null,
        playbackDurationSeconds: progress?.durationSeconds ?? null,
        playbackCompleted: progress?.completed ?? false,
      };
    })
    .sort((a, b) => {
      const aTime =
        latestProgressByAnime.get(a.anime.id)?.lastPlayedAt?.getTime() ??
        a.userAnime.updatedAt.getTime();
      const bTime =
        latestProgressByAnime.get(b.anime.id)?.lastPlayedAt?.getTime() ??
        b.userAnime.updatedAt.getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}

export interface SeasonalByDay {
  day: number; // 0..6
  items: { anime: Anime; userAnime: UserAnime | null }[];
}

/**
 * 用户在追的（watching）番剧按更新日分组。
 *
 * airing_day 字段在 anime 表上长期为 null（syncFromBangumi 不写它），
 * 这里直接从 episodes.airedAt 实时派生：
 *   - 优先用下一集 upcoming 的 weekday（show 还在播）
 *   - 否则用过去 14 天内的最后一集（刚播完）
 *   - 都没有 → 视为这季不在播，剔除（避免完结番污染本季）
 */
export function getSeasonalByDay(userId: string): SeasonalByDay[] {
  const lib = getLibrary(userId).filter(
    (it) => it.userAnime.watchStatus === "watching",
  );
  const map = new Map<number, SeasonalByDay>();
  for (let d = 0; d < 7; d++) map.set(d, { day: d, items: [] });
  if (lib.length === 0) return Array.from(map.values());

  const animeIds = lib.map((it) => it.anime.id);
  const eps = db
    .select()
    .from(episodes)
    .where(inArray(episodes.animeId, animeIds))
    .all();

  const now = Date.now();
  const recentCutoff = now - 14 * 24 * 60 * 60 * 1000;

  // 对每部 anime 找出"代表性 episode"决定 weekday
  type Repr = { animeId: number; t: number };
  const upcomingFirst = new Map<number, Repr>(); // 最近的未来一集
  const recentLast = new Map<number, Repr>(); // 过去 14 天内最后一集
  for (const e of eps) {
    if (!e.airedAt) continue;
    const t = e.airedAt.getTime();
    if (t >= now) {
      const prev = upcomingFirst.get(e.animeId);
      if (!prev || t < prev.t) upcomingFirst.set(e.animeId, { animeId: e.animeId, t });
    } else if (t >= recentCutoff) {
      const prev = recentLast.get(e.animeId);
      if (!prev || t > prev.t) recentLast.set(e.animeId, { animeId: e.animeId, t });
    }
  }

  for (const it of lib) {
    const repr =
      upcomingFirst.get(it.anime.id) ?? recentLast.get(it.anime.id);
    if (!repr) continue; // 完结 / 没数据：不进本季
    const day = new Date(repr.t).getDay();
    map.get(day)!.items.push({ anime: it.anime, userAnime: it.userAnime });
  }
  return Array.from(map.values());
}

export interface MissedItem {
  anime: Anime;
  userAnime: UserAnime;
  missedCount: number;
  nextMissedEpisode: number;
  nextMissedEpisodeIsDownloaded: boolean;
  latestAiredEpisode: number;
  latestEpisodeIsDownloaded: boolean;
  daysSince: number;
}

/** Anime where airedCount > currentEpisode, sorted by most recently missed. */
export function getMissedUpdates(userId: string, limit = 4): MissedItem[] {
  const lib = getLibrary(userId).filter(
    (it) => it.userAnime.watchStatus === "watching",
  );
  if (lib.length === 0) return [];

  const animeIds = lib.map((it) => it.anime.id);
  const eps = db
    .select()
    .from(episodes)
    .where(inArray(episodes.animeId, animeIds))
    .all();
  const downloadedEpisodeIds = getCompletedDownloadEpisodeIds(
    eps.map((e) => e.id),
  );

  const now = Date.now();
  const airedByAnime = new Map<
    number,
    { number: number; aired: number; isDownloaded: boolean }[]
  >();
  for (const e of eps) {
    if (!e.airedAt) continue;
    const t = e.airedAt.getTime();
    if (t > now) continue;
    const list = airedByAnime.get(e.animeId) ?? [];
    list.push({
      number: e.number,
      aired: t,
      isDownloaded: downloadedEpisodeIds.has(e.id),
    });
    airedByAnime.set(e.animeId, list);
  }

  const out: MissedItem[] = [];
  for (const it of lib) {
    const missed = (airedByAnime.get(it.anime.id) ?? [])
      .filter((episode) => episode.number > it.userAnime.currentEpisode)
      .sort((a, b) => a.number - b.number);
    if (missed.length > 0) {
      const next = missed[0];
      const latest = missed[missed.length - 1];
      out.push({
        anime: it.anime,
        userAnime: it.userAnime,
        missedCount: missed.length,
        nextMissedEpisode: next.number,
        nextMissedEpisodeIsDownloaded: next.isDownloaded,
        latestAiredEpisode: latest.number,
        latestEpisodeIsDownloaded: latest.isDownloaded,
        daysSince: Math.max(
          0,
          Math.floor((now - latest.aired) / (24 * 60 * 60 * 1000)),
        ),
      });
    }
  }
  return out
    .sort((a, b) => a.daysSince - b.daysSince)
    .slice(0, limit);
}

/** For the hero carousel — pick a small set of currently-watching titles. */
export function getHeroCandidates(userId: string, limit = 4): LibraryItem[] {
  return getLibrary(userId)
    .filter((it) => it.userAnime.watchStatus === "watching")
    .slice(0, limit);
}

/* ─── 动漫本地库（番剧侧自有片，独立于追番）────────────────────── */

export interface LocalAnimeItem {
  anime: Anime;
  totalEpisodes: number;
  downloadedEpisodes: number;
  userAnime: UserAnime | null;
}

/**
 * 番剧侧「本地库」：mediaType=anime 且有本地自有片（local-file 完成记录）的条目。
 * 与「我的追番」（追的）、「番剧库」（发现新番）互不重叠；不要求加入追番即可播放。
 */
export function getAnimeLocalLibrary(userId: string): LocalAnimeItem[] {
  const localIds = [...getLocalLibraryAnimeIds()];
  if (localIds.length === 0) return [];
  const rows = db
    .select()
    .from(anime)
    .where(and(eq(anime.mediaType, "anime"), inArray(anime.id, localIds)))
    .orderBy(desc(anime.updatedAt))
    .all();
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const epRows = db
    .select({ animeId: episodes.animeId, isDownloaded: episodes.isDownloaded })
    .from(episodes)
    .where(inArray(episodes.animeId, ids))
    .all();
  const totalByAnime = new Map<number, number>();
  const dlByAnime = new Map<number, number>();
  for (const e of epRows) {
    totalByAnime.set(e.animeId, (totalByAnime.get(e.animeId) ?? 0) + 1);
    if (e.isDownloaded)
      dlByAnime.set(e.animeId, (dlByAnime.get(e.animeId) ?? 0) + 1);
  }
  const uaRows = db
    .select()
    .from(userAnime)
    .where(and(eq(userAnime.userId, userId), inArray(userAnime.animeId, ids)))
    .all();
  const uaByAnime = new Map(uaRows.map((u) => [u.animeId, u]));

  return rows.map((a) => ({
    anime: a,
    totalEpisodes: totalByAnime.get(a.id) ?? 0,
    downloadedEpisodes: dlByAnime.get(a.id) ?? 0,
    userAnime: uaByAnime.get(a.id) ?? null,
  }));
}
