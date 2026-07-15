/**
 * 影视条目刮削（server only，写真实库）：TMDB 元数据 + 豆瓣评分/CN 在哪看，一次补齐。
 *
 * - TMDB：中文标题 / 原名 / 海报 / 简介 / TMDB 评分 / 类型 / IMDb id（全球可用）。
 * - 豆瓣：中文评分（优先于 TMDB 评分展示）+ CN「在哪看」平台（vendors）。best-effort，
 *   豆瓣是灰色 + 脆弱，抓不到就跳过、不影响 TMDB 部分（评分回退 TMDB）。
 *
 * 幂等：默认只刮「缺 tmdbId 或缺豆瓣评分」的条目，重复运行安全。
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  anime,
  episodes,
  normalizeWatchProviders,
  type WatchProviderEntry,
  type WatchProvidersCache,
} from "@/db/schema";
import {
  getDetail,
  getCinemaCatalog,
  getTvEpisodes,
  getWatchProviders,
  isTmdbConfigured,
  searchTitle,
  tmdbImageUrl,
  type TmdbCatalogHit,
  type TmdbMediaType,
} from "@/lib/tmdb";
import {
  getDoubanCatalog,
  getDoubanInfo,
  getDoubanSubject,
  hasDoubanAnimationGenre,
  isReliableDoubanInfoMatch,
  isReliableDoubanTitleSetMatch,
  type DoubanCatalogHit,
  type DoubanInfo,
} from "@/lib/douban";
import { getBangumiTitleAliases } from "@/lib/anime-title-aliases";
import { extractJavCode, getJavInfo } from "@/lib/jav";
import { cacheCover } from "@/lib/cover-cache";
import { selectPreferredSynopsis } from "@/lib/synopsis-language";

const POSTER_SIZE = "w500";
type AnimeRow = typeof anime.$inferSelect;

// 海外「在哪看」查询区。TMDB/JustWatch 对中国大陆无数据（CN provider 恒 0，见 tmdb.ts），
// 国内「在哪看」走豆瓣 vendors；海外区拿 Netflix/Disney+/HBO 等。默认 US（数据最全），
// 主要用台/港订阅就改 "TW" / "HK"。← §15.1 唯一可调小参数。
const OVERSEAS_REGION = "US";

export interface EnrichResult {
  animeId: number;
  matched: boolean;
  tmdbId?: number;
  doubanId?: string;
  title?: string;
  reason?: string;
  reclassified?: boolean;
  conflict?: boolean;
}

function doubanToProviders(d: DoubanInfo | null): WatchProvidersCache | null {
  if (!d || d.vendors.length === 0) return null;
  const providers: WatchProviderEntry[] = d.vendors.map((v, i) => ({
    providerId: i + 1,
    providerName: v.name,
    type: "flatrate",
    url: v.url ?? undefined,
  }));
  return {
    region: "CN",
    providers,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

export function mergeWatchProviderRegions(
  existing:
    | WatchProvidersCache
    | WatchProvidersCache[]
    | null
    | undefined,
  fresh: Array<WatchProvidersCache | null | undefined>,
): WatchProvidersCache[] {
  const merged = new Map<string, WatchProvidersCache>();
  for (const lane of normalizeWatchProviders(existing)) {
    merged.set(lane.region.toUpperCase(), lane);
  }
  for (const lane of fresh) {
    if (!lane || lane.providers.length === 0) continue;
    merged.set(lane.region.toUpperCase(), lane);
  }
  return [...merged.values()];
}

function mergeDoubanGenres(
  row: AnimeRow,
  detail: DoubanInfo | null,
): string[] | null {
  const genres = Array.from(
    new Set([...(row.tags ?? []), ...(detail?.genres ?? [])]),
  );
  return genres.length > 0 ? genres : row.tags;
}

function hasEpisodeRows(animeId: number): boolean {
  return (
    db
      .select({ id: episodes.id })
      .from(episodes)
      .where(eq(episodes.animeId, animeId))
      .get() != null
  );
}

/**
 * 给已确认身份的动漫补豆瓣字段。现有 Bangumi 标题、封面和剧集是主数据；
 * 豆瓣只补空字段、评分、CN providers 与题材。
 */
