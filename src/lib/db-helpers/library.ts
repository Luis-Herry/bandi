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
import { currentSeason, type BgmSeason } from "@/lib/bangumi";
import {
  getCompletionEpisodeNumber,
  getWatchedThroughEpisodeNumber,
  type WatchStatus,
} from "@/lib/watch-progress";
import {
  selectContinueEpisode,
  selectHeroEpisodeAvailability,
} from "@/lib/continue-watching";

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
  const episodeNumbersByAnime = new Map<number, number[]>();
  for (const e of epRows) {
    const list = episodeNumbersByAnime.get(e.animeId) ?? [];
    list.push(e.number);
    episodeNumbersByAnime.set(e.animeId, list);
  }
  const watchedThroughByAnime = new Map<number, number>();
  for (const r of rows) {
    const completionEpisode = getCompletionEpisodeNumber({
      totalEpisodes: r.a.totalEpisodes,
      episodeNumbers: episodeNumbersByAnime.get(r.a.id) ?? [],
    });
    watchedThroughByAnime.set(
      r.a.id,
      getWatchedThroughEpisodeNumber({
        currentEpisode: r.ua.currentEpisode,
        watchStatus: r.ua.watchStatus as WatchStatus,
        completionEpisode,
      }),
    );
  }
  const airedByAnime = new Map<number, number>();
  const watchedAiredByAnime = new Map<number, number>();
  for (const e of epRows) {
    if (e.airedAt && e.airedAt.getTime() <= now) {
      airedByAnime.set(e.animeId, (airedByAnime.get(e.animeId) ?? 0) + 1);
      if (e.number <= (watchedThroughByAnime.get(e.animeId) ?? 0)) {
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
  latestPlaybackProgress: typeof playbackProgress.$inferSelect | null;
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
  const latestPlayback =
    db
      .select()
      .from(playbackProgress)
      .where(
        and(
          eq(playbackProgress.userId, userId),
          eq(playbackProgress.animeId, animeId),
        ),
      )
      .orderBy(desc(playbackProgress.lastPlayedAt))
      .get() ?? null;
  const highestEpisodeNumber = eps.reduce(
    (highest, episode) => Math.max(highest, episode.number),
    0,
  );
  const displayTotalEpisodes =
    eps.length === 0
      ? a.totalEpisodes
      : a.mediaType === "anime"
        ? eps.length
        : Math.max(a.totalEpisodes ?? 0, highestEpisodeNumber);
  const displayAnime =
    a.totalEpisodes !== displayTotalEpisodes
      ? { ...a, totalEpisodes: displayTotalEpisodes }
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
    latestPlaybackProgress: latestPlayback,
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
    .select({
      animeId: userAnime.animeId,
      current: userAnime.currentEpisode,
      watchStatus: userAnime.watchStatus,
    })
    .from(userAnime)
    .innerJoin(anime, eq(userAnime.animeId, anime.id))
    .where(and(eq(userAnime.userId, userId), eq(anime.mediaType, "anime")))
    .all();
  const animeIds = userRows.map((r) => r.animeId);
  if (animeIds.length === 0) return [];

  const progressByAnime = new Map(
    userRows.map((r) => [
      r.animeId,
      { current: r.current, watchStatus: r.watchStatus as WatchStatus },
    ]),
  );

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
  const episodeNumbersByAnime = new Map<number, number[]>();
  for (const r of eps) {
    const list = episodeNumbersByAnime.get(r.a.id) ?? [];
    list.push(r.ep.number);
    episodeNumbersByAnime.set(r.a.id, list);
  }
  const watchedThroughByAnime = new Map<number, number>();
  for (const r of eps) {
    if (watchedThroughByAnime.has(r.a.id)) continue;
    const progress = progressByAnime.get(r.a.id);
    if (!progress) continue;
    watchedThroughByAnime.set(
      r.a.id,
      getWatchedThroughEpisodeNumber({
        currentEpisode: progress.current,
        watchStatus: progress.watchStatus,
        completionEpisode: getCompletionEpisodeNumber({
          totalEpisodes: r.a.totalEpisodes,
          episodeNumbers: episodeNumbersByAnime.get(r.a.id) ?? [],
        }),
      }),
    );
  }

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
        watched: (watchedThroughByAnime.get(r.a.id) ?? 0) >= r.ep.number,
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

interface ProgressEpisode {
  id: number;
  animeId: number;
  number: number;
  airedAt: Date | null;
  isDownloaded: boolean;
}

function groupEpisodesForProgress(
  rows: Array<{
    id: number;
    animeId: number;
    number: number;
    airedAt: Date | null;
  }>,
  downloadedEpisodeIds: Set<number>,
): Map<number, ProgressEpisode[]> {
  const grouped = new Map<number, ProgressEpisode[]>();
  for (const row of rows) {
    const list = grouped.get(row.animeId) ?? [];
    list.push({
      ...row,
      isDownloaded: downloadedEpisodeIds.has(row.id),
    });
    grouped.set(row.animeId, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.number - b.number);
  }
  return grouped;
}

export interface ContinueWatching {
  anime: Anime;
  userAnime: UserAnime;
  airedCount: number;
  watchedAiredCount: number;
  watchedThroughEpisode: number;
  continueEpisodeNumber: number;
  playbackEpisodeNumber: number | null;
  playbackPositionSeconds: number | null;
  playbackDurationSeconds: number | null;
  playbackCompleted: boolean;
  hasIncompletePlayback: boolean;
}

/** Currently watching, sorted by recently updated. */
export function getContinueWatching(userId: string, limit = 4): ContinueWatching[] {
  const lib = getLibrary(userId).filter(
    (it) => it.userAnime.watchStatus === "watching",
  );
  if (lib.length === 0) return [];

  const animeIds = lib.map((it) => it.anime.id);
  const episodeRows = db
    .select({
      id: episodes.id,
      animeId: episodes.animeId,
      number: episodes.number,
      airedAt: episodes.airedAt,
    })
    .from(episodes)
    .where(inArray(episodes.animeId, animeIds))
    .all();
  const downloadedEpisodeIds = getCompletedDownloadEpisodeIds(
    episodeRows.map((row) => row.id),
  );
  const episodesByAnime = groupEpisodesForProgress(
    episodeRows,
    downloadedEpisodeIds,
  );

  const progressRows = db
    .select()
    .from(playbackProgress)
    .where(
      and(
        eq(playbackProgress.userId, userId),
        inArray(playbackProgress.animeId, animeIds),
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
      const animeEpisodes = episodesByAnime.get(it.anime.id) ?? [];
      const completionEpisode = getCompletionEpisodeNumber({
        totalEpisodes: it.anime.totalEpisodes,
        episodeNumbers: animeEpisodes.map((episode) => episode.number),
      });
      const watchedThroughEpisode = getWatchedThroughEpisodeNumber({
        currentEpisode: it.userAnime.currentEpisode,
        watchStatus: it.userAnime.watchStatus as WatchStatus,
        completionEpisode,
      });
      const effectiveWatchedThrough =
        progress?.completed && progress.episodeNumber > watchedThroughEpisode
          ? progress.episodeNumber
          : watchedThroughEpisode;
      const continueSelection = selectContinueEpisode({
        watchedThroughEpisode: effectiveWatchedThrough,
        episodes: animeEpisodes,
        playbackProgress: progress,
      });
      const hasIncompletePlayback =
        continueSelection.source === "incomplete-playback";
      const continueEpisodeNumber = continueSelection.episodeNumber;

      return {
        ...it,
        watchedThroughEpisode: effectiveWatchedThrough,
        continueEpisodeNumber,
        playbackEpisodeNumber: progress?.episodeNumber ?? null,
        playbackPositionSeconds: progress?.positionSeconds ?? null,
        playbackDurationSeconds: progress?.durationSeconds ?? null,
        playbackCompleted: progress?.completed ?? false,
        hasIncompletePlayback,
      };
    })
    .filter((it): it is ContinueWatching => it.continueEpisodeNumber != null)
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
  const episodeNumbersByAnime = new Map<number, number[]>();
  const airedByAnime = new Map<
    number,
    { number: number; aired: number; isDownloaded: boolean }[]
  >();
  for (const e of eps) {
    const numbers = episodeNumbersByAnime.get(e.animeId) ?? [];
    numbers.push(e.number);
    episodeNumbersByAnime.set(e.animeId, numbers);
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
    const completionEpisode = getCompletionEpisodeNumber({
      totalEpisodes: it.anime.totalEpisodes,
      episodeNumbers: episodeNumbersByAnime.get(it.anime.id) ?? [],
    });
    const watchedThroughEpisode = getWatchedThroughEpisodeNumber({
      currentEpisode: it.userAnime.currentEpisode,
      watchStatus: it.userAnime.watchStatus as WatchStatus,
      completionEpisode,
    });
    const missed = (airedByAnime.get(it.anime.id) ?? [])
      .filter((episode) => episode.number > watchedThroughEpisode)
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

export interface HeroCandidate extends LibraryItem {
  watchedThroughEpisode: number;
  latestAiredEpisode: number | null;
  continueEpisodeNumber: number | null;
  sourceEpisodeNumber: number | null;
  nextAiringEpisodeNumber: number | null;
  nextAiringAt: Date | null;
}

/** For the hero carousel — current-season tracked titles, even when caught up. */
export function getHeroCandidates(
  userId: string,
  limit?: number,
): HeroCandidate[] {
  const tracked = getLibrary(userId).filter(
    (it) =>
      it.userAnime.watchStatus !== "dropped" && it.anime.status !== "completed",
  );
  if (tracked.length === 0) return [];

  const trackedAnimeIds = tracked.map((it) => it.anime.id);
  const episodeRows = db
    .select({
      id: episodes.id,
      animeId: episodes.animeId,
      number: episodes.number,
      airedAt: episodes.airedAt,
    })
    .from(episodes)
    .where(inArray(episodes.animeId, trackedAnimeIds))
    .all();
  const downloadedEpisodeIds = getCompletedDownloadEpisodeIds(
    episodeRows.map((row) => row.id),
  );
  const episodesByAnime = groupEpisodesForProgress(
    episodeRows,
    downloadedEpisodeIds,
  );
  const lib = tracked.filter((it) =>
    isCurrentSeasonTrackedAnime(it.anime, episodesByAnime.get(it.anime.id) ?? []),
  );
  if (lib.length === 0) return [];

  const animeIds = lib.map((it) => it.anime.id);

  const progressRows = db
    .select()
    .from(playbackProgress)
    .where(
      and(
        eq(playbackProgress.userId, userId),
        inArray(playbackProgress.animeId, animeIds),
      ),
    )
    .orderBy(desc(playbackProgress.lastPlayedAt))
    .all();
  const latestProgressByAnime = new Map<number, (typeof progressRows)[number]>();
  for (const progress of progressRows) {
    if (latestProgressByAnime.has(progress.animeId)) continue;
    latestProgressByAnime.set(progress.animeId, progress);
  }

  const now = Date.now();
  const candidates = lib
    .map((it) => {
      const animeEpisodes = episodesByAnime.get(it.anime.id) ?? [];
      const completionEpisode = getCompletionEpisodeNumber({
        totalEpisodes: it.anime.totalEpisodes,
        episodeNumbers: animeEpisodes.map((episode) => episode.number),
      });
      const progress = latestProgressByAnime.get(it.anime.id);
      const watchedThroughEpisode = getWatchedThroughEpisodeNumber({
        currentEpisode: it.userAnime.currentEpisode,
        watchStatus: it.userAnime.watchStatus as WatchStatus,
        completionEpisode,
      });
      const effectiveWatchedThrough =
        progress?.completed && progress.episodeNumber > watchedThroughEpisode
          ? progress.episodeNumber
          : watchedThroughEpisode;
      const airedEpisodes = animeEpisodes
        .filter(
          (episode) => episode.airedAt && episode.airedAt.getTime() <= now,
        )
        .sort((a, b) => a.number - b.number);
      const latestAiredEpisode =
        airedEpisodes.length > 0
          ? airedEpisodes[airedEpisodes.length - 1]!.number
          : null;
      const continueSelection = selectContinueEpisode({
        watchedThroughEpisode: effectiveWatchedThrough,
        episodes: animeEpisodes,
        playbackProgress: progress,
        now: new Date(now),
      });
      const episodeAvailability = selectHeroEpisodeAvailability({
        watchedThroughEpisode: effectiveWatchedThrough,
        episodes: animeEpisodes,
        now: new Date(now),
      });

      return {
        ...it,
        watchedThroughEpisode: effectiveWatchedThrough,
        latestAiredEpisode,
        continueEpisodeNumber: continueSelection.episodeNumber,
        sourceEpisodeNumber: episodeAvailability.sourceEpisodeNumber,
        nextAiringEpisodeNumber:
          episodeAvailability.nextAiringEpisodeNumber,
        nextAiringAt: episodeAvailability.nextAiringAt,
      };
    })
    .sort((a, b) => {
      const actionDelta = getHeroActionPriority(b) - getHeroActionPriority(a);
      if (actionDelta !== 0) return actionDelta;
      return b.userAnime.updatedAt.getTime() - a.userAnime.updatedAt.getTime();
    });

  return Number.isFinite(limit) ? candidates.slice(0, limit) : candidates;
}

function getHeroActionPriority(candidate: HeroCandidate) {
  if (candidate.continueEpisodeNumber != null) return 3;
  if (candidate.sourceEpisodeNumber != null) return 2;
  if (candidate.nextAiringAt != null) return 1;
  return 0;
}

const LOCAL_SEASON_BY_BGM_SEASON: Record<
  BgmSeason,
  "winter" | "spring" | "summer" | "fall"
> = {
  WINTER: "winter",
  SPRING: "spring",
  SUMMER: "summer",
  FALL: "fall",
};

function isCurrentSeasonTrackedAnime(a: Anime, animeEpisodes: ProgressEpisode[]) {
  if (a.status === "completed") return false;

  const season = currentSeason();
  const localSeason = LOCAL_SEASON_BY_BGM_SEASON[season.season];
  if (a.year === season.year && a.season === localSeason) return true;
  if (tagsMatchCurrentSeason(a.tags, season.season, season.year)) return true;
  if (episodesMatchCurrentSeason(animeEpisodes, season.season, season.year)) {
    return true;
  }

  return false;
}

function tagsMatchCurrentSeason(
  tags: string[] | null | undefined,
  season: BgmSeason,
  year: number,
) {
  for (const tag of tags ?? []) {
    const match = /^(\d{4})年(\d{1,2})月$/.exec(tag);
    if (!match) continue;
    const tagYear = Number(match[1]);
    const tagMonth = Number(match[2]);
    if (tagYear === year && monthToBgmSeason(tagMonth) === season) return true;
  }
  return false;
}

function monthToBgmSeason(month: number): BgmSeason {
  if (month <= 3) return "WINTER";
  if (month <= 6) return "SPRING";
  if (month <= 9) return "SUMMER";
  return "FALL";
}

const SEASON_START_MONTH_INDEX: Record<BgmSeason, number> = {
  WINTER: 0,
  SPRING: 3,
  SUMMER: 6,
  FALL: 9,
};

function episodesMatchCurrentSeason(
  animeEpisodes: ProgressEpisode[],
  season: BgmSeason,
  year: number,
) {
  const startMonth = SEASON_START_MONTH_INDEX[season];
  const start = new Date(year, startMonth, 1).getTime();
  const end =
    season === "FALL"
      ? new Date(year + 1, 0, 1).getTime()
      : new Date(year, startMonth + 3, 1).getTime();

  return animeEpisodes.some((episode) => {
    const time = episode.airedAt?.getTime();
    return time != null && time >= start && time < end;
  });
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
