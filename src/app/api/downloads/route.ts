import { NextResponse } from "next/server";
import { db } from "@/db";
import { anime, downloadQueue, episodes } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { findDownloadDuplicate } from "@/lib/download-dedupe";
import {
  buildSafeTorrentOptions,
  shouldPauseAfterCompletion,
} from "@/lib/download-safety";
import {
  addTorrent,
  extractMagnetHash,
  listTorrents,
  pauseTorrent,
  type QbitTorrent,
} from "@/lib/qbit";

export const dynamic = "force-dynamic";

type DbStatus = "pending" | "downloading" | "completed" | "failed";

/**
 * 把 release 名拆成可比对的 token 集合。
 * 同一集番剧的不同字幕组释放名（中/英、不同字幕组）字面上几乎不重叠，
 * 但「英文罗马字名 + 集数」是共同的强特征。
 */
function tokenize(s: string) {
  // 去掉所有方括号块（发布组、画质、字幕标记）
  const stripped = s.replace(/\[[^\]]*\]/g, " ");
  const nums = new Set(stripped.match(/\b\d{2,4}\b/g) ?? []);
  const words = new Set(
    (stripped.match(/[A-Za-z]{3,}/g) ?? []).map((w) => w.toLowerCase()),
  );
  const cjk = new Set(
    stripped.match(/[一-龥぀-ゟ゠-ヿ]/g) ?? [],
  );
  return { nums, words, cjk };
}

function matchScore(
  a: ReturnType<typeof tokenize>,
  b: ReturnType<typeof tokenize>,
): number {
  let s = 0;
  for (const n of a.nums) if (b.nums.has(n)) s += 2;
  for (const w of a.words) if (b.words.has(w)) s += 1;
  for (const c of a.cjk) if (b.cjk.has(c)) s += 0.3;
  return s;
}

function findLive(
  row: { title: string; magnetUrl: string },
  live: QbitTorrent[],
): QbitTorrent | null {
  const hash = extractMagnetHash(row.magnetUrl);
  if (hash) {
    const byHash = live.find((t) => t.hash.toLowerCase() === hash);
    if (byHash) return byHash;
  }

  // 历史数据可能没有可解析 magnet，才退回标题匹配。
  const title = row.title;
  const exact = live.find((t) => t.name === title);
  if (exact) return exact;

  // Token 评分，阈值 5；同时要求至少命中 1 个数字 token（集数）避免误配。
  const a = tokenize(title);
  let best: { t: QbitTorrent; score: number } | null = null;
  for (const t of live) {
    const b = tokenize(t.name);
    const score = matchScore(a, b);
    if (score < 5) continue;
    let hasNum = false;
    for (const n of a.nums) if (b.nums.has(n)) { hasNum = true; break; }
    if (!hasNum) continue;
    if (!best || score > best.score) best = { t, score };
  }
  return best?.t ?? null;
}

/**
 * Map qBit live state → our DB enum.
 * qBit states ref: downloading / stalledDL / metaDL / checkingDL / forcedDL / queuedDL
 *                  / pausedDL / allocating / uploading / stalledUP / forcedUP /
 *                  queuedUP / checkingUP / pausedUP / error / missingFiles / moving
 */
function deriveStatus(t: QbitTorrent): DbStatus {
  if (t.state === "error" || t.state === "missingFiles") return "failed";
  // 完成判定：progress 到顶 或 进入任意 UP / seeding 态
  if (t.progress >= 0.999) return "completed";
  const s = t.state;
  if (
    s === "uploading" ||
    s === "stalledUP" ||
    s === "forcedUP" ||
    s === "queuedUP" ||
    s === "checkingUP" ||
    s === "pausedUP"
  ) {
    return "completed";
  }
  return "downloading";
}

export async function GET() {
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
  const live = await listTorrents().catch(() => []);
  const pauseHashes = new Set<string>();

  const now = new Date();

  const items = rows.map((r) => {
    const lt = findLive(r.d, live);

    // 若 qBit 在线且能找到这条 torrent，根据真实状态回写 DB
    let status: DbStatus = r.d.status as DbStatus;
    let progress = r.d.progress;
    let speed: string | null = r.d.speed ?? null;

    if (lt) {
      const liveStatus = deriveStatus(lt);
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
