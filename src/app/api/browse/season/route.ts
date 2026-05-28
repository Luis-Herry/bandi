/**
 * GET /api/browse/season?season=SPRING&year=2026
 *
 * 客户端切季度时用。逻辑见 lib/db-helpers/browse.ts。
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import {
  getSeasonalBrowse,
  type SeasonalBrowseItem,
} from "@/lib/db-helpers/browse";
import type { BgmSeason } from "@/lib/bangumi";

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

  const items: SeasonalBrowseItem[] = await getSeasonalBrowse(
    user.id,
    seasonRaw as BgmSeason,
    yearRaw,
  );
  return NextResponse.json({ items });
}
