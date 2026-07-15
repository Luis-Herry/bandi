/**
 * 动漫本地目录扫描与增量入库（server only）。
 *
 * 用户先预览，确认后才在单个事务里保存扫描目录并写入 anime / episodes /
 * downloadQueue。只新增本地播放骨架，不创建 userAnime，也不覆盖已有元数据。
 */

import { and, eq, like, sql } from "drizzle-orm";
import path from "node:path";
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
  parseAnimeMediaFileName,
  type ScannedTitle,
} from "@/lib/cinema-scan";
import { extractSeason, stripSeasonSuffix } from "@/lib/rss";
import { resolveUniqueEpisodeRangeCandidate } from "@/lib/anime-season-range";

const LIBRARY_KEY = "anime_library";

export interface AnimeLibraryConfig {
  roots: string[];
}

export interface AnimeScanPreview {
  titlesScanned: number;
  filesFound: number;
  series: number;
  movies: number;
  existingMatches: number;
  newTitles: number;
  titlesConflicted: number;
  pathConflicts: number;
  samples: Array<{
    title: string;
    kind: "series" | "movie";
    year: number | null;
    season: number | null;
    files: number;
    action: "match" | "create" | "conflict";
  }>;
}

export interface AnimeImportSummary {
  titlesScanned: number;
  animeCreated: number;
  animeMatched: number;
  titlesConflicted: number;
  episodesCreated: number;
  filesImported: number;
  filesSkipped: number;
  filesConflicted: number;
}

type AnimeRow = typeof anime.$inferSelect;

interface PathOwner {
  animeId: number;
  mediaType: string;
}

function cleanRoots(roots: string[]): string[] {
  return [...new Set(roots.map((root) => root.trim()).filter(Boolean))];
}

function localPathKey(value: string): string {
  return path.resolve(value).toLowerCase();
}

export function getAnimeLibraryRoots(): string[] {
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, LIBRARY_KEY))
    .get();
  const value = row?.value as Partial<AnimeLibraryConfig> | null;
  if (!value || !Array.isArray(value.roots)) return [];
  return cleanRoots(
    value.roots.filter((root): root is string => typeof root === "string"),
  );
}

export function scanAnimeLibraryRoots(roots: string[]): ScannedTitle[] {
  const files = cleanRoots(roots).flatMap((root) =>
    listLocalVideoFiles(root).map((file) => parseAnimeMediaFileName(file.path)),
  );
  return groupScannedFiles(files);
}

function displayTitleOf(title: ScannedTitle): string {
  if (title.kind === "tv" && (title.season ?? 1) > 1) {
    return `${title.title} 第${title.season}季`;
  }
  return title.title;
}

function matchingAnimeRows(
  rows: AnimeRow[],
  scanned: ScannedTitle,
  episodeRows: Array<{ animeId: number; number: number }>,
): AnimeRow[] {
  const title = displayTitleOf(scanned);
  const key = normalizeMediaTitleKey(title);
  const exact = rows.filter((row) =>
    [row.title, row.titleJa].some(
      (candidate) => normalizeMediaTitleKey(candidate) === key,
    ),
  );
  if (
    scanned.kind !== "tv" ||
    scanned.files.some((file) => extractSeason(file.absPath) != null)
  ) {
    return exact;
  }

  const baseKey = normalizeMediaTitleKey(stripSeasonSuffix(scanned.title));
  const sameSeries = rows.filter((row) =>
    [row.title, row.titleJa].some(
      (candidate) =>
        normalizeMediaTitleKey(stripSeasonSuffix(candidate ?? "")) === baseKey,
    ),
  );
  if (sameSeries.length <= 1) return sameSeries.length === 1 ? sameSeries : exact;

  const byAnime = new Map<number, number[]>();
  for (const episode of episodeRows) {
    const group = byAnime.get(episode.animeId) ?? [];
    group.push(episode.number);
    byAnime.set(episode.animeId, group);
  }
  const resolved = resolveUniqueEpisodeRangeCandidate(
    sameSeries.map((row) => ({
      value: row,
      totalEpisodes: row.totalEpisodes,
      episodeNumbers: byAnime.get(row.id) ?? [],
    })),
    scanned.files.map((file) => file.episode),
  );
  return resolved ? [resolved] : sameSeries;
}

