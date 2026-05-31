import { NextResponse } from "next/server";
import { currentSeason } from "@/lib/bangumi";
import {
  getContinueWatching,
  getTodayUpdates,
} from "@/lib/db-helpers/library";
import {
  getLocalSeasonalBrowseFallback,
  getSeasonalBrowse,
  type SeasonalBrowseItem,
} from "@/lib/db-helpers/browse";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

interface RecommendationItem {
  source: "local" | "bangumi";
  id: number | null;
  bangumiId: number | null;
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
      title: item.anime.title,
      titleJa: item.anime.titleJa,
      year: item.anime.year,
      coverUrl: item.anime.coverUrl,
      inLibrary: true,
      meta:
        item.userAnime.currentEpisode > 0
          ? `看到 EP.${String(item.userAnime.currentEpisode).padStart(2, "0")}`
          : "还没开始观看",
    }))
    .filter((item) => addSeen(seen, item));

  const todayUpdates: RecommendationItem[] = getTodayUpdates(user.id)
    .filter((item) => !item.watched)
    .slice(0, 3)
    .map((item) => ({
      source: "local" as const,
      id: item.anime.id,
      bangumiId: item.anime.bangumiId,
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
    seasonal = await getSeasonalBrowse(user.id, season.season, season.year);
  } catch (error) {
    console.error("[search-recommendations] seasonal fallback:", error);
    seasonal = getLocalSeasonalBrowseFallback(
      user.id,
      season.season,
      season.year,
    );
  }

  const popular: RecommendationItem[] = [];
  for (const item of seasonal) {
    const recommendation: RecommendationItem = {
      source: item.localAnimeId ? "local" : "bangumi",
      id: item.localAnimeId,
      bangumiId: item.bangumiId > 0 ? item.bangumiId : null,
      title: item.title,
      titleJa: item.titleJa,
      year: season.year,
      coverUrl: item.coverUrl,
      inLibrary: item.inLibrary,
      meta: item.score
        ? `Bangumi ${item.score.toFixed(1)}`
        : item.platform ?? "本季热门",
    };
    if (!addSeen(seen, recommendation)) continue;
    popular.push(recommendation);
    if (popular.length >= 4) break;
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
