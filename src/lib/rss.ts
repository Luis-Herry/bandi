/**
 * RSS 2.0 parser tuned for Mikan / Nyaa / dmhy. Extracts magnet links from
 * <enclosure> URLs or scrapes them out of <description> when needed.
 *
 * Returns a normalized list of items, plus filter helpers (keywords / quality
 * / fansub group) that downstream cron jobs use to decide what to push to qBit.
 */

import { XMLParser } from "fast-xml-parser";

export interface RssItem {
  title: string;
  link: string;
  pubDate?: Date;
  magnet?: string;
  size?: string;
  description?: string;
}

export interface RssMatchOptions {
  keywords?: string[];
  quality?: string;
  group?: string;
}

export interface FetchRssOptions {
  timeoutMs?: number;
}

const MAGNET_RE = /magnet:\?[^"'\s<>]+/i;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

/** Fetch and parse an RSS feed URL. Resolves to [] on any error. */
export async function fetchRss(
  url: string,
  options: FetchRssOptions = {},
): Promise<RssItem[]> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          process.env.BANGUMI_USER_AGENT ??
          "luis/anime-tracker (https://github.com/luis)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      // RSS sources update at most every 30 min — no caching needed here,
      // but timeout via AbortSignal to avoid hanging cron jobs.
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml);
  } catch {
    return [];
  }
}

export function buildSearchRssUrls(feedUrl: string, queries: string[]): string[] {
  const urls = new Set<string>([feedUrl]);
  for (const query of queries) {
    const searchUrl = buildSearchRssUrl(feedUrl, query);
    if (searchUrl) urls.add(searchUrl);
  }
  return [...urls];
}

function buildSearchRssUrl(feedUrl: string, query: string): string | null {
  const keyword = query.trim();
  if (!keyword) return null;

  let url: URL;
  try {
    url = new URL(feedUrl);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (host.includes("animes.garden")) {
    url.searchParams.set("search", keyword);
    return url.toString();
  }

  if (host === "dmhy.org" || host.endsWith(".dmhy.org")) {
    url.searchParams.set("keyword", keyword);
    return url.toString();
  }

  return null;
}

/** Parse a raw RSS XML string. */
export function parseRss(xml: string): RssItem[] {
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    return [];
  }

  // RSS 2.0: rss > channel > item[]
  // Some feeds use Atom-ish wrappers; only RSS 2 is targeted here.
  const root = parsed as Record<string, unknown> | null;
  if (!root) return [];
  const rss = (root.rss ?? root) as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const rawItems = channel?.item;
  if (!rawItems) return [];
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];

  return list
    .map((raw): RssItem | null => {
      const item = raw as Record<string, unknown>;
      const title = toStr(item.title);
      if (!title) return null;
      const link = toStr(item.link);
      const description = toStr(item.description);
      const enclosure = item.enclosure as
        | { "@_url"?: string; "@_length"?: string }
        | undefined;
      const enclosureUrl = enclosure?.["@_url"];
      const size = enclosure?.["@_length"];

      let magnet: string | undefined;
      if (enclosureUrl?.startsWith("magnet:")) magnet = enclosureUrl;
      if (!magnet) {
        const inDesc = description.match(MAGNET_RE)?.[0];
        if (inDesc) magnet = inDesc;
      }
      if (!magnet && link.startsWith("magnet:")) magnet = link;

      const pubDateStr = toStr(item.pubDate);
      const pubDate = pubDateStr ? new Date(pubDateStr) : undefined;

      return {
        title,
        link: enclosureUrl ?? link,
        pubDate: pubDate && !Number.isNaN(pubDate.getTime()) ? pubDate : undefined,
        magnet,
        size,
        description,
      };
    })
    .filter((x): x is RssItem => x !== null);
}

function toStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v && "#text" in v) {
    return String((v as { "#text": unknown })["#text"] ?? "");
  }
  return String(v);
}

/* ── Match helpers ─────────────────────────────────────────────── */

