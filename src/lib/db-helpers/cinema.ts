/**
 * 影视（看剧 / 电影）数据查询。
 *
 * 当前为骨架阶段：影视条目就是 `anime` 表里 `mediaType in (drama, movie)` 的行
 * （复用现有表，电影＝单集特例）。元数据 / 评分 / "在哪看" 由后续 tmdb.ts、
 * douban.ts 和本地库扫描填充，这里只负责把已有行读出来分组。
 *
 */

import { and, eq, inArray, desc, like } from "drizzle-orm";
import { db } from "@/db";
import {
  anime,
  downloadQueue,
  episodes,
  playbackProgress,
  userAnime,
  normalizeWatchProviders,
  type Anime,
  type Episode,
  type UserAnime,
  type WatchProvidersCache,
} from "@/db/schema";
import { getLocalLibraryAnimeIds } from "@/lib/cinema-import";
import { hasDoubanAnimationGenre } from "@/lib/douban";
import { extractJavCode } from "@/lib/jav";

type AnimeRow = typeof anime.$inferSelect;
export type CinemaWatchStatus = UserAnime["watchStatus"];

const SCRAPED_COVER_RE =
  /(?:dmm\.co\.jp|image\.tmdb\.org|img\d+\.doubanio\.com)/i;

// Temporary product gate: keep existing cinema rows intact, but hide the
// default non-adult local-library feed until it is ready to resurface.
export const CINEMA_LOCAL_DEFAULT_DATA_HIDDEN =
  process.env.CINEMA_LOCAL_DEFAULT_DATA_HIDDEN !== "0";

// 已成功刮到任一源的元数据（脏标题/没刮到的不展示）
function isScraped(row: AnimeRow): boolean {
  return (
    row.tmdbId != null ||
    row.doubanRating != null ||
    SCRAPED_COVER_RE.test(row.coverUrl ?? "")
  );
}

// 信息完整度打分，去重时保留最全的一条
function metaScore(row: AnimeRow): number {
  let s = 0;
  if (SCRAPED_COVER_RE.test(row.coverUrl ?? "")) s += 4;
  if (row.doubanRating != null || row.tmdbRating != null) s += 2;
  if (row.tmdbId != null) s += 1;
  if (row.titleJa) s += 1;
  return s;
}

// 去重键：同一番号 / 同一 tmdbId / 同一标题+年份 视为同一条
function dedupKey(row: AnimeRow): string {
  const code = extractJavCode(row.title ?? "");
  if (code) return `jav:${code}`;
  if (row.tmdbId != null) return `tmdb:${row.tmdbId}`;
  return `t:${(row.title ?? "").toLowerCase()}|${row.year ?? ""}`;
}

export type CinemaMediaType = "drama" | "movie";

export interface CinemaItem {
  id: number;
  title: string;
  titleJa: string | null;
  posterUrl: string | null;
  year: number | null;
  mediaType: CinemaMediaType;
  /** 优先豆瓣评分，回退 TMDB 评分（10 分制） */
  rating: number | null;
  ratingSource: "douban" | "tmdb" | null;
  /** "在哪合法看" 摘要标签，无数据时为 null */
  providerLabel: string | null;
  /** 本地是否已有自有片（本地库扫描接入后才有意义） */
  isLocal: boolean;
  /** 当前用户的追踪状态（想看/在看/…），未追踪为 null */
  watchStatus: CinemaWatchStatus | null;
  /** 题材标签（TMDB / 豆瓣 genres），影视库筛选用，可能为空 */
  tags: string[];
}

export interface CinemaLibrary {
  drama: CinemaItem[];
  movie: CinemaItem[];
}

