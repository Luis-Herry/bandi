/**
 * 定时任务调度。
 *
 * 通过 `instrumentation.ts` 的 `register()` 钩子在 Next.js 启动时
 * 调用一次 `startCronJobs()`。模块级 `started` flag 防止 HMR 多次启动。
 *
 * 两个 job：
 *  - 每天 06:00 → checkUpdates：遍历所有 airing 的番剧，从 Bangumi 同步集数表，
 *    更新本地 episodes 表，缓存 anime.accentColor。
 *  - 每 30 分钟 → checkRss：拉取所有启用的 RSS 源，按 filters 匹配，
 *    新条目入 downloadQueue 并 push 到 qBittorrent。
 *
 * 所有错误都吞掉并写到 stderr，绝不让 cron 把进程拽崩。
 */

import cron from "node-cron";
import { db } from "@/db";
import { anime, episodes, rssSources, downloadQueue, userAnime } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { syncFromBangumi } from "@/db/queries/anime";
import {
  fetchRss,
  extractEpisodeNumber,
  matchAgainstLibrary,
  type LibraryAnimeRef,
} from "@/lib/rss";
import { findDownloadDuplicate } from "@/lib/download-dedupe";
import { buildSafeTorrentOptions } from "@/lib/download-safety";
import { addTorrent } from "@/lib/qbit";
import { getPreferences } from "@/lib/preferences";

let started = false;

export function startCronJobs() {
  if (started) return;
  started = true;

  const tz = "Asia/Shanghai";

  // 每天 06:00 检查番剧更新
  cron.schedule(
    "0 6 * * *",
    () => {
      void runCheckUpdates().catch((e) =>
        console.error("[cron] checkUpdates failed:", e),
      );
    },
    { timezone: tz },
  );

  // 每 30 分钟检查 RSS
  cron.schedule(
    "*/30 * * * *",
    () => {
      void runCheckRss().catch((e) =>
        console.error("[cron] checkRss failed:", e),
      );
    },
    { timezone: tz },
  );

  console.log("[cron] scheduled: checkUpdates (06:00), checkRss (every 30m)");

  // 启动后延迟 5 秒立即跑一次 RSS，给用户即时反馈
  setTimeout(() => {
    void runCheckRss().catch((e) =>
      console.error("[cron] initial rss check failed:", e),
    );
  }, 5_000);
}

/* ─── Jobs ──────────────────────────────────────────────────── */

export interface CheckUpdatesResult {
  scanned: number;
  synced: number;
  skipped: number;
  errors: number;
}

/** 遍历所有 airing 番剧，从 Bangumi 增量同步。 */
export async function runCheckUpdates(): Promise<CheckUpdatesResult> {
  const rows = db
    .select({ id: anime.id, bangumiId: anime.bangumiId })
    .from(anime)
    .where(eq(anime.status, "airing"))
    .all();

  const result: CheckUpdatesResult = {
    scanned: rows.length,
    synced: 0,
    skipped: 0,
    errors: 0,
  };

  for (const row of rows) {
    if (!row.bangumiId) {
      result.skipped += 1;
      continue;
    }
    try {
      const r = await syncFromBangumi(row.bangumiId);
      if (r) result.synced += 1;
      else result.errors += 1;
      // 礼貌点，给 Bangumi 一秒喘息
      await sleep(1000);
    } catch (e) {
      console.error("[cron] sync failed for", row.bangumiId, e);
      result.errors += 1;
    }
  }

  console.log("[cron] checkUpdates done:", result);
  return result;
}

export interface CheckRssResult {
  sources: number;
  newItems: number;
  pushed: number;
  skipped: number;
  errors: number;
}

/**
 * 拉取所有启用的 RSS 源，对照「已订阅番剧 + 用户下载偏好」过滤，
 * 新条目入队并 push qBit。
 *
 * 关键差异（修复 #500-推全部事故）：
 *  - 旧逻辑只看 RSS 源自带的 filters，导致动漫花园这类宽口 RSS 会把全站推下来。
 *  - 新逻辑要求每个 item 必须命中当前 watching/planning 列表里的某个番剧标题，
 *    再叠加字幕组 / 关键字 / 画质三道偏好过滤。
 *  - 每条被拒的 item 都打日志说原因，方便排查"为什么没下载"。
 */
