/**
 * Helpers for the seasonal anime catalog.
 *
 * Yuc (长门番堂) is the primary quarterly catalog so domestic users can browse
 * without a proxy. Bangumi stays available to detail and explicit sync flows
 * for ratings, comments, credits, and relationships that only it provides.
 * Local rows are joined through a trusted identity or a unique,
 * high-confidence title/year/format match.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { anime, userAnime } from "@/db/schema";
import { type BgmSeason, type BgmSubject } from "@/lib/bangumi";
import { selectBangumiImageByRole } from "@/lib/bangumi-image";
import { selectPreferredSynopsis } from "@/lib/synopsis-language";
import { getYucEntriesForQuarter, type YucSourceStatus } from "@/lib/yuc/client";
import {
  dedupeYucEntries,
  findUniqueYucCatalogMatch,
  isReliableYucWorkMatch,
  yucEntryType,
} from "@/lib/yuc/match";
import type { YucEntry } from "@/lib/yuc/types";
import {
  listYucIdentities,
  type YucIdentityRecord,
} from "@/lib/yuc/identity";

export type SeasonalUpdateState = "updated" | "upcoming" | "pending";
export type SeasonalBrowseSource = "bangumi" | "yuc" | "local";
export type SeasonalBrowseDataStatus = "fresh" | "fallback" | "unavailable";

export interface SeasonalBrowseItem {
  /** Stable client key. Never overload a negative Bangumi id for local rows. */
  itemKey: string;
  bangumiId: number | null;
  yucKey: string | null;
  yucSourceUrl: string | null;
  sources: SeasonalBrowseSource[];
  title: string;
  titleJa: string | null;
  coverUrl: string | null;
  summary: string | null;
  /** Premiere date only. Weekly grouping uses airingDay. */
  date: string | null;
  airingDay: number | null;
  airingTime: string | null;
  episodes: number | null;
  score: number | null;
  tags: string[];
  /** TV / WEB / OVA / 剧场版. */
  platform: string | null;
  localAnimeId: number | null;
  inLibrary: boolean;
  updateState?: SeasonalUpdateState;
}

export interface SeasonalBrowseResult {
  items: SeasonalBrowseItem[];
  dataStatus: SeasonalBrowseDataStatus;
  yucStatus: YucSourceStatus;
}

type LocalBrowseRow = Pick<
  typeof anime.$inferSelect,
  | "id"
  | "bangumiId"
  | "title"
  | "titleJa"
  | "coverUrl"
  | "synopsis"
  | "type"
  | "totalEpisodes"
  | "airingDay"
  | "airingTime"
  | "tags"
  | "season"
  | "year"
>;

function pickCover(subject: BgmSubject): string | null {
  return selectBangumiImageByRole(subject.images, "card");
}

function pickEpisodes(subject: BgmSubject): number | null {
  if (subject.total_episodes != null && subject.total_episodes > 0) {
    return subject.total_episodes;
  }
  if (subject.eps != null && subject.eps > 0) return subject.eps;
  return null;
}

const LOCAL_SEASON_BY_BGM_SEASON: Record<
  BgmSeason,
  "winter" | "spring" | "summer" | "fall"
> = {
  WINTER: "winter",
  SPRING: "spring",
  SUMMER: "summer",
  FALL: "fall",
};

const SEASON_START_MONTH: Record<BgmSeason, string> = {
  WINTER: "01",
  SPRING: "04",
  SUMMER: "07",
  FALL: "10",
};

const PLATFORM_BY_LOCAL_TYPE: Record<string, string> = {
  TV: "TV",
  Movie: "剧场版",
  OVA: "OVA",
  Web: "WEB",
};

function monthToBgmSeason(month: number): BgmSeason {
  if (month <= 3) return "WINTER";
  if (month <= 6) return "SPRING";
  if (month <= 9) return "SUMMER";
  return "FALL";
}

function findSeasonMonthTag(
  tags: string[] | null | undefined,
  season: BgmSeason,
  year: number,
): string | null {
  for (const tag of tags ?? []) {
    const match = /^(\d{4})年(\d{1,2})月$/u.exec(tag);
    if (!match) continue;
    const tagYear = Number(match[1]);
    const tagMonth = Number(match[2]);
    if (tagYear === year && monthToBgmSeason(tagMonth) === season) {
      return String(tagMonth).padStart(2, "0");
    }
  }
  return null;
}

