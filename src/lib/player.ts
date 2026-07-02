import path from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { anime, downloadQueue, episodes, userAnime } from "@/db/schema";
import { parseLocalFileDownloadUrl } from "@/lib/download-reconcile";
import {
  extractMagnetHash,
  getTorrentFiles,
  type QbitTorrentFile,
} from "@/lib/qbit";

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

const SUBTITLE_EXTS = new Set([".srt", ".vtt"]);

const VIDEO_MIME: Record<string, string> = {
  ".avi": "video/x-msvideo",
  ".flv": "video/x-flv",
  ".m4v": "video/mp4",
  ".m2ts": "video/mp2t",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".ts": "video/mp2t",
  ".webm": "video/webm",
  ".wmv": "video/x-ms-wmv",
};

const COMPLETE_RATIO = 0.9;
const COMPLETE_REMAINING_SECONDS = 90;

export interface PlayerFile {
  name: string;
  size: number;
  progress: number;
}

export interface HttpRange {
  start: number;
  end: number;
  status: 200 | 206;
}

export interface PlaybackCompletionInput {
  positionSeconds: number;
  durationSeconds: number;
}

export interface PlaybackCompletionState {
  completed: boolean;
  progressRatio: number;
}

export interface PlayerEpisodeNavigationItem {
  number: number;
  isPlayable: boolean;
}

export interface PlayerEpisodeNavigation {
  playableEpisodeNumbers: number[];
  previousPlayableEpisode: number | null;
  nextPlayableEpisode: number | null;
}

export interface SidecarSubtitleFile {
  name: string;
  label: string;
  urlSafeName: string;
}

export interface ResolvedPlayableEpisodeFile {
  animeId: number;
  animeTitle: string;
  episodeId: number;
  episodeNumber: number;
  fileName: string;
  absPath: string;
  size: number;
  mimeType: string;
}

type PlayerResolveError =
  | "bad_magnet"
  | "episode_not_found"
  | "invalid_anime"
  | "local_file_missing"
  | "no_download"
  | "no_video_file"
  | "not_in_library"
  | "path_outside_save_path"
  | "qbit_lookup_failed";

export type ResolvePlayableEpisodeFileResult =
  | { ok: true; file: ResolvedPlayableEpisodeFile }
  | {
      ok: false;
      error: PlayerResolveError;
      status: number;
      message: string;
    };

export function isVideoFile(name: string): boolean {
  return VIDEO_EXTS.has(path.extname(name).toLowerCase());
}

export function isSubtitleFile(name: string): boolean {
  return SUBTITLE_EXTS.has(path.extname(name).toLowerCase());
}

export function pickLargestVideoFile<T extends PlayerFile>(
  files: T[],
): T | null {
  const videos = files.filter((file) => isVideoFile(file.name));
  if (videos.length === 0) return null;
  return [...videos].sort((a, b) => b.size - a.size)[0] ?? null;
}

export function buildPlayerEpisodeNavigation(
  episodes: PlayerEpisodeNavigationItem[],
  currentEpisode: number,
): PlayerEpisodeNavigation {
  const playableEpisodeNumbers = Array.from(
    new Set(
      episodes
        .filter((episode) => episode.isPlayable)
        .map((episode) => Math.floor(episode.number))
        .filter((number) => Number.isFinite(number) && number > 0),
    ),
  ).sort((a, b) => a - b);

  const previousPlayableEpisode =
    [...playableEpisodeNumbers].reverse().find((number) => number < currentEpisode) ??
    null;
  const nextPlayableEpisode =
    playableEpisodeNumbers.find((number) => number > currentEpisode) ?? null;

  return {
    playableEpisodeNumbers,
    previousPlayableEpisode,
    nextPlayableEpisode,
  };
}

export function getVideoMimeType(name: string): string {
  return VIDEO_MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

export function parseHttpRange(
  rangeHeader: string | null,
  fileSize: number,
): HttpRange | null {
  if (!rangeHeader) return { start: 0, end: Math.max(0, fileSize - 1), status: 200 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || fileSize <= 0) return null;

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  let start: number;
  let end: number;

  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : fileSize - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
    status: 206,
  };
}

export function getPlaybackCompletionState({
  positionSeconds,
  durationSeconds,
}: PlaybackCompletionInput): PlaybackCompletionState {
  const safeDuration = Math.max(0, Math.floor(durationSeconds));
  const safePosition = Math.max(0, Math.floor(positionSeconds));
  if (safeDuration <= 0) return { completed: false, progressRatio: 0 };

  const progressRatio = Math.min(1, safePosition / safeDuration);
  const remainingSeconds = Math.max(0, safeDuration - safePosition);
  return {
    completed:
      progressRatio >= COMPLETE_RATIO ||
      remainingSeconds <= COMPLETE_REMAINING_SECONDS,
    progressRatio,
  };
}

export function srtToWebVtt(source: string): string {
  const body = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");

  return `WEBVTT\n\n${body}\n`;
}