const QUALITY_PATTERNS: Record<string, RegExp> = {
  "480p": /\b480p\b/i,
  "720p": /\b720p\b/i,
  "1080p": /\b1080p\b/i,
  "4k": /\b(4k|2160p)\b/i,
};

/* ── Season helpers ───────────────────────────────────────────── */

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/**
 * 从标题中识别季号。识别失败返回 null（外层一般 fallback 到 1）。
 *
 * 例：
 *   - "杖与剑的魔剑谭 第二季"        → 2
 *   - "Tsue to Tsurugi no Wistoria Season 2" → 2
 *   - "転生したらスライムだった件 第4期" → 4
 *   - "S2", "4th Season", "Part 2"   → 2/4/2
 */
export function extractSeason(title: string): number | null {
  if (!title) return null;
  // 中文/日文 "第N季/期"
  let m = title.match(/第\s*([0-9]+|[一二三四五六七八九十])\s*[季期]/);
  if (m) {
    const v = m[1];
    return /^\d+$/.test(v) ? Number(v) : CN_NUM[v] ?? null;
  }
  // 英文 "Season N" / "S2"
  m = title.match(/\b(?:season|s)\s*(\d+)\b/i);
  if (m) return Number(m[1]);
  // "2nd Season" / "4th Season"
  m = title.match(/\b(\d+)\s*(?:st|nd|rd|th)\s*season\b/i);
  if (m) return Number(m[1]);
  // "Part N"（极少数番剧用）
  m = title.match(/\bpart\s*(\d+)\b/i);
  if (m) return Number(m[1]);
  return null;
}

/**
 * 去掉标题末尾的「季号后缀」，留下基础剧名做模糊匹配。
 *
 * "杖与剑的魔剑谭 第二季"            → "杖与剑的魔剑谭"
 * "Tsue to Tsurugi no Wistoria Season 2" → "Tsue to Tsurugi no Wistoria"
 * "迷宫饭"                          → "迷宫饭"
 */
export function stripSeasonSuffix(s: string): string {
  if (!s) return s;
  return s
    .replace(/[\s　]*第\s*[0-9一二三四五六七八九十]+\s*[季期部]\s*$/i, "")
    .replace(/[\s\-]+(\d+)\s*(?:st|nd|rd|th)?\s*season\s*$/i, "")
    .replace(/[\s\-]+season\s*\d+\s*$/i, "")
    .replace(/[\s\-]+s\s*\d+\s*$/i, "")
    .replace(/[\s\-]+(?:part|cour)\s*\d+\s*$/i, "")
    .trim();
}

/** Return true if a feed item passes the filter rule. */
export function matchesRule(item: RssItem, rule: RssMatchOptions): boolean {
  const haystack = item.title.toLowerCase();
  if (rule.keywords?.length) {
    const allHit = rule.keywords.every((k) =>
      haystack.includes(k.toLowerCase()),
    );
    if (!allHit) return false;
  }
  if (rule.quality) {
    const pat = QUALITY_PATTERNS[rule.quality.toLowerCase()];
    if (pat && !pat.test(item.title)) return false;
  }
  if (rule.group) {
    if (!haystack.includes(rule.group.toLowerCase())) return false;
  }
  return true;
}

/* ── Library-aware match ─────────────────────────────────────── */

import type { DownloadPreferences } from "@/lib/preferences";
import { expandZhVariants } from "@/lib/zh-convert";

/**
 * 当前追番库中的一项最小信息，用来对照 RSS 标题。
 * cron 那边把 watching/planning 的 userAnime join anime 之后传进来。
 */
export interface LibraryAnimeRef {
  animeId: number;
  title: string;
  titleJa: string | null;
}

export interface MatchAgainstLibraryResult {
  /** 通过所有检查，返回命中的番剧 id 和命中时使用的名字（用于日志）。 */
  ok: true;
  animeId: number;
  animeTitle: string;
}

export interface MatchAgainstLibraryReject {
  ok: false;
  /** 哪一道关卡没过，给日志看的。 */
  reason:
    | "no-magnet"
    | "not-in-library"
    | "group-not-allowed"
    | "keyword-missing"
    | "quality-not-allowed";
}

