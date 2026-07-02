/**
 * 本地影视库扫描 + 入库（server only，写真实库）。
 *
 * 复用现有播放管线：本地影片 = `anime` 行（mediaType=movie/drama）+ `episodes` 行
 * + `local-file:` 的 `downloadQueue` 完成记录 → 现有内置播放器 / `/api/play` 直接能放。
 *
 * 幂等 + 纯增量：只插入缺失的 anime / episode / 本地文件记录，已存在的跳过，
 * 绝不删除或覆写既有数据。重复扫描安全。
 */

import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { anime, appSettings, downloadQueue, episodes } from "@/db/schema";
import {
  buildLocalFileDownloadUrl,
  listLocalVideoFiles,
  parseLocalFileDownloadUrl,
} from "@/lib/download-reconcile";
import {
  groupScannedFiles,
  normalizeMediaTitleKey,
  parseMediaFileName,
  type ScannedTitle,
} from "@/lib/cinema-scan";

const LIBRARY_KEY = "cinema_library";

export interface CinemaLibraryConfig {
  roots: string[];
}

export function getCinemaLibraryRoots(): string[] {
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, LIBRARY_KEY))
    .get();
  const v = row?.value as Partial<CinemaLibraryConfig> | null;
  if (!v || !Array.isArray(v.roots)) return [];
  return v.roots.filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
}

export function setCinemaLibraryRoots(roots: string[]): string[] {
  const clean = [...new Set(roots.map((r) => r.trim()).filter(Boolean))];
  db.insert(appSettings)
    .values({ key: LIBRARY_KEY, value: { roots: clean }, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: { roots: clean }, updatedAt: sql`(unixepoch())` },
    })
    .run();
  return clean;
}

export interface ScanResult {
  titles: ScannedTitle[];
  /** 识别为字幕组动画、跳过不进 cinema 的文件数（动漫走动漫侧） */
  skippedFansubFiles: number;
}

/** 遍历扫描根目录 → 解析文件名 → 按片名/季聚合（只读文件系统，不写库）。字幕组动画跳过。 */
export function scanLibraryRoots(roots: string[]): ScanResult {
  const files = roots.flatMap((root) =>
    listLocalVideoFiles(root).map((f) => parseMediaFileName(f.path)),
  );
  const skippedFansubFiles = files.filter((f) => f.kind === "skip").length;
  return { titles: groupScannedFiles(files), skippedFansubFiles };
}

export interface CinemaImportSummary {
  titlesScanned: number;
  animeCreated: number;
  animeMatched: number;
  episodesCreated: number;
  filesImported: number;
  filesSkipped: number;
  /** 识别为字幕组动画、跳过不进 cinema 的文件数 */
  skippedFansubFiles: number;
}

export interface CinemaScanPreview {
  titlesScanned: number;
  filesFound: number;
  movies: number;
  dramas: number;
  /** 识别为字幕组动画、跳过不进 cinema 的文件数 */
  skippedFansubFiles: number;
  samples: Array<{
    title: string;
    kind: "movie" | "drama";
    year: number | null;
    season: number | null;
    files: number;
  }>;
}

function displayTitleOf(t: ScannedTitle): string {
  if (t.kind === "tv" && (t.season ?? 1) > 1) {
    return `${t.title} 第${t.season}季`;
  }
  return t.title;
}

export function previewScannedTitles(
  titles: ScannedTitle[],
  skippedFansubFiles = 0,
  sampleLimit = 6,
): CinemaScanPreview {
  return {
    titlesScanned: titles.length,
    filesFound: titles.reduce((sum, title) => sum + title.files.length, 0),
    movies: titles.filter((title) => title.kind === "movie").length,
    dramas: titles.filter((title) => title.kind === "tv").length,
    skippedFansubFiles,
    samples: titles.slice(0, sampleLimit).map((title) => ({
      title: displayTitleOf(title),
      kind: title.kind === "movie" ? "movie" : "drama",
      year: title.year ?? null,
      season: title.kind === "tv" ? title.season ?? 1 : null,
      files: title.files.length,
    })),
  };
}

function titleMatchesScanned(row: typeof anime.$inferSelect, scannedTitle: string) {
  const scannedKey = normalizeMediaTitleKey(scannedTitle);
  return [row.title, row.titleJa].some(
    (title) => normalizeMediaTitleKey(title) === scannedKey,
  );
}

