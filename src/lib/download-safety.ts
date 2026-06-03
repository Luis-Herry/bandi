import type { AddTorrentOptions } from "@/lib/qbit";

export type DownloadRuntimeStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "failed";

export const SAFE_TORRENT_UPLOAD_LIMIT_BYTES = 128 * 1024;

export function buildSafeTorrentOptions(
  options: AddTorrentOptions = {},
): AddTorrentOptions {
  return {
    upLimit: SAFE_TORRENT_UPLOAD_LIMIT_BYTES,
    ratioLimit: 0,
    seedingTimeLimit: 0,
    ...options,
  };
}

export function shouldPauseAfterCompletion(
  previousStatus: DownloadRuntimeStatus,
  nextStatus: DownloadRuntimeStatus,
): boolean {
  return previousStatus !== "completed" && nextStatus === "completed";
}
