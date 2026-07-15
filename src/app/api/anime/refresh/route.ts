import { NextResponse } from "next/server";
import {
  getSubjectsBySeason,
  invalidateSeasonCache,
  type BgmSeason,
} from "@/lib/bangumi";
import {
  refreshAnimeMetadata,
  type AnimeMetadataRefreshScope,
} from "@/lib/anime-metadata-refresh";
import { requireRouteUser } from "@/lib/session";
import { getYucEntriesForQuarter } from "@/lib/yuc/client";

export const dynamic = "force-dynamic";

type RefreshRequest = {
  scope: AnimeMetadataRefreshScope;
  animeId?: number;
  year?: number;
  season?: BgmSeason;
};

const VALID_SEASONS: BgmSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
const inflight = new Map<string, Promise<unknown>>();

export async function POST(req: Request) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const body = (await req.json().catch(() => ({}))) as RefreshRequest;

  try {
    if (body.scope === "season") {
      const year = Number(body.year);
      const season = String(body.season ?? "").toUpperCase() as BgmSeason;
      if (!Number.isInteger(year) || year < 1980 || year > 2100) {
        return NextResponse.json({ error: "invalid_year" }, { status: 400 });
      }
      if (!VALID_SEASONS.includes(season)) {
        return NextResponse.json({ error: "invalid_season" }, { status: 400 });
      }
      const key = `season:${year}:${season}`;
      const result = await runSingleFlight(key, async () => {
        invalidateSeasonCache();
        const [subjects, yuc] = await Promise.all([
          getSubjectsBySeason(season, year),
          getYucEntriesForQuarter(year, season, true),
        ]);
        const metadata = await refreshAnimeMetadata({
          scope: "season",
          year,
          season,
        });
        const warnings = [
          ...metadata.warnings,
          ...(yuc.status === "unavailable"
            ? ["长门番堂本次暂不可用"]
            : []),
        ];
        return {
          ...metadata,
          outcome:
            metadata.outcome === "needs_review"
              ? "needs_review" as const
              : warnings.length > 0
                ? "partial" as const
                : "updated" as const,
          bangumiSubjects: subjects.length,
          yucEntries: yuc.entries.length,
          yucStatus: yuc.status,
          warnings,
        };
      });
      return NextResponse.json(result);
    }

    if (
      body.scope !== "anime" &&
      body.scope !== "local-library" &&
      body.scope !== "downloads"
    ) {
      return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
    }
    const animeId = body.scope === "anime" ? Number(body.animeId) : undefined;
    const key = `${body.scope}:${animeId ?? "all"}`;
    const result = await runSingleFlight(key, () =>
      refreshAnimeMetadata({ scope: body.scope, animeId }),
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "refresh_failed";
    const status = message === "anime_not_found" ? 404 : message.startsWith("invalid_") ? 400 : 500;
    console.error("[anime-refresh] manual refresh failed", error);
    return NextResponse.json({ error: message }, { status });
  }
}

function runSingleFlight<T>(key: string, work: () => Promise<T>): Promise<T> {
  const current = inflight.get(key) as Promise<T> | undefined;
  if (current) return current;
  const promise = work().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}
