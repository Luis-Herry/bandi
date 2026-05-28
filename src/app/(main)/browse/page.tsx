import { redirect } from "next/navigation";
import {
  currentSeason,
  isBangumiUnavailableError,
  shiftSeason,
  type BgmSeason,
} from "@/lib/bangumi";
import {
  getLocalSeasonalBrowseFallback,
  getSeasonalBrowse,
} from "@/lib/db-helpers/browse";
import { getCurrentUser } from "@/lib/session";
import { BrowseClient } from "./BrowseClient";

export const dynamic = "force-dynamic";

const VALID_SEASONS: BgmSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

interface PageProps {
  searchParams: Promise<{ season?: string; year?: string }>;
}

export default async function BrowsePage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const now = currentSeason();

  // 三个标签：上一季 / 本季 / 下一季
  const quarters = [
    { ...shiftSeason(now, -1), labelKey: "prev" as const },
    { ...now, labelKey: "current" as const },
    { ...shiftSeason(now, 1), labelKey: "next" as const },
  ];

  let season: BgmSeason = now.season;
  let year: number = now.year;
  const reqSeason = (sp.season ?? "").toUpperCase();
  const reqYear = Number(sp.year);
  if (
    (VALID_SEASONS as readonly string[]).includes(reqSeason) &&
    Number.isFinite(reqYear)
  ) {
    season = reqSeason as BgmSeason;
    year = reqYear;
  }

  let dataStatus: "fresh" | "fallback" | "unavailable" = "fresh";
  let items: Awaited<ReturnType<typeof getSeasonalBrowse>>;
  try {
    items = await getSeasonalBrowse(user.id, season, year);
  } catch (error) {
    if (!isBangumiUnavailableError(error)) throw error;
    console.error("[browse] Bangumi seasonal browse unavailable:", error);
    items = getLocalSeasonalBrowseFallback(user.id, season, year);
    dataStatus = items.length > 0 ? "fallback" : "unavailable";
  }

  return (
    <BrowseClient
      initialSeason={season}
      initialYear={year}
      initialItems={items}
      quarters={quarters}
      dataStatus={dataStatus}
    />
  );
}
