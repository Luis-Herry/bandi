import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { anime, downloadQueue, episodes, userAnime } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  deriveQbitDownloadStatus,
  filterShadowLocalFileDownloads,
  findMatchingQbitTorrent,
  isVideoFileName,
  listLocalVideoFiles,
  parseLocalFileDownloadUrl,
  planExternalDownloadImports,
} from "@/lib/download-reconcile";
import { findDownloadDuplicate } from "@/lib/download-dedupe";
import { resetDownloadedFlagsWithoutCompletedRows } from "@/lib/download-cleanup";
import { resolveDownloadRoot } from "@/lib/download-root";
import {
  buildSafeTorrentOptions,
  shouldPauseAfterCompletion,
} from "@/lib/download-safety";
import { getAllRssTitleAliases } from "@/lib/rss-title-aliases";
import {
  addTorrent,
  extractMagnetHash,
  getStatus,
  listTorrents,
  pauseTorrent,
  type QbitTorrent,
} from "@/lib/qbit";
import { extractEpisodeNumber } from "@/lib/rss";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type DbStatus = "pending" | "downloading" | "completed" | "failed";

export async function GET() {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const downloadRoot = resolveDownloadRoot();
  if (!downloadRoot.ok) {
    return downloadDirectoryUnavailable(downloadRoot.message);
  }

  const qbitStatus = await getStatus().catch(() => ({
    connected: false,
    url: "",
  }));
  const live = qbitStatus.connected
    ? await listTorrents().catch(() => [])
    : [];
  syncMissingDownloadSources({
    live,
    qbitConnected: qbitStatus.connected,
  });
  syncExternalDownloads(live, downloadRoot.path);
  backfillMissingDownloadEpisodeRefs();

  const rows = await db
    .select({
      d: downloadQueue,
      anime: {
        id: anime.id,
        title: anime.title,
        coverUrl: anime.coverUrl,
      },
      episodeNumber: episodes.number,
    })
    .from(downloadQueue)
    .leftJoin(anime, eq(downloadQueue.animeId, anime.id))
    .leftJoin(episodes, eq(downloadQueue.episodeId, episodes.id))
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
          promoteStartedByDownloadedEpisode(r.d.episodeId);
        }
        if (completedNow) {
          const hash = extractMagnetHash(r.d.magnetUrl);
          if (hash) pauseHashes.add(hash);
        }

        status = liveStatus;
        progress = livePct;
      }
    }

    if (status === "completed" && r.d.episodeId != null) {
      promoteStartedByDownloadedEpisode(r.d.episodeId);
    }

    return {
      ...r.d,
      status,
      progress,
      speed,
      anime: r.anime?.id ? r.anime : null,
      episodeNumber: r.episodeNumber ?? null,
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

  return NextResponse.json({ items: filterShadowLocalFileDownloads(items) });
}

function syncMissingDownloadSources({
  live,
  qbitConnected,
}: {
  live: QbitTorrent[];
  qbitConnected: boolean;
}) {
  const liveHashes = new Set(
    live.map((torrent) => torrent.hash.trim().toLowerCase()).filter(Boolean),
  );
  const rows = db
    .select({
      id: downloadQueue.id,
      episodeId: downloadQueue.episodeId,
      magnetUrl: downloadQueue.magnetUrl,
      status: downloadQueue.status,
    })
    .from(downloadQueue)
    .all();

  const staleIds: number[] = [];
  const episodeIds: Array<number | null> = [];
  for (const row of rows) {
    if (row.status !== "completed") continue;

    const localPath = parseLocalFileDownloadUrl(row.magnetUrl);
    if (localPath) {
      if (!existsSync(localPath) || !isVideoFileName(path.basename(localPath))) {
        staleIds.push(row.id);
        episodeIds.push(row.episodeId);
      }
      continue;
    }

    const hash = extractMagnetHash(row.magnetUrl);
    if (qbitConnected && hash && !liveHashes.has(hash)) {
      staleIds.push(row.id);
      episodeIds.push(row.episodeId);
    }
  }

  if (staleIds.length === 0) return;

  db.delete(downloadQueue).where(inArray(downloadQueue.id, staleIds)).run();
  resetDownloadedFlagsWithoutCompletedRows(episodeIds);
}

function backfillMissingDownloadEpisodeRefs() {
  const rows = db
    .select({
      id: downloadQueue.id,
      animeId: downloadQueue.animeId,
      episodeId: downloadQueue.episodeId,
      title: downloadQueue.title,
      status: downloadQueue.status,
    })
    .from(downloadQueue)
    .all()
    .filter(
      (row): row is typeof row & { animeId: number } =>
        row.animeId != null && row.episodeId == null,
    );
  if (rows.length === 0) return;

  const episodesByAnime = new Map<number, Map<number, { id: number; isDownloaded: boolean }>>();
  for (const ep of db
    .select({
      id: episodes.id,
      animeId: episodes.animeId,
      number: episodes.number,
      isDownloaded: episodes.isDownloaded,
    })
    .from(episodes)
    .all()) {
    const byNumber = episodesByAnime.get(ep.animeId) ?? new Map();
    byNumber.set(ep.number, {
      id: ep.id,
      isDownloaded: Boolean(ep.isDownloaded),
    });
    episodesByAnime.set(ep.animeId, byNumber);
  }

  for (const row of rows) {
    const episodeNumber = extractEpisodeNumber(row.title);
    if (episodeNumber == null) continue;

    const ep = episodesByAnime.get(row.animeId)?.get(episodeNumber);
    if (!ep) continue;

    db.update(downloadQueue)
      .set({ episodeId: ep.id })
      .where(eq(downloadQueue.id, row.id))
      .run();

    if (row.status === "completed") {
      if (!ep.isDownloaded) {
        db.update(episodes)
          .set({ isDownloaded: true })
          .where(eq(episodes.id, ep.id))
          .run();
        ep.isDownloaded = true;
      }
      promoteStartedByDownloadedEpisode(ep.id);
    }
  }
}

function syncExternalDownloads(live: QbitTorrent[], downloadRoot: string) {
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
      promoteStartedByDownloadedEpisode(item.episodeId);
    }
  }
}

function promoteStartedByDownloadedEpisode(episodeId: number) {
  const ep = db
    .select({
      animeId: episodes.animeId,
      number: episodes.number,
    })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .get();
  if (!ep || ep.number <= 0) return;

  const rows = db
    .select({
      id: userAnime.id,
      currentEpisode: userAnime.currentEpisode,
    })
    .from(userAnime)
    .where(
      and(
        eq(userAnime.animeId, ep.animeId),
        inArray(userAnime.watchStatus, ["planning", "watching"]),
      ),
    )
    .all();
  if (rows.length === 0) return;

  const now = new Date();
  for (const row of rows) {
    if (row.currentEpisode >= ep.number) continue;
    db.update(userAnime)
      .set({
        watchStatus: "watching",
        currentEpisode: ep.number,
        updatedAt: now,
      })
      .where(eq(userAnime.id, row.id))
      .run();
  }
}

export async function POST(req: Request) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const downloadRoot = resolveDownloadRoot();
  if (!downloadRoot.ok) {
    return downloadDirectoryUnavailable(downloadRoot.message);
  }

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

function downloadDirectoryUnavailable(message: string): NextResponse {
  console.error("[downloads] 下载目录不可用:", message);
  return NextResponse.json(
    { error: "download_directory_unavailable", message },
    { status: 503 },
  );
}