function applyDoubanAnimationMetadata(
  row: AnimeRow,
  detail: DoubanInfo | null,
  hit: Pick<DoubanCatalogHit, "doubanId" | "rating" | "coverUrl">,
  { reclassify = false } = {},
): void {
  const storedEpisodes = hasEpisodeRows(row.id);
  const totalEpisodes = storedEpisodes
    ? row.totalEpisodes
    : row.totalEpisodes != null && row.totalEpisodes > 0
      ? row.totalEpisodes
      : detail?.totalEpisodes;
  const watchProviders = detail
    ? mergeWatchProviderRegions(row.watchProviders, [doubanToProviders(detail)])
    : row.watchProviders;
  const now = new Date();

  db.update(anime)
    .set({
      ...(reclassify ? { mediaType: "anime" as const } : {}),
      title: row.title,
      titleJa: row.titleJa ?? detail?.originalTitle,
      coverUrl: row.coverUrl ?? detail?.posterUrl ?? hit.coverUrl,
      synopsis: selectPreferredSynopsis(row.synopsis, detail?.synopsis),
      totalEpisodes,
      year: row.year ?? detail?.year ?? null,
      tags: mergeDoubanGenres(row, detail),
      doubanId: row.doubanId ?? detail?.doubanId ?? hit.doubanId,
      doubanRating: detail?.rating ?? hit.rating ?? row.doubanRating,
      doubanRatingFetchedAt: now,
      watchProviders,
      updatedAt: now,
    })
    .where(eq(anime.id, row.id))
    .run();

  if (
    !storedEpisodes &&
    detail?.availableEpisodes != null
  ) {
    syncDoubanEpisodePlaceholdersInCurrentTransaction(
      row.id,
      detail.availableEpisodes,
    );
  }
}

/** 电视剧追更：用 TMDb 逐集播出日期填 episodes（删旧+插新，对齐 syncFromBangumi 模式）。 */
async function syncCinemaEpisodes(
  animeId: number,
  tmdbId: number,
): Promise<number> {
  const eps = await getTvEpisodes(tmdbId);
  if (eps.length === 0) return 0;
  db.delete(episodes).where(eq(episodes.animeId, animeId)).run();
  for (const e of eps) {
    db.insert(episodes)
      .values({
        animeId,
        number: e.number,
        title: e.title,
        airedAt: e.airDate ? new Date(e.airDate) : null,
      })
      .run();
  }
  return eps.length;
}

/**
 * 无 TMDB 时按豆瓣当前可用集数补占位行。只插缺失集号，保留已有标题、
 * 播出日期、下载状态和主键，重复执行保持幂等。
 */
export function syncDoubanEpisodePlaceholders(
  animeId: number,
  availableEpisodes: number,
): number {
  return db.transaction(() =>
    syncDoubanEpisodePlaceholdersInCurrentTransaction(
      animeId,
      availableEpisodes,
    ),
  );
}

function syncDoubanEpisodePlaceholdersInCurrentTransaction(
  animeId: number,
  availableEpisodes: number,
): number {
  const safeCount = Math.max(0, Math.floor(availableEpisodes));
  if (safeCount === 0) return 0;

  const existingNumbers = new Set(
    db
      .select({ number: episodes.number })
      .from(episodes)
      .where(eq(episodes.animeId, animeId))
      .all()
      .map((row) => row.number),
  );
  const missingNumbers = Array.from(
    { length: safeCount },
    (_, index) => index + 1,
  ).filter((number) => !existingNumbers.has(number));

  for (const number of missingNumbers) {
    db.insert(episodes)
      .values({ animeId, number, title: null, airedAt: null })
      .run();
  }
  return missingNumbers.length;
}

// 标题是否值得拿去 TMDB/豆瓣 搜：纯数字 / 第N话 / 太短的不搜，避免乱配
// （如国产动画分集文件名被清成 "12"，去 TMDB 误配成 "Adam-12"）。
function isSearchableTitle(title: string | null): boolean {
  const t = (title ?? "").trim();
  if (t.length < 3) return false;
  if (/^\d+$/.test(t)) return false;
  if (/第\s*\d+\s*[话集話]/.test(t)) return false;
  if (/^\d{1,3}\s*[-_．.]/.test(t)) return false; // "12-..." 这类集号开头
  return true;
}