function tagsMatchSeason(
  tags: string[] | null | undefined,
  season: BgmSeason,
  year: number,
): boolean {
  return findSeasonMonthTag(tags, season, year) != null;
}

/**
 * Full result for pages that need to explain a degraded source. The quarterly
 * route never waits on Bangumi; stale Yuc data and local rows keep it usable.
 */
export async function getSeasonalBrowseResult(
  userId: string,
  season: BgmSeason,
  year: number,
): Promise<SeasonalBrowseResult> {
  const yucResult = await getYucEntriesForQuarter(year, season);
  let items = buildSeasonalBrowseItems(
    userId,
    [],
    dedupeYucEntries(yucResult.entries),
    year,
  );

  if (yucResult.status !== "fresh") {
    console.warn(
      `[browse] Yuc seasonal browse is ${yucResult.status}; using cached/local fallback`,
    );
    items = mergeFallbackItems(
      items,
      getLocalSeasonalBrowseFallback(userId, season, year),
    );
  }

  return {
    items,
    dataStatus: yucResult.status === "fresh"
      ? "fresh"
      : items.length > 0
        ? "fallback"
        : "unavailable",
    yucStatus: yucResult.status,
  };
}

/** Item-only helper used by the YUC-primary home seasonal rail. */
export async function getSeasonalBrowse(
  userId: string,
  season: BgmSeason,
  year: number,
): Promise<SeasonalBrowseItem[]> {
  return (await getSeasonalBrowseResult(userId, season, year)).items;
}

export function buildSeasonalBrowseItems(
  userId: string,
  subjects: readonly BgmSubject[],
  yucEntries: readonly YucEntry[],
  year: number,
): SeasonalBrowseItem[] {
  const bgmIds = subjects.map((subject) => subject.id);
  const identityRecords = safeListYucIdentities().filter((record) =>
    yucEntries.some((entry) => entry.sourceKey === record.sourceKey),
  );
  const localRows = loadCandidateLocalRows(
    bgmIds,
    year,
    identityRecords.map((record) => record.animeId),
    yucEntries.some((entry) => yucEntryType(entry) === "Movie"),
  );
  const localByBgmId = new Map(
    localRows
      .filter((row) => row.bangumiId != null)
      .map((row) => [row.bangumiId!, row]),
  );
  const inLibrarySet = loadInLibrarySet(
    userId,
    localRows.map((row) => row.id),
  );
  const localByYucKey = matchYucEntriesToLocalRows(
    yucEntries,
    localRows,
    identityRecords,
  );
  const matchedYucKeys = new Set<string>();

  const primary = subjects.map((subject): SeasonalBrowseItem => {
    const yuc = findUniqueYucCatalogMatch(yucEntries, {
      title: subject.name_cn?.trim() || subject.name,
      titleJa: subject.name,
      year: subject.date?.match(/^\d{4}/u)
        ? Number(subject.date.slice(0, 4))
        : year,
      format: subject.platform,
    });
    if (yuc) matchedYucKeys.add(yuc.sourceKey);

    const directLocal = localByBgmId.get(subject.id) ?? null;
    const yucLocal = yuc ? localByYucKey.get(yuc.sourceKey) ?? null : null;
    const local = directLocal ?? yucLocal;
    const sources: SeasonalBrowseSource[] = yuc
      ? local
        ? ["bangumi", "yuc", "local"]
        : ["bangumi", "yuc"]
      : local
        ? ["bangumi", "local"]
        : ["bangumi"];

    return {
      itemKey: `bgm:${subject.id}`,
      bangumiId: subject.id,
      yucKey: yuc?.sourceKey ?? null,
      yucSourceUrl: yuc?.sourceUrl ?? null,
      sources,
      title: subject.name_cn?.trim() || subject.name,
      titleJa: subject.name || yuc?.titleJa || null,
      coverUrl: pickCover(subject) ?? yuc?.coverUrl ?? local?.coverUrl ?? null,
      summary: selectPreferredSynopsis(local?.synopsis, subject.summary),
      date: subject.date ?? yuc?.premiereDate ?? null,
      airingDay: yuc?.weeklyDay ?? local?.airingDay ?? null,
      airingTime: yuc?.weeklyTime ?? local?.airingTime ?? null,
      episodes:
        pickEpisodes(subject) ?? yuc?.totalEpisodes ?? local?.totalEpisodes ?? null,
      score: subject.rating?.score ?? null,
      tags: uniqueStrings([
        ...(subject.tags ?? []).slice(0, 24).map((tag) => tag.name),
        ...(yuc?.tags ?? []),
      ]),
      platform:
        subject.platform?.trim() ||
        (yuc ? PLATFORM_BY_LOCAL_TYPE[yucEntryType(yuc)] : null) ||
        (local ? PLATFORM_BY_LOCAL_TYPE[local.type] ?? local.type : null),
      localAnimeId: local?.id ?? null,
      inLibrary: local != null && inLibrarySet.has(local.id),
    };
  });

  const yucOnly = yucEntries
    .filter((entry) => !matchedYucKeys.has(entry.sourceKey))
    .map((entry): SeasonalBrowseItem => {
      const local = localByYucKey.get(entry.sourceKey) ?? null;
      return {
        itemKey: entry.sourceKey,
        bangumiId: local?.bangumiId ?? null,
        yucKey: entry.sourceKey,
        yucSourceUrl: entry.sourceUrl,
        sources: local ? ["yuc", "local"] : ["yuc"],
        title: entry.title,
        titleJa: entry.titleJa ?? local?.titleJa ?? null,
        coverUrl: entry.coverUrl ?? local?.coverUrl ?? null,
        summary: local?.synopsis ?? null,
        date: entry.premiereDate,
        airingDay: entry.weeklyDay ?? local?.airingDay ?? null,
        airingTime: entry.weeklyTime ?? local?.airingTime ?? null,
        episodes: entry.totalEpisodes ?? local?.totalEpisodes ?? null,
        score: null,
        // 长门番堂收录的是日本新番与动画电影。补上地区标签，避免
        // 番剧库默认“日本”筛选把长门番堂独有条目全部隐藏。
        tags: uniqueStrings(["日本", ...entry.tags, ...(local?.tags ?? [])]),
        platform: PLATFORM_BY_LOCAL_TYPE[yucEntryType(entry)],
        localAnimeId: local?.id ?? null,
        inLibrary: local != null && inLibrarySet.has(local.id),
      };
    });

  return [...primary, ...yucOnly];
}

