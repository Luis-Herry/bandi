import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type {
  YucAtomEntry,
  YucAtomPage,
  YucEntry,
  YucPageParseOptions,
  YucProvider,
  YucSeasonParseOptions,
  YucSourceKind,
  YucSourceKeyParts,
} from "./types";

export type {
  YucAtomEntry,
  YucAtomPage,
  YucEntry,
  YucPageParseOptions,
  YucProvider,
  YucSeasonParseOptions,
  YucSourceKind,
  YucSourceKeyParts,
} from "./types";

const DEFAULT_BASE_URL = "https://yuc.wiki/";

const WEEKDAY_BY_LABEL: Readonly<Record<string, number>> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/gu, " ").trim();
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

function elementLines(element: Cheerio<AnyNode>): string[] {
  const html = element.html();
  if (!html) return unique([element.text()]);
  const withBreaks = html.replace(/<br\s*\/?\s*>/giu, "\n");
  const fragment = load(`<body>${withBreaks}</body>`);
  return unique(fragment("body").text().split(/\r?\n/u));
}

function normalizeTitleKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function cleanScheduleTitle(value: string): string {
  return cleanText(value)
    .replace(/\s*#\s*\d+(?:\s*[~～-]\s*\d+)?\s*[~～]?\s*$/u, "")
    .trim();
}

/**
 * Resolve a URL and reject every scheme except HTTP(S). Yuc's own legacy HTTP
 * links are upgraded to the canonical HTTPS host.
 */
export function normalizeYucUrl(
  value: string | null | undefined,
  baseUrl = DEFAULT_BASE_URL,
): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;

    if (url.hostname === "yuc.wiki" || url.hostname === "www.yuc.wiki") {
      url.protocol = "https:";
      url.hostname = "yuc.wiki";
      url.port = "";
    }
    return url.toString();
  } catch {
    return null;
  }
}

function sourcePageId(sourceKind: YucSourceKind, sourceUrl: string): string {
  try {
    const pathname = new URL(sourceUrl).pathname.replace(/^\/+|\/+$/gu, "");
    const pageId = pathname.split("/").filter(Boolean).at(-1);
    if (pageId && /^[a-z0-9_-]+$/iu.test(pageId)) return pageId.toLowerCase();
  } catch {
    // Fall through to the stable source-kind default.
  }
  if (sourceKind === "season") return "season";
  if (sourceKind === "future") return "new";
  if (sourceKind === "special") return "sp";
  return "movie";
}

function stableTitleHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function buildYucSourceKey(
  sourceKind: YucSourceKind,
  sourceUrl: string,
  title: string,
  titleJa: string | null,
): string {
  const identity = `${normalizeTitleKey(title)}\u0000${normalizeTitleKey(titleJa ?? "")}`;
  return `yuc:${sourceKind}:${sourcePageId(sourceKind, sourceUrl)}:${stableTitleHash(identity)}`;
}

export function parseYucSourceKey(value: string): YucSourceKeyParts | null {
  const match = value.match(
    /^yuc:(season|future|special|movie):([a-z0-9_-]+):([a-f0-9]{16})$/u,
  );
  if (!match) return null;
  const sourceKind = match[1] as YucSourceKind;
  const pageId = match[2];
  const validPage =
    (sourceKind === "season" && /^20\d{4}$/u.test(pageId)) ||
    (sourceKind === "future" && pageId === "new") ||
    (sourceKind === "special" && pageId === "sp") ||
    (sourceKind === "movie" && pageId === "movie");
  if (!validPage) return null;
  return {
    sourceKind,
    pageId,
    stableHash: match[3],
  };
}

