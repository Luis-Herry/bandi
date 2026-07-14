import path from "node:path";
import type { BgmSeason } from "@/lib/bangumi";
import { normalizeRuntimeDirectory } from "@/lib/download-root";
import {
  createYucCache,
  YucUnavailableError,
  type YucCacheStatus,
} from "./cache";
import {
  findYucEntryBySourceKey,
  normalizeYucUrl,
  parseYucAtom,
  parseYucFuturePage,
  parseYucMoviePage,
  parseYucSeasonPage,
  parseYucSourceKey,
  parseYucSpecialPage,
} from "./parser";
import type { YucAtomPage, YucEntry } from "./types";
import { dedupeYucEntries } from "./match";

const PARSER_VERSION = 2;
const ATOM_TTL_MS = 2 * 60 * 60 * 1000;
const ACTIVE_PAGE_TTL_MS = 12 * 60 * 60 * 1000;
const HISTORICAL_PAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const YUC_ATOM_URL = "https://yuc.wiki/atom.xml";
const YUC_FUTURE_URL = "https://yuc.wiki/new/";
const YUC_SPECIAL_URL = "https://yuc.wiki/sp/";
const YUC_MOVIE_URL = "https://yuc.wiki/movie/";
const ATOM_SIGNAL_BUDGET_MS = 250;
const QUARTER_SOURCE_BUDGET_MS = 3_800;

const MONTH_BY_SEASON: Record<BgmSeason, number> = {
  WINTER: 1,
  SPRING: 4,
  SUMMER: 7,
  FALL: 10,
};

export type YucSourceStatus = YucCacheStatus | "unavailable";

export interface YucCatalogResult {
  entries: YucEntry[];
  status: YucSourceStatus;
  checkedAt: number | null;
}

export type YucEntryLookupResult =
  | { status: "found"; entry: YucEntry }
  | { status: "invalid" | "not_found" | "unavailable"; entry: null };

let cache: ReturnType<typeof createYucCache> | null = null;
let warnedMissingDirectory = false;

function getCache() {
  if (cache) return cache;
  cache = createYucCache({ cacheDir: getConfiguredCacheDirectory() });
  return cache;
}

function getConfiguredCacheDirectory(): string | null {
  const configured = process.env.YUC_CACHE_DIR?.trim();
  if (!configured) {
    if (!warnedMissingDirectory) {
      warnedMissingDirectory = true;
      console.warn(
        "[yuc] YUC_CACHE_DIR 未配置；本次仅使用进程内缓存，不会写入未配置的磁盘位置",
      );
    }
    return null;
  }
  const normalized = normalizeRuntimeDirectory(configured);
  if (!normalized) {
    throw new Error(
      process.env.ANIME_LOCAL_SERVER_APP === "1"
        ? `YUC_CACHE_DIR 必须是完整的 macOS 子目录：${configured}`
        : `YUC_CACHE_DIR 必须是完整的 Windows 盘符或 UNC 子目录：${configured}`,
    );
  }
  return normalized;
}

function seasonUrl(year: number, month: number): string {
  return `https://yuc.wiki/${year}${String(month).padStart(2, "0")}/`;
}

function pageTtl(year: number, month: number, now = new Date()): number {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const distance = (year - currentYear) * 12 + month - currentMonth;
  return Math.abs(distance) <= 3 ? ACTIVE_PAGE_TTL_MS : HISTORICAL_PAGE_TTL_MS;
}

export async function getYucSeasonPage(
  year: number,
  month: number,
  upstreamUpdatedAt: number | null = null,
  deadlineAt?: number,
): Promise<YucCatalogResult> {
  if (!Number.isInteger(year) || year < 1980 || year > 2100) {
    return unavailableCatalog();
  }
  if (![1, 4, 7, 10].includes(month)) return unavailableCatalog();
  const sourceUrl = seasonUrl(year, month);
  try {
    const result = await getCache().get({
      key: `season:${year}${String(month).padStart(2, "0")}`,
      sourceUrl,
      ttlMs: pageTtl(year, month),
      parserVersion: PARSER_VERSION,
      minimumRetainedRatio: 0.7,
      upstreamUpdatedAt,
      deadlineAt,
      parse: (source) =>
        parseYucSeasonPage(source, { year, month, sourceUrl }),
    });
    return {
      entries: result.items,
      status: result.status,
      checkedAt: result.checkedAt,
    };
  } catch (error) {
    logUnavailable("season", error);
    return unavailableCatalog();
  }
}

