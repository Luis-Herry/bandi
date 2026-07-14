/**
 * POST /api/downloads/[id]/pause
 *
 * 通过 magnetUrl 解出 infohash 后调用 qBit pause。
 * 数据库的 status 维持现状——qBit 的实际暂停状态会通过 liveState 反映回来。
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { downloadQueue } from "@/db/schema";
import { extractMagnetHash, pauseTorrent } from "@/lib/qbit";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const rowId = Number(id);
  if (!Number.isFinite(rowId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const row = db
    .select({
      magnetUrl: downloadQueue.magnetUrl,
      status: downloadQueue.status,
    })
    .from(downloadQueue)
    .where(eq(downloadQueue.id, rowId))
    .get();
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (row.status !== "downloading" && row.status !== "pending") {
    return NextResponse.json(
      { error: "download is not active" },
      { status: 409 },
    );
  }

  const hash = extractMagnetHash(row.magnetUrl);
  if (!hash) {
    return NextResponse.json(
      { error: "cannot extract infohash" },
      { status: 422 },
    );
  }

  const r = await pauseTorrent(hash);
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error ?? "qbit_pause_failed" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
