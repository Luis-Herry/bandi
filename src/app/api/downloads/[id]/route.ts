import { NextResponse } from "next/server";
import { db } from "@/db";
import { downloadQueue } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resetDownloadedFlagsWithoutCompletedRows } from "@/lib/download-cleanup";
import { dismissDownloadSources } from "@/lib/download-dismissals";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "downloading", "completed", "failed"] as const;
type DownloadStatus = (typeof STATUSES)[number];
function isStatus(v: unknown): v is DownloadStatus {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const rowId = Number(id);
  if (!Number.isFinite(rowId))
    return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (isStatus(body.status)) updates.status = body.status;
  if (typeof body.progress === "number")
    updates.progress = Math.max(0, Math.min(100, Math.round(body.progress)));
  if (typeof body.speed === "string") updates.speed = body.speed;
  if (typeof body.errorMessage === "string")
    updates.errorMessage = body.errorMessage;

  db.update(downloadQueue)
    .set(updates)
    .where(eq(downloadQueue.id, rowId))
    .run();
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const rowId = Number(id);
  if (!Number.isFinite(rowId))
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const row = db
    .select({
      episodeId: downloadQueue.episodeId,
      magnetUrl: downloadQueue.magnetUrl,
    })
    .from(downloadQueue)
    .where(eq(downloadQueue.id, rowId))
    .get();
  if (!row) {
    return NextResponse.json({ error: "download_not_found" }, { status: 404 });
  }
  const dismissed = dismissDownloadSources([row.magnetUrl]);
  const result = db.delete(downloadQueue).where(eq(downloadQueue.id, rowId)).run();
  const resetDownloaded = resetDownloadedFlagsWithoutCompletedRows([
    row?.episodeId,
  ]);
  return NextResponse.json({
    ok: true,
    deleted: result.changes ?? 0,
    dismissed,
    resetDownloaded,
  });
}