/**
 * 对照「已订阅番剧 + 用户偏好」过滤一条 RSS item。
 *
 * 流程：
 *  1. 必须有 magnet。
 *  2. 标题必须包含某个已订阅番剧的 title 或 titleJa（不区分大小写、太短的番名跳过避免误匹）。
 *  3. 偏好里 preferredGroups 非空时，标题须命中其中之一（大小写不敏感）。
 *  4. requiredKeywords 非空时，标题须命中其中之一（OR，命中任一即通过）。
 *  5. preferredQualities 非空时，按数组顺序匹配，第一个命中即通过。
 *
 * 全程纯函数，不读数据库。
 */
export function matchAgainstLibrary(
  item: RssItem,
  library: LibraryAnimeRef[],
  prefs: DownloadPreferences,
): MatchAgainstLibraryResult | MatchAgainstLibraryReject {
  if (!item.magnet) return { ok: false, reason: "no-magnet" };

  const titleLower = item.title.toLowerCase();
  const itemSeason = extractSeason(item.title); // null 表示 RSS 未标季号

  // 2. library 匹配：用「完整名」和「去掉季后缀的基名」两种候选去 includes。
  //    季号约束（兼容 dmhy 这类常省略季号的源）：
  //      - 两边都标了季号，且不一致 → 拒绝
  //      - 库里标了 ≥2 季、RSS 没标   → 通过（RSS 通常默认当前季）
  //      - 库里没标（第一季）、RSS 标了 ≥2 → 拒绝（明显不是同季）
  //    候选按长度降序，更具体的优先命中。
  type Candidate = {
    animeId: number;
    animeTitle: string;
    needle: string;
    expectedSeason: number | null;
  };
  const candidates: Candidate[] = [];
  for (const a of library) {
    const expected =
      extractSeason(a.title) ?? extractSeason(a.titleJa ?? "") ?? null;
    const push = (n: string | null | undefined) => {
      if (!n) return;
      const t = n.trim();
      if (t.length < 3) return;
      // 同时按原文 / 繁体 / 简体三种形态推进去，ANi 这类繁体源也能命中
      for (const variant of expandZhVariants(t)) {
        if (variant.length < 3) continue;
        candidates.push({
          animeId: a.animeId,
          animeTitle: a.title,
          needle: variant,
          expectedSeason: expected,
        });
      }
    };
    push(a.title);
    push(a.titleJa);
    push(stripSeasonSuffix(a.title));
    push(stripSeasonSuffix(a.titleJa ?? ""));
  }
  // 去重 + 长候选优先
  const seen = new Set<string>();
  const sorted = candidates
    .filter((c) => {
      const k = `${c.animeId}|${c.needle.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.needle.length - a.needle.length);

  let hit: { animeId: number; animeTitle: string } | null = null;
  for (const c of sorted) {
    if (!titleLower.includes(c.needle.toLowerCase())) continue;
    if (c.expectedSeason != null && itemSeason != null) {
      if (c.expectedSeason !== itemSeason) continue;
    } else if (c.expectedSeason == null && itemSeason != null && itemSeason > 1) {
      continue;
    }
    hit = { animeId: c.animeId, animeTitle: c.animeTitle };
    break;
  }
  if (!hit) return { ok: false, reason: "not-in-library" };

  // 3. 字幕组
  if (prefs.preferredGroups.length > 0) {
    const groupHit = prefs.preferredGroups.some((g) => {
      const gTrim = g.trim();
      if (!gTrim) return false;
      return titleLower.includes(gTrim.toLowerCase());
    });
    if (!groupHit) return { ok: false, reason: "group-not-allowed" };
  }

  // 4. 关键字（OR）
  if (prefs.requiredKeywords.length > 0) {
    const kwHit = prefs.requiredKeywords.some((k) => {
      const kTrim = k.trim();
      if (!kTrim) return false;
      return titleLower.includes(kTrim.toLowerCase());
    });
    if (!kwHit) return { ok: false, reason: "keyword-missing" };
  }

  // 5. 画质（数组顺序，首个命中即接受）
  if (prefs.preferredQualities.length > 0) {
    const qHit = prefs.preferredQualities.some((q) => {
      const qTrim = q.trim();
      if (!qTrim) return false;
      const key = qTrim.toLowerCase();
      const pat = QUALITY_PATTERNS[key];
      if (pat) return pat.test(item.title);
      // 自定义画质字符串，退化为子串匹配
      return titleLower.includes(key);
    });
    if (!qHit) return { ok: false, reason: "quality-not-allowed" };
  }

  return { ok: true, animeId: hit.animeId, animeTitle: hit.animeTitle };
}

/* ── Episode number extraction ───────────────────────────────── */

/**
 * 从 release 标题中识别集号，识别失败返回 null。
 *
 * 覆盖格式（按优先级从高到低）：
 *   - 第07话 / 第7集 / 第 07 話
 *   - S01E07 / S1E7
 *   - E07 / E7（前后必须是单词边界）
 *   - [07] / [07v2]
 *   - (07) / (07v2)
 *   - "- 07" / "- 07v2"（破折号后空格再跟数字）
 *   - 裸数字（最后兜底，需排除画质标记和年份）
 *
 * 与 episode/[ep]/sources/route.ts 里的 containsEpisode 逻辑对偶：
 * 那边是「给定集号，匹配标题」；这边是「给定标题，抠出集号」。
 */
export function extractEpisodeNumber(title: string): number | null {
  if (!title) return null;

  // 0. 季内集号 + 总集号同现时，优先取绝对集号。
  let m = title.match(/[总總]\s*第\s*0*(\d{1,3})/);
  if (m) return Number(m[1]);

  // 1. 中文/日文 "第X话/集/話"，最可靠
  m = title.match(/第\s*0*(\d{1,3})\s*[话集話]/);
  if (m) return Number(m[1]);

  // 2. S01E07 / S1E7 形式，本地库文件名常见
  m = title.match(/\bS\d{1,2}E0*(\d{1,3})(?:v\d+)?(?![A-Za-z0-9])/i);
  if (m) return Number(m[1]);

  // 3. E07 / E7 形式（前后为非字母数字或字符串边界）
  m = title.match(/(?:^|[^A-Za-z0-9])E0*(\d{1,3})(?:v\d+)?(?![A-Za-z0-9])/i);
  if (m) return Number(m[1]);

  // 4. [07] / [07v2]，需排除 [1080p] 这类
  const bracketMatches = title.matchAll(/\[(\d{1,3})(?:v\d+)?\]/g);
  for (const bm of bracketMatches) {
    const n = Number(bm[1]);
    // 排除显然不是集号的：四位数（年份）或 >=480 的画质值
    if (bm[1].length >= 4) continue;
    if (n >= 480) continue;
    return n;
  }

  // 5. (07) / (07v2)
  const parenMatches = title.matchAll(/\((\d{1,3})(?:v\d+)?\)/g);
  for (const pm of parenMatches) {
    const n = Number(pm[1]);
    if (pm[1].length >= 4) continue;
    if (n >= 480) continue;
    return n;
  }

  // 6. " - 07" / " - 07v2"（破折号 + 空白 + 集号）
  m = title.match(/[-－]\s+0*(\d{1,3})(?:v\d+)?(?![A-Za-z0-9p])/);
  if (m) return Number(m[1]);

  // 7. 裸数字兜底：扫所有 1-3 位数字 token，排除画质和年份
  //    画质：1080p / 720p / 480p / 2160p / 4k 已不会匹配（带 p / k 后缀）
  //    年份：4 位数被 \d{1,3} 排除；额外排除 1900-2099 出现的 token
  const tokens = title.matchAll(
    /(?:^|[^0-9A-Za-z./-])(\d{1,3})(?:v\d+)?(?![0-9A-Za-z./-])/g,
  );
  for (const t of tokens) {
    const n = Number(t[1]);
    // 太大的不像集号（实际几乎没有番剧超过 999 集，且 100+ 容易撞到误识）
    if (n <= 0 || n > 999) continue;
    return n;
  }

  return null;
}
