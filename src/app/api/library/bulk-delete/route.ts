/**
 * POST /api/library/bulk-delete
 *
 * body: { ids: number[] }  // anime.id 列表
 * 只删除当前用户名下的 userAnime 行，不动 anime 元数据，也不触碰下载记录。
 */

import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { userAnime } from "@/db/schema";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const ids = body.ids
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) {
    return NextResponse.json({ error: "no valid ids" }, { status: 400 });
  }

  const result = db
    .delete(userAnime)
    .where(
      and(eq(userAnime.userId, user.id), inArray(userAnime.animeId, ids)),
    )
    .run();

  return NextResponse.json({
    ok: true,
    deleted: result.changes ?? ids.length,
  });
}