/** 刮削单条影视条目（番号→r18/jav321；其余→TMDB+豆瓣，best-effort）。 */
export async function enrichCinemaItem(animeId: number): Promise<EnrichResult> {
  const row = db.select().from(anime).where(eq(anime.id, animeId)).get();
  if (!row) return { animeId, matched: false, reason: "not_found" };
  if (row.mediaType !== "drama" && row.mediaType !== "movie") {
    return { animeId, matched: false, reason: "not_cinema" };
  }

  const type: TmdbMediaType = row.mediaType === "movie" ? "movie" : "tv";

  // 番号片（测试样例使用 TEST-390）走专用源 r18.dev —— TMDB/豆瓣 对它无效，直接跳过省去两次空查
  const javCode = extractJavCode(row.title);
  if (javCode) {
    const jav = await getJavInfo(javCode);
    if (!jav) {
      db.update(anime)
        .set({ doubanRatingFetchedAt: new Date(), updatedAt: new Date() })
        .where(eq(anime.id, animeId))
        .run();
      return { animeId, matched: false, reason: "no_match" };
    }
    const parts: string[] = [];
    if (jav.actresses.length > 0) parts.push(`主演：${jav.actresses.join("、")}`);
    if (jav.maker) parts.push(`片商：${jav.maker}`);
    if (jav.series) parts.push(`系列：${jav.series}`);
    if (jav.releaseDate) parts.push(`发行：${jav.releaseDate}`);
    const synopsis =
      [parts.join(" · "), jav.descriptionJa].filter(Boolean).join("\n\n") ||
      row.synopsis;
    const tags = Array.from(
      new Set([
        ...(row.tags ?? []),
        ...jav.actresses,
        ...(jav.maker ? [jav.maker] : []),
        ...jav.genres.slice(0, 6),
      ]),
    );
    // 后台预热封面到磁盘缓存，显示前就抓好（DMM 封面经代理慢，避免一屏并发超时）
    if (jav.coverUrl) void cacheCover(jav.coverUrl);
    db.update(anime)
      .set({
        title: javCode, // 番号作主标识
        titleJa: jav.titleJa ?? jav.title ?? row.titleJa, // 日文原标题优先，回退英文
        coverUrl: jav.coverUrl ?? row.coverUrl,
        synopsis,
        doubanRating: jav.rating ?? row.doubanRating, // jav321 评分（/10）
        year: row.year ?? jav.year ?? null,
        tags: tags.length > 0 ? tags : row.tags,
        doubanRatingFetchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(anime.id, animeId))
      .run();
    return { animeId, matched: true, title: javCode };
  }

  // 防误匹配：标题是纯数字/第N话/太短就别去 TMDB/豆瓣 乱配，标记已尝试后跳过
  if (!isSearchableTitle(row.title)) {
    db.update(anime)
      .set({ doubanRatingFetchedAt: new Date(), updatedAt: new Date() })
      .where(eq(anime.id, animeId))
      .run();
    return { animeId, matched: false, reason: "unsearchable" };
  }

  // TMDB（best-effort）。公开影视库导入的行已经带 tmdbId，直接按 id 补详情，
  // 避免标题二次搜索命中到同名旧片。
  const tmdbHit =
    isTmdbConfigured() && row.tmdbId != null
      ? {
          tmdbId: row.tmdbId,
          type,
          title: row.title,
          originalTitle: row.titleJa,
          year: row.year,
          posterPath: null,
          voteAverage: row.tmdbRating,
          overview: row.synopsis,
        }
      : isTmdbConfigured()
        ? await searchTitle(row.title, { type, year: row.year })
        : null;
  const tmdbDetail = tmdbHit ? await getDetail(tmdbHit.tmdbId, type) : null;

  // 豆瓣（best-effort）
  const douban = row.doubanId
    ? await getDoubanSubject(row.doubanId, type)
    : await getDoubanInfo(row.title, { type, year: row.year });
  const reliableDouban =
    row.doubanId != null
      ? douban?.doubanId === row.doubanId
        ? douban
        : null
      : isReliableDoubanInfoMatch(row.title, row.year, douban)
        ? douban
        : null;

  if (
    reliableDouban &&
    hasDoubanAnimationGenre(reliableDouban.genres)
  ) {
    const animationHit: DoubanCatalogHit = {
      doubanId: reliableDouban.doubanId,
      title: reliableDouban.title || row.title,
      type,
      rating: reliableDouban.rating,
      coverUrl: reliableDouban.posterUrl,
      source: "hot",
      isAnimation: true,
      animationClassificationKnown: true,
    };
    const preparedItem: PreparedDoubanCatalogHit = {
      hit: animationHit,
      detail: reliableDouban,
      isAnimation: true,
      classificationConfirmed: true,
      exactConflict: false,
    };
    const aliases = await buildAnimeAliasCache([preparedItem]);
    const resolution = applyAnimationCatalogHit(
      animationHit,
      reliableDouban,
      aliases,
      animeId,
    );
    if (resolution.kind === "mergeConflict") {
      return {
        animeId,
        matched: false,
        doubanId: reliableDouban.doubanId,
        reason: "douban_animation_merge_conflict",
        conflict: true,
      };
    }
    if (resolution.kind === "skippedAnimeUnmatched") {
      return {
        animeId,
        matched: false,
        doubanId: reliableDouban.doubanId,
        reason: "skipped_anime_unmatched",
      };
    }
    return {
      animeId: resolution.row.id,
      matched: true,
      doubanId: reliableDouban.doubanId,
      title: resolution.row.title,
      reason:
        resolution.kind === "reclassified"
          ? "douban_animation_reclassified"
          : "douban_animation_matched",
      reclassified: resolution.kind === "reclassified",
    };
  }

  if (!tmdbHit && !reliableDouban) {
    // 标记已尝试，避免 onlyMissing 下次反复重试匹配不上的条目（如番号片）
    db.update(anime)
      .set({ doubanRatingFetchedAt: new Date(), updatedAt: new Date() })
      .where(eq(anime.id, animeId))
      .run();
    return { animeId, matched: false, reason: "no_match" };
  }

  const poster =
    tmdbImageUrl(tmdbDetail?.posterPath ?? tmdbHit?.posterPath, POSTER_SIZE) ??
    reliableDouban?.posterUrl ??
    row.coverUrl;
  const genres = Array.from(
    new Set([
      ...(row.tags ?? []),
      ...(tmdbDetail?.genres ?? []),
      ...(reliableDouban?.genres ?? []),
    ]),
  );
  // 「在哪看」双线：国内（豆瓣 vendors，region=CN）+ 海外（TMDb watch-providers，
  // 默认 US；CN 区 TMDb 无数据故查海外区）。best-effort，哪条没刮到就不放；两条都没
  // 刮到才保留旧值（归一成数组，兼容历史单对象行）。
  const cnProviders = doubanToProviders(reliableDouban);
  const overseasProviders = tmdbHit
    ? await getWatchProviders(tmdbHit.tmdbId, type, OVERSEAS_REGION)
    : null;
  const watchProviders = mergeWatchProviderRegions(row.watchProviders, [
    cnProviders,
    overseasProviders,
  ]);
  const totalEpisodes =
    type === "tv" && reliableDouban?.totalEpisodes != null
      ? Math.max(row.totalEpisodes ?? 0, reliableDouban.totalEpisodes)
      : row.totalEpisodes;

  db.update(anime)
    .set({
      tmdbId: tmdbHit?.tmdbId ?? row.tmdbId,
      title:
        tmdbDetail?.title ||
        tmdbHit?.title ||
        reliableDouban?.title ||
        row.title,
      titleJa:
        tmdbDetail?.originalTitle ??
        tmdbHit?.originalTitle ??
        reliableDouban?.originalTitle ??
        row.titleJa,
      coverUrl: poster,
      synopsis:
        tmdbDetail?.overview ??
        tmdbHit?.overview ??
        reliableDouban?.synopsis ??
        row.synopsis,
      tmdbRating: tmdbDetail?.voteAverage ?? tmdbHit?.voteAverage ?? row.tmdbRating,
      doubanId: reliableDouban?.doubanId ?? row.doubanId,
      doubanRating: reliableDouban?.rating ?? row.doubanRating,
      doubanRatingFetchedAt: new Date(), // 同时作为「已尝试刮削」标记

      imdbId: tmdbDetail?.imdbId ?? row.imdbId,
      year:
        row.year ??
        tmdbDetail?.year ??
        tmdbHit?.year ??
        reliableDouban?.year ??
        null,
      totalEpisodes,
      tags: genres.length > 0 ? genres : row.tags,
      watchProviders,
      updatedAt: new Date(),
    })
    .where(eq(anime.id, animeId))
    .run();

  // 电视剧追更：拉 TMDb 逐集播出日期填 episodes（best-effort，单独表写，挂了不影响主刮削）
  if (type === "tv" && tmdbHit) {
    try {
      await syncCinemaEpisodes(animeId, tmdbHit.tmdbId);
    } catch {
      /* 剧集拉取失败不影响条目刮削结果 */
    }
  } else if (
    type === "tv" &&
    reliableDouban?.availableEpisodes != null
  ) {
    syncDoubanEpisodePlaceholders(
      animeId,
      reliableDouban.availableEpisodes,
    );
  }

  return {
    animeId,
    matched: true,
    tmdbId: tmdbHit?.tmdbId,
    doubanId: reliableDouban?.doubanId,
    title:
      tmdbDetail?.title ||
      tmdbHit?.title ||
      reliableDouban?.title ||
      row.title,
  };
}

export interface EnrichLibrarySummary {
  total: number; // 本次处理数
  matched: number;
  unmatched: number;
  remaining: number; // 还剩多少待刮（本次未处理）
  results: EnrichResult[];
}

const ENRICH_CONCURRENCY = 3;
const ENRICH_DEFAULT_LIMIT = 40;

async function mapPool<T, R>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/**
 * 批量刮削。默认只刮「还没尝试过」的条目（doubanRatingFetchedAt 为空）；每次最多 limit 条、
 * 并发上限 ENRICH_CONCURRENCY，返回 remaining 供前端续跑。匹配不上的会被标记已尝试、不再重试。
 */
export async function enrichCinemaLibrary({
  onlyMissing = true,
  limit = ENRICH_DEFAULT_LIMIT,
}: { onlyMissing?: boolean; limit?: number } = {}): Promise<EnrichLibrarySummary> {
  const rows = db
    .select({ id: anime.id, fetchedAt: anime.doubanRatingFetchedAt })
    .from(anime)
    .where(inArray(anime.mediaType, ["drama", "movie"]))
    .all();
  const pending = onlyMissing ? rows.filter((r) => r.fetchedAt == null) : rows;
  const batch = pending.slice(0, Math.max(1, limit));
  const remaining = Math.max(0, pending.length - batch.length);

  const results = await mapPool(batch, ENRICH_CONCURRENCY, (t) =>
    enrichCinemaItem(t.id),
  );

  return {
    total: batch.length,
    matched: results.filter((r) => r.matched).length,
    unmatched: results.filter((r) => !r.matched).length,
    remaining,
    results,
  };
}

export interface CinemaCatalogImportSummary {
  total: number;
  created: number;
  matched: number;
  enriched: number;
  results: EnrichResult[];
}

function mediaTypeOfCatalogHit(hit: TmdbCatalogHit): "drama" | "movie" {
  return hit.type === "tv" ? "drama" : "movie";
}

function titleOfCatalogHit(hit: TmdbCatalogHit): string {
  return hit.title.trim() || hit.originalTitle?.trim() || `TMDb ${hit.tmdbId}`;
}

function catalogStatusOf(hit: TmdbCatalogHit): "airing" | "completed" {
  if (hit.type === "tv") return "airing";
  return hit.source === "now_playing" || hit.source === "trending"
    ? "airing"
    : "completed";
}

function findExistingCatalogRow(hit: TmdbCatalogHit) {
  const mediaType = mediaTypeOfCatalogHit(hit);
  const byTmdbId = db
    .select()
    .from(anime)
    .where(and(eq(anime.mediaType, mediaType), eq(anime.tmdbId, hit.tmdbId)))
    .get();
  if (byTmdbId) return byTmdbId;

  const title = titleOfCatalogHit(hit).toLowerCase();
  const candidates =
    hit.year == null
      ? db
          .select()
          .from(anime)
          .where(eq(anime.mediaType, mediaType))
          .all()
      : db
          .select()
          .from(anime)
          .where(and(eq(anime.mediaType, mediaType), eq(anime.year, hit.year)))
          .all();
  return (
    candidates.find((row) => row.title.toLowerCase() === title) ?? null
  );
}

function upsertCatalogHit(hit: TmdbCatalogHit): {
  animeId: number;
  created: boolean;
} {
  const mediaType = mediaTypeOfCatalogHit(hit);
  const title = titleOfCatalogHit(hit);
  const coverUrl = tmdbImageUrl(hit.posterPath, POSTER_SIZE);
  const now = new Date();
  const existing = findExistingCatalogRow(hit);

  if (existing) {
    db.update(anime)
      .set({
        tmdbId: existing.tmdbId ?? hit.tmdbId,
        title: existing.title || title,
        titleJa: existing.titleJa ?? hit.originalTitle,
        coverUrl: existing.coverUrl ?? coverUrl,
        synopsis: existing.synopsis ?? hit.overview,
        tmdbRating: existing.tmdbRating ?? hit.voteAverage,
        year: existing.year ?? hit.year,
        status: existing.status === "completed" ? existing.status : catalogStatusOf(hit),
        updatedAt: now,
      })
      .where(eq(anime.id, existing.id))
      .run();
    return { animeId: existing.id, created: false };
  }

  const inserted = db
    .insert(anime)
    .values({
      title,
      titleJa: hit.originalTitle,
      coverUrl,
      synopsis: hit.overview,
      type: hit.type === "movie" ? "Movie" : "TV",
      status: catalogStatusOf(hit),
      totalEpisodes: null,
      year: hit.year,
      mediaType,
      tmdbId: hit.tmdbId,
      tmdbRating: hit.voteAverage,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: anime.id })
    .get();
  return { animeId: inserted.id, created: true };
}

export async function importCinemaCatalog({
  limit = 80,
  enrich = false,
}: { limit?: number; enrich?: boolean } = {}): Promise<CinemaCatalogImportSummary> {
  const hits = await getCinemaCatalog({ limit });
  let created = 0;
  let matched = 0;
  let enriched = 0;
  const results: EnrichResult[] = [];

  for (const hit of hits) {
    const row = upsertCatalogHit(hit);
    if (row.created) created += 1;
    else matched += 1;

    if (enrich) {
      const result = await enrichCinemaItem(row.animeId);
      results.push(result);
      if (result.matched) enriched += 1;
    }
  }

  return {
    total: hits.length,
    created,
    matched,
    enriched,
    results,
  };
}

export interface DoubanCatalogImportSummary {
  total: number;
  created: number;
  matched: number;
  routedToAnime: number;
  matchedAnimation: number;
  reclassifiedAnimation: number;
  skippedAnimeUnmatched: number;
  conflicts: number;
  skippedUnclassified: number;
}

function mediaTypeOfDoubanCatalogHit(hit: DoubanCatalogHit): "drama" | "movie" {
  return hit.type === "tv" ? "drama" : "movie";
}

function titleOfDoubanCatalogHit(hit: DoubanCatalogHit): string {
  return hit.title.trim() || `Douban ${hit.doubanId}`;
}

type ExactDoubanRows =
  | { kind: "none"; rows: [] }
  | { kind: "one"; rows: [AnimeRow]; row: AnimeRow }
  | { kind: "conflict"; rows: AnimeRow[] };

interface AnimeAliasEntry {
  bangumiId: number;
  aliases: string[];
}

type AnimeAliasCache = Map<number, AnimeAliasEntry>;

type AnimationIdentityResolution =
  | { kind: "matched"; row: AnimeRow }
  | { kind: "reclassified"; row: AnimeRow }
  | { kind: "skippedAnimeUnmatched" }
  | { kind: "mergeConflict"; rowIds: number[] };

function findDoubanCatalogRowsById(doubanId: string): ExactDoubanRows {
  const rows = db
    .select()
    .from(anime)
    .where(eq(anime.doubanId, doubanId))
    .all();
  if (rows.length === 0) return { kind: "none", rows: [] };
  if (rows.length === 1) return { kind: "one", rows: [rows[0]], row: rows[0] };
  return { kind: "conflict", rows };
}

function doubanIdentityTitles(
  hit: DoubanCatalogHit,
  detail: DoubanInfo | null,
): Array<string | null> {
  return [hit.title, detail?.title ?? null, detail?.originalTitle ?? null];
}

function localIdentityTitles(
  row: AnimeRow,
  aliases: AnimeAliasCache,
): Array<string | null> {
  const cached = aliases.get(row.id);
  const bangumiAliases =
    cached && cached.bangumiId === row.bangumiId ? cached.aliases : [];
  return [row.title, row.titleJa, ...bangumiAliases];
}

function findAnimeIdentityCandidates(
  hit: DoubanCatalogHit,
  detail: DoubanInfo | null,
  aliases: AnimeAliasCache,
): AnimeRow[] {
  if (detail?.year == null) return [];
  const doubanTitles = doubanIdentityTitles(hit, detail);
  return db
    .select()
    .from(anime)
    .where(eq(anime.mediaType, "anime"))
    .all()
    .filter((row) =>
      isReliableDoubanTitleSetMatch({
        doubanTitles,
        localTitles: localIdentityTitles(row, aliases),
        doubanYear: detail.year,
        localYear: row.year,
      }),
    );
}

function resolveAnimationIdentity(
  hit: DoubanCatalogHit,
  detail: DoubanInfo | null,
  aliases: AnimeAliasCache,
): AnimationIdentityResolution {
  const exact = findDoubanCatalogRowsById(hit.doubanId);
  if (exact.kind === "conflict") {
    return { kind: "mergeConflict", rowIds: exact.rows.map((row) => row.id) };
  }
  const candidates = findAnimeIdentityCandidates(hit, detail, aliases);
  if (exact.kind === "one") {
    if (exact.row.mediaType === "anime") return { kind: "matched", row: exact.row };
    const otherAnime = candidates.filter((candidate) => candidate.id !== exact.row.id);
    if (otherAnime.length > 0) {
      return {
        kind: "mergeConflict",
        rowIds: [exact.row.id, ...otherAnime.map((row) => row.id)],
      };
    }
    return { kind: "reclassified", row: exact.row };
  }
  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (
      candidate.doubanId != null &&
      candidate.doubanId !== hit.doubanId
    ) {
      return { kind: "mergeConflict", rowIds: [candidate.id] };
    }
    return { kind: "matched", row: candidate };
  }
  if (candidates.length > 1) {
    return { kind: "mergeConflict", rowIds: candidates.map((row) => row.id) };
  }
  return { kind: "skippedAnimeUnmatched" };
}