export function listSidecarSubtitleFiles(videoPath: string): SidecarSubtitleFile[] {
  const videoDir = path.dirname(videoPath);
  const videoBaseName = path.basename(videoPath, path.extname(videoPath));
  try {
    return readdirSync(videoDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isSubtitleFile(entry.name))
      .map((entry) => ({
        name: entry.name,
        label: toSubtitleLabel(entry.name, videoBaseName),
        urlSafeName: encodeURIComponent(entry.name),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  } catch {
    return [];
  }
}

export function readSidecarSubtitleAsWebVtt({
  videoPath,
  subtitleName,
}: {
  videoPath: string;
  subtitleName: string;
}): string | null {
  if (
    !subtitleName ||
    subtitleName !== path.basename(subtitleName) ||
    !isSubtitleFile(subtitleName)
  ) {
    return null;
  }

  const videoDir = path.resolve(path.dirname(videoPath));
  const subtitlePath = path.resolve(videoDir, subtitleName);
  const normalizedDir = videoDir.toLowerCase();
  const normalizedSubtitlePath = subtitlePath.toLowerCase();
  if (
    normalizedSubtitlePath !== normalizedDir &&
    !normalizedSubtitlePath.startsWith(normalizedDir + path.sep.toLowerCase())
  ) {
    return null;
  }

  try {
    const source = readFileSync(subtitlePath, "utf8");
    if (path.extname(subtitleName).toLowerCase() === ".srt") {
      return srtToWebVtt(source);
    }
    const normalized = source.replace(/^\uFEFF/, "").trimStart();
    return normalized.startsWith("WEBVTT")
      ? normalized
      : `WEBVTT\n\n${normalized}`;
  } catch {
    return null;
  }
}

function toSubtitleLabel(fileName: string, videoBaseName: string): string {
  const baseName = path.basename(fileName, path.extname(fileName));
  const cleaned = baseName
    .replace(videoBaseName, "")
    .replace(/^[\s._-]+/, "")
    .trim();
  return cleaned || "外挂字幕";
}

export async function resolvePlayableEpisodeFile({
  userId,
  animeId,
  episode,
}: {
  userId: string;
  animeId: number;
  episode?: number;
}): Promise<ResolvePlayableEpisodeFileResult> {
  if (!Number.isFinite(animeId)) {
    return {
      ok: false,
      error: "invalid_anime",
      status: 400,
      message: "番剧参数无效",
    };
  }

  // 本地库 / 成人区内容多半没被「想看」追踪过（无 userAnime 行），但有本地文件就该能播。
  // userAnime 仅用于兜底没传集号时的默认集；不存在就默认 EP.1，不再强制要求先加入追番。
  const ua = db
    .select()
    .from(userAnime)
    .where(and(eq(userAnime.userId, userId), eq(userAnime.animeId, animeId)))
    .get();

  let targetNumber = Number(episode);
  if (!Number.isFinite(targetNumber)) {
    targetNumber = ua && ua.currentEpisode > 0 ? ua.currentEpisode : 1;
  }
  targetNumber = Math.floor(targetNumber);

  const ep = db
    .select()
    .from(episodes)
    .where(and(eq(episodes.animeId, animeId), eq(episodes.number, targetNumber)))
    .get();
  if (!ep) {
    return {
      ok: false,
      error: "episode_not_found",
      status: 404,
      message: `没有找到 EP.${targetNumber} 的剧集信息`,
    };
  }

  const dl = db
    .select()
    .from(downloadQueue)
    .where(
      and(
        eq(downloadQueue.animeId, animeId),
        eq(downloadQueue.episodeId, ep.id),
        eq(downloadQueue.status, "completed"),
      ),
    )
    .orderBy(desc(downloadQueue.updatedAt))
    .get();
  if (!dl) {
    const a = db.select().from(anime).where(eq(anime.id, animeId)).get();
    return {
      ok: false,
      error: "no_download",
      status: 404,
      message: `EP.${targetNumber} 还没下载完成${a?.title ? `（${a.title}）` : ""}`,
    };
  }

  const localFilePath = parseLocalFileDownloadUrl(dl.magnetUrl);
  if (localFilePath) {
    if (!existsSync(localFilePath) || !isVideoFile(localFilePath)) {
      return {
        ok: false,
        error: "local_file_missing",
        status: 404,
        message: "本地下载记录存在，但视频文件已不在原位置",
      };
    }
    const a = db.select().from(anime).where(eq(anime.id, animeId)).get();
    const stat = statSync(localFilePath);

    return {
      ok: true,
      file: {
        animeId,
        animeTitle: a?.title ?? dl.title,
        episodeId: ep.id,
        episodeNumber: targetNumber,
        fileName: path.basename(localFilePath),
        absPath: localFilePath,
        size: stat.size,
        mimeType: getVideoMimeType(localFilePath),
      },
    };
  }

  const hash = extractMagnetHash(dl.magnetUrl);
  if (!hash) {
    return {
      ok: false,
      error: "bad_magnet",
      status: 500,
      message: "下载记录的磁链格式异常",
    };
  }

  const tf = await getTorrentFiles(hash);
  if (!tf.ok) {
    return {
      ok: false,
      error: "qbit_lookup_failed",
      status: 502,
      message: `qBittorrent 查询失败（${tf.error}）`,
    };
  }

  const picked = pickLargestVideoFile<QbitTorrentFile>(tf.files);
  if (!picked) {
    return {
      ok: false,
      error: "no_video_file",
      status: 404,
      message: "种子里找不到视频文件",
    };
  }

  const basePath = path.resolve(tf.savePath);
  const absPath = path.resolve(basePath, picked.name);
  const normalizedBase = basePath.toLowerCase();
  const normalizedAbs = absPath.toLowerCase();
  if (
    normalizedAbs !== normalizedBase &&
    !normalizedAbs.startsWith(normalizedBase + path.sep.toLowerCase())
  ) {
    return {
      ok: false,
      error: "path_outside_save_path",
      status: 500,
      message: "视频文件路径超出下载目录",
    };
  }

  const a = db.select().from(anime).where(eq(anime.id, animeId)).get();

  return {
    ok: true,
    file: {
      animeId,
      animeTitle: a?.title ?? dl.title,
      episodeId: ep.id,
      episodeNumber: targetNumber,
      fileName: picked.name,
      absPath,
      size: picked.size,
      mimeType: getVideoMimeType(picked.name),
    },
  };
}
