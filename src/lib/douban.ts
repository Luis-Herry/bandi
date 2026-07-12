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
  originalTitle: string | null;
  synopsis: string | null;
  year: number | null;
  rating: number | null; // 10 分制
  ratingCount: number | null;
  genres: string[];
  posterUrl: string | null;
  vendors: DoubanVendor[];
  /** 豆瓣声明的整部剧总集数。 */
  totalEpisodes: number | null;
  /** 豆瓣当前已可用的集数；用于无 TMDB 时生成不带播出日期的占位集。 */
  availableEpisodes: number | null;
}

export interface DoubanEpisodeAvailabilityInput {
  episodesCount?: unknown;
  episodesInfo?: unknown;
  lastEpisodeNumber?: unknown;
}

export interface DoubanEpisodeAvailability {
  totalEpisodes: number | null;
  availableEpisodes: number | null;
}

export interface DoubanCatalogHit {
  doubanId: string;
  title: string;
  type: DoubanType;
  rating: number | null;
  coverUrl: string | null;
  source: "hot";
  /** 命中豆瓣动画分类集合；热门接口本身不返回 genres。 */
  isAnimation: boolean;
  /** 对应媒介的动画分类集合请求成功，可安全把未命中的 movie 当真人电影。 */
  animationClassificationKnown: boolean;
}

const DOUBAN_ANIMATION_GENRES = new Set(["动画", "動畫"]);

/** 豆瓣的 tv 分类同时包含真人电视剧和电视动画，需再按详情题材分流。 */
export function hasDoubanAnimationGenre(
  genres: readonly string[] | null | undefined,
): boolean {
  return (genres ?? []).some((genre) =>
    DOUBAN_ANIMATION_GENRES.has(genre.trim()),
  );
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

export function normalizeDoubanIdentityTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s·・:：\-—_.,，。!！?？'"“”‘’()（）[\]【】]/g, "");
}

function chineseSeasonNumber(value: string): number | null {
  const digits = new Map([
    ["一", 1],
    ["二", 2],
    ["三", 3],
    ["四", 4],
    ["五", 5],
    ["六", 6],
    ["七", 7],
    ["八", 8],
    ["九", 9],
  ]);
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (tens ? (digits.get(tens) ?? 0) : 1) * 10 +
      (ones ? (digits.get(ones) ?? 0) : 0);
  }
  return digits.get(value) ?? null;
}

/** 只提取明确季标；篇章、Part、cour 不擅自换算成季度。 */
export function getExplicitAnimeSeasons(
  titles: readonly (string | null | undefined)[],
): number[] {
  const seasons = new Set<number>();
  for (const raw of titles) {
    const title = raw?.normalize("NFKC").toLowerCase();
    if (!title) continue;
    const patterns = [
      /第\s*(\d+)\s*(?:季|期|クール)/g,
      /(?:season|s)\s*0*(\d+)\b/g,
      /(\d+)(?:st|nd|rd|th)\s+season\b/g,
    ];
    for (const pattern of patterns) {
      for (const match of title.matchAll(pattern)) {
        const season = Number(match[1]);
        if (Number.isInteger(season) && season > 0) seasons.add(season);
      }
    }
    for (const match of title.matchAll(/第\s*([一二三四五六七八九十]+)\s*(?:季|期)/g)) {
      const season = chineseSeasonNumber(match[1]);
      if (season != null && season > 0) seasons.add(season);
    }
  }
  return [...seasons].sort((a, b) => a - b);
}

export function hasAnimeSeasonConflict(
  leftTitles: readonly (string | null | undefined)[],
  rightTitles: readonly (string | null | undefined)[],
): boolean {
  const left = getExplicitAnimeSeasons(leftTitles);
  const right = getExplicitAnimeSeasons(rightTitles);
  return (
    left.length > 0 &&
    right.length > 0 &&
    !left.some((season) => right.includes(season))
  );
}

/** 动画身份回退：标题/别名规范化精确相交，且双方年份已知相等、季别不冲突。 */
export function isReliableDoubanTitleSetMatch({
  doubanTitles,
  localTitles,
  doubanYear,
  localYear,
}: {
  doubanTitles: readonly (string | null | undefined)[];
  localTitles: readonly (string | null | undefined)[];
  doubanYear: number | null | undefined;
  localYear: number | null | undefined;
}): boolean {
  if (doubanYear == null || localYear == null || doubanYear !== localYear) {
    return false;
  }
  if (hasAnimeSeasonConflict(doubanTitles, localTitles)) return false;
  const doubanKeys = new Set(
    doubanTitles
      .filter((title): title is string => Boolean(title?.trim()))
      .map(normalizeDoubanIdentityTitle),
  );
  return localTitles
    .filter((title): title is string => Boolean(title?.trim()))
    .map(normalizeDoubanIdentityTitle)
    .some((key) => doubanKeys.has(key));
}

/** 标题搜索结果只有在标题一致、且已知年份不冲突时才可用于改内容类型。 */
export function isReliableDoubanInfoMatch(
  title: string,
  year: number | null | undefined,
  info: Pick<DoubanInfo, "title" | "originalTitle" | "year"> | null,
): boolean {
  if (!info) return false;
  return isReliableDoubanTitleSetMatch({
    doubanTitles: [info.title, info.originalTitle],
    localTitles: [title],
    doubanYear: info.year,
    localYear: year,
  });
}

function parseRating(rate: string | undefined): number | null {
  if (!rate) return null;
  const value = Number(rate);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mapCatalogSubject(
  item: SearchSubjectItem,
  type: DoubanType,
  isAnimation = false,
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
    isAnimation,
    animationClassificationKnown: false,
  };
}

