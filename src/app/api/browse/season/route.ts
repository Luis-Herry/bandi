/**
 * GET /api/browse/season?season=SPRING&year=2026
 *
 * 客户端切季度时用。逻辑见 lib/db-helpers/browse.ts。
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import {
  buildSeasonalBrowseItems,
  getSeasonalBrowseResult,
} from "@/lib/db-helpers/browse";
import { getSubjectsBySeason, type BgmSeason } from "@/lib/bangumi";
import { getYucEntriesForQuarter } from "@/lib/yuc/client";
import { dedupeYucEntries } from "@/lib/yuc/match";

export const dynamic = "force-dynamic";

const VALID_SEASONS: BgmSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

export async function GET(req: Request) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  const seasonRaw = (url.searchParams.get("season") ?? "").toUpperCase();
  const yearRaw = Number(url.searchParams.get("year"));

  if (!(VALID_SEASONS as readonly string[]).includes(seasonRaw)) {
    return NextResponse.json({ error: "invalid season" }, { status: 400 });
  }
  if (!Number.isFinite(yearRaw) || yearRaw < 1980 || yearRaw > 2100) {
    return NextResponse.json({ error: "invalid year" }, { status: 400 });
  }

  const season = seasonRaw as BgmSeason;
  if (url.searchParams.get("mode") === "scores") {
    try {
      const [subjects, yucResult] = await Promise.all([
        getSubjectsBySeason(season, yearRaw),
        getYucEntriesForQuarter(yearRaw, season),
      ]);
      const scores = buildSeasonalBrowseItems(
        user.id,
        subjects,
        dedupeYucEntries(yucResult.entries),
        yearRaw,
      ).flatMap((item) =>
        item.score != null && item.score > 0
          ? [
              {
                bangumiId: item.bangumiId,
                yucKey: item.yucKey,
                score: item.score,
              },
            ]
          : [],
      );
      return NextResponse.json({ status: "ready", scores });
    } catch (error) {
      console.warn("[browse] optional Bangumi scores unavailable", error);
      return NextResponse.json({ status: "unavailable", scores: [] });
    }
  }

  const result = await getSeasonalBrowseResult(
    user.id,
    season,
    yearRaw,
  );
  return NextResponse.json(result);
}