export function getLocalSeasonalBrowseFallback(
  userId: string,
  season: BgmSeason,
  year: number,
): SeasonalBrowseItem[] {
  const localSeason = LOCAL_SEASON_BY_BGM_SEASON[season];
  const rows = db
    .select({
      id: anime.id,
      bangumiId: anime.bangumiId,
      title: anime.title,
      titleJa: anime.titleJa,
      coverUrl: anime.coverUrl,
      synopsis: anime.synopsis,
      type: anime.type,
      totalEpisodes: anime.totalEpisodes,
      airingDay: anime.airingDay,
      airingTime: anime.airingTime,
      tags: anime.tags,
      season: anime.season,
      year: anime.year,
    })
    .from(anime)
    .where(and(eq(anime.mediaType, "anime"), eq(anime.year, year)))
    .all()
    .filter(
      (row) =>
        row.season === localSeason || tagsMatchSeason(row.tags, season, year),
    );

  const inLibrarySet = loadInLibrarySet(
    userId,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    itemKey: row.bangumiId != null ? `bgm:${row.bangumiId}` : `local:${row.id}`,
    bangumiId: row.bangumiId,
    yucKey: null,
    yucSourceUrl: null,
    sources: ["local"],
    title: row.title,
    titleJa: row.titleJa,
    coverUrl: row.coverUrl,
    summary: row.synopsis,
    date: row.year
      ? `${row.year}-${
          findSeasonMonthTag(row.tags, season, row.year) ??
          SEASON_START_MONTH[season]
        }-01`
      : null,
    airingDay: row.airingDay,
    airingTime: row.airingTime,
    episodes: row.totalEpisodes,
    score: null,
    tags: row.tags ?? [],
    platform: PLATFORM_BY_LOCAL_TYPE[row.type] ?? row.type,
    localAnimeId: row.id,
    inLibrary: inLibrarySet.has(row.id),
  }));
}

