/**
 * Bangumi (bgm.tv) HTTP client.
 *
 * - Reads UA from env BANGUMI_USER_AGENT (required, but has a fallback).
 * - Retries transient failures with bounded backoff.
 * - Default callers get typed result or null/[] so the UI never breaks.
 * - Seasonal browse can opt into a typed unavailable error to show a real
 *   outage state instead of pretending the season has zero items.
 */

import { unstable_cache } from "next/cache";

const BASE = "https://api.bgm.tv";

const UA =
  process.env.BANGUMI_USER_AGENT ??
  "luis/anime-tracker (https://github.com/luis)";

const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_FETCH_ATTEMPTS = 2;

interface BgmFetchOptions extends RequestInit {
  throwOnUnavailable?: boolean;
  timeoutMs?: number;
  maxAttempts?: number;
}

export class BangumiUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "BangumiUnavailableError";
    this.cause = options?.cause;
  }
}

export function isBangumiUnavailableError(
  error: unknown,
): error is BangumiUnavailableError {
  return error instanceof BangumiUnavailableError;
}

function retryDelay(attempt: number): number {
  return 800 + attempt * 700 + Math.random() * 350;
}

export interface BgmImages {
  large?: string;
  common?: string;
  medium?: string;
  small?: string;
  grid?: string;
}

export interface BgmSubject {
  id: number;
  type: number; // 2 = anime
  name: string;
  name_cn?: string;
  summary?: string;
  date?: string;
  platform?: string;
  images?: BgmImages;
  total_episodes?: number;
  eps?: number;
  rating?: { score?: number; total?: number };
  tags?: Array<{ name: string; count: number }>;
  infobox?: Array<{
    key: string;
    value:
      | string
      | Array<{
          k?: string;
          v?: string;
        }>;
  }>;
}

export interface BgmEpisode {
  id: number;
  type: number;
  name?: string;
  name_cn?: string;
  sort: number; // 集数
  ep?: number;
  airdate?: string;
  duration?: string;
  desc?: string;
}

export interface BgmSearchHit extends BgmSubject {
  score?: number;
}

export interface BgmPerson {
  id: number;
  name: string;
  type: number;
  career?: string[];
  images?: BgmImages | null;
  short_summary?: string;
  summary?: string;
  locked?: boolean;
  infobox?: Array<{
    key: string;
    value:
      | string
      | Array<{
          k?: string;
          v?: string;
        }>;
  }>;
}

export interface BgmRelatedPerson {
  id: number;
  name: string;
  type: number;
  career?: string[];
  images?: BgmImages | null;
  relation: string;
  eps?: string;
}

export interface BgmRelatedCharacter {
  id: number;
  name: string;
  summary?: string;
  type: number;
  images?: BgmImages | null;
  relation: string;
  actors?: BgmPerson[];
}

export interface BgmPersonSubject {
  id: number;
  type: number;
  staff?: string;
  eps?: string;
  name: string;
  name_cn?: string;
  image?: string;
}

export interface BgmRelatedSubject {
  id: number;
  type: number;
  name: string;
  name_cn?: string;
  relation: string;
  images?: BgmImages | null;
}

export interface BgmCharacter {
  id: number;
  name: string;
  type?: number;
  summary?: string;
  images?: BgmImages | null;
  infobox?: Array<{
    key: string;
    value:
      | string
      | Array<{
          k?: string;
          v?: string;
        }>;
  }>;
}

async function bgmFetch<T>(
  path: string,
  init: BgmFetchOptions = {},
  attempt = 0,
): Promise<T | null> {
  const {
    throwOnUnavailable = false,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    maxAttempts = DEFAULT_FETCH_ATTEMPTS,
    ...fetchInit
  } = init;
  try {
    const headers = new Headers(fetchInit.headers);
    headers.set("User-Agent", UA);
    headers.set("Accept", "application/json");
    if (fetchInit.method === "POST" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(`${BASE}${path}`, {
      ...fetchInit,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt + 1 < maxAttempts) {
        await new Promise((r) => setTimeout(r, retryDelay(attempt)));
        return bgmFetch<T>(path, init, attempt + 1);
      }
      if (throwOnUnavailable) {
        throw new BangumiUnavailableError(
          `Bangumi unavailable: ${res.status}`,
        );
      }
      return null;
    }
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof BangumiUnavailableError) throw error;
    if (attempt + 1 < maxAttempts) {
      await new Promise((r) => setTimeout(r, retryDelay(attempt)));
      return bgmFetch<T>(path, init, attempt + 1);
    }
    if (throwOnUnavailable) {
      throw new BangumiUnavailableError("Bangumi request failed", {
        cause: error,
      });
    }
    return null;
  }
}

/** GET /v0/subjects/{id} */
export function getSubject(id: number): Promise<BgmSubject | null> {
  return bgmFetch<BgmSubject>(`/v0/subjects/${id}`);
}

