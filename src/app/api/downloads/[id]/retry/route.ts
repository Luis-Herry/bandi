/**
 * POST /api/downloads/[id]/retry
 *
 * Failed DB rows keep the original magnetUrl. Retry resubmits that magnet to
 * qBittorrent and reuses the same queue row so list order and episode links stay
 * stable.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { downloadQueue } from "@/db/schema";
import { buildSafeTorrentOptions } from "@/lib/download-safety";
import { addTorrent } from "@/lib/qbit";

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
    .select({
      id: downloadQueue.id,
      status: downloadQueue.status,
      magnetUrl: downloadQueue.magnetUrl,
    })
    .from(downloadQueue)
    .where(eq(downloadQueue.id, rowId))
    .get();
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (row.status !== "failed") {
    return NextResponse.json(
      { error: "only failed downloads can be retried" },
      { status: 409 },
    );
  }

  const result = await addTorrent(
    row.magnetUrl,
    buildSafeTorrentOptions({ category: "anime" }),
  );
  const now = new Date();
  if (!result.ok) {
    db.update(downloadQueue)
      .set({
        status: "failed",
        errorMessage: result.error ?? "qbit_add_failed",
        updatedAt: now,
      })
      .where(eq(downloadQueue.id, row.id))
      .run();
    return NextResponse.json(
      { error: result.error ?? "qbit_add_failed" },
      { status: 502 },
    );
  }

  db.update(downloadQueue)
    .set({
      status: "downloading",
      progress: 0,
      speed: null,
      errorMessage: null,
      updatedAt: now,
    })
    .where(eq(downloadQueue.id, row.id))
    .run();

  return NextResponse.json({ ok: true });
}