/** Normalize one encoded dynamic-route segment before validating its identity. */
export function decodeYucSourceKeyParam(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return parseYucSourceKey(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Resolve an opaque source key without guessing. Duplicate matches (including a
 * theoretical hash collision) fail closed so an add route cannot select the
 * wrong work.
 */
export function findYucEntryBySourceKey(
  entries: readonly YucEntry[],
  sourceKey: string,
): YucEntry | null {
  if (!parseYucSourceKey(sourceKey)) return null;
  const matches = entries.filter((entry) => entry.sourceKey === sourceKey);
  return matches.length === 1 ? matches[0] : null;
}

export function inferYucProviderService(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (hostMatches(host, "crunchyroll.com")) return "Crunchyroll";
  if (hostMatches(host, "netflix.com")) return "Netflix";
  if (hostMatches(host, "bilibili.com")) return "哔哩哔哩";
  if (hostMatches(host, "gamer.com.tw")) return "巴哈姆特动画疯";
  if (
    [
      "amazon.com",
      "amazon.co.jp",
      "amazon.co.uk",
      "amazon.de",
      "amazon.fr",
      "amazon.it",
      "amazon.es",
      "primevideo.com",
    ].some((domain) => hostMatches(host, domain))
  ) {
    return "Prime Video";
  }
  if (hostMatches(host, "disneyplus.com")) return "Disney+";
  if (hostMatches(host, "youtube.com") || host === "youtu.be") return "YouTube";
  if (hostMatches(host, "iqiyi.com")) return "爱奇艺";
  if (host === "v.qq.com" || host.endsWith(".v.qq.com")) return "腾讯视频";
  if (hostMatches(host, "youku.com")) return "优酷";
  return null;
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function parseProviders(
  $: CheerioAPI,
  wrapper: Cheerio<AnyNode>,
  sourceUrl: string,
): YucProvider[] {
  const result: YucProvider[] = [];
  const seen = new Set<string>();
  wrapper.find(".tr_area a[href]").each((_, anchor) => {
    const link = $(anchor);
    const url = normalizeYucUrl(link.attr("href"), sourceUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    result.push({
      label: cleanText(link.find(".area").first().text() || link.text()),
      service: inferYucProviderService(url),
      url,
    });
  });
  return result;
}

function parseWeekday(value: string): number | null {
  const match = value.match(/周([一二三四五六日天])/u);
  return match ? WEEKDAY_BY_LABEL[match[1]] : null;
}

function parseWeeklyTime(value: string): string | null {
  const match = value.match(/\b(\d{1,2}:\d{2})\s*[~～]?/u);
  return match?.[1] ?? null;
}

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isoDate(year: number, month: number, day: number): string | null {
  if (!isValidDate(year, month, day)) return null;
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseExactDate(
  value: string | null,
  fallbackYear?: number,
  seasonMonth?: number,
): string | null {
  if (!value) return null;

  const full = value.match(/\b(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})\b/u);
  if (full) return isoDate(Number(full[1]), Number(full[2]), Number(full[3]));

  const short = value.match(/(?:^|\D)(\d{1,2})[\/-](\d{1,2})(?=\D|$)/u);
  if (!short || fallbackYear === undefined) return null;

  const month = Number(short[1]);
  const day = Number(short[2]);
  let year = fallbackYear;
  if (seasonMonth !== undefined) {
    if (month - seasonMonth > 6) year -= 1;
    if (seasonMonth - month > 6) year += 1;
  }
  return isoDate(year, month, day);
}

function parseEpisodeCount(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/(?:全\s*|=\s*)(\d+)\s*话/u);
  return match ? Number(match[1]) : null;
}

function parseSeasonHint(value: string | null): {
  year: number | null;
  month: number | null;
} {
  if (!value) return { year: null, month: null };
  const seasonal = value.match(/\b(20\d{2})\s*([春夏秋冬])/u);
  if (seasonal) {
    const monthBySeason: Record<string, number> = {
      冬: 1,
      春: 4,
      夏: 7,
      秋: 10,
    };
    return { year: Number(seasonal[1]), month: monthBySeason[seasonal[2]] };
  }

  const exact = value.match(/\b(20\d{2})[\/-](\d{1,2})/u);
  if (exact) return { year: Number(exact[1]), month: Number(exact[2]) };

  const year = value.match(/\b(20\d{2})\b/u);
  return { year: year ? Number(year[1]) : null, month: null };
}

function parseFormat(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLocaleLowerCase("en-US");
  if (/movie|剧场|電影|电影/u.test(normalized)) return "Movie";
  if (/\bova\b/u.test(normalized)) return "OVA";
  if (/\boad\b/u.test(normalized)) return "OAD";
  if (/\bweb\b|网络/u.test(normalized)) return "Web";
  if (/\bsp\b|special|特別篇|特别篇/u.test(normalized)) return "Special";
  if (/\btv\b/u.test(normalized)) return "TV";
  return null;
}

function extractLabelValue(lines: string[], labels: string[]): string | null {
  const pattern = new RegExp(`^(?:${labels.join("|")})[：:]\\s*(.+)$`, "u");
  for (const line of lines) {
    const match = line.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return null;
}

function coverFrom(
  wrapper: Cheerio<AnyNode>,
  sourceUrl: string,
): string | null {
  const image = wrapper.find("img[data-src], img[src]").first();
  const imageUrl = normalizeYucUrl(
    image.attr("data-src") ?? image.attr("src"),
    sourceUrl,
  );
  if (imageUrl) return normalizeYucCoverUrl(imageUrl, sourceUrl);
  return normalizeYucCoverUrl(
    wrapper.find("a.fancybox[href]").first().attr("href"),
    sourceUrl,
  );
}

/** Live YUC covers currently use this host; unknown CDN hosts degrade to a placeholder. */
export function normalizeYucCoverUrl(
  value: string | null | undefined,
  baseUrl = DEFAULT_BASE_URL,
): string | null {
  const normalized = normalizeYucUrl(value, baseUrl);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (url.protocol !== "https:" || url.hostname !== "i0.hdslb.com") return null;
  return url.toString();
}

function baseEntry(
  sourceKind: YucSourceKind,
  sourceUrl: string,
  title: string,
): YucEntry {
  return {
    sourceKey: "",
    sourceKind,
    sourceUrl,
    title,
    titleJa: null,
    coverUrl: null,
    premiereRaw: null,
    premiereDate: null,
    weeklyDay: null,
    weeklyTime: null,
    scheduleRaw: null,
    totalEpisodes: null,
    format: null,
    tags: [],
    staff: [],
    cast: [],
    studio: null,
    original: null,
    officialUrl: null,
    pvUrl: null,
    providers: [],
    seasonYear: null,
    seasonMonth: null,
  };
}

function finalize(entry: YucEntry): YucEntry {
  const providerByUrl = new Map(entry.providers.map((item) => [item.url, item]));
  return {
    ...entry,
    coverUrl: normalizeYucCoverUrl(entry.coverUrl, entry.sourceUrl),
    sourceKey: buildYucSourceKey(
      entry.sourceKind,
      entry.sourceUrl,
      entry.title,
      entry.titleJa,
    ),
    tags: unique(entry.tags),
    staff: unique(entry.staff),
    cast: unique(entry.cast),
    providers: [...providerByUrl.values()],
  };
}

function mergeEntries(current: YucEntry, incoming: YucEntry): YucEntry {
  const detailedTitle = incoming.titleJa ? incoming.title : current.title;
  return {
    ...current,
    title: detailedTitle,
    titleJa: incoming.titleJa ?? current.titleJa,
    coverUrl: current.coverUrl ?? incoming.coverUrl,
    premiereRaw: current.premiereRaw ?? incoming.premiereRaw,
    premiereDate: current.premiereDate ?? incoming.premiereDate,
    weeklyDay: current.weeklyDay ?? incoming.weeklyDay,
    weeklyTime: current.weeklyTime ?? incoming.weeklyTime,
    scheduleRaw: unique([current.scheduleRaw, incoming.scheduleRaw]).join(" · ") || null,
    totalEpisodes: current.totalEpisodes ?? incoming.totalEpisodes,
    format: current.format ?? incoming.format,
    tags: [...current.tags, ...incoming.tags],
    staff: [...current.staff, ...incoming.staff],
    cast: [...current.cast, ...incoming.cast],
    studio: current.studio ?? incoming.studio,
    original: current.original ?? incoming.original,
    officialUrl: current.officialUrl ?? incoming.officialUrl,
    pvUrl: current.pvUrl ?? incoming.pvUrl,
    providers: [...current.providers, ...incoming.providers],
    seasonYear: current.seasonYear ?? incoming.seasonYear,
    seasonMonth: current.seasonMonth ?? incoming.seasonMonth,
  };
}

function precedingCover(
  table: Cheerio<AnyNode>,
  sourceUrl: string,
): string | null {
  const parent = table.parent();
  const entryWrapper = parent.hasClass("table-container") ? parent.parent() : parent;
  let cursor = entryWrapper.prev();
  for (let index = 0; index < 4 && cursor.length; index += 1) {
    const cover = coverFrom(cursor, sourceUrl);
    if (cover) return cover;
    cursor = cursor.prev();
  }
  return null;
}

export function parseYucSeasonPage(
  html: string,
  options: YucSeasonParseOptions,
): YucEntry[] {
  const $ = load(html);
  const sourceUrl = normalizeYucUrl(options.sourceUrl) ?? DEFAULT_BASE_URL;
  const entries = new Map<string, YucEntry>();
  const scheduleKeyByCover = new Map<string, string>();
  let weeklyDay: number | null = null;

  $(".date2, .date_title_").each((_, element) => {
    const current = $(element);
    if (current.hasClass("date2")) {
      weeklyDay = parseWeekday(cleanText(current.text()));
      return;
    }

    const title = cleanScheduleTitle(current.text());
    if (!title) return;
    const wrapper = current.closest('div[style*="float"]');
    const dateBox = wrapper.find(".div_date").first();
    const timeRaw = cleanText(dateBox.find('[class^="imgtext"]').first().text());
    const metaRaw = cleanText(dateBox.find(".imgep").first().text());
    const premiereRaw = /\d{1,2}[\/-]\d{1,2}/u.test(metaRaw) ? metaRaw : null;
    const key = normalizeTitleKey(title);
    const entry = baseEntry("season", sourceUrl, title);
    entry.coverUrl = coverFrom(dateBox, sourceUrl);
    entry.premiereRaw = premiereRaw;
    entry.premiereDate = parseExactDate(
      premiereRaw,
      options.year,
      options.month,
    );
    entry.weeklyDay = weeklyDay;
    entry.weeklyTime = parseWeeklyTime(timeRaw);
    entry.scheduleRaw = unique([timeRaw, metaRaw]).join(" · ") || null;
    entry.totalEpisodes = parseEpisodeCount(metaRaw);
    entry.format = weeklyDay === null ? "Web" : "TV";
    entry.providers = parseProviders($, wrapper, sourceUrl);
    entry.seasonYear = options.year;
    entry.seasonMonth = options.month;

    entries.set(key, entries.has(key) ? mergeEntries(entries.get(key)!, entry) : entry);
    if (entry.coverUrl) scheduleKeyByCover.set(entry.coverUrl, key);
  });

  $(".title_main_r").each((_, element) => {
    const titleCell = $(element);
    const title = cleanText(
      titleCell.find('[class^="title_cn_r"]').first().text() ||
        elementLines(titleCell)[0],
    );
    if (!title) return;

    const titleJa =
      cleanText(titleCell.find('[class^="title_jp_r"]').first().text()) || null;
    const table = titleCell.closest("table");
    const staff = elementLines(table.find('[class^="staff_r"]').first());
    const cast = elementLines(table.find('[class^="cast_r"]').first());
    const typeTags = elementLines(table.find('[class^="type_tag_r"]').first());
    const adaptation = cleanText(
      table.find('[class^="type_b_r"], [class^="type_c_r"]').first().text(),
    );
    const broadcastRaw = cleanText(
      table.find(".broadcast_r").first().text(),
    );
    const broadcastExtra = cleanText(
      table.find(".broadcast_ex_r").first().text(),
    );
    const incoming = baseEntry("season", sourceUrl, title);
    incoming.titleJa = titleJa;
    incoming.coverUrl = precedingCover(table, sourceUrl);
    incoming.premiereRaw = /\d{1,2}[\/-]\d{1,2}/u.test(broadcastRaw)
      ? broadcastRaw
      : null;
    incoming.premiereDate = parseExactDate(
      incoming.premiereRaw,
      options.year,
      options.month,
    );
    incoming.weeklyDay = parseWeekday(broadcastRaw);
    incoming.scheduleRaw = unique([broadcastRaw, broadcastExtra]).join(" · ") || null;
    incoming.totalEpisodes = parseEpisodeCount(
      unique([broadcastRaw, broadcastExtra]).join(" "),
    );
    incoming.format = incoming.weeklyDay === null ? null : "TV";
    incoming.tags = unique([adaptation, ...typeTags.flatMap((tag) => tag.split("/"))]);
    incoming.staff = staff;
    incoming.cast = cast;
    incoming.studio = extractLabelValue(staff, ["动画制作", "制作"]);
    incoming.original = extractLabelValue(staff, ["原作", "原案", "原著", "作者"]);
    table.find(".link_a_r a[href]").each((__, anchor) => {
      const link = $(anchor);
      const label = cleanText(link.text()).toLocaleLowerCase("zh-CN");
      const url = normalizeYucUrl(link.attr("href"), sourceUrl);
      if (!url) return;
      if (/官网|official/u.test(label)) incoming.officialUrl ??= url;
      if (/\bpv\b|预告/u.test(label)) incoming.pvUrl ??= url;
    });
    incoming.seasonYear = options.year;
    incoming.seasonMonth = options.month;

    const titleKey = normalizeTitleKey(title);
    const key =
      (entries.has(titleKey) && titleKey) ||
      (incoming.coverUrl ? scheduleKeyByCover.get(incoming.coverUrl) : undefined) ||
      titleKey;
    entries.set(
      key,
      entries.has(key) ? mergeEntries(entries.get(key)!, incoming) : incoming,
    );
  });

  return [...entries.values()].map(finalize);
}

function parseCardPage(
  html: string,
  sourceKind: "future" | "special" | "movie",
  sourceUrl: string,
): YucEntry[] {
  const $ = load(html);
  const entries = new Map<string, YucEntry>();
  const titleSelector =
    sourceKind === "future"
      ? '[class^="future_title_"]'
      : sourceKind === "special"
        ? '[class^="sp_title"]'
        : ".movie_title";

  $(titleSelector).each((_, element) => {
    const titleCell = $(element);
    const title = cleanText(elementLines(titleCell).join(" "));
    if (!title) return;
    const wrapper = titleCell.closest('div[style*="float"]');
    const entry = baseEntry(sourceKind, sourceUrl, title);
    entry.coverUrl = coverFrom(wrapper, sourceUrl);

    if (sourceKind === "future") {
      const typeRaw = cleanText(
        wrapper.find('[class^="future_type_"]').first().text(),
      );
      const dateRaw = cleanText(
        wrapper.find('[class^="future_date"]').first().text(),
      );
      const season = parseSeasonHint(dateRaw);
      entry.premiereRaw = dateRaw || null;
      entry.premiereDate = parseExactDate(dateRaw || null);
      entry.scheduleRaw = dateRaw || null;
      entry.format = parseFormat(typeRaw);
      entry.tags = unique([typeRaw]);
      entry.original = /原创/u.test(typeRaw) ? "原创" : null;
      entry.seasonYear = season.year;
      entry.seasonMonth = season.month;
    } else if (sourceKind === "special") {
      const typeRaw = cleanText(wrapper.find('[class^="type-"]').first().text());
      const releaseRaw = cleanText(
        wrapper.find('[class^="sp_release"]').first().text(),
      );
      const season = parseSeasonHint(releaseRaw);
      entry.premiereRaw = releaseRaw || null;
      entry.premiereDate = parseExactDate(releaseRaw || null);
      entry.scheduleRaw = releaseRaw || null;
      entry.format = parseFormat(typeRaw);
      entry.tags = unique([typeRaw]);
      entry.seasonYear = season.year;
      entry.seasonMonth = season.month;
    } else {
      const statusRaw = cleanText(wrapper.find(".type-o").first().text());
      const releaseRaw = cleanText(wrapper.find(".movie_release").first().text());
      const isTentative = /原定|延期|取消|待定/u.test(`${statusRaw} ${releaseRaw}`);
      const season = isTentative
        ? { year: null, month: null }
        : parseSeasonHint(releaseRaw);
      entry.premiereRaw = releaseRaw || null;
      entry.premiereDate = isTentative ? null : parseExactDate(releaseRaw || null);
      entry.scheduleRaw = unique([statusRaw, releaseRaw]).join(" · ") || null;
      entry.format = "Movie";
      entry.tags = unique([statusRaw]);
      entry.seasonYear = season.year;
      entry.seasonMonth = season.month;
    }

    const key = normalizeTitleKey(title);
    entries.set(key, entries.has(key) ? mergeEntries(entries.get(key)!, entry) : entry);
  });

  return [...entries.values()].map(finalize);
}

export function parseYucFuturePage(
  html: string,
  options: YucPageParseOptions = {},
): YucEntry[] {
  const sourceUrl =
    normalizeYucUrl(options.sourceUrl ?? "https://yuc.wiki/new/") ??
    "https://yuc.wiki/new/";
  return parseCardPage(html, "future", sourceUrl);
}

export function parseYucSpecialPage(
  html: string,
  options: YucPageParseOptions = {},
): YucEntry[] {
  const sourceUrl =
    normalizeYucUrl(options.sourceUrl ?? "https://yuc.wiki/sp/") ??
    "https://yuc.wiki/sp/";
  return parseCardPage(html, "special", sourceUrl);
}

export function parseYucMoviePage(
  html: string,
  options: YucPageParseOptions = {},
): YucEntry[] {
  const sourceUrl =
    normalizeYucUrl(options.sourceUrl ?? "https://yuc.wiki/movie/") ??
    "https://yuc.wiki/movie/";
  return parseCardPage(html, "movie", sourceUrl);
}

function optionalAtomText(value: string): string | null {
  const cleaned = cleanText(value);
  return cleaned || null;
}

export function parseYucAtom(
  xml: string,
  options: YucPageParseOptions = {},
): YucAtomPage {
  const sourceUrl =
    normalizeYucUrl(options.sourceUrl ?? "https://yuc.wiki/atom.xml") ??
    "https://yuc.wiki/atom.xml";
  const $ = load(xml, { xml: true });
  const feed = $("feed").first();
  const selfUrl = normalizeYucUrl(
    feed.find('> link[rel="self"]').first().attr("href"),
    sourceUrl,
  );
  const entries: YucAtomEntry[] = [];

  feed.find("> entry").each((_, element) => {
    const entry = $(element);
    entries.push({
      title: cleanText(entry.find("> title").first().text()),
      url: normalizeYucUrl(entry.find("> link[href]").first().attr("href"), sourceUrl),
      id: normalizeYucUrl(entry.find("> id").first().text(), sourceUrl),
      publishedAt: optionalAtomText(entry.find("> published").first().text()),
      updatedAt: optionalAtomText(entry.find("> updated").first().text()),
      summaryHtml: optionalAtomText(entry.find("> summary").first().text()),
    });
  });

  return {
    title: cleanText(feed.find("> title").first().text()),
    subtitle: optionalAtomText(feed.find("> subtitle").first().text()),
    sourceUrl: selfUrl ?? sourceUrl,
    siteUrl: normalizeYucUrl(
      feed.find("> link:not([rel]), > link[rel=alternate]").first().attr("href"),
      sourceUrl,
    ),
    updatedAt: optionalAtomText(feed.find("> updated").first().text()),
    entries,
  };
}