function readPathOwners(): Map<string, PathOwner[]> {
  const rows = db
    .select({
      animeId: downloadQueue.animeId,
      magnetUrl: downloadQueue.magnetUrl,
      mediaType: anime.mediaType,
    })
    .from(downloadQueue)
    .innerJoin(anime, eq(downloadQueue.animeId, anime.id))
    .where(like(downloadQueue.magnetUrl, "local-file:%"))
    .all();
  const owners = new Map<string, PathOwner[]>();
  for (const row of rows) {
    if (row.animeId == null) continue;
    const localPath = parseLocalFileDownloadUrl(row.magnetUrl);
    if (!localPath) continue;
    const key = localPathKey(localPath);
    const group = owners.get(key) ?? [];
    group.push({ animeId: row.animeId, mediaType: row.mediaType });
    owners.set(key, group);
  }
  return owners;
}

export function previewScannedAnimeTitles(
  titles: ScannedTitle[],
  sampleLimit = 6,
): AnimeScanPreview {
  const animeRows = db
    .select()
    .from(anime)
    .where(eq(anime.mediaType, "anime"))
    .all();
  const episodeRows = db
    .select({ animeId: episodes.animeId, number: episodes.number })
    .from(episodes)
    .all();
  const pathOwners = readPathOwners();
  let existingMatches = 0;
  let newTitles = 0;
  let titlesConflicted = 0;
  let pathConflicts = 0;

  const samples = titles.slice(0, sampleLimit).map((title) => {
    const displayTitle = displayTitleOf(title);
    const matches = matchingAnimeRows(animeRows, title, episodeRows);
    const match = matches.length === 1 ? matches[0] : null;
    let action: "match" | "create" | "conflict";
    if (matches.length > 1) {
      titlesConflicted += 1;
      action = "conflict";
    } else if (match) {
      existingMatches += 1;
      action = "match";
    } else {
      newTitles += 1;
      action = "create";
    }
    for (const file of title.files) {
      const owners = pathOwners.get(localPathKey(file.absPath)) ?? [];
      if (owners.length > 0 && !owners.some((owner) => owner.animeId === match?.id)) {
        pathConflicts += 1;
      }
    }
    return {
      title: displayTitle,
      kind: title.kind === "movie" ? ("movie" as const) : ("series" as const),
      year: title.year ?? null,
      season: title.kind === "tv" ? title.season ?? 1 : null,
      files: title.files.length,
      action,
    };
  });

  if (titles.length > sampleLimit) {
    for (const title of titles.slice(sampleLimit)) {
      const displayTitle = displayTitleOf(title);
      const matches = matchingAnimeRows(animeRows, title, episodeRows);
      const match = matches.length === 1 ? matches[0] : null;
      if (matches.length > 1) titlesConflicted += 1;
      else if (match) existingMatches += 1;
      else newTitles += 1;
      for (const file of title.files) {
        const owners = pathOwners.get(localPathKey(file.absPath)) ?? [];
        if (owners.length > 0 && !owners.some((owner) => owner.animeId === match?.id)) {
          pathConflicts += 1;
        }
      }
    }
  }

  return {
    titlesScanned: titles.length,
    filesFound: titles.reduce((sum, title) => sum + title.files.length, 0),
    series: titles.filter((title) => title.kind === "tv").length,
    movies: titles.filter((title) => title.kind === "movie").length,
    existingMatches,
    newTitles,
    titlesConflicted,
    pathConflicts,
    samples,
  };
}

