/**
 * Helpers for the "番剧库" seasonal browse page.
 *
 * 把 Bangumi 拉到的一季番剧拼接上本地状态：
 *   - localAnimeId：本地 anime 表 id（bangumiId 命中）
 *   - inLibrary：当前用户是否已加入追番
 *
 * 数据源：Bangumi `/v0/search/subjects`（按 air_date 过滤、按 heat 排序）。
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { anime, userAnime } from "@/db/schema";
import {
  getSubjectsBySeason,
  type BgmSeason,
  type BgmSubject,
} from "@/lib/bangumi";
import { selectBangumiImageByRole } from "@/lib/bangumi-image";

export type SeasonalUpdateState = "updated" | "upcoming" | "pending";

export interface SeasonalBrowseItem {
  bangumiId: number;
  title: string;
  titleJa: string | null;
  coverUrl: string | null;
  summary: string | null;
  date: string | null;
  episodes: number | null;
  score: number | null;
  tags: string[];
  /** Bangumi 的 platform 字段，已是中文（TV/WEB/OVA/剧场版/动态漫画/其他） */
  platform: string | null;
  localAnimeId: number | null;
  inLibrary: boolean;
  updateState?: SeasonalUpdateState;
}

function pickCover(s: BgmSubject): string | null {
  return selectBangumiImageByRole(s.images, "card");
}

function pickEpisodes(s: BgmSubject): number | null {
  if (s.total_episodes != null && s.total_episodes > 0) return s.total_episodes;
  if (s.eps != null && s.eps > 0) return s.eps;
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
    const match = /^(\d{4})年(\d{1,2})月$/.exec(tag);
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

export async function getSeasonalBrowse(
  userId: string,
  season: BgmSeason,
  year: number,
): Promise<SeasonalBrowseItem[]> {
  const list = await getSubjectsBySeason(season, year);
  if (list.length === 0) return [];

  const bgmIds = list.map((s) => s.id);
  const localRows = db
    .select({ id: anime.id, bangumiId: anime.bangumiId })
    .from(anime)
    .where(inArray(anime.bangumiId, bgmIds))
    .all();
  const localByBgmId = new Map(
    localRows
      .filter((r) => r.bangumiId != null)
      .map((r) => [r.bangumiId!, r.id]),
  );

  const localIds = localRows.map((r) => r.id);
  const userRows =
    localIds.length > 0
      ? db
          .select({ animeId: userAnime.animeId })
          .from(userAnime)
          .where(
            and(
              eq(userAnime.userId, userId),
              inArray(userAnime.animeId, localIds),
            ),
          )
          .all()
      : [];
  const inLibrarySet = new Set(userRows.map((r) => r.animeId));

  return list.map((s) => {
    const localId = localByBgmId.get(s.id) ?? null;
    return {
      bangumiId: s.id,
      title: s.name_cn?.trim() || s.name,
      titleJa: s.name || null,
      coverUrl: pickCover(s),
      summary: s.summary?.trim() || null,
      date: s.date ?? null,
      episodes: pickEpisodes(s),
      score: s.rating?.score ?? null,
      // 保留前 24 个标签：UI 卡片只显示前 2 个，但筛选需要从完整列表里匹配来源/类型/地区
      tags: (s.tags ?? []).slice(0, 24).map((t) => t.name),
      platform: s.platform?.trim() || null,
      localAnimeId: localId,
      inLibrary: localId != null && inLibrarySet.has(localId),
    };
  });
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
      tags: anime.tags,
      season: anime.season,
      year: anime.year,
    })
    .from(anime)
    .where(eq(anime.year, year))
    .all()
    .filter(
      (row) =>
        row.season === localSeason || tagsMatchSeason(row.tags, season, year),
    );

  if (rows.length === 0) return [];

  const localIds = rows.map((row) => row.id);
  const userRows = db
    .select({ animeId: userAnime.animeId })
    .from(userAnime)
    .where(
      and(eq(userAnime.userId, userId), inArray(userAnime.animeId, localIds)),
    )
    .all();
  const inLibrarySet = new Set(userRows.map((row) => row.animeId));

  return rows.map((row) => ({
    bangumiId: row.bangumiId ?? -row.id,
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
    episodes: row.totalEpisodes,
    score: null,
    tags: row.tags ?? [],
    platform: PLATFORM_BY_LOCAL_TYPE[row.type] ?? row.type,
    localAnimeId: row.id,
    inLibrary: inLibrarySet.has(row.id),
  }));
}
