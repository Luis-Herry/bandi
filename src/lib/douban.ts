/**
 * 豆瓣（douban.com）抓取客户端 —— 中文评分 + CN「在哪看」平台链接。
 *
 * 实测（2026-06-26）可用路线（MetaShark 那套 Frodo API 老 apikey 已 400 失效、需签名）：
 *  - 搜索：`movie.douban.com/j/subject_suggest?q=`（轻量 JSON，反爬宽松，HTTP 200）
 *  - 详情：`m.douban.com/rexxar/api/v2/{movie|tv}/{id}` + 移动 UA + Referer
 *           → `rating.value`（评分）、`rating.count`、`genres`、`pic`、`vendors`（在线观看平台）
 *           桌面 `movie.douban.com/subject/{id}/` 整页会 302 跳 sec.douban.com 反爬，不用。
 *
 * 定位：评分 + 平台当「锦上添花」，best-effort + 缓存（写库字段 + 时间戳），抓不到不影响主体验。
 * 灰色：抓豆瓣违反其 ToS，个人自用风险低，别商用 / 别公开大规模跑。网络走系统代理。
 */

const SUGGEST_URL = "https://movie.douban.com/j/subject_suggest";
const SEARCH_SUBJECTS_URL = "https://movie.douban.com/j/search_subjects";
const REXXAR_BASE = "https://m.douban.com/rexxar/api/v2";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_ATTEMPTS = 2;

export type DoubanType = "movie" | "tv";

export interface DoubanVendor {
  name: string;
  url: string | null; // 只保留 http(s) 链接；douban:// 小程序链接置 null
}

export interface DoubanInfo {
  doubanId: string;
  title: string;
  year: number | null;
  rating: number | null; // 10 分制
  ratingCount: number | null;
  genres: string[];
  posterUrl: string | null;
  vendors: DoubanVendor[];
}

export interface DoubanCatalogHit {
  doubanId: string;
  title: string;
  type: DoubanType;
  rating: number | null;
  coverUrl: string | null;
  source: "hot";
}

interface SearchSubjectItem {
  id?: string;
  title?: string;
  rate?: string;
  cover?: string;
}

interface SearchSubjectsResponse {
  subjects?: SearchSubjectItem[];
}

async function fetchText(
  url: string,
  headers: Record<string, string>,
  { timeoutMs = DEFAULT_TIMEOUT_MS, attempts = DEFAULT_ATTEMPTS } = {},
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 600 + i * 700));
          continue;
        }
        return null;
      }
      return await res.text();
    } catch {
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 600 + i * 700));
        continue;
      }
      return null;
    }
  }
  return null;
}