// 「在哪看」双线汇总标签（卡片角标用）：CN 区优先（用户在国内，最可能直接点开），
// 再海外区；跨区按平台名去重。详情页才做「国内 / 海外」分组明示，卡片只给一句概览。
export function providerLabelOf(caches: WatchProvidersCache[]): string | null {
  const ordered = [...caches].sort(
    (a, b) => (a.region === "CN" ? 0 : 1) - (b.region === "CN" ? 0 : 1),
  );
  const names: string[] = [];
  const seen = new Set<string>();
  for (const cache of ordered) {
    for (const p of cache.providers) {
      const name = p.providerName?.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  if (names.length === 0) return null;
  const first = names[0];
  return names.length > 1
    ? `${first} 等 ${names.length} 个平台可看`
    : `${first} 可看`;
}

function toCinemaItem(
  row: typeof anime.$inferSelect,
  localAnimeIds: Set<number>,
  watchStatus: CinemaWatchStatus | null,
): CinemaItem {
  const rating = row.doubanRating ?? row.tmdbRating ?? null;
  const ratingSource =
    row.doubanRating != null ? "douban" : row.tmdbRating != null ? "tmdb" : null;
  return {
    id: row.id,
    title: row.title,
    titleJa: row.titleJa,
    posterUrl: row.coverUrl,
    year: row.year,
    mediaType: (row.mediaType === "movie" ? "movie" : "drama") as CinemaMediaType,
    rating,
    ratingSource,
    providerLabel: providerLabelOf(normalizeWatchProviders(row.watchProviders)),
    isLocal: localAnimeIds.has(row.id),
    watchStatus,
    tags: row.tags ?? [],
  };
}

/**
 * 全部已刮到元数据的影视条目（去重后），带上当前用户的追踪状态。
 * `getCinemaLibrary`（本地库，isLocal）与 `getCinemaWatchlist`（清单，非本地）共用它。
 */
function buildCinemaItems(userId: string): CinemaItem[] {
  const rows = db
    .select()
    .from(anime)
    .where(
      and(
        inArray(anime.mediaType, ["drama", "movie"]),
        eq(anime.isAdult, false),
      ),
    )
    .orderBy(desc(anime.updatedAt))
    .all();

  // 只展示已成功刮到元数据的条目（脏标题/未刮到的不再显示），并按番号/tmdbId/标题去重，
  // 同一条保留信息最全的那行（避免脏标题前缀不同被拆成多张重复卡）。
  const best = new Map<string, AnimeRow>();
  for (const row of rows) {
    if (!isScraped(row) || hasDoubanAnimationGenre(row.tags)) continue;
    const key = dedupKey(row);
    const cur = best.get(key);
    if (!cur || metaScore(row) > metaScore(cur)) best.set(key, row);
  }

  const picked = [...best.values()];
  const ids = picked.map((r) => r.id);
  const statusByAnime = new Map<number, CinemaWatchStatus>();
  if (ids.length > 0) {
    const statusRows = db
      .select({
        animeId: userAnime.animeId,
        watchStatus: userAnime.watchStatus,
      })
      .from(userAnime)
      .where(and(eq(userAnime.userId, userId), inArray(userAnime.animeId, ids)))
      .all();
    for (const r of statusRows) statusByAnime.set(r.animeId, r.watchStatus);
  }

  const localAnimeIds = getLocalLibraryAnimeIds();
  return picked.map((row) =>
    toCinemaItem(row, localAnimeIds, statusByAnime.get(row.id) ?? null),
  );
}

/**
 * 本地库：有本地自有片（`isLocal`）的影视，按品类分组，可直接播放。
 * 与「清单」按「有没有本地文件」二分，互不重叠。
 */
export function getCinemaLibrary(userId: string): CinemaLibrary {
  const items = buildCinemaItems(userId).filter((i) => i.isLocal);
  return {
    drama: items.filter((i) => i.mediaType === "drama"),
    movie: items.filter((i) => i.mediaType === "movie"),
  };
}

/**
 * 清单：没有本地文件、想看 / 在看的影视（watchlist + 在哪合法看）。
 * 演示剧（只有元数据没有文件）属于这里；真有了本地文件就会归到「本地库」。
 */
export function getCinemaWatchlist(userId: string): CinemaItem[] {
  return buildCinemaItems(userId).filter((i) => !i.isLocal);
}

export interface AdultLibrary {
  jav: CinemaItem[];
  ova: CinemaItem[];
}

/**
 * 成人分区：真人番号片 + 成人动漫 OVA（isAdult=1），独立于主 cinema 本地库/影视库。
 * 页内分「番号 / OVA」两组。番号片有 r18 封面，OVA 多为裸标题占位。
 * 不要求 isScraped——OVA 没刮到元数据也要能在分区里看到并播放。
 */
export function getAdultLibrary(userId: string): AdultLibrary {
  const rows = db
    .select()
    .from(anime)
    .where(eq(anime.isAdult, true))
    .orderBy(desc(anime.updatedAt))
    .all();

  // 同番号/同标题去重，保留信息最全的一行
  const best = new Map<string, AnimeRow>();
  for (const row of rows) {
    const key = dedupKey(row);
    const cur = best.get(key);
    if (!cur || metaScore(row) > metaScore(cur)) best.set(key, row);
  }
  const picked = [...best.values()];
  const ids = picked.map((r) => r.id);

  const statusByAnime = new Map<number, CinemaWatchStatus>();
  if (ids.length > 0) {
    const statusRows = db
      .select({
        animeId: userAnime.animeId,
        watchStatus: userAnime.watchStatus,
      })
      .from(userAnime)
      .where(and(eq(userAnime.userId, userId), inArray(userAnime.animeId, ids)))
      .all();
    for (const r of statusRows) statusByAnime.set(r.animeId, r.watchStatus);
  }

  const localAnimeIds = getLocalLibraryAnimeIds();
  const jav: CinemaItem[] = [];
  const ova: CinemaItem[] = [];
  for (const row of picked) {
    const item = toCinemaItem(row, localAnimeIds, statusByAnime.get(row.id) ?? null);
    (extractJavCode(row.title ?? "") ? jav : ova).push(item);
  }
  return { jav, ova };
}

/* ─── 影视追更 feed（独立于动漫首页 feed）────────────────────── */

export interface CinemaTodayUpdate {
  anime: Anime;
  episode: Episode;
  providerLabel: string | null;
  watched: boolean;
}

export interface CinemaUpcomingEpisode {
  anime: Anime;
  episode: Episode;
  providerLabel: string | null;
}

export interface CinemaMissedItem {
  anime: Anime;
  userAnime: UserAnime;
  providerLabel: string | null;
  missedCount: number;
  nextMissedEpisode: number;
  nextMissedEpisodeIsDownloaded: boolean;
  latestAiredEpisode: number;
  latestEpisodeIsDownloaded: boolean;
  daysSince: number;
}

function getTrackedCinemaRows(userId: string) {
  const rows = db
    .select({ ua: userAnime, a: anime })
    .from(userAnime)
    .innerJoin(anime, eq(userAnime.animeId, anime.id))
    .where(
      and(
        eq(userAnime.userId, userId),
        eq(userAnime.watchStatus, "watching"),
        eq(anime.mediaType, "drama"),
      ),
    )
    .all();
  if (!CINEMA_LOCAL_DEFAULT_DATA_HIDDEN) return rows;

  const localAnimeIds = getLocalLibraryAnimeIds();
  return rows.filter((row) => localAnimeIds.has(row.a.id));
}

function getLocalFileEpisodeIds(
  episodeIds: Array<number | null | undefined>,
): Set<number> {
  const ids = [
    ...new Set(
      episodeIds.filter(
        (id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0,
      ),
    ),
  ];
  if (ids.length === 0) return new Set();

  const rows = db
    .select({ episodeId: downloadQueue.episodeId })
    .from(downloadQueue)
    .where(
      and(
        inArray(downloadQueue.episodeId, ids),
        eq(downloadQueue.status, "completed"),
        like(downloadQueue.magnetUrl, "local-file:%"),
      ),
    )
    .all();

  return new Set(
    rows
      .map((row) => row.episodeId)
      .filter((id): id is number => typeof id === "number" && id > 0),
  );
}

function withLocalFileState(ep: Episode, localFileEpisodeIds: Set<number>): Episode {
  const isDownloaded = localFileEpisodeIds.has(ep.id);
  return ep.isDownloaded === isDownloaded ? ep : { ...ep, isDownloaded };
}

function readTrackedCinemaEpisodes(userId: string) {
  const tracked = getTrackedCinemaRows(userId);
  if (tracked.length === 0) {
    return {
      rows: [] as { ep: Episode; a: Anime; providerLabel: string | null }[],
      currentByAnime: new Map<number, number>(),
      userAnimeByAnime: new Map<number, UserAnime>(),
    };
  }

  const animeIds = tracked.map((row) => row.a.id);
  const currentByAnime = new Map(
    tracked.map((row) => [row.a.id, row.ua.currentEpisode]),
  );
  const userAnimeByAnime = new Map(tracked.map((row) => [row.a.id, row.ua]));

  const rows = db
    .select({ ep: episodes, a: anime })
    .from(episodes)
    .innerJoin(anime, eq(episodes.animeId, anime.id))
    .where(inArray(episodes.animeId, animeIds))
    .all();

  const localFileEpisodeIds = getLocalFileEpisodeIds(rows.map((row) => row.ep.id));

  return {
    rows: rows.map((row) => ({
      ep: withLocalFileState(row.ep, localFileEpisodeIds),
      a: row.a,
      providerLabel: providerLabelOf(normalizeWatchProviders(row.a.watchProviders)),
    })),
    currentByAnime,
    userAnimeByAnime,
  };
}

/** 影视：今日播出的、用户正在看的电视剧（追更只针对电视剧，电影不参与）。 */
export function getCinemaTodayUpdates(userId: string): CinemaTodayUpdate[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { rows, currentByAnime } = readTrackedCinemaEpisodes(userId);
  return rows
    .filter(
      (row) =>
        row.ep.airedAt &&
        row.ep.airedAt.getTime() >= start.getTime() &&
        row.ep.airedAt.getTime() < end.getTime(),
    )
    .sort((a, b) => {
      const at = a.ep.airedAt?.getTime() ?? 0;
      const bt = b.ep.airedAt?.getTime() ?? 0;
      return at - bt || a.a.id - b.a.id;
    })
    .map((row) => ({
      anime: row.a,
      episode: row.ep,
      providerLabel: row.providerLabel,
      watched: (currentByAnime.get(row.a.id) ?? 0) >= row.ep.number,
    }));
}

/** 影视：未来 N 天内（不含今天）将播出的、用户正在看的电视剧（电影不参与追更）。 */
export function getCinemaUpcomingEpisodes(
  userId: string,
  days = 7,
): CinemaUpcomingEpisode[] {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const end = new Date(tomorrow);
  end.setDate(end.getDate() + days);

  const { rows } = readTrackedCinemaEpisodes(userId);
  return rows
    .filter(
      (row) =>
        row.ep.airedAt &&
        row.ep.airedAt.getTime() >= tomorrow.getTime() &&
        row.ep.airedAt.getTime() < end.getTime(),
    )
    .sort((a, b) => {
      const at = a.ep.airedAt?.getTime() ?? 0;
      const bt = b.ep.airedAt?.getTime() ?? 0;
      return at - bt || a.a.id - b.a.id;
    })
    .map((row) => ({
      anime: row.a,
      episode: row.ep,
      providerLabel: row.providerLabel,
    }));
}

/** 影视：已播但用户当前进度还没追上的剧集。 */
export function getCinemaMissedUpdates(
  userId: string,
  limit = 4,
): CinemaMissedItem[] {
  const { rows, userAnimeByAnime } = readTrackedCinemaEpisodes(userId);
  if (rows.length === 0) return [];

  const now = Date.now();
  const airedByAnime = new Map<
    number,
    {
      number: number;
      aired: number;
      isDownloaded: boolean;
      providerLabel: string | null;
      anime: Anime;
    }[]
  >();

  for (const row of rows) {
    if (!row.ep.airedAt) continue;
    const aired = row.ep.airedAt.getTime();
    if (aired > now) continue;
    const list = airedByAnime.get(row.a.id) ?? [];
    list.push({
      number: row.ep.number,
      aired,
      isDownloaded: row.ep.isDownloaded,
      providerLabel: row.providerLabel,
      anime: row.a,
    });
    airedByAnime.set(row.a.id, list);
  }

  const out: CinemaMissedItem[] = [];
  for (const [animeId, airedEpisodes] of airedByAnime) {
    const ua = userAnimeByAnime.get(animeId);
    if (!ua) continue;
    const missed = airedEpisodes
      .filter((episode) => episode.number > ua.currentEpisode)
      .sort((a, b) => a.number - b.number);
    if (missed.length === 0) continue;

    const next = missed[0];
    const latest = missed[missed.length - 1];
    out.push({
      anime: next.anime,
      userAnime: ua,
      providerLabel: next.providerLabel,
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

  return out
    .sort((a, b) => a.daysSince - b.daysSince || a.anime.id - b.anime.id)
    .slice(0, limit);
}

export interface CinemaContinueWatching {
  anime: Anime;
  userAnime: UserAnime;
  airedCount: number;
  watchedAiredCount: number;
  playbackEpisodeNumber: number | null;
  playbackPositionSeconds: number | null;
  playbackDurationSeconds: number | null;
  playbackCompleted: boolean;
  nextEpisode: number;
  nextEpisodeIsDownloaded: boolean;
  providerLabel: string | null;
}

/** 影视：在看的电视剧「继续观看」（镜像动漫首页 getContinueWatching，drama-only）。 */
export function getCinemaContinueWatching(
  userId: string,
  limit = 4,
): CinemaContinueWatching[] {
  const { rows, currentByAnime, userAnimeByAnime } =
    readTrackedCinemaEpisodes(userId);
  if (rows.length === 0) return [];

  const now = Date.now();
  const byAnime = new Map<
    number,
    {
      anime: Anime;
      aired: number;
      watched: number;
      providerLabel: string | null;
      nextEpisode: number;
      nextEpisodeIsDownloaded: boolean;
    }
  >();
  for (const row of rows) {
    const cur = currentByAnime.get(row.a.id) ?? 0;
    const isAired = !!row.ep.airedAt && row.ep.airedAt.getTime() <= now;
    const g =
      byAnime.get(row.a.id) ??
      {
        anime: row.a,
        aired: 0,
        watched: 0,
        providerLabel: row.providerLabel,
        nextEpisode: cur > 0 ? cur : 1,
        nextEpisodeIsDownloaded: false,
      };
    if (isAired) {
      g.aired += 1;
      if (row.ep.number <= cur) g.watched += 1;
    }
    // 下一集 = 当前进度的下一集（有则用 currentEpisode+1，落在已有集号上）
    if (row.ep.number === cur + 1) {
      g.nextEpisode = row.ep.number;
      g.nextEpisodeIsDownloaded = row.ep.isDownloaded;
    } else if (cur === 0 && row.ep.number === 1) {
      g.nextEpisode = 1;
      g.nextEpisodeIsDownloaded = row.ep.isDownloaded;
    }
    byAnime.set(row.a.id, g);
  }

  const animeIds = [...byAnime.keys()];
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
  const latest = new Map<number, (typeof progressRows)[number]>();
  for (const p of progressRows) {
    if (!latest.has(p.animeId)) latest.set(p.animeId, p);
  }

  return [...byAnime.values()]
    .map((g) => {
      const p = latest.get(g.anime.id);
      const ua = userAnimeByAnime.get(g.anime.id)!;
      return {
        anime: g.anime,
        userAnime: ua,
        airedCount: g.aired,
        watchedAiredCount: g.watched,
        playbackEpisodeNumber: p?.episodeNumber ?? null,
        playbackPositionSeconds: p?.positionSeconds ?? null,
        playbackDurationSeconds: p?.durationSeconds ?? null,
        playbackCompleted: p?.completed ?? false,
        nextEpisode: g.nextEpisode,
        nextEpisodeIsDownloaded: g.nextEpisodeIsDownloaded,
        providerLabel: g.providerLabel,
      };
    })
    .sort((a, b) => {
      const at =
        latest.get(a.anime.id)?.lastPlayedAt?.getTime() ??
        a.userAnime.updatedAt.getTime();
      const bt =
        latest.get(b.anime.id)?.lastPlayedAt?.getTime() ??
        b.userAnime.updatedAt.getTime();
      return bt - at;
    })
    .slice(0, limit);
}
