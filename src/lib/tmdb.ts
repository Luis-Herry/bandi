/**
 * TMDB (themoviedb.org) HTTP client —— 看剧 / 电影模块的元数据主源。
 *
 * - 鉴权用 v4 Read Access Token（env `TMDB_API_TOKEN`），走 Bearer header。
 * - 默认语言 zh-CN，拿中文标题 / 简介；图片是相对 path，用 `tmdbImageUrl` 拼全。
 * - 网络走系统代理（应用以 `node --use-env-proxy` 启动，api.themoviedb.org 在 CN 需代理）。
 * - 默认 typed-or-null，UI 不因 TMDB 挂掉而崩；未配置 token 时直接返回 null。
 *
 * ⚠️ 实测（2026-06-26）：TMDB / JustWatch **不覆盖中国大陆 watch-provider**
 * （CN 不在支持区域里，CN provider 数恒 0）。所以 `getWatchProviders` 对 region=CN
 * 返回空；"在哪看" 的 CN 方案不走 TMDB（见 media-modules-plan 决策）。港/台/美等区有数据。
 *
 * 缓存：不在这里做（不用 next/cache，方便独立测试）；评分 / providers 由上层 enrich
 * 步骤写入 `anime` 表字段 + 时间戳，过期再刷（沿用项目约定）。
 */

import type { WatchProviderEntry, WatchProvidersCache } from "@/db/schema";

const BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

const TOKEN = process.env.TMDB_API_TOKEN ?? "";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_ATTEMPTS = 2;

export type TmdbMediaType = "movie" | "tv";

export interface TmdbSearchHit {
  tmdbId: number;
  type: TmdbMediaType;
  title: string;
  originalTitle: string | null;
  year: number | null;
  posterPath: string | null;
  voteAverage: number | null;
  overview: string | null;
}

export interface TmdbDetail extends TmdbSearchHit {
  backdropPath: string | null;
  genres: string[];
  imdbId: string | null;
  runtimeMinutes: number | null;
}

export type TmdbCatalogSource =
  | "trending"
  | "popular"
  | "top_rated"
  | "now_playing"
  | "on_the_air"
  | "airing_today";

export interface TmdbCatalogHit extends TmdbSearchHit {
  source: TmdbCatalogSource;
  popularity: number | null;
  voteCount: number | null;
  releaseDate: string | null;
  genreIds: number[];
  originalLanguage: string | null;
}

export function isTmdbConfigured(): boolean {
  return TOKEN.length > 0;
}

/** 拼 TMDB 图片完整 URL。size 例：w185 / w342 / w500 / w780 / original。 */
export function tmdbImageUrl(
  path: string | null | undefined,
  size = "w500",
): string | null {
  if (!path) return null;
  return `${IMAGE_BASE}/${size}${path}`;
}

function retryDelay(attempt: number): number {
  return 600 + attempt * 600;
}

async function tmdbFetch<T>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  { timeoutMs = DEFAULT_TIMEOUT_MS, maxAttempts = DEFAULT_ATTEMPTS } = {},
): Promise<T | null> {
  if (!TOKEN) return null;

  const url = new URL(`${BASE}${endpoint}`);
  if (params.language === undefined) url.searchParams.set("language", "zh-CN");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, retryDelay(attempt)));
          continue;
        }
        return null;
      }
      return (await res.json()) as T;
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, retryDelay(attempt)));
        continue;
      }
      return null;
    }
  }
  return null;
}

function yearOf(dateStr: string | undefined | null): number | null {
  if (!dateStr) return null;
  const m = /^(\d{4})/.exec(dateStr);
  return m ? Number(m[1]) : null;
}

interface RawSearchResult {
  id: number;
  title?: string; // movie
  name?: string; // tv
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  overview?: string;
}

interface RawCatalogResult extends RawSearchResult {
  media_type?: "movie" | "tv" | "person";
  adult?: boolean;
  popularity?: number;
  vote_count?: number;
  genre_ids?: number[];
  original_language?: string;
}

