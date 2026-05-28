/**
 * POST /api/browse/add
 *
 * 把"番剧库"页面里看到的某条 Bangumi 番剧加入用户的追番列表（默认 planning）。
 *
 * 流程：
 *  1. syncFromBangumi(bangumiId) → 拿到本地 anime.id（必要时拉详情 + 集数入库）
 *  2. 创建或更新 userAnime 记录（status='planning'）
 *
 * Body:
 *   { bangumiId: number }
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userAnime, type UserAnime } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { syncFromBangumi } from "@/db/queries/anime";

export const dynamic = "force-dynamic";

interface AddBody {
  bangumiId?: number;
}

export async function POST(req: Request) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  const body = (await req.json().catch(() => ({}))) as AddBody;
  const bangumiId = Number(body.bangumiId);
  if (!Number.isFinite(bangumiId) || bangumiId <= 0) {
    return NextResponse.json({ error: "bangumiId required" }, { status: 400 });
  }

  const synced = await syncFromBangumi(bangumiId);
  if (!synced) {
    return NextResponse.json(
      { error: "bangumi_sync_failed" },
      { status: 502 },
    );
  }
  const animeId = synced.animeId;

  const existing = db
    .select()
    .from(userAnime)
    .where(
      and(eq(userAnime.userId, user.id), eq(userAnime.animeId, animeId)),
    )
    .get() as UserAnime | undefined;

  if (existing) {
    db.update(userAnime)
      .set({ updatedAt: new Date() })
      .where(eq(userAnime.id, existing.id))
      .run();
    return NextResponse.json({
      id: existing.id,
      animeId,
      created: false,
      already: true,
    });
  }

  const inserted = db
    .insert(userAnime)
    .values({
      userId: user.id,
      animeId,
      watchStatus: "planning",
    })
    .returning({ id: userAnime.id })
    .get();

  return NextResponse.json({ id: inserted.id, animeId, created: true });
}