/** Group only by an explicit weekly broadcast day; premiere dates stay dates. */
export function groupSeasonalBrowseByWeekday(
  items: readonly SeasonalBrowseItem[],
): { day: number; items: SeasonalBrowseItem[] }[] {
  const groups: SeasonalBrowseItem[][] = Array.from({ length: 7 }, () => []);
  for (const item of items) {
    if (item.airingDay == null || item.airingDay < 0 || item.airingDay > 6) {
      continue;
    }
    groups[item.airingDay].push(item);
  }
  return [1, 2, 3, 4, 5, 6, 0].map((day) => ({ day, items: groups[day] }));
}

function loadCandidateLocalRows(
  bgmIds: readonly number[],
  year: number,
  identityAnimeIds: readonly number[],
  includeAllMovies: boolean,
): LocalBrowseRow[] {
  const selection = {
    id: anime.id,
    bangumiId: anime.bangumiId,
    title: anime.title,
    titleJa: anime.titleJa,
    coverUrl: anime.coverUrl,
    synopsis: anime.synopsis,
    type: anime.type,
    totalEpisodes: anime.totalEpisodes,
    airingDay: anime.airingDay,
    airingTime: anime.airingTime,
    tags: anime.tags,
    season: anime.season,
    year: anime.year,
  };
  const byYear = db
    .select(selection)
    .from(anime)
    .where(and(eq(anime.mediaType, "anime"), eq(anime.year, year)))
    .all();
  const byBangumi =
    bgmIds.length > 0
      ? db
          .select(selection)
          .from(anime)
          .where(inArray(anime.bangumiId, [...bgmIds]))
          .all()
      : [];
  const byIdentity =
    identityAnimeIds.length > 0
      ? db
          .select(selection)
          .from(anime)
          .where(inArray(anime.id, [...new Set(identityAnimeIds)]))
          .all()
      : [];
  const byMovie = includeAllMovies
    ? db
        .select(selection)
        .from(anime)
        .where(and(eq(anime.mediaType, "anime"), eq(anime.type, "Movie")))
        .all()
    : [];
  return [
    ...new Map(
      [...byYear, ...byBangumi, ...byIdentity, ...byMovie].map((row) => [
        row.id,
        row,
      ]),
    ).values(),
  ];
}

function matchYucEntriesToLocalRows(
  entries: readonly YucEntry[],
  rows: readonly LocalBrowseRow[],
  identities: readonly YucIdentityRecord[],
): Map<string, LocalBrowseRow> {
  const result = new Map<string, LocalBrowseRow>();
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const identity of identities) {
    const row = rowsById.get(identity.animeId);
    if (row) result.set(identity.sourceKey, row);
  }
  for (const entry of entries) {
    if (result.has(entry.sourceKey)) continue;
    const matches = rows.filter((row) =>
      isReliableYucWorkMatch(entry, {
        title: row.title,
        titleJa: row.titleJa,
        year: row.year,
        format: row.type,
      }),
    );
    if (matches.length === 1) result.set(entry.sourceKey, matches[0]);
  }
  return result;
}

function safeListYucIdentities(): YucIdentityRecord[] {
  try {
    return listYucIdentities();
  } catch (error) {
    console.warn("[browse] ignored invalid YUC identity ledger", error);
    return [];
  }
}

function loadInLibrarySet(userId: string, animeIds: readonly number[]): Set<number> {
  if (animeIds.length === 0) return new Set();
  const rows = db
    .select({ animeId: userAnime.animeId })
    .from(userAnime)
    .where(
      and(
        eq(userAnime.userId, userId),
        inArray(userAnime.animeId, [...animeIds]),
      ),
    )
    .all();
  return new Set(rows.map((row) => row.animeId));
}

function mergeFallbackItems(
  yucItems: readonly SeasonalBrowseItem[],
  localItems: readonly SeasonalBrowseItem[],
): SeasonalBrowseItem[] {
  const result = [...yucItems];
  const localIds = new Set(
    result
      .map((item) => item.localAnimeId)
      .filter((id): id is number => id != null),
  );
  const keys = new Set(result.map((item) => item.itemKey));
  for (const item of localItems) {
    if (
      keys.has(item.itemKey) ||
      (item.localAnimeId != null && localIds.has(item.localAnimeId))
    ) {
      continue;
    }
    result.push(item);
    keys.add(item.itemKey);
    if (item.localAnimeId != null) localIds.add(item.localAnimeId);
  }
  return result;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
