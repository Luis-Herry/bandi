import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { downloadQueue } from "@/db/schema";

const ACTIVE_DOWNLOAD_STATUSES = ["pending", "downloading"] as const;

export type DownloadDuplicateReason =
  | "same-magnet"
  | "episode-downloaded"
  | "same-episode";

export interface DownloadDuplicate {
  reason: DownloadDuplicateReason;
  downloadId?: number;
  episodeId?: number;
}

export function findDownloadDuplicate(input: {
  magnetUrl: string;
  episodeId?: number | null;
}): DownloadDuplicate | null {
  const sameMagnet = db
    .select({ id: downloadQueue.id })
    .from(downloadQueue)
    .where(eq(downloadQueue.magnetUrl, input.magnetUrl))
    .get();
  if (sameMagnet) {
    return { reason: "same-magnet", downloadId: sameMagnet.id };
  }

  if (input.episodeId == null) return null;

  const completedEpisode = db
    .select({ id: downloadQueue.id })
    .from(downloadQueue)
    .where(
      and(
        eq(downloadQueue.episodeId, input.episodeId),
        eq(downloadQueue.status, "completed"),
      ),
    )
    .get();
  if (completedEpisode) {
    return {
      reason: "episode-downloaded",
      downloadId: completedEpisode.id,
      episodeId: input.episodeId,
    };
  }

  const sameEpisode = db
    .select({ id: downloadQueue.id })
    .from(downloadQueue)
    .where(
      and(
        eq(downloadQueue.episodeId, input.episodeId),
        inArray(downloadQueue.status, ACTIVE_DOWNLOAD_STATUSES),
      ),
    )
    .get();
  if (sameEpisode) {
    return {
      reason: "same-episode",
      downloadId: sameEpisode.id,
      episodeId: input.episodeId,
    };
  }

  return null;
}