/** 把聚合后的影视条目写入库（幂等、纯增量）。 */
export function importScannedTitles(
  titles: ScannedTitle[],
  skippedFansubFiles = 0,
): CinemaImportSummary {
  const summary: CinemaImportSummary = {
    titlesScanned: titles.length,
    animeCreated: 0,
    animeMatched: 0,
    episodesCreated: 0,
    filesImported: 0,
    filesSkipped: 0,
    skippedFansubFiles,
  };

  // 全局已有的 local-file 绝对路径，用于去重（避免重复扫描重复入库）
  const existingLocalPaths = new Set(
    db
      .select({ magnetUrl: downloadQueue.magnetUrl })
      .from(downloadQueue)
      .all()
      .map((r) => parseLocalFileDownloadUrl(r.magnetUrl))
      .filter((p): p is string => Boolean(p))
      .map((p) => p.toLowerCase()),
  );

  for (const t of titles) {
    const mediaType = t.kind === "movie" ? "movie" : "drama";
    const title = displayTitleOf(t);

    // 匹配已有 anime 行（mediaType + 标题；电影再比年份），命中则复用，否则新建
    const candidates = db
      .select()
      .from(anime)
      .where(eq(anime.mediaType, mediaType))
      .all();
    const existing =
      candidates.find(
        (a) =>
          titleMatchesScanned(a, title) &&
          (mediaType !== "movie" || a.year === t.year),
      ) ?? null;

    let animeId: number;
    if (existing) {
      animeId = existing.id;
      summary.animeMatched += 1;
    } else {
      const inserted = db
        .insert(anime)
        .values({
          title,
          type: t.kind === "movie" ? "Movie" : "TV",
          status: "completed",
          mediaType,
          year: t.year ?? null,
          totalEpisodes: t.kind === "movie" ? 1 : t.files.length,
        })
        .returning({ id: anime.id })
        .get();
      animeId = inserted.id;
      summary.animeCreated += 1;
    }

    type EpisodeRow = typeof episodes.$inferSelect;
    const epByNumber = new Map<number, EpisodeRow>(
      db
        .select()
        .from(episodes)
        .where(eq(episodes.animeId, animeId))
        .all()
        .map((e): [number, EpisodeRow] => [e.number, e]),
    );

    for (const file of t.files) {
      const number = t.kind === "movie" ? 1 : file.episode;
      let ep = epByNumber.get(number);
      if (!ep) {
        ep = db
          .insert(episodes)
          .values({ animeId, number, title: file.fileName, isDownloaded: true })
          .returning()
          .get();
        epByNumber.set(number, ep);
        summary.episodesCreated += 1;
      } else if (!ep.isDownloaded) {
        db.update(episodes)
          .set({ isDownloaded: true })
          .where(eq(episodes.id, ep.id))
          .run();
      }

      const lower = file.absPath.toLowerCase();
      if (existingLocalPaths.has(lower)) {
        summary.filesSkipped += 1;
        continue;
      }

      db.insert(downloadQueue)
        .values({
          animeId,
          episodeId: ep.id,
          title: file.fileName,
          magnetUrl: buildLocalFileDownloadUrl(file.absPath),
          status: "completed",
          progress: 100,
        })
        .run();
      existingLocalPaths.add(lower);
      summary.filesImported += 1;
    }
  }

  return summary;
}

/** 当前有本地完成文件背书的 anime id 集合（供影视卡 isLocal 用）。 */
export function getLocalLibraryAnimeIds(): Set<number> {
  const rows = db
    .select({
      animeId: downloadQueue.animeId,
      magnetUrl: downloadQueue.magnetUrl,
      mediaType: anime.mediaType,
    })
    .from(downloadQueue)
    .innerJoin(anime, eq(downloadQueue.animeId, anime.id))
    .where(
      and(
        eq(downloadQueue.status, "completed"),
        like(downloadQueue.magnetUrl, "local-file:%"),
      ),
    )
    .all()
    .filter((row): row is typeof row & { animeId: number } => row.animeId != null);

  const byPath = new Map<string, typeof rows>();
  for (const row of rows) {
    const pathKey =
      parseLocalFileDownloadUrl(row.magnetUrl)?.toLowerCase() ??
      row.magnetUrl.toLowerCase();
    const group = byPath.get(pathKey) ?? [];
    group.push(row);
    byPath.set(pathKey, group);
  }

  const ids = new Set<number>();
  for (const group of byPath.values()) {
    const animeRows = group.filter((row) => row.mediaType === "anime");
    for (const row of animeRows.length > 0 ? animeRows : group) {
      ids.add(row.animeId);
    }
  }
  return ids;
}