function mapSearchHit(r: RawSearchResult, type: TmdbMediaType): TmdbSearchHit {
  return {
    tmdbId: r.id,
    type,
    title: (type === "movie" ? r.title : r.name) ?? r.original_title ?? r.original_name ?? "",
    originalTitle: (type === "movie" ? r.original_title : r.original_name) ?? null,
    year: yearOf(type === "movie" ? r.release_date : r.first_air_date),
    posterPath: r.poster_path ?? null,
    voteAverage:
      typeof r.vote_average === "number" && r.vote_average > 0
        ? r.vote_average
        : null,
    overview: r.overview || null,
  };
}

function releaseDateOf(r: RawSearchResult, type: TmdbMediaType): string | null {
  return (type === "movie" ? r.release_date : r.first_air_date) ?? null;
}

function mapCatalogHit(
  r: RawCatalogResult,
  type: TmdbMediaType,
  source: TmdbCatalogSource,
): TmdbCatalogHit {
  return {
    ...mapSearchHit(r, type),
    source,
    popularity: typeof r.popularity === "number" ? r.popularity : null,
    voteCount: typeof r.vote_count === "number" ? r.vote_count : null,
    releaseDate: releaseDateOf(r, type),
    genreIds: Array.isArray(r.genre_ids) ? r.genre_ids : [],
    originalLanguage: r.original_language ?? null,
  };
}

const CATALOG_ENDPOINTS: Array<{
  endpoint: string;
  source: TmdbCatalogSource;
  type?: TmdbMediaType;
}> = [
  { endpoint: "/trending/all/week", source: "trending" },
  { endpoint: "/movie/popular", source: "popular", type: "movie" },
  { endpoint: "/movie/top_rated", source: "top_rated", type: "movie" },
  { endpoint: "/movie/now_playing", source: "now_playing", type: "movie" },
  { endpoint: "/tv/popular", source: "popular", type: "tv" },
  { endpoint: "/tv/top_rated", source: "top_rated", type: "tv" },
  { endpoint: "/tv/on_the_air", source: "on_the_air", type: "tv" },
  { endpoint: "/tv/airing_today", source: "airing_today", type: "tv" },
];

const CATALOG_SOURCE_PRIORITY: Record<TmdbCatalogSource, number> = {
  trending: 0,
  now_playing: 1,
  on_the_air: 1,
  airing_today: 1,
  popular: 2,
  top_rated: 3,
};

const TMDB_ANIMATION_GENRE_ID = 16;