export async function getYucFuturePage(
  upstreamUpdatedAt: number | null = null,
  deadlineAt?: number,
): Promise<YucCatalogResult> {
  return getSupplementPage(
    "future",
    YUC_FUTURE_URL,
    parseYucFuturePage,
    upstreamUpdatedAt,
    deadlineAt,
  );
}

export async function getYucSpecialPage(
  upstreamUpdatedAt: number | null = null,
  deadlineAt?: number,
): Promise<YucCatalogResult> {
  return getSupplementPage(
    "special",
    YUC_SPECIAL_URL,
    parseYucSpecialPage,
    upstreamUpdatedAt,
    deadlineAt,
  );
}

export async function getYucMoviePage(
  upstreamUpdatedAt: number | null = null,
  deadlineAt?: number,
): Promise<YucCatalogResult> {
  return getSupplementPage(
    "movie",
    YUC_MOVIE_URL,
    parseYucMoviePage,
    upstreamUpdatedAt,
    deadlineAt,
  );
}

async function getSupplementPage(
  key: "future" | "special" | "movie",
  sourceUrl: string,
  parse: (source: string, options: { sourceUrl: string }) => YucEntry[],
  upstreamUpdatedAt: number | null,
  deadlineAt: number | undefined,
): Promise<YucCatalogResult> {
  try {
    const result = await getCache().get({
      key,
      sourceUrl,
      ttlMs: ACTIVE_PAGE_TTL_MS,
      parserVersion: PARSER_VERSION,
      upstreamUpdatedAt,
      deadlineAt,
      parse: (source) => parse(source, { sourceUrl }),
    });
    return {
      entries: result.items,
      status: result.status,
      checkedAt: result.checkedAt,
    };
  } catch (error) {
    logUnavailable(key, error);
    return unavailableCatalog();
  }
}

export async function getYucAtomPage(): Promise<YucAtomPage | null> {
  try {
    const result = await getCache().get({
      key: "atom",
      sourceUrl: YUC_ATOM_URL,
      ttlMs: ATOM_TTL_MS,
      parserVersion: PARSER_VERSION,
      parse: (source) => [
        normalizeYucAtomForCache(
          parseYucAtom(source, { sourceUrl: YUC_ATOM_URL }),
        ),
      ],
      countItems: (items) => items[0]?.entries.length ?? 0,
      minimumRetainedRatio: 0.7,
    });
    return result.items[0] ?? null;
  } catch (error) {
    logUnavailable("atom", error);
    return null;
  }
}

/** Atom supplies page timestamps; entry HTML is removed before the snapshot is saved. */
export function normalizeYucAtomForCache(page: YucAtomPage): YucAtomPage {
  return {
    ...page,
    entries: page.entries.map((entry) => ({ ...entry, summaryHtml: null })),
  };
}

