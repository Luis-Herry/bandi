/**
 * POST /api/downloads/[id]/resume
 *
 * 通过 magnetUrl 解出 infohash 后调用 qBit resume。
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { downloadQueue } from "@/db/schema";
import { extractMagnetHash, resumeTorrent } from "@/lib/qbit";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rowId = Number(id);
  if (!Number.isFinite(rowId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const row = db
    .select({ magnetUrl: downloadQueue.magnetUrl })
    .from(downloadQueue)
    .where(eq(downloadQueue.id, rowId))
    .get();
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const hash = extractMagnetHash(row.magnetUrl);
  if (!hash) {
    return NextResponse.json(
      { error: "cannot extract infohash" },
      { status: 422 },
    );
  }

  const r = await resumeTorrent(hash);
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error ?? "qbit_resume_failed" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
