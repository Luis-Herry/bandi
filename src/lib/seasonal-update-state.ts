import { inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes, rssSources } from "@/db/schema";
import type {
  SeasonalBrowseItem,
  SeasonalUpdateState,
} from "@/lib/db-helpers/browse";
import { applyCompletedDownloadState } from "@/lib/download-cleanup";
import { dedupeEpisodesByNumber } from "@/lib/episode-normalize";
import { fetchRss, stripSeasonSuffix, type RssItem } from "@/lib/rss";
import {
  containsAnimeTitleAlias,
  containsEpisodeRelease,
  stripTrailingArcAfterSeason,
} from "@/lib/source-match";
import { expandZhVariants } from "@/lib/zh-convert";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RSS_CACHE_MS = 5 * 60 * 1000;
const RSS_FETCH_TIMEOUT_MS = 4_000;
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type EpisodeRow = {
  id: number;
  animeId: number;
  number: number;
  airedAt: Date | null;
  isDownloaded: boolean;
};

type EpisodeContext = {
  targetEpisode: number | null;
  seasonEpisodeNumbers: number[];
  targetDownloaded: boolean;
};

let recentRssCache: {
  expiresAt: number;
  items: RssItem[];
} | null = null;

export async function attachSeasonalUpdateStates(
  items: SeasonalBrowseItem[],
  now = new Date(),
): Promise<SeasonalBrowseItem[]> {
  if (items.length === 0) return items;

  const [rssItems, episodeRows] = await Promise.all([
    getRecentRssItems(),
    getEpisodeRows(items),
  ]);
  const episodeRowsByAnime = groupEpisodeRows(episodeRows);

  return items.map((item) => {
    const context = getEpisodeContext(item, episodeRowsByAnime, now);
    const hasResource =
      context.targetDownloaded || hasMatchingRssItem(item, context, rssItems);

    return {
      ...item,
      updateState: resolveSeasonalUpdateState(item.date, hasResource, now),
    };
  });
}

export function resolveSeasonalUpdateState(
  date: string | null,
  hasResource: boolean,
  now = new Date(),
): SeasonalUpdateState | undefined {
  if (hasResource) return "updated";
  if (!date) return undefined;
  if (isFutureUpdateDay(date, now)) return "upcoming";
  return "pending";
}

export function inferEpisodeNumberFromAirDate(
  date: string | null,
  now = new Date(),
  totalEpisodes?: number | null,
): number | null {
  const firstAirDate = parseDateOnly(date);
  if (!firstAirDate) return null;

  const elapsed = startOfDay(now).getTime() - startOfDay(firstAirDate).getTime();
  if (elapsed < 0) return null;

  const episode = Math.floor(elapsed / WEEK_MS) + 1;
  if (totalEpisodes != null && totalEpisodes > 0) {
    return Math.min(episode, totalEpisodes);
  }
  return episode;
}

async function getRecentRssItems(): Promise<RssItem[]> {
  const now = Date.now();
  if (recentRssCache && recentRssCache.expiresAt > now) {
    return recentRssCache.items;
  }

  const sources = db
    .select({ url: rssSources.url })
    .from(rssSources)
    .where(eq(rssSources.isActive, true))
    .all();

  const batches = await Promise.all(
    sources.map((source) =>
      fetchRss(source.url, { timeoutMs: RSS_FETCH_TIMEOUT_MS }),
    ),
  );
  const items = dedupeRssItems(batches.flat());
  recentRssCache = {
    expiresAt: now + RSS_CACHE_MS,
    items,
  };
  return items;
}

async function getEpisodeRows(
  items: SeasonalBrowseItem[],
): Promise<EpisodeRow[]> {
  const localIds = [
    ...new Set(
      items
        .map((item) => item.localAnimeId)
        .filter((id): id is number => id != null),
    ),
  ];
  if (localIds.length === 0) return [];

  const rows = db
    .select({
      id: episodes.id,
      animeId: episodes.animeId,
      number: episodes.number,
      airedAt: episodes.airedAt,
      isDownloaded: episodes.isDownloaded,
    })
    .from(episodes)
    .where(inArray(episodes.animeId, localIds))
    .all();
  return applyCompletedDownloadState(rows);
}