function ymdToTime(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function todayToTime(value: string | Date | undefined): number {
  if (value instanceof Date) {
    return Date.parse(value.toISOString().slice(0, 10) + "T00:00:00Z");
  }
  if (typeof value === "string") {
    return ymdToTime(value) ?? Date.now();
  }
  return Date.now();
}

export function isCinemaCatalogCandidate(
  hit: TmdbCatalogHit,
  { today }: { today?: string | Date } = {},
): boolean {
  if (!hit.title.trim() || !hit.posterPath) return false;

  if (hit.type === "tv" && hit.genreIds.includes(TMDB_ANIMATION_GENRE_ID)) {
    return false;
  }

  const voteCount = hit.voteCount ?? 0;
  const popularity = hit.popularity ?? 0;
  if (hit.source === "top_rated" && voteCount < (hit.type === "movie" ? 100 : 50)) {
    return false;
  }
  if ((hit.source === "popular" || hit.source === "trending") && voteCount < 20 && popularity < 10) {
    return false;
  }

  const releaseTime = ymdToTime(hit.releaseDate);
  if (releaseTime != null) {
    const todayTime = todayToTime(today);
    const day = 24 * 60 * 60 * 1000;
    if (hit.type === "movie" && releaseTime - todayTime > 45 * day) {
      return false;
    }
    if (hit.type === "tv" && releaseTime - todayTime > 7 * day) {
      return false;
    }
  }

  return true;
}

/**
 * 公开影视库候选：TMDb 热门 / 高分 / 正在上映 / 正在播出的电影和电视剧。
 * 只取公开元数据，不接下载源；详情页再补豆瓣评分和正版观看入口。
 */
export async function getCinemaCatalog({
  limit = 80,
}: { limit?: number } = {}): Promise<TmdbCatalogHit[]> {
  const collected: TmdbCatalogHit[] = [];

  const lists = await Promise.all(
    CATALOG_ENDPOINTS.map(async (config) => {
      const data = await tmdbFetch<{ results?: RawCatalogResult[] }>(
        config.endpoint,
        { page: 1 },
        { timeoutMs: 8_000, maxAttempts: 1 },
      );
      return { config, results: data?.results ?? [] };
    }),
  );

  for (const { config, results } of lists) {
    for (const row of results) {
      const type =
        config.type ??
        (row.media_type === "movie" || row.media_type === "tv"
          ? row.media_type
          : null);
      if (!type || row.adult) continue;

      const hit = mapCatalogHit(row, type, config.source);
      if (!hit.title.trim()) continue;
      if (!isCinemaCatalogCandidate(hit)) continue;
      collected.push(hit);
    }
  }

  const best = new Map<string, TmdbCatalogHit>();
  for (const hit of collected) {
    const key = `${hit.type}:${hit.tmdbId}`;
    const current = best.get(key);
    if (!current) {
      best.set(key, hit);
      continue;
    }
    const nextPriority = CATALOG_SOURCE_PRIORITY[hit.source];
    const currentPriority = CATALOG_SOURCE_PRIORITY[current.source];
    if (
      nextPriority < currentPriority ||
      (nextPriority === currentPriority &&
        (hit.voteAverage ?? 0) > (current.voteAverage ?? 0))
    ) {
      best.set(key, hit);
    }
  }

  return [...best.values()]
    .sort((a, b) => {
      const sourceDelta =
        CATALOG_SOURCE_PRIORITY[a.source] - CATALOG_SOURCE_PRIORITY[b.source];
      if (sourceDelta !== 0) return sourceDelta;
      const voteDelta = (b.voteAverage ?? 0) - (a.voteAverage ?? 0);
      if (voteDelta !== 0) return voteDelta;
      return (b.popularity ?? 0) - (a.popularity ?? 0);
    })
    .slice(0, Math.max(1, limit));
}

/**
 * 按片名（+年份）搜索，返回最匹配的第一条。中文名优先（zh-CN），
 * 中文搜不到时回退英文原名再搜一次。
 */
export async function searchTitle(
  name: string,
  { type, year }: { type: TmdbMediaType; year?: number | null },
): Promise<TmdbSearchHit | null> {
  const query = name.trim();
  if (!query) return null;

  const yearParam = type === "movie" ? "year" : "first_air_date_year";
  const tryQuery = async (lang?: string) => {
    const data = await tmdbFetch<{ results?: RawSearchResult[] }>(
      `/search/${type}`,
      {
        query,
        [yearParam]: year ?? undefined,
        include_adult: "false",
        language: lang,
      },
    );
    return data?.results?.[0] ?? null;
  };

  const hit = (await tryQuery()) ?? (await tryQuery("en-US"));
  return hit ? mapSearchHit(hit, type) : null;
}

interface RawDetail extends RawSearchResult {
  backdrop_path?: string | null;
  genres?: Array<{ id: number; name: string }>;
  runtime?: number; // movie
  episode_run_time?: number[]; // tv
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
}

/** 取详情（中文标题 / 简介 / 海报 / 类型 / 评分 / IMDb id）。 */
export async function getDetail(
  tmdbId: number,
  type: TmdbMediaType,
): Promise<TmdbDetail | null> {
  const data = await tmdbFetch<RawDetail>(`/${type}/${tmdbId}`, {
    append_to_response: "external_ids",
  });
  if (!data) return null;

  const base = mapSearchHit(data, type);
  const runtime =
    type === "movie"
      ? (data.runtime ?? null)
      : (data.episode_run_time?.[0] ?? null);

  return {
    ...base,
    backdropPath: data.backdrop_path ?? null,
    genres: (data.genres ?? []).map((g) => g.name).filter(Boolean),
    imdbId: data.imdb_id ?? data.external_ids?.imdb_id ?? null,
    runtimeMinutes: runtime && runtime > 0 ? runtime : null,
  };
}

// TMDB provider 名规范化（有数据的区域用；CN 无数据）
const PROVIDER_NAME_ZH: Record<string, string> = {
  "iqiyi": "爱奇艺",
  "iq.com": "爱奇艺",
  "tencent video": "腾讯视频",
  "wetv": "腾讯视频",
  "youku": "优酷",
  "mgtv": "芒果TV",
  "bilibili": "哔哩哔哩",
  "netflix": "Netflix",
  "disney plus": "Disney+",
  "amazon prime video": "Prime Video",
};

function normalizeProviderName(name: string): string {
  return PROVIDER_NAME_ZH[name.trim().toLowerCase()] ?? name.trim();
}

interface RawProviderEntry {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
}
interface RawRegionProviders {
  link?: string;
  flatrate?: RawProviderEntry[];
  rent?: RawProviderEntry[];
  buy?: RawProviderEntry[];
  free?: RawProviderEntry[];
  ads?: RawProviderEntry[];
}

/**
 * 取「在哪看」。⚠️ region=CN 实测无数据（TMDB 不覆盖中国大陆），返回 null。
 * 港/台/美等区有数据，传对应 region 可用。
 */
export async function getWatchProviders(
  tmdbId: number,
  type: TmdbMediaType,
  region = "CN",
): Promise<WatchProvidersCache | null> {
  const data = await tmdbFetch<{ results?: Record<string, RawRegionProviders> }>(
    `/${type}/${tmdbId}/watch/providers`,
    { language: "" }, // 该接口不吃 language
  );
  const regionData = data?.results?.[region.toUpperCase()];
  if (!regionData) return null;

  const buckets: Array<[WatchProviderEntry["type"], RawProviderEntry[] | undefined]> = [
    ["flatrate", regionData.flatrate],
    ["free", regionData.free],
    ["ads", regionData.ads],
    ["rent", regionData.rent],
    ["buy", regionData.buy],
  ];

  const providers: WatchProviderEntry[] = [];
  const seen = new Set<number>();
  for (const [type_, list] of buckets) {
    for (const p of list ?? []) {
      if (seen.has(p.provider_id)) continue;
      seen.add(p.provider_id);
      providers.push({
        providerId: p.provider_id,
        providerName: normalizeProviderName(p.provider_name),
        type: type_,
        logoPath: p.logo_path ?? undefined,
      });
    }
  }

  if (providers.length === 0) return null;
  return {
    region: region.toUpperCase(),
    link: regionData.link,
    providers,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

export interface TmdbEpisode {
  /** 跨季累计的绝对集号（跳过 season 0 / 特别篇），对齐本项目 episodes.number 的绝对语义 */
  number: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  airDate: string | null; // YYYY-MM-DD
}

interface RawSeason {
  season_number: number;
  episode_count?: number;
}
interface RawEpisode {
  episode_number: number;
  name?: string;
  air_date?: string | null;
}

/**
 * 取一部电视剧的全部剧集（含播出日期），供电视剧追更用。
 * 先拉 `/tv/{id}` 的 seasons 列表（跳过 season 0 特别篇），再逐季拉
 * `/tv/{id}/season/{n}` 的 episodes；按季顺序展平成绝对集号。
 * best-effort：任一季拉失败只跳过该季，未配 token 或整体失败返回空数组。
 */
export async function getTvEpisodes(tmdbId: number): Promise<TmdbEpisode[]> {
  const detail = await tmdbFetch<{ seasons?: RawSeason[] }>(`/tv/${tmdbId}`, {});
  const seasons = (detail?.seasons ?? [])
    .filter((s) => s.season_number >= 1)
    .sort((a, b) => a.season_number - b.season_number);
  if (seasons.length === 0) return [];

  const out: TmdbEpisode[] = [];
  let abs = 0;
  for (const s of seasons) {
    const data = await tmdbFetch<{ episodes?: RawEpisode[] }>(
      `/tv/${tmdbId}/season/${s.season_number}`,
      {},
    );
    const eps = (data?.episodes ?? [])
      .slice()
      .sort((a, b) => a.episode_number - b.episode_number);
    for (const e of eps) {
      abs += 1;
      out.push({
        number: abs,
        seasonNumber: s.season_number,
        episodeNumber: e.episode_number,
        title: e.name || null,
        airDate: e.air_date || null,
      });
    }
  }
  return out;
}
