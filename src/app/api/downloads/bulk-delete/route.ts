/**
 * POST /api/downloads/bulk-delete
 *
 * body: { ids: number[] }
 * Removes rows from the local download list only. It does not delete torrents
 * or files from qBittorrent. Episode downloaded flags are cleared when the
 * deleted rows were the last completed queue record backing that episode.
 */

import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { downloadQueue } from "@/db/schema";
import { resetDownloadedFlagsWithoutCompletedRows } from "@/lib/download-cleanup";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const ids = [
    ...new Set(
      body.ids
        .map((value) => Number(value))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  if (ids.length === 0) {
    return NextResponse.json({ error: "no valid ids" }, { status: 400 });
  }

  const rows = db
    .select({ episodeId: downloadQueue.episodeId })
    .from(downloadQueue)
    .where(inArray(downloadQueue.id, ids))
    .all();
  const result = db
    .delete(downloadQueue)
    .where(inArray(downloadQueue.id, ids))
    .run();
  const resetDownloaded = resetDownloadedFlagsWithoutCompletedRows(
    rows.map((row) => row.episodeId),
  );

  return NextResponse.json({
    ok: true,
    deleted: result.changes ?? 0,
    resetDownloaded,
  });
}
