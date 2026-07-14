import { NextResponse } from "next/server";
import { currentSeason, getSubjectsBySeason } from "@/lib/bangumi";
import {
  getContinueWatching,
  getTodayUpdates,
} from "@/lib/db-helpers/library";
import {
  getLocalSeasonalBrowseFallback,
  buildSeasonalBrowseItems,
  type SeasonalBrowseItem,
} from "@/lib/db-helpers/browse";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const POPULAR_LIMIT = 4;

interface RecommendationItem {
  source: "local" | "bangumi";
  id: number | null;
  bangumiId: number | null;
  mediaType: "anime" | "drama" | "movie";
  title: string;
  titleJa: string | null;
  year: number | null;
  coverUrl: string | null;
  inLibrary?: boolean;
  meta: string;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({
      continueWatching: [],
      todayUpdates: [],
      popular: [],
    });
  }
  const seen = new Set<string>();

  const continueWatching: RecommendationItem[] = getContinueWatching(
    user.id,
    3,
  )
    .map((item) => ({
      source: "local" as const,
      id: item.anime.id,
      bangumiId: item.anime.bangumiId,
      mediaType: "anime" as const,
      title: item.anime.title,
      titleJa: item.anime.titleJa,
      year: item.anime.year,
      coverUrl: item.anime.coverUrl,
      inLibrary: true,
      meta: `继续 EP.${String(item.continueEpisodeNumber).padStart(2, "0")}`,
    }))
    .filter((item) => addSeen(seen, item));

  const todayUpdates: RecommendationItem[] = getTodayUpdates(user.id)
    .filter((item) => !item.watched)
    .slice(0, 3)
    .map((item) => ({
      source: "local" as const,
      id: item.anime.id,
      bangumiId: item.anime.bangumiId,
      mediaType: "anime" as const,
      title: item.anime.title,
      titleJa: item.anime.titleJa,
      year: item.anime.year,
      coverUrl: item.anime.coverUrl,
      inLibrary: true,
      meta: `${item.watched ? "已看" : "今日更新"} EP.${String(
        item.episode.number,
      ).padStart(2, "0")}`,
    }))
    .filter((item) => addSeen(seen, item));

  const season = currentSeason();
  let seasonal: SeasonalBrowseItem[] = [];
  try {
    seasonal = buildSeasonalBrowseItems(
      user.id,
      await getSubjectsBySeason(season.season, season.year),
      [],
      season.year,
    );
  } catch (error) {
    console.error("[search-recommendations] seasonal fallback:", error);
    seasonal = getLocalSeasonalBrowseFallback(
      user.id,
      season.season,
      season.year,
    );
  }

  const popular: RecommendationItem[] = [];
  for (const item of selectJapaneseSeasonalTopRated(seasonal)) {
    const recommendation: RecommendationItem = {
      source: item.localAnimeId ? "local" : "bangumi",
      id: item.localAnimeId,
      bangumiId:
        item.bangumiId != null && item.bangumiId > 0
          ? item.bangumiId
          : null,
      mediaType: "anime",
      title: item.title,
      titleJa: item.titleJa,
      year: season.year,
      coverUrl: item.coverUrl,
      inLibrary: item.inLibrary,
      meta: `Bangumi ${item.score!.toFixed(1)}`,
    };
    if (!addSeen(seen, recommendation)) continue;
    popular.push(recommendation);
    if (popular.length >= POPULAR_LIMIT) break;
  }

  return NextResponse.json({
    continueWatching,
    todayUpdates,
    popular,
  });
}

function recommendationKey(item: RecommendationItem) {
  if (item.id != null) return `local:${item.id}`;
  if (item.bangumiId != null) return `bangumi:${item.bangumiId}`;
  return `title:${item.title}`;
}

function addSeen(seen: Set<string>, item: RecommendationItem) {
  const key = recommendationKey(item);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

function selectJapaneseSeasonalTopRated(items: SeasonalBrowseItem[]) {
  return items
    .filter(
      (item) =>
        item.score != null &&
        item.score > 0 &&
        item.tags.includes("日本"),
    )
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
