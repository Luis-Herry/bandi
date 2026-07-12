/**
 * GET  /api/cinema/enrich  → 返回待刮削的影视条目 id（番号片优先排前，成功率高、最快出结果）
 * POST /api/cinema/enrich  → 刮削（需登录）
 *   { animeId: number }            → 刮单条（前端逐条调用，实时进度）
 *   { scope?: "missing" | "all" }  → 批量（保留）
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { anime } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { extractJavCode } from "@/lib/jav";
import { getLocalLibraryAnimeIds } from "@/lib/cinema-import";
import { getCinemaWatchlist } from "@/lib/db-helpers/cinema";
import {
  enrichCinemaItem,
  enrichCinemaLibrary,
  importCinemaCatalog,
  importDoubanCatalog,
} from "@/lib/cinema-enrich";

export const dynamic = "force-dynamic";

// 已成功刮到任一源的数据：tmdbId / 豆瓣或番号评分 / 刮来的封面
function isScraped(r: {
  tmdbId: number | null;
  doubanRating: number | null;
  coverUrl: string | null;
}): boolean {
  return (
    r.tmdbId != null ||
    r.doubanRating != null ||
    /(?:dmm\.co\.jp|image\.tmdb\.org|img\d+\.doubanio\.com)/i.test(
      r.coverUrl ?? "",
    )
  );
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const localOnly = new URL(req.url).searchParams.get("scope") === "local";
  const localIds = localOnly ? [...getLocalLibraryAnimeIds()] : [];
  if (localOnly && localIds.length === 0) {
    return NextResponse.json({
      pending: [],
      total: 0,
      jav: 0,
      sourceCount: 0,
      completeCount: 0,
      scope: "local",
    });
  }

  const rows = db
    .select({
      id: anime.id,
      title: anime.title,
      tmdbId: anime.tmdbId,
      doubanRating: anime.doubanRating,
      fetchedAt: anime.doubanRatingFetchedAt,
      coverUrl: anime.coverUrl,
      isAdult: anime.isAdult,
    })
    .from(anime)
    .where(
      localOnly
        ? and(
            inArray(anime.mediaType, ["drama", "movie"]),
            inArray(anime.id, localIds),
          )
        : inArray(anime.mediaType, ["drama", "movie"]),
    )
    .all();

  // 番号片：只要还没成功刮到就一直进队列（不被「已尝试」标记挡住，r18/jav321 是新源）。
  // 成人 OVA（isAdult 且非番号）没有刮削源，直接跳过，别白占队列拖慢整批。
  // 其余非番号片：试过一次就不再试，避免反复磨匹配不上的杂项。番号片排最前。
  const withCode: number[] = [];
  const without: number[] = [];
  for (const r of rows) {
    if (extractJavCode(r.title || "")) {
      if (!isScraped(r)) withCode.push(r.id);
    } else if (r.isAdult) {
      continue;
    } else if (r.fetchedAt == null) {
      without.push(r.id);
    }
  }

  const pending = [...withCode, ...without];

  return NextResponse.json({
    pending,
    total: pending.length,
    jav: withCode.length,
    sourceCount: rows.length,
    completeCount: Math.max(0, rows.length - pending.length),
    scope: localOnly ? "local" : "all",
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    animeId?: unknown;
    scope?: unknown;
    limit?: unknown;
  };

  if (typeof body.animeId === "number") {
    const result = await enrichCinemaItem(body.animeId);
    return NextResponse.json({ ok: true, result });
  }

  if (body.scope === "catalog") {
    const limit =
      typeof body.limit === "number"
        ? Math.min(120, Math.max(1, Math.floor(body.limit)))
        : 80;
    const [tmdbSummary, doubanSummary] = await Promise.all([
      importCinemaCatalog({ limit, enrich: false }),
      importDoubanCatalog({ limit: Math.min(limit, 60) }),
    ]);
    const summary = {
      ...tmdbSummary,
      total: tmdbSummary.total + doubanSummary.total,
      created: tmdbSummary.created + doubanSummary.created,
      matched: tmdbSummary.matched + doubanSummary.matched,
      sources: {
        tmdb: tmdbSummary,
        douban: doubanSummary,
      },
    };
    revalidatePath("/cinema-library");
    const visible = getCinemaWatchlist(user.id).length;
    return NextResponse.json({ ok: true, summary: { ...summary, visible } });
  }

  const onlyMissing = body.scope !== "all";
  const summary = await enrichCinemaLibrary({ onlyMissing });
  return NextResponse.json({ ok: true, summary });
}