/** GET /v0/episodes?subject_id=... */
export async function getEpisodes(
  subjectId: number,
  limit = 100,
): Promise<BgmEpisode[]> {
  const data = await bgmFetch<{ data?: BgmEpisode[] }>(
    `/v0/episodes?subject_id=${subjectId}&limit=${limit}`,
  );
  return data?.data ?? [];
}

export function selectMainBangumiEpisodes(episodeRows: BgmEpisode[]): BgmEpisode[] {
  return episodeRows.filter((episode) => episode.type === 0);
}

/** GET /calendar — 当周新番表 */
export async function getCalendar(): Promise<
  Array<{ weekday: { id: number }; items: BgmSubject[] }>
> {
  const data = await bgmFetch<
    Array<{ weekday: { id: number }; items: BgmSubject[] }>
  >("/calendar");
  return data ?? [];
}

/** POST /v0/search/subjects — newer search API */
export async function searchSubjects(
  q: string,
  limit = 10,
): Promise<BgmSearchHit[]> {
  if (!q.trim()) return [];
  const body = {
    keyword: q,
    filter: { type: [2] }, // anime
  };
  const data = await bgmFetch<{ data?: BgmSearchHit[] }>(
    `/v0/search/subjects?limit=${limit}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  return data?.data ?? [];
}

const BANGUMI_CREDIT_CACHE_SECONDS = 60 * 60 * 12;

/** GET /v0/subjects/{id}/characters */
export const getSubjectCharacters = unstable_cache(
  async (subjectId: number): Promise<BgmRelatedCharacter[]> => {
    const data = await bgmFetch<BgmRelatedCharacter[]>(
      `/v0/subjects/${subjectId}/characters`,
    );
    return data ?? [];
  },
  ["bangumi", "subject-characters"],
  { revalidate: BANGUMI_CREDIT_CACHE_SECONDS },
);

/** GET /v0/subjects/{id}/persons */
export const getSubjectPersons = unstable_cache(
  async (subjectId: number): Promise<BgmRelatedPerson[]> => {
    const data = await bgmFetch<BgmRelatedPerson[]>(
      `/v0/subjects/${subjectId}/persons`,
    );
    return data ?? [];
  },
  ["bangumi", "subject-persons"],
  { revalidate: BANGUMI_CREDIT_CACHE_SECONDS },
);

/** GET /v0/subjects/{id}/subjects */
export const getSubjectRelations = unstable_cache(
  async (subjectId: number): Promise<BgmRelatedSubject[]> => {
    const data = await bgmFetch<BgmRelatedSubject[]>(
      `/v0/subjects/${subjectId}/subjects`,
    );
    return data ?? [];
  },
  ["bangumi", "subject-relations"],
  { revalidate: BANGUMI_CREDIT_CACHE_SECONDS },
);

/** GET /v0/persons/{id} */
export const getPerson = unstable_cache(
  async (personId: number): Promise<BgmPerson | null> =>
    bgmFetch<BgmPerson>(`/v0/persons/${personId}`),
  ["bangumi", "person"],
  { revalidate: BANGUMI_CREDIT_CACHE_SECONDS },
);

/** GET /v0/persons/{id}/subjects */
export const getPersonSubjects = unstable_cache(
  async (personId: number): Promise<BgmPersonSubject[]> => {
    const data = await bgmFetch<BgmPersonSubject[]>(
      `/v0/persons/${personId}/subjects`,
    );
    return data ?? [];
  },
  ["bangumi", "person-subjects"],
  { revalidate: BANGUMI_CREDIT_CACHE_SECONDS },
);

/** GET /v0/characters/{id} */
export const getCharacter = unstable_cache(
  async (characterId: number): Promise<BgmCharacter | null> =>
    bgmFetch<BgmCharacter>(`/v0/characters/${characterId}`),
  ["bangumi", "character"],
  { revalidate: BANGUMI_CREDIT_CACHE_SECONDS },
);

/* ─────────── 按季度浏览 ─────────── */

export type BgmSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

const SEASON_TO_FIRST_MONTH: Record<BgmSeason, number> = {
  WINTER: 1,
  SPRING: 4,
  SUMMER: 7,
  FALL: 10,
};

/**
 * 按季度拉一季的番剧全集。
 *
 * - 实测 Bangumi `/v0/search/subjects` 每次最多返回 20 条（无论 limit 怎么传），
 *   所以一季 200+ 条需要 10+ 次请求。先打第 1 页拿 `total`，剩余页面并发拉。
 * - heat 顺序拉、客户端按 rating.score 重新降序排（无评分 / score=0 压底）
 * - 安全上限：最多 30 页 = 600 条，远超任何一季的真实规模
 * - **模块级内存缓存 30 分钟**：首页 + 番剧库每次进页面都会调这个；一季数据
 *   本来就天级别变化，30 分钟 TTL 远低于变化频率但能把页面打开从 400-800ms
 *   压到几乎 0ms。同 key 并发请求复用同一 inflight Promise，避免并发雪崩。
 * - 失败结果**不进缓存**（只缓存成功），下次进页面会再试。
 */
const SEASON_CACHE_TTL_MS = 30 * 60 * 1000;
const seasonCache = new Map<
  string,
  { data: BgmSubject[]; expiresAt: number }
>();
const seasonInflight = new Map<string, Promise<BgmSubject[]>>();

/** 给 cron 等场景用：拉新数据前主动清缓存 */
export function invalidateSeasonCache(): void {
  seasonCache.clear();
  seasonInflight.clear();
}

export async function getSubjectsBySeason(
  season: BgmSeason,
  year: number,
): Promise<BgmSubject[]> {
  const cacheKey = `${season}|${year}`;
  const hit = seasonCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const inflight = seasonInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = fetchSeasonSubjects(season, year)
    .then((data) => {
      if (data.length > 0) {
        seasonCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + SEASON_CACHE_TTL_MS,
        });
      }
      return data;
    })
    .finally(() => {
      seasonInflight.delete(cacheKey);
    });
  seasonInflight.set(cacheKey, promise);
  return promise;
}

async function fetchSeasonSubjects(
  season: BgmSeason,
  year: number,
): Promise<BgmSubject[]> {
  const firstMonth = SEASON_TO_FIRST_MONTH[season];
  const startY = year;
  const startM = firstMonth;
  const endY = firstMonth === 10 ? year + 1 : year;
  const endM = firstMonth === 10 ? 1 : firstMonth + 3;
  const start = `${startY}-${String(startM).padStart(2, "0")}-01`;
  const end = `${endY}-${String(endM).padStart(2, "0")}-01`;

  const body = JSON.stringify({
    sort: "heat",
    filter: {
      type: [2],
      air_date: [`>=${start}`, `<${end}`],
    },
  });

  const pageSize = 20; // API 实际上限
  const maxPages = 30;

  // 1) 拿第一页同时拿到 total
  const first = await bgmFetch<{
    total?: number;
    data?: BgmSubject[];
  }>(`/v0/search/subjects?limit=${pageSize}&offset=0`, {
    method: "POST",
    body,
    throwOnUnavailable: true,
    timeoutMs: 4_000,
    maxAttempts: 2,
  });
  if (!first?.data || first.data.length === 0) return [];

  const total = Math.min(first.total ?? first.data.length, maxPages * pageSize);
  const all: BgmSubject[] = [...first.data];

  // 2) 剩余页面并发拉
  const offsets: number[] = [];
  for (let off = pageSize; off < total; off += pageSize) {
    offsets.push(off);
  }
  if (offsets.length > 0) {
    const pages = await Promise.all(
      offsets.map((off) =>
        bgmFetch<{ data?: BgmSubject[] }>(
          `/v0/search/subjects?limit=${pageSize}&offset=${off}`,
          {
            method: "POST",
            body,
            throwOnUnavailable: true,
            timeoutMs: 4_000,
            maxAttempts: 2,
          },
        ),
      ),
    );
    for (const p of pages) {
      if (p?.data) all.push(...p.data);
    }
  }

  // 3) 评分高在前；无评分（0 / null / undefined）一律压底，按原 heat 顺序保留
  all.sort((a, b) => {
    const sa = a.rating?.score ?? 0;
    const sb = b.rating?.score ?? 0;
    if (sa === sb) return 0;
    if (sa === 0) return 1;
    if (sb === 0) return -1;
    return sb - sa;
  });

  return all;
}

/** 由 (年, 月) 推回 (season, year)，月份从 1 开始。 */
export function monthToSeason(year: number, month: number): {
  season: BgmSeason;
  year: number;
} {
  if (month <= 3) return { season: "WINTER", year };
  if (month <= 6) return { season: "SPRING", year };
  if (month <= 9) return { season: "SUMMER", year };
  return { season: "FALL", year };
}

export function currentSeason(now: Date = new Date()) {
  return monthToSeason(now.getFullYear(), now.getMonth() + 1);
}

export function shiftSeason(
  ref: { season: BgmSeason; year: number },
  delta: number,
): { season: BgmSeason; year: number } {
  const order: BgmSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const idx = order.indexOf(ref.season) + delta;
  const yearDelta = Math.floor(idx / 4);
  const newIdx = ((idx % 4) + 4) % 4;
  return { season: order[newIdx], year: ref.year + yearDelta };
}

/** Map a Bangumi subject to anime table shape */
export function subjectToAnimeRow(s: BgmSubject) {
  const cover =
    s.images?.large ?? s.images?.common ?? s.images?.medium ?? null;
  const tags = (s.tags ?? []).slice(0, 8).map((t) => t.name);
  let year: number | undefined;
  if (s.date && /^\d{4}/.test(s.date)) year = parseInt(s.date.slice(0, 4), 10);
  return {
    bangumiId: s.id,
    title: s.name_cn || s.name,
    titleJa: s.name,
    coverUrl: cover,
    synopsis: s.summary,
    type: "TV" as const,
    status: "airing" as const,
    totalEpisodes: s.eps ?? s.total_episodes ?? null,
    year: year ?? null,
    tags,
  };
}