export async function getYucEntriesForQuarter(
  year: number,
  season: BgmSeason,
): Promise<YucCatalogResult> {
  const month = MONTH_BY_SEASON[season];
  const deadlineAt = Date.now() + QUARTER_SOURCE_BUDGET_MS;
  const atomPage = await settleWithin(
    getYucAtomPage(),
    ATOM_SIGNAL_BUDGET_MS,
    null,
  );
  const [seasonPage, futurePage, specialPage, moviePage] = await Promise.all([
    getYucSeasonPage(
      year,
      month,
      atomPageUpdatedAt(atomPage, seasonUrl(year, month)),
      deadlineAt,
    ),
    getYucFuturePage(
      atomPageUpdatedAt(atomPage, YUC_FUTURE_URL),
      deadlineAt,
    ),
    getYucSpecialPage(
      atomPageUpdatedAt(atomPage, YUC_SPECIAL_URL),
      deadlineAt,
    ),
    getYucMoviePage(
      atomPageUpdatedAt(atomPage, YUC_MOVIE_URL),
      deadlineAt,
    ),
  ]);
  const supplemental = [futurePage, specialPage, moviePage]
    .flatMap((page) => page.entries)
    .filter((entry) => entryBelongsToQuarter(entry, year, season));
  const entries = dedupeYucEntries([...seasonPage.entries, ...supplemental]);
  const pages = [seasonPage, futurePage, specialPage, moviePage];
  return {
    entries,
    status: aggregateStatus(pages.map((page) => page.status)),
    checkedAt:
      Math.max(...pages.map((page) => page.checkedAt ?? 0), 0) || null,
  };
}

function atomPageUpdatedAt(
  page: YucAtomPage | null,
  sourceUrl: string,
): number | null {
  if (!page) return null;
  const target = normalizeYucUrl(sourceUrl);
  if (!target) return null;
  const entry = page.entries.find(
    (item) =>
      normalizeYucUrl(item.url ?? item.id, YUC_ATOM_URL) === target,
  );
  const timestamp = entry?.updatedAt ? Date.parse(entry.updatedAt) : NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function settleWithin<T>(
  promise: Promise<T>,
  budgetMs: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), budgetMs);
  });
  try {
    return await Promise.race([promise, budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getYucEntryBySourceKey(
  sourceKey: string,
): Promise<YucEntry | null> {
  return (await lookupYucEntryBySourceKey(sourceKey)).entry;
}

export async function lookupYucEntryBySourceKey(
  sourceKey: string,
): Promise<YucEntryLookupResult> {
  const parsed = parseYucSourceKey(sourceKey);
  if (!parsed) return { status: "invalid", entry: null };

  let page: YucCatalogResult;
  if (parsed.sourceKind === "season") {
    if (!/^\d{6}$/u.test(parsed.pageId)) {
      return { status: "invalid", entry: null };
    }
    const year = Number(parsed.pageId.slice(0, 4));
    const month = Number(parsed.pageId.slice(4, 6));
    page = await getYucSeasonPage(year, month);
  } else if (parsed.sourceKind === "future") {
    page = await getYucFuturePage();
  } else if (parsed.sourceKind === "special") {
    page = await getYucSpecialPage();
  } else {
    page = await getYucMoviePage();
  }
  if (page.status === "unavailable") {
    return { status: "unavailable", entry: null };
  }
  const entry = findYucEntryBySourceKey(page.entries, sourceKey);
  return entry
    ? { status: "found", entry }
    : { status: "not_found", entry: null };
}

function entryBelongsToQuarter(
  entry: YucEntry,
  year: number,
  season: BgmSeason,
): boolean {
  const entryYear =
    entry.seasonYear ??
    (entry.premiereDate ? Number(entry.premiereDate.slice(0, 4)) : null);
  const entryMonth =
    entry.seasonMonth ??
    (entry.premiereDate ? Number(entry.premiereDate.slice(5, 7)) : null);
  if (entryYear !== year || entryMonth == null) return false;
  return monthToSeason(entryMonth) === season;
}

function monthToSeason(month: number): BgmSeason {
  if (month <= 3) return "WINTER";
  if (month <= 6) return "SPRING";
  if (month <= 9) return "SUMMER";
  return "FALL";
}

function aggregateStatus(statuses: YucSourceStatus[]): YucSourceStatus {
  if (statuses.includes("fresh")) return "fresh";
  if (statuses.includes("stale")) return "stale";
  return "unavailable";
}

function unavailableCatalog(): YucCatalogResult {
  return { entries: [], status: "unavailable", checkedAt: null };
}

function logUnavailable(source: string, error: unknown): void {
  if (error instanceof YucUnavailableError) {
    console.warn(`[yuc] ${source} 暂时不可用：${error.message}`);
    return;
  }
  console.warn(`[yuc] ${source} 读取失败`, error);
}