async function buildAnimeAliasCache(
  items: PreparedDoubanCatalogHit[],
): Promise<AnimeAliasCache> {
  const years = new Set(
    items
      .filter((item) => item.isAnimation && item.detail?.year != null)
      .map((item) => item.detail!.year!),
  );
  if (years.size === 0) return new Map();
  const rows = db
    .select()
    .from(anime)
    .where(eq(anime.mediaType, "anime"))
    .all()
    .filter(
      (row) =>
        row.year != null && years.has(row.year) && row.bangumiId != null,
    );
  const entries = await mapPool(rows, ENRICH_CONCURRENCY, async (row) => ({
    animeId: row.id,
    bangumiId: row.bangumiId!,
    aliases: await getBangumiTitleAliases(row.bangumiId),
  }));
  return new Map(
    entries.map((entry) => [
      entry.animeId,
      { bangumiId: entry.bangumiId, aliases: entry.aliases },
    ]),
  );
}

function applyAnimationCatalogHit(
  hit: DoubanCatalogHit,
  detail: DoubanInfo | null,
  aliases: AnimeAliasCache,
  originAnimeId?: number,
): AnimationIdentityResolution {
  return db.transaction(() => {
    const resolution = resolveAnimationIdentity(hit, detail, aliases);
    if (
      originAnimeId != null &&
      resolution.kind === "matched" &&
      resolution.row.id !== originAnimeId
    ) {
      return {
        kind: "mergeConflict",
        rowIds: [originAnimeId, resolution.row.id],
      };
    }
    if (resolution.kind === "matched") {
      applyDoubanAnimationMetadata(resolution.row, detail, hit);
    } else if (resolution.kind === "reclassified") {
      applyDoubanAnimationMetadata(resolution.row, detail, hit, {
        reclassify: true,
      });
    }
    return resolution;
  });
}

