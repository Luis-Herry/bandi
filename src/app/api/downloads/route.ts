import { NextResponse } from "next/server";
import path from "node:path";
import { db } from "@/db";
import { anime, downloadQueue, episodes } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  deriveQbitDownloadStatus,
  findMatchingQbitTorrent,
  listLocalVideoFiles,
  planExternalDownloadImports,
} from "@/lib/download-reconcile";
import { findDownloadDuplicate } from "@/lib/download-dedupe";
import {
  buildSafeTorrentOptions,
  shouldPauseAfterCompletion,
} from "@/lib/download-safety";
import { getAllRssTitleAliases } from "@/lib/rss-title-aliases";
import {
  addTorrent,
  extractMagnetHash,
  listTorrents,
  pauseTorrent,
  type QbitTorrent,
} from "@/lib/qbit";

export const dynamic = "force-dynamic";

type DbStatus = "pending" | "downloading" | "completed" | "failed";

export async function GET() {
  const live = await listTorrents().catch(() => []);
  syncExternalDownloads(live);

  const rows = await db
    .select({
      d: downloadQueue,
      anime: {
        id: anime.id,
        title: anime.title,
        coverUrl: anime.coverUrl,
      },
    })
    .from(downloadQueue)
    .leftJoin(anime, eq(downloadQueue.animeId, anime.id))
    .orderBy(desc(downloadQueue.createdAt))
    .all();

  // Cross-reference qBit live state to keep progress + status fresh.
  const pauseHashes = new Set<string>();

  const now = new Date();

  const items = rows.map((r) => {
    const lt = findMatchingQbitTorrent(r.d, live);

    // 若 qBit 在线且能找到这条 torrent，根据真实状态回写 DB
    let status: DbStatus = r.d.status as DbStatus;
    let progress = r.d.progress;
    let speed: string | null = r.d.speed ?? null;

    if (lt) {
      const liveStatus = deriveQbitDownloadStatus(lt) as DbStatus;
      const livePct = Math.min(100, Math.max(0, Math.round(lt.progress * 100)));
      const completedNow = shouldPauseAfterCompletion(status, liveStatus);
      const liveSpeedStr = lt.dlspeed > 0 ? null : null; // 不存速度，UI 用 liveSpeed 实时显示

      const changed =
        liveStatus !== status ||
        Math.abs(livePct - progress) >= 1 ||
        speed !== liveSpeedStr;

      if (changed) {
        db.update(downloadQueue)
          .set({
            status: liveStatus,
            progress: livePct,
            updatedAt: now,
          })
          .where(eq(downloadQueue.id, r.d.id))
          .run();

        // 跨 downloading→completed 边界时回写 episodes.isDownloaded
        // 只在「原状态非 completed + 新状态 completed + 有关联集号」三者同时满足时写一次
        // 避免每次轮询都重复 UPDATE
        if (completedNow && r.d.episodeId != null) {
          db.update(episodes)
            .set({ isDownloaded: true })
            .where(eq(episodes.id, r.d.episodeId))
            .run();
        }
        if (completedNow) {
          const hash = extractMagnetHash(r.d.magnetUrl);
          if (hash) pauseHashes.add(hash);
        }

        status = liveStatus;
        progress = livePct;
      }
    }

    return {
      ...r.d,
      status,
      progress,
      speed,
      anime: r.anime?.id ? r.anime : null,
      liveProgress: lt ? lt.progress : null,
      liveSpeed: lt ? lt.dlspeed : null,
      liveState: lt ? lt.state : null,
    };
  });

  if (pauseHashes.size > 0) {
    await Promise.all(
      [...pauseHashes].map(async (hash) => {
        const result = await pauseTorrent(hash);
        if (!result.ok) {
          console.error("[downloads] pause completed torrent failed:", {
            hash,
            error: result.error,
          });
        }
      }),
    );
  }

  return NextResponse.json({ items });
}

function syncExternalDownloads(live: QbitTorrent[]) {
  const downloadRoot = path.resolve(process.cwd(), "download");
  const existingDownloads = db
    .select({
      title: downloadQueue.title,
      magnetUrl: downloadQueue.magnetUrl,
    })
    .from(downloadQueue)
    .all();
  const animeRefs = db
    .select({
      id: anime.id,
      title: anime.title,
      titleJa: anime.titleJa,
    })
    .from(anime)
    .all();
  const episodeRefs = db
    .select({
      id: episodes.id,
      animeId: episodes.animeId,
      number: episodes.number,
    })
    .from(episodes)
    .all();

  const imports = planExternalDownloadImports({
    downloadRoot,
    existingDownloads,
    liveTorrents: live,
    localFiles: listLocalVideoFiles(downloadRoot),
    animeRefs,
    episodeRefs,
    aliasesByAnimeId: getAllRssTitleAliases(),
  });

  if (imports.length === 0) return;

  const now = new Date();
  for (const item of imports) {
    db.insert(downloadQueue)
      .values({
        title: item.title,
        magnetUrl: item.magnetUrl,
        animeId: item.animeId,
        episodeId: item.episodeId,
        status: item.status,
        progress: item.progress,
        updatedAt: now,
      })
      .run();

    if (item.status === "completed" && item.episodeId != null) {
      db.update(episodes)
        .set({ isDownloaded: true })
        .where(eq(episodes.id, item.episodeId))
        .run();
    }
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    magnetUrl?: string;
    animeId?: number;
    episodeId?: number;
  };
  if (!body.title || !body.magnetUrl) {
    return NextResponse.json(
      { error: "title and magnetUrl required" },
      { status: 400 },
    );
  }

  const duplicate = findDownloadDuplicate({
    magnetUrl: body.magnetUrl,
    episodeId: body.episodeId ?? null,
  });
  if (duplicate) {
    return NextResponse.json({
      duplicate: true,
      reason: duplicate.reason,
      id: duplicate.downloadId,
      episodeId: duplicate.episodeId ?? body.episodeId ?? null,
      qbit: true,
    });
  }

  const inserted = db
    .insert(downloadQueue)
    .values({
      title: body.title,
      magnetUrl: body.magnetUrl,
      animeId: body.animeId ?? null,
      episodeId: body.episodeId ?? null,
      status: "pending",
    })
    .returning({ id: downloadQueue.id })
    .get();

  // Push to qBit, update status accordingly.
  const result = await addTorrent(
    body.magnetUrl,
    buildSafeTorrentOptions({ category: "anime" }),
  );
  if (result.ok) {
    db.update(downloadQueue)
      .set({ status: "downloading", updatedAt: new Date() })
      .where(eq(downloadQueue.id, inserted.id))
      .run();
  } else {
    db.update(downloadQueue)
      .set({
        status: "failed",
        errorMessage: result.error ?? "qbit_add_failed",
        updatedAt: new Date(),
      })
      .where(eq(downloadQueue.id, inserted.id))
      .run();
  }

  return NextResponse.json({
    id: inserted.id,
    qbit: result.ok,
    error: result.ok ? undefined : result.error,
  });
}
