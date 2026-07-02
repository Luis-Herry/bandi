import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { extractEpisodeNumber, extractSeason, stripSeasonSuffix } from "@/lib/rss";
import {
  containsAnimeTitleAlias,
  stripTrailingArcAfterSeason,
} from "@/lib/source-match";
import { expandZhVariants } from "@/lib/zh-convert";
import { extractMagnetHash, type QbitTorrent } from "@/lib/qbit";

export type DownloadImportSource = "qbit" | "local-file";
export type DownloadImportStatus = "pending" | "downloading" | "completed" | "failed";

export interface ExistingDownloadRef {
  title: string;
  magnetUrl: string;
}

export interface LocalVideoFileRef {
  path: string;
  name: string;
}

export interface DownloadAnimeRef {
  id: number;
  title: string;
  titleJa: string | null;
}

export interface DownloadEpisodeRef {
  id: number;
  animeId: number;
  number: number;
}

export interface ExternalDownloadImport {
  source: DownloadImportSource;
  title: string;
  magnetUrl: string;
  status: DownloadImportStatus;
  progress: number;
  animeId: number | null;
  episodeId: number | null;
}

interface DownloadListRowRef {
  animeId?: number | null;
  episodeId?: number | null;
  magnetUrl: string;
  status?: string | null;
}

interface PlanExternalDownloadImportsInput {
  downloadRoot: string;
  existingDownloads: ExistingDownloadRef[];
  liveTorrents: QbitTorrent[];
  localFiles: LocalVideoFileRef[];
  animeRefs: DownloadAnimeRef[];
  episodeRefs: DownloadEpisodeRef[];
  aliasesByAnimeId: Record<number | string, string[]>;
}

const LOCAL_FILE_DOWNLOAD_URL_PREFIX = "local-file:";
const VIDEO_EXTS = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".m4v",
  ".ts",
  ".m2ts",
]);

const COMPLETED_QBIT_STATES = new Set([
  "uploading",
  "stalledUP",
  "forcedUP",
  "queuedUP",
  "checkingUP",
  "pausedUP",
  "stoppedUP",
]);
const VISIBLE_QBIT_DOWNLOAD_STATUSES = new Set([
  "pending",
  "downloading",
  "completed",
]);

function tokenizeReleaseName(value: string) {
  const stripped = value.replace(/\[[^\]]*\]/g, " ");
  const nums = new Set(
    (stripped.match(/\b\d{1,4}\b/g) ?? []).filter((number) => {
      const n = Number(number);
      return n > 0 && n < 480;
    }),
  );
  const words = new Set(
    (stripped.match(/[A-Za-z]{3,}/g) ?? []).map((word) => word.toLowerCase()),
  );
  const cjk = new Set(stripped.match(/[一-龥぀-ゟ゠-ヿ]/g) ?? []);
  return { nums, words, cjk };
}

function releaseNameMatchScore(
  a: ReturnType<typeof tokenizeReleaseName>,
  b: ReturnType<typeof tokenizeReleaseName>,
): number {
  let score = 0;
  for (const number of a.nums) if (b.nums.has(number)) score += 2;
  for (const word of a.words) if (b.words.has(word)) score += 1;
  for (const char of a.cjk) if (b.cjk.has(char)) score += 0.3;
  return score;
}

export function isVideoFileName(name: string): boolean {
  return VIDEO_EXTS.has(path.extname(name).toLowerCase());
}

export function listLocalVideoFiles(downloadRoot: string): LocalVideoFileRef[] {
  const root = path.resolve(downloadRoot);
  if (!existsSync(root)) return [];

  const out: LocalVideoFileRef[] = [];
  const walk = (dir: string) => {
    const entries = readDirectoryEntries(dir);
    if (entries.length === 0) return;

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !isVideoFileName(entry.name)) continue;
      out.push({ path: fullPath, name: entry.name });
    }
  };

  walk(root);
  return out;
}

function readDirectoryEntries(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return [];
  }
}

export function buildLocalFileDownloadUrl(absPath: string): string {
  return `${LOCAL_FILE_DOWNLOAD_URL_PREFIX}${encodeURIComponent(path.resolve(absPath))}`;
}