function upsertDoubanCatalogHit(
  hit: DoubanCatalogHit,
  detail: DoubanInfo | null,
): {
  kind: "created" | "matched" | "conflict";
  animeId?: number;
} {
  const mediaType = mediaTypeOfDoubanCatalogHit(hit);
  const title = titleOfDoubanCatalogHit(hit);
  const now = new Date();
  const exact = findDoubanCatalogRowsById(hit.doubanId);
  if (exact.kind === "conflict") return { kind: "conflict" };
  const titleMatches = db
    .select()
    .from(anime)
    .where(eq(anime.mediaType, mediaType))
    .all()
    .filter((row) => row.title.trim().toLowerCase() === title.toLowerCase());
  if (exact.kind === "none" && titleMatches.length > 1) {
    return { kind: "conflict" };
  }
  const existing = exact.kind === "one" ? exact.row : titleMatches[0];

  if (existing) {
    const totalEpisodes =
      detail?.totalEpisodes != null
        ? Math.max(existing.totalEpisodes ?? 0, detail.totalEpisodes)
        : existing.totalEpisodes;
    const watchProviders = detail
      ? mergeWatchProviderRegions(existing.watchProviders, [
          doubanToProviders(detail),
        ])
      : existing.watchProviders;
    db.update(anime)
      .set({
        doubanId: existing.doubanId ?? hit.doubanId,
        title: existing.title || title,
        titleJa: existing.titleJa ?? detail?.originalTitle,
        coverUrl: existing.coverUrl ?? detail?.posterUrl ?? hit.coverUrl,
        synopsis: existing.synopsis ?? detail?.synopsis,
        totalEpisodes,
        year: existing.year ?? detail?.year,
        tags: mergeDoubanGenres(existing, detail),
        doubanRating:
          existing.doubanRating ?? detail?.rating ?? hit.rating,
        doubanRatingFetchedAt: detail
          ? now
          : existing.doubanRatingFetchedAt,
        watchProviders,
        updatedAt: now,
      })
      .where(eq(anime.id, existing.id))
      .run();
    if (hit.type === "tv" && detail?.availableEpisodes != null) {
      syncDoubanEpisodePlaceholdersInCurrentTransaction(
        existing.id,
        detail.availableEpisodes,
      );
    }
    return { kind: "matched", animeId: existing.id };
  }

  const inserted = db
    .insert(anime)
    .values({
      title: detail?.title.trim() || title,
      titleJa: detail?.originalTitle,
      coverUrl: detail?.posterUrl ?? hit.coverUrl,
      synopsis: detail?.synopsis,
      type: hit.type === "movie" ? "Movie" : "TV",
      status: hit.type === "movie" ? "completed" : "airing",
      totalEpisodes: detail?.totalEpisodes,
      year: detail?.year,
      tags: detail?.genres.length ? detail.genres : null,
      mediaType,
      doubanId: hit.doubanId,
      doubanRating: detail?.rating ?? hit.rating,
      doubanRatingFetchedAt: detail ? now : null,
      watchProviders: detail
        ? mergeWatchProviderRegions(null, [doubanToProviders(detail)])
        : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: anime.id })
    .get();
  if (hit.type === "tv" && detail?.availableEpisodes != null) {
    syncDoubanEpisodePlaceholdersInCurrentTransaction(
      inserted.id,
      detail.availableEpisodes,
    );
  }
  return { kind: "created", animeId: inserted.id };
}