export async function runCheckRss(): Promise<CheckRssResult> {
  const sources = db
    .select()
    .from(rssSources)
    .where(eq(rssSources.isActive, true))
    .all();

  const result: CheckRssResult = {
    sources: sources.length,
    newItems: 0,
    pushed: 0,
    skipped: 0,
    errors: 0,
  };

  // 取「当前在追 / 计划中」番剧，作为标题匹配候选集
  const library: LibraryAnimeRef[] = db
    .selectDistinct({
      animeId: anime.id,
      title: anime.title,
      titleJa: anime.titleJa,
    })
    .from(userAnime)
    .innerJoin(anime, eq(userAnime.animeId, anime.id))
    .where(inArray(userAnime.watchStatus, ["watching", "planning"]))
    .all();

  const prefs = await getPreferences();

  if (library.length === 0) {
    console.log(
      "[cron] checkRss: library is empty (no watching/planning anime), skipping",
    );
    // 仍然更新各源的 lastCheckedAt，避免 UI 上一直显示"从未检查"
    for (const src of sources) {
      db.update(rssSources)
        .set({ lastCheckedAt: new Date() })
        .where(eq(rssSources.id, src.id))
        .run();
    }
    console.log("[cron] checkRss done:", result);
    return result;
  }

  // 跨源的 magnet 去重缓存（同一次运行内）
  const seenMagnets = new Set<string>();

  for (const src of sources) {
    try {
      const items = await fetchRss(src.url);
      const rejectStats: Record<string, number> = {};

      for (const it of items) {
        const match = matchAgainstLibrary(it, library, prefs);
        if (!match.ok) {
          rejectStats[match.reason] = (rejectStats[match.reason] ?? 0) + 1;
          continue;
        }

        const magnet = it.magnet!;
        if (seenMagnets.has(magnet)) {
          result.skipped += 1;
          continue;
        }
        seenMagnets.add(magnet);

        // 从标题里抠出集号，反查 episodes.id；失败则置空
        // 这样下载完成时才能定位到具体哪一集，回写 episodes.isDownloaded
        const epNumber = extractEpisodeNumber(it.title);
        const epRow =
          epNumber != null
            ? db
                .select({ id: episodes.id })
                .from(episodes)
                .where(
                  and(
                    eq(episodes.animeId, match.animeId),
                    eq(episodes.number, epNumber),
                  ),
                )
                .get()
            : null;

        const duplicate = findDownloadDuplicate({
          magnetUrl: magnet,
          episodeId: epRow?.id ?? null,
        });
        if (duplicate) {
          result.skipped += 1;
          continue;
        }

        // 入队
        const inserted = db
          .insert(downloadQueue)
          .values({
            title: it.title,
            magnetUrl: magnet,
            status: "pending",
            progress: 0,
            animeId: match.animeId,
            episodeId: epRow?.id ?? null,
          })
          .returning({ id: downloadQueue.id })
          .get();
        result.newItems += 1;

        console.log(
          `[cron] queued: "${it.title}" → anime#${match.animeId} (${match.animeTitle})` +
            (epRow ? ` ep#${epNumber}` : epNumber != null ? ` (ep ${epNumber} 未在 episodes 表)` : " (集号未识别)"),
        );

        // 推 qBit
        const r = await addTorrent(
          magnet,
          buildSafeTorrentOptions({ category: "anime" }),
        );
        if (r.ok) {
          db.update(downloadQueue)
            .set({ status: "downloading", updatedAt: new Date() })
            .where(eq(downloadQueue.id, inserted.id))
            .run();
          result.pushed += 1;
        } else {
          db.update(downloadQueue)
            .set({
              status: "failed",
              errorMessage: r.error ?? "qbit add failed",
              updatedAt: new Date(),
            })
            .where(eq(downloadQueue.id, inserted.id))
            .run();
          result.errors += 1;
        }
      }

      const rejectSummary = Object.entries(rejectStats)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      console.log(
        `[cron] rss "${src.name}": ${items.length} items, rejected { ${rejectSummary || "none"} }`,
      );

      // 更新 lastCheckedAt
      db.update(rssSources)
        .set({ lastCheckedAt: new Date() })
        .where(eq(rssSources.id, src.id))
        .run();
    } catch (e) {
      console.error("[cron] rss source failed:", src.name, e);
      result.errors += 1;
    }
  }

  console.log("[cron] checkRss done:", result);
  return result;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