export function parseLocalFileDownloadUrl(value: string): string | null {
  if (!value.startsWith(LOCAL_FILE_DOWNLOAD_URL_PREFIX)) return null;
  try {
    const decoded = decodeURIComponent(
      value.slice(LOCAL_FILE_DOWNLOAD_URL_PREFIX.length),
    );
    return path.isAbsolute(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function findMatchingQbitTorrent(
  row: ExistingDownloadRef,
  live: QbitTorrent[],
): QbitTorrent | null {
  const hash = extractMagnetHash(row.magnetUrl);
  if (hash) {
    return live.find((torrent) => normalizeHash(torrent.hash) === hash) ?? null;
  }

  const exact = live.find((torrent) => torrent.name === row.title);
  if (exact) return exact;

  const rowTokens = tokenizeReleaseName(row.title);
  let best: { torrent: QbitTorrent; score: number } | null = null;
  for (const torrent of live) {
    const torrentTokens = tokenizeReleaseName(torrent.name);
    const score = releaseNameMatchScore(rowTokens, torrentTokens);
    if (score < 5) continue;

    let hasEpisodeNumber = false;
    for (const number of rowTokens.nums) {
      if (torrentTokens.nums.has(number)) {
        hasEpisodeNumber = true;
        break;
      }
    }
    if (!hasEpisodeNumber) continue;
    if (!best || score > best.score) best = { torrent, score };
  }

  return best?.torrent ?? null;
}

export function planExternalDownloadImports(
  input: PlanExternalDownloadImportsInput,
): ExternalDownloadImport[] {
  const existingHashes = new Set(
    input.existingDownloads
      .map((row) => extractMagnetHash(row.magnetUrl))
      .filter((hash): hash is string => Boolean(hash)),
  );
  const existingLocalPaths = new Set(
    input.existingDownloads
      .map((row) => parseLocalFileDownloadUrl(row.magnetUrl))
      .filter((filePath): filePath is string => Boolean(filePath))
      .map(normalizePathForCompare),
  );
  const existingTitles = new Set(
    input.existingDownloads.map((row) => normalizeTitleKey(row.title)),
  );
  const episodeRowsByAnime = groupEpisodeRefs(input.episodeRefs);
  const liveFileNamesInDownloadRoot = new Set<string>();
  const imports: ExternalDownloadImport[] = [];

  for (const torrent of input.liveTorrents) {
    if (!isProjectDownloadTorrent(torrent, input.downloadRoot)) continue;

    for (const titleKey of getLiveTorrentFileTitleKeys(
      torrent,
      input.downloadRoot,
    )) {
      liveFileNamesInDownloadRoot.add(titleKey);
    }

    const hash = normalizeHash(torrent.hash);
    if (!hash || existingHashes.has(hash)) continue;
    const titleKey = normalizeTitleKey(torrent.name);
    if (existingTitles.has(titleKey)) continue;

    const inferred = inferAnimeEpisode(
      torrent.name,
      input.animeRefs,
      input.aliasesByAnimeId,
      episodeRowsByAnime,
    );
    imports.push({
      source: "qbit",
      title: torrent.name,
      magnetUrl: buildSyntheticMagnet(hash, torrent.name),
      status: deriveQbitDownloadStatus(torrent),
      progress: Math.min(100, Math.max(0, Math.round(torrent.progress * 100))),
      animeId: inferred.animeId,
      episodeId: inferred.episodeId,
    });

    existingHashes.add(hash);
    existingTitles.add(titleKey);
  }

  for (const file of input.localFiles) {
    const absPath = path.resolve(file.path);
    if (!isPathInsideRoot(absPath, input.downloadRoot)) continue;
    if (!isVideoFileName(file.name)) continue;

    const titleKey = normalizeTitleKey(file.name);
    if (existingLocalPaths.has(normalizePathForCompare(absPath))) continue;
    if (existingTitles.has(titleKey)) continue;
    if (liveFileNamesInDownloadRoot.has(titleKey)) continue;

    const inferred = inferAnimeEpisode(
      file.name,
      input.animeRefs,
      input.aliasesByAnimeId,
      episodeRowsByAnime,
    );
    imports.push({
      source: "local-file",
      title: file.name,
      magnetUrl: buildLocalFileDownloadUrl(absPath),
      status: "completed",
      progress: 100,
      animeId: inferred.animeId,
      episodeId: inferred.episodeId,
    });

    existingLocalPaths.add(normalizePathForCompare(absPath));
    existingTitles.add(titleKey);
  }

  return imports;
}

export function filterShadowLocalFileDownloads<T extends DownloadListRowRef>(
  rows: T[],
): T[] {
  const qbitEpisodeKeys = new Set<string>();
  for (const row of rows) {
    if (!extractMagnetHash(row.magnetUrl)) continue;
    if (!isVisibleQbitDownloadStatus(row.status)) continue;

    const key = getEpisodeDownloadKey(row);
    if (key) qbitEpisodeKeys.add(key);
  }

  return rows.filter((row) => {
    if (!parseLocalFileDownloadUrl(row.magnetUrl)) return true;

    const key = getEpisodeDownloadKey(row);
    return !key || !qbitEpisodeKeys.has(key);
  });
}

export function deriveQbitDownloadStatus(t: QbitTorrent): DownloadImportStatus {
  if (t.state === "error" || t.state === "missingFiles") return "failed";
  if (t.progress >= 0.999) return "completed";
  if (COMPLETED_QBIT_STATES.has(t.state)) return "completed";
  return "downloading";
}

function inferAnimeEpisode(
  releaseTitle: string,
  animeRefs: DownloadAnimeRef[],
  aliasesByAnimeId: Record<number | string, string[]>,
  episodeRowsByAnime: Map<number, DownloadEpisodeRef[]>,
): { animeId: number | null; episodeId: number | null } {
  const anime = findBestAnimeMatch(releaseTitle, animeRefs, aliasesByAnimeId);
  if (!anime) return { animeId: null, episodeId: null };

  const episode = resolveEpisodeForRelease(
    releaseTitle,
    episodeRowsByAnime.get(anime.id) ?? [],
  );
  return {
    animeId: anime.id,
    episodeId: episode?.id ?? null,
  };
}

function findBestAnimeMatch(
  releaseTitle: string,
  animeRefs: DownloadAnimeRef[],
  aliasesByAnimeId: Record<number | string, string[]>,
): DownloadAnimeRef | null {
  let best: { anime: DownloadAnimeRef; score: number } | null = null;

  for (const anime of animeRefs) {
    const aliases = buildAnimeAliases(anime, aliasesByAnimeId[anime.id] ?? []);
    const exact = containsAnimeTitleAlias(releaseTitle, aliases);
    const score = exact
      ? 100 + Math.max(...aliases.map((alias) => alias.length), 0) / 100
      : scoreFuzzyTitleMatch(releaseTitle, aliases);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { anime, score };
  }

  return best?.anime ?? null;
}

function buildAnimeAliases(anime: DownloadAnimeRef, savedAliases: string[]): string[] {
  const out = new Set<string>();
  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return;

    const bases = new Set<string>([trimmed]);
    const stripped = stripSeasonSuffix(trimmed);
    if (stripped) bases.add(stripped);
    const seasonTitle = stripTrailingArcAfterSeason(trimmed);
    if (seasonTitle) bases.add(seasonTitle);
    const leading = getLeadingTitleSegment(trimmed);
    if (leading) bases.add(leading);

    for (const base of bases) {
      for (const variant of expandZhVariants(base)) {
        const alias = variant.trim();
        if (alias.length >= 2) out.add(alias);
      }
    }
  };

  for (const alias of savedAliases) push(alias);
  push(anime.title);
  push(anime.titleJa);
  return [...out].sort((a, b) => b.length - a.length);
}

function scoreFuzzyTitleMatch(releaseTitle: string, aliases: string[]): number {
  const releaseSeason = extractSeason(releaseTitle);
  const releaseCore = getComparableTitleCore(releaseTitle);
  const releaseChars = uniqueCjkChars(releaseCore);
  if (releaseChars.length === 0) return 0;

  let best = 0;
  for (const alias of aliases) {
    const aliasSeason = extractSeason(alias);
    if (
      releaseSeason !== null &&
      aliasSeason !== null &&
      releaseSeason !== aliasSeason
    ) {
      continue;
    }

    const aliasCore = getComparableTitleCore(alias);
    const aliasChars = uniqueCjkChars(aliasCore);
    const minLength = Math.min(releaseChars.length, aliasChars.length);
    if (minLength === 0) continue;

    const common = aliasChars.filter((char) => releaseChars.includes(char)).length;
    const ratio = common / minLength;
    const enoughCommonChars = common >= 3 || (common >= 2 && minLength <= 3);
    if (!enoughCommonChars || ratio < 0.6) continue;

    const seasonBonus =
      releaseSeason !== null && aliasSeason !== null && releaseSeason === aliasSeason
        ? 5
        : 0;
    best = Math.max(best, 20 + ratio * 10 + common / 10 + seasonBonus);
  }

  return best;
}

function resolveEpisodeForRelease(
  releaseTitle: string,
  episodeRows: DownloadEpisodeRef[],
): DownloadEpisodeRef | null {
  const releaseEpisode = extractEpisodeNumber(releaseTitle);
  if (releaseEpisode == null) return null;

  const rows = dedupeEpisodeRows(episodeRows);
  const exact = rows.find((row) => row.number === releaseEpisode);
  if (exact) return exact;

  if (!isContiguousEpisodeSequence(rows)) return null;
  const first = rows[0]?.number;
  if (first == null || first <= 1) return null;
  if (releaseEpisode < 1 || releaseEpisode > rows.length) return null;
  return rows[releaseEpisode - 1] ?? null;
}

function groupEpisodeRefs(rows: DownloadEpisodeRef[]): Map<number, DownloadEpisodeRef[]> {
  const grouped = new Map<number, DownloadEpisodeRef[]>();
  for (const row of rows) {
    const list = grouped.get(row.animeId) ?? [];
    list.push(row);
    grouped.set(row.animeId, list);
  }
  for (const [animeId, list] of grouped) {
    grouped.set(animeId, dedupeEpisodeRows(list));
  }
  return grouped;
}

function dedupeEpisodeRows(rows: DownloadEpisodeRef[]): DownloadEpisodeRef[] {
  const seen = new Set<number>();
  const out: DownloadEpisodeRef[] = [];
  for (const row of [...rows].sort((a, b) => a.number - b.number)) {
    if (seen.has(row.number)) continue;
    seen.add(row.number);
    out.push(row);
  }
  return out;
}

function isContiguousEpisodeSequence(rows: DownloadEpisodeRef[]): boolean {
  return rows.every((row, index) => row.number === rows[0]!.number + index);
}

function isProjectDownloadTorrent(torrent: QbitTorrent, downloadRoot: string): boolean {
  if ((torrent.category ?? "").toLowerCase() === "anime") return true;
  if (isPathInsideRoot(torrent.content_path ?? "", downloadRoot)) return true;
  return isPathInsideRoot(torrent.save_path ?? "", downloadRoot);
}

function getLiveTorrentFileTitleKeys(
  torrent: QbitTorrent,
  downloadRoot: string,
): string[] {
  const keys = new Set<string>();
  if (isPathInsideRoot(torrent.save_path ?? "", downloadRoot)) {
    keys.add(normalizeTitleKey(torrent.name));
  }
  if (isPathInsideRoot(torrent.content_path ?? "", downloadRoot)) {
    keys.add(normalizeTitleKey(path.basename(torrent.content_path!)));
  }
  return [...keys];
}

function getEpisodeDownloadKey(row: DownloadListRowRef): string | null {
  if (row.animeId == null || row.episodeId == null) return null;
  return `${row.animeId}:${row.episodeId}`;
}

function isVisibleQbitDownloadStatus(status: string | null | undefined): boolean {
  if (status == null) return true;
  return VISIBLE_QBIT_DOWNLOAD_STATUSES.has(status);
}

function isPathInsideRoot(value: string, root: string): boolean {
  if (!value.trim()) return false;
  const normalizedValue = normalizePathForCompare(value);
  const normalizedRoot = normalizePathForCompare(root);
  return (
    normalizedValue === normalizedRoot ||
    normalizedValue.startsWith(`${normalizedRoot}/`)
  );
}

function normalizePathForCompare(value: string): string {
  return path
    .resolve(value)
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function normalizeTitleKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeHash(value: string | null | undefined): string | null {
  const hash = value?.trim().toLowerCase();
  return hash && /^[a-f0-9]{40}$/.test(hash) ? hash : null;
}

function buildSyntheticMagnet(hash: string, name: string): string {
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}`;
}

function getComparableTitleCore(value: string): string {
  const withoutGroups = value
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\.[a-z0-9]{2,5}$/i, " ");
  const beforeEpisode = withoutGroups.replace(
    /[-－]\s*0*\d{1,3}(?:v\d+)?(?:\s|\[|\(|$).*$/i,
    "",
  );
  const seasonTitle = stripTrailingArcAfterSeason(beforeEpisode) ?? beforeEpisode;
  return stripSeasonSuffix(seasonTitle)
    .replace(/第\s*[0-9一二三四五六七八九十]+\s*[季期部]/gi, "")
    .replace(/\b(?:season|s)\s*\d+\b/gi, "")
    .replace(/\b\d+\s*(?:st|nd|rd|th)\s*season\b/gi, "")
    .replace(/[\s　:：,，、/／~〜\-－_]+/g, "");
}

function uniqueCjkChars(value: string): string[] {
  return [...new Set(value.match(/[\p{Script=Han}]/gu) ?? [])];
}

function getLeadingTitleSegment(value: string): string | null {
  const [segment] = value.split(/[，,、/／:：~〜]/);
  const trimmed = segment?.trim();
  if (!trimmed || trimmed === value.trim() || trimmed.length < 3) return null;
  return trimmed;
}
