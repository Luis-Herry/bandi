import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { downloadQueue } from "@/db/schema";
import { isVideoFileName, parseLocalFileDownloadUrl } from "@/lib/download-reconcile";
import { resolveDownloadRoot } from "@/lib/download-root";
import { isPathWithinRoot, openInFileManager } from "@/lib/file-manager";
import { extractMagnetHash, getTorrentFiles } from "@/lib/qbit";
import { requireLocalHostRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireLocalHostRouteUser();
  if (user instanceof Response) return user;
  if (
    process.env.ANIME_DESKTOP_APP !== "1" &&
    process.env.ANIME_LOCAL_SERVER_APP !== "1"
  ) {
    return new Response("not_found", { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { downloadId?: unknown };
  const downloadId = body.downloadId == null ? null : Number(body.downloadId);
  if (downloadId != null && (!Number.isInteger(downloadId) || downloadId <= 0)) {
    return NextResponse.json({ error: "invalid_download_id" }, { status: 400 });
  }

  const root = resolveDownloadRoot();
  if (!root.ok) {
    return NextResponse.json({ error: "download_directory_unavailable" }, { status: 503 });
  }
  if (downloadId == null) return openTarget(root.path, false, false);

  const row = db
    .select({ magnetUrl: downloadQueue.magnetUrl })
    .from(downloadQueue)
    .where(eq(downloadQueue.id, downloadId))
    .get();
  if (!row) {
    return NextResponse.json({ error: "download_not_found" }, { status: 404 });
  }

  const localPath = parseLocalFileDownloadUrl(row.magnetUrl);
  if (localPath) {
    if (!isExistingFile(localPath)) {
      return NextResponse.json({ error: "local_file_missing" }, { status: 404 });
    }
    return openTarget(localPath, true, false);
  }

  const hash = extractMagnetHash(row.magnetUrl);
  if (!hash) return openTarget(root.path, false, true);
  const torrent = await getTorrentFiles(hash).catch(() => null);
  if (!torrent?.ok || !isPathWithinRoot(root.path, torrent.savePath)) {
    return openTarget(root.path, false, true);
  }

  const video = [...torrent.files]
    .filter((file) => isVideoFileName(file.name))
    .sort((left, right) => right.size - left.size)[0];
  if (video) {
    const filePath = path.resolve(torrent.savePath, video.name);
    if (
      isPathWithinRoot(root.path, filePath) &&
      isExistingFile(filePath)
    ) {
      return openTarget(filePath, true, false);
    }
  }
  if (isExistingDirectory(torrent.savePath)) {
    return openTarget(torrent.savePath, false, true);
  }
  return openTarget(root.path, false, true);
}

function isExistingFile(candidate: string): boolean {
  try {
    return existsSync(candidate) && statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isExistingDirectory(candidate: string): boolean {
  try {
    return existsSync(candidate) && statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function openTarget(targetPath: string, selectFile: boolean, fallback: boolean) {
  if (!openInFileManager(targetPath, { selectFile })) {
    return NextResponse.json({ error: "file_manager_unavailable" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, fallback });
}