interface PreparedDoubanCatalogHit {
  hit: DoubanCatalogHit;
  detail: DoubanInfo | null;
  isAnimation: boolean;
  classificationConfirmed: boolean;
  exactConflict: boolean;
}

export async function importDoubanCatalog({
  limit = 40,
}: { limit?: number } = {}): Promise<DoubanCatalogImportSummary> {
  const hits = await getDoubanCatalog({ limit });
  // 热门接口没有 genres。动画集合先标记高概率候选；其余尚未可靠分类的 TV
  // 在入库前受限并发读取详情。详情失败时暂不写影视库，避免把未知动画落成 drama。
  const prepared = await mapPool(hits, ENRICH_CONCURRENCY, async (hit) => {
    const exact = findDoubanCatalogRowsById(hit.doubanId);
    const exactRows = exact.rows;
    const alreadyClassifiedAsAnime =
      exactRows.some((row) => row.mediaType === "anime") ||
      exactRows.some((row) => hasDoubanAnimationGenre(row.tags));
    if (
      exact.kind === "one" &&
      alreadyClassifiedAsAnime &&
      exact.row.doubanRatingFetchedAt != null
    ) {
      return {
        hit,
        detail: null,
        isAnimation: true,
        classificationConfirmed: true,
        exactConflict: false,
      } satisfies PreparedDoubanCatalogHit;
    }

    const needsDetail =
      alreadyClassifiedAsAnime ||
      hit.isAnimation ||
      hit.type === "tv" ||
      !hit.animationClassificationKnown;
    const detail = needsDetail
      ? await getDoubanSubject(hit.doubanId, hit.type)
      : null;
    const detailHasGenres = (detail?.genres.length ?? 0) > 0;
    return {
      hit,
      detail,
      isAnimation:
        alreadyClassifiedAsAnime ||
        (detailHasGenres
          ? hasDoubanAnimationGenre(detail?.genres)
          : hit.isAnimation),
      classificationConfirmed:
        alreadyClassifiedAsAnime ||
        (hit.type !== "tv" && hit.animationClassificationKnown) ||
        hit.isAnimation ||
        detailHasGenres,
      exactConflict: exact.kind === "conflict",
    } satisfies PreparedDoubanCatalogHit;
  });
  const aliases = await buildAnimeAliasCache(prepared);
  let created = 0;
  let matched = 0;
  let routedToAnime = 0;
  let matchedAnimation = 0;
  let reclassifiedAnimation = 0;
  let skippedAnimeUnmatched = 0;
  let conflicts = 0;
  let skippedUnclassified = 0;

  for (const item of prepared) {
    if (item.exactConflict) {
      conflicts += 1;
      if (item.isAnimation) routedToAnime += 1;
      continue;
    }
    if (!item.classificationConfirmed) {
      skippedUnclassified += 1;
      continue;
    }
    if (item.isAnimation) {
      routedToAnime += 1;
      const resolution = applyAnimationCatalogHit(
        item.hit,
        item.detail,
        aliases,
      );
      if (resolution.kind === "matched") matchedAnimation += 1;
      else if (resolution.kind === "reclassified") reclassifiedAnimation += 1;
      else if (resolution.kind === "skippedAnimeUnmatched") {
        skippedAnimeUnmatched += 1;
      } else conflicts += 1;
      continue;
    }

    const row = db.transaction(() =>
      upsertDoubanCatalogHit(item.hit, item.detail),
    );
    if (row.kind === "created") created += 1;
    else if (row.kind === "matched") matched += 1;
    else conflicts += 1;
  }

  return {
    total: hits.length,
    created,
    matched,
    routedToAnime,
    matchedAnimation,
    reclassifiedAnimation,
    skippedAnimeUnmatched,
    conflicts,
    skippedUnclassified,
  };
}