interface SuggestItem {
  id: string;
  title: string;
  year?: string;
  type?: string;
  episode?: string;
  img?: string;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

function parseRating(rate: string | undefined): number | null {
  if (!rate) return null;
  const value = Number(rate);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mapCatalogSubject(
  item: SearchSubjectItem,
  type: DoubanType,
): DoubanCatalogHit | null {
  const doubanId = String(item.id ?? "").trim();
  const title = String(item.title ?? "").trim();
  if (!doubanId || !title) return null;

  return {
    doubanId,
    title,
    type,
    rating: parseRating(item.rate),
    coverUrl: item.cover ?? null,
    source: "hot",
  };
}

async function fetchCatalogType(
  type: DoubanType,
  limit: number,
): Promise<DoubanCatalogHit[]> {
  const params = new URLSearchParams({
    type,
    tag: "热门",
    sort: "recommend",
    page_limit: String(limit),
    page_start: "0",
  });
  const text = await fetchText(`${SEARCH_SUBJECTS_URL}?${params.toString()}`, {
    "User-Agent": DESKTOP_UA,
    Referer: "https://movie.douban.com/explore",
  });
  if (!text) return [];

  let data: SearchSubjectsResponse;
  try {
    data = JSON.parse(text) as SearchSubjectsResponse;
  } catch {
    return [];
  }

  return (Array.isArray(data.subjects) ? data.subjects : [])
    .map((item) => mapCatalogSubject(item, type))
    .filter((hit): hit is DoubanCatalogHit => hit != null);
}

export async function getDoubanCatalog({
  limit = 40,
}: { limit?: number } = {}): Promise<DoubanCatalogHit[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const perType = Math.min(50, Math.max(1, Math.ceil(safeLimit / 2)));
  const [tv, movies] = await Promise.all([
    fetchCatalogType("tv", perType),
    fetchCatalogType("movie", perType),
  ]);
  const seen = new Set<string>();
  const hits: DoubanCatalogHit[] = [];

  for (const hit of [...tv, ...movies]) {
    const key = `${hit.type}:${hit.doubanId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(hit);
    if (hits.length >= safeLimit) break;
  }

  return hits;
}

/** 按片名（+年份）搜豆瓣，返回最匹配条目的 id。 */
export async function searchDoubanId(
  name: string,
  year?: number | null,
): Promise<{ id: string; title: string; year: number | null } | null> {
  const query = name.trim();
  if (!query) return null;

  const text = await fetchText(
    `${SUGGEST_URL}?q=${encodeURIComponent(query)}`,
    { "User-Agent": DESKTOP_UA, Referer: "https://movie.douban.com/" },
  );
  if (!text) return null;

  let items: SuggestItem[];
  try {
    items = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(items) || items.length === 0) return null;

  const wanted = normalize(query);
  const byYearTitle =
    year != null
      ? items.find(
          (it) => Number(it.year) === year && normalize(it.title).includes(wanted),
        )
      : undefined;
  const byYear =
    year != null ? items.find((it) => Number(it.year) === year) : undefined;
  const byTitle = items.find((it) => normalize(it.title) === wanted);
  const best = byYearTitle ?? byYear ?? byTitle ?? items[0];

  return {
    id: best.id,
    title: best.title,
    year: best.year ? Number(best.year) : null,
  };
}

interface RexxarSubject {
  title?: string;
  year?: string;
  rating?: { value?: number; count?: number };
  genres?: string[];
  pic?: { normal?: string; large?: string };
  vendors?: Array<{ title?: string; url?: string }>;
}

function mapSubject(doubanId: string, j: RexxarSubject): DoubanInfo {
  const ratingVal = j.rating?.value;
  const vendors: DoubanVendor[] = (j.vendors ?? [])
    .map((v) => ({
      name: String(v.title ?? "").trim(),
      url:
        typeof v.url === "string" && /^https?:\/\//i.test(v.url) ? v.url : null,
    }))
    .filter((v) => v.name);

  return {
    doubanId,
    title: j.title ?? "",
    year: j.year ? Number(j.year) : null,
    rating: typeof ratingVal === "number" && ratingVal > 0 ? ratingVal : null,
    ratingCount:
      typeof j.rating?.count === "number" ? j.rating.count : null,
    genres: (j.genres ?? []).filter((g) => typeof g === "string"),
    posterUrl: j.pic?.normal ?? j.pic?.large ?? null,
    vendors,
  };
}

/** 取豆瓣详情（评分 + 在线观看平台）。按 type 选 movie/tv 端点，redirect 时自动换另一个。 */
export async function getDoubanSubject(
  doubanId: string,
  type: DoubanType,
): Promise<DoubanInfo | null> {
  const tryType = async (t: DoubanType): Promise<RexxarSubject | "redirect" | null> => {
    const text = await fetchText(`${REXXAR_BASE}/${t}/${doubanId}`, {
      "User-Agent": MOBILE_UA,
      Referer: `https://m.douban.com/movie/subject/${doubanId}/`,
    });
    if (!text) return null;
    if (text.includes("redirected you to")) return "redirect";
    try {
      return JSON.parse(text) as RexxarSubject;
    } catch {
      return null;
    }
  };

  let data = await tryType(type);
  if (data === "redirect") data = await tryType(type === "movie" ? "tv" : "movie");
  if (!data || data === "redirect") return null;
  return mapSubject(doubanId, data);
}

/** 搜索 + 详情：按片名拿豆瓣评分 + 平台。best-effort，失败返回 null。 */
export async function getDoubanInfo(
  name: string,
  { type, year }: { type: DoubanType; year?: number | null },
): Promise<DoubanInfo | null> {
  const hit = await searchDoubanId(name, year ?? null);
  if (!hit) return null;
  return getDoubanSubject(hit.id, type);
}