function groupEpisodeRows(rows: EpisodeRow[]): Map<number, EpisodeRow[]> {
  const grouped = new Map<number, EpisodeRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.animeId) ?? [];
    list.push(row);
    grouped.set(row.animeId, list);
  }

  for (const [animeId, list] of grouped) {
    const normalized = dedupeEpisodesByNumber(
      [...list].sort((a, b) => a.number - b.number),
    );
    grouped.set(animeId, normalized);
  }
  return grouped;
}

function getEpisodeContext(
  item: SeasonalBrowseItem,
  episodeRowsByAnime: Map<number, EpisodeRow[]>,
  now: Date,
): EpisodeContext {
  const rows =
    item.localAnimeId != null
      ? episodeRowsByAnime.get(item.localAnimeId) ?? []
      : [];
  const seasonEpisodeNumbers = rows.map((row) => row.number);
  const latestAired = rows
    .filter((row) => row.airedAt && row.airedAt.getTime() <= now.getTime())
    .sort((a, b) => b.number - a.number)[0];

  if (latestAired) {
    return {
      targetEpisode: latestAired.number,
      seasonEpisodeNumbers,
      targetDownloaded: latestAired.isDownloaded,
    };
  }

  return {
    targetEpisode: inferEpisodeNumberFromAirDate(
      item.date,
      now,
      item.episodes,
    ),
    seasonEpisodeNumbers,
    targetDownloaded: false,
  };
}

function hasMatchingRssItem(
  item: SeasonalBrowseItem,
  context: EpisodeContext,
  rssItems: RssItem[],
): boolean {
  if (context.targetEpisode == null) return false;

  const aliases = buildSeasonalAliases(item);
  if (aliases.length === 0) return false;

  return rssItems.some((rssItem) => {
    if (!rssItem.magnet) return false;
    if (!containsAnimeTitleAlias(rssItem.title, aliases)) return false;
    return containsEpisodeRelease(
      rssItem.title,
      context.targetEpisode!,
      context.seasonEpisodeNumbers,
    );
  });
}

function buildSeasonalAliases(item: SeasonalBrowseItem): string[] {
  const rawAliases = new Set<string>();
  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    rawAliases.add(trimmed);
    rawAliases.add(stripSeasonSuffix(trimmed));
    const seasonTitle = stripTrailingArcAfterSeason(trimmed);
    if (seasonTitle) rawAliases.add(seasonTitle);
    const leading = getLeadingTitleSegment(trimmed);
    if (leading) rawAliases.add(leading);
  };

  push(item.title);
  push(item.titleJa);

  const expanded = new Set<string>();
  for (const alias of rawAliases) {
    for (const variant of expandZhVariants(alias)) {
      const trimmed = variant.trim();
      if (trimmed.length >= 2) expanded.add(trimmed);
    }
  }
  return [...expanded].sort((a, b) => b.length - a.length);
}

function getLeadingTitleSegment(value: string): string | null {
  const match = value.trim().match(/^(.+?)\s+[\w'".-]+$/);
  const segment = match?.[1]?.trim();
  return segment && segment !== value.trim() ? segment : null;
}

function resolveWeekdayIndex(day: number): number {
  const index = WEEKDAY_ORDER.indexOf(day);
  return index === -1 ? WEEKDAY_ORDER.length : index;
}

function isFutureUpdateDay(date: string, now: Date): boolean {
  const parsed = parseDateOnly(date);
  if (!parsed) return false;
  if (startOfDay(parsed).getTime() > startOfDay(now).getTime()) return true;
  return resolveWeekdayIndex(parsed.getDay()) > resolveWeekdayIndex(now.getDay());
}

function parseDateOnly(date: string | null): Date | null {
  if (!date) return null;
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(date);
  if (match) {
    const parsed = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dedupeRssItems(items: RssItem[]): RssItem[] {
  const seen = new Set<string>();
  const out: RssItem[] = [];
  for (const item of items) {
    const key = item.magnet ?? item.link ?? item.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