interface DoubanCatalogFeed {
  hits: DoubanCatalogHit[];
  ok: boolean;
}

async function fetchCatalogType(
  type: DoubanType,
  limit: number,
  { tag = "热门", isAnimation = false } = {},
): Promise<DoubanCatalogFeed> {
  const params = new URLSearchParams({
    type,
    tag,
    sort: "recommend",
    page_limit: String(limit),
    page_start: "0",
  });
  const text = await fetchText(`${SEARCH_SUBJECTS_URL}?${params.toString()}`, {
    "User-Agent": DESKTOP_UA,
    Referer: "https://movie.douban.com/explore",
  });
  if (!text) return { hits: [], ok: false };

  let data: SearchSubjectsResponse;
  try {
    data = JSON.parse(text) as SearchSubjectsResponse;
  } catch {
    return { hits: [], ok: false };
  }

  return {
    hits: (Array.isArray(data.subjects) ? data.subjects : [])
      .map((item) => mapCatalogSubject(item, type, isAnimation))
      .filter((hit): hit is DoubanCatalogHit => hit != null),
    ok: true,
  };
}

export async function getDoubanCatalog({
  limit = 40,
}: { limit?: number } = {}): Promise<DoubanCatalogHit[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const perType = Math.min(50, Math.max(1, Math.ceil(safeLimit / 2)));
  // 热门列表不含 genres。额外两次分类集合请求先按 id 标记动画，比逐条详情请求低得多；
  // tv 使用豆瓣探索页的「日本动画」，movie 使用「动画」。详情补全仍会做最终保底。
  const [tvFeed, movieFeed, tvAnimationFeed, movieAnimationFeed] =
    await Promise.all([
      fetchCatalogType("tv", perType),
      fetchCatalogType("movie", perType),
      fetchCatalogType("tv", 50, {
        tag: "日本动画",
        isAnimation: true,
      }),
      fetchCatalogType("movie", 50, { tag: "动画", isAnimation: true }),
    ]);
  const animationIds = new Set(
    [...tvAnimationFeed.hits, ...movieAnimationFeed.hits].map(
      (hit) => `${hit.type}:${hit.doubanId}`,
    ),
  );
  const seen = new Set<string>();
  const hits: DoubanCatalogHit[] = [];

  for (const hit of [...tvFeed.hits, ...movieFeed.hits]) {
    const key = `${hit.type}:${hit.doubanId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      ...hit,
      isAnimation: animationIds.has(key),
      animationClassificationKnown:
        hit.type === "tv" ? tvAnimationFeed.ok : movieAnimationFeed.ok,
    });
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
  original_title?: string;
  intro?: string;
  year?: string;
  rating?: { value?: number; count?: number };
  genres?: string[];
  pic?: { normal?: string; large?: string };
  vendors?: Array<{ title?: string; url?: string }>;
  episodes_count?: number | string;
  episodes_info?: string;
  last_episode_number?: number | string | null;
}

function positiveInteger(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * 解析豆瓣剧集进度文案。豆瓣常见形态有「更新至 13 集」「32 集全」，
 * 也有已完结条目只给 episodes_count、episodes_info 为空的情况。
 */
export function parseDoubanEpisodeAvailability({
  episodesCount,
  episodesInfo,
  lastEpisodeNumber,
}: DoubanEpisodeAvailabilityInput): DoubanEpisodeAvailability {
  const declaredTotal = positiveInteger(episodesCount);
  const lastEpisode = positiveInteger(lastEpisodeNumber);
  const info = typeof episodesInfo === "string" ? episodesInfo.trim() : "";
  const completedMatch =
    /(\d+)\s*集\s*(?:全|完结|完結)/.exec(info) ??
    /(?:全|完结|完結)\s*(\d+)\s*集/.exec(info);
  const updatingMatch = /(?:更新至|更新到)\s*第?\s*(\d+)\s*集/.exec(info);
  const completedEpisodes = positiveInteger(completedMatch?.[1]);
  const updatingEpisodes = positiveInteger(updatingMatch?.[1]);
  const totalEpisodes =
    declaredTotal != null || completedEpisodes != null
      ? Math.max(declaredTotal ?? 0, completedEpisodes ?? 0)
      : null;
  const rawAvailable =
    updatingEpisodes ??
    completedEpisodes ??
    lastEpisode ??
    (info === "" ? declaredTotal : null);
  const availableEpisodes =
    rawAvailable != null && totalEpisodes != null
      ? Math.min(rawAvailable, totalEpisodes)
      : rawAvailable;

  return { totalEpisodes, availableEpisodes };
}

function mapSubject(doubanId: string, j: RexxarSubject): DoubanInfo {
  const ratingVal = j.rating?.value;
  const episodeAvailability = parseDoubanEpisodeAvailability({
    episodesCount: j.episodes_count,
    episodesInfo: j.episodes_info,
    lastEpisodeNumber: j.last_episode_number,
  });
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
    originalTitle: j.original_title?.trim() || null,
    synopsis: j.intro?.trim() || null,
    year: j.year ? Number(j.year) : null,
    rating: typeof ratingVal === "number" && ratingVal > 0 ? ratingVal : null,
    ratingCount:
      typeof j.rating?.count === "number" ? j.rating.count : null,
    genres: (j.genres ?? []).filter((g) => typeof g === "string"),
    posterUrl: j.pic?.normal ?? j.pic?.large ?? null,
    vendors,
    ...episodeAvailability,
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