/** 确认导入：扫描已在事务外完成，这里只执行短事务写入。 */
export function importScannedAnimeTitles(
  titles: ScannedTitle[],
  roots: string[],
): AnimeImportSummary {
  const summary: AnimeImportSummary = {
    titlesScanned: titles.length,
    animeCreated: 0,
    animeMatched: 0,
    titlesConflicted: 0,
    episodesCreated: 0,
    filesImported: 0,
    filesSkipped: 0,
    filesConflicted: 0,
  };

  db.transaction((tx) => {
    const normalizedRoots = cleanRoots(roots);
    tx.insert(appSettings)
      .values({
        key: LIBRARY_KEY,
        value: { roots: normalizedRoots },
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: { roots: normalizedRoots }, updatedAt: sql`(unixepoch())` },
      })
      .run();

    const animeRows = tx
      .select()
      .from(anime)
      .where(eq(anime.mediaType, "anime"))
      .all();
    const identityEpisodeRows = tx
      .select({ animeId: episodes.animeId, number: episodes.number })
      .from(episodes)
      .all();
    const pathRows = tx
      .select({
        animeId: downloadQueue.animeId,
        magnetUrl: downloadQueue.magnetUrl,
        mediaType: anime.mediaType,
      })
      .from(downloadQueue)
      .innerJoin(anime, eq(downloadQueue.animeId, anime.id))
      .where(like(downloadQueue.magnetUrl, "local-file:%"))
      .all();
    const pathOwners = new Map<string, PathOwner[]>();
    for (const row of pathRows) {
      if (row.animeId == null) continue;
      const localPath = parseLocalFileDownloadUrl(row.magnetUrl);
      if (!localPath) continue;
      const key = localPathKey(localPath);
      const group = pathOwners.get(key) ?? [];
      group.push({ animeId: row.animeId, mediaType: row.mediaType });
      pathOwners.set(key, group);
    }

    for (const scanned of titles) {
      const title = displayTitleOf(scanned);
      const matches = matchingAnimeRows(animeRows, scanned, identityEpisodeRows);
      if (matches.length > 1) {
        summary.titlesConflicted += 1;
        continue;
      }
      let existing = matches[0] ?? null;
      const matchedExisting = existing != null;
      const importableFiles = [] as typeof scanned.files;
      for (const file of scanned.files) {
        const key = localPathKey(file.absPath);
        const owners = pathOwners.get(key) ?? [];
        if (owners.length === 0) {
          importableFiles.push(file);
        } else if (existing && owners.some((owner) => owner.animeId === existing?.id)) {
          summary.filesSkipped += 1;
        } else {
          summary.filesConflicted += 1;
        }
      }

      if (!existing && importableFiles.length === 0) continue;

      let animeId: number;
      if (existing) {
        animeId = existing.id;
        summary.animeMatched += 1;
      } else {
        existing = tx
          .insert(anime)
          .values({
            title,
            type: scanned.kind === "movie" ? "Movie" : "TV",
            status: scanned.kind === "movie" ? "completed" : "airing",
            mediaType: "anime",
            year: scanned.year ?? null,
            totalEpisodes: scanned.kind === "movie" ? 1 : null,
          })
          .returning()
          .get();
        animeRows.push(existing);
        animeId = existing.id;
        summary.animeCreated += 1;
      }

      const episodeRows = tx
        .select()
        .from(episodes)
        .where(eq(episodes.animeId, animeId))
        .all();
      const episodeByNumber = new Map(episodeRows.map((episode) => [episode.number, episode]));
      const existingNumbers = [...episodeByNumber.keys()];
      const firstExistingNumber =
        existingNumbers.length > 0 ? Math.min(...existingNumbers) : 0;
      const lastExistingNumber =
        existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
      const declaredSeasonSpan =
        existing.totalEpisodes == null
          ? 0
          : existing.totalEpisodes >= firstExistingNumber && firstExistingNumber > 1
            ? existing.totalEpisodes - firstExistingNumber + 1
            : existing.totalEpisodes;
      const plausibleSeasonSpan = Math.max(
        declaredSeasonSpan,
        lastExistingNumber - firstExistingNumber + 1,
      );
      const scannedNumbers = importableFiles.map((file) => file.episode);
      const useSeasonLocalOffset =
        matchedExisting &&
        scanned.kind === "tv" &&
        (scanned.season ?? 1) > 1 &&
        firstExistingNumber > 1 &&
        scannedNumbers.length > 0 &&
        scannedNumbers.every((number) => number > 0 && number <= plausibleSeasonSpan) &&
        scannedNumbers.every((number) => !episodeByNumber.has(number));

      for (const file of importableFiles) {
        const number =
          scanned.kind === "movie"
            ? 1
            : useSeasonLocalOffset
              ? firstExistingNumber + file.episode - 1
              : file.episode;
        let episode = episodeByNumber.get(number);
        if (!episode) {
          episode = tx
            .insert(episodes)
            .values({
              animeId,
              number,
              title: file.fileName,
              isDownloaded: true,
            })
            .returning()
            .get();
          episodeByNumber.set(number, episode);
          summary.episodesCreated += 1;
        } else if (!episode.isDownloaded) {
          tx.update(episodes)
            .set({ isDownloaded: true })
            .where(eq(episodes.id, episode.id))
            .run();
        }

        tx.insert(downloadQueue)
          .values({
            animeId,
            episodeId: episode.id,
            title: file.fileName,
            magnetUrl: buildLocalFileDownloadUrl(file.absPath),
            status: "completed",
            progress: 100,
          })
          .run();
        const key = localPathKey(file.absPath);
        pathOwners.set(key, [{ animeId, mediaType: "anime" }]);
        summary.filesImported += 1;
      }

      const totalEpisodes =
        matchedExisting && existing.totalEpisodes != null
          ? existing.totalEpisodes
          : scanned.kind === "movie"
            ? 1
            : null;
      tx.update(anime)
        .set({ totalEpisodes, updatedAt: new Date() })
        .where(and(eq(anime.id, animeId), eq(anime.mediaType, "anime")))
        .run();
    }
  });

  return summary;
}
