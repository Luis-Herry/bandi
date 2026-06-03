import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { downloadQueue, episodes } from "@/db/schema";

function isPositiveEpisodeId(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function getCompletedDownloadEpisodeIds(
  episodeIds: Array<number | null | undefined>,
): Set<number> {
  const ids = [...new Set(episodeIds.filter(isPositiveEpisodeId))];
  if (ids.length === 0) return new Set();

  const rows = db
    .select({ episodeId: downloadQueue.episodeId })
    .from(downloadQueue)
    .where(
      and(
        inArray(downloadQueue.episodeId, ids),
        eq(downloadQueue.status, "completed"),
      ),
    )
    .all();

  return new Set(rows.map((row) => row.episodeId).filter(isPositiveEpisodeId));
}

export function applyCompletedDownloadState<
  T extends { id: number; isDownloaded: boolean },
>(episodeRows: T[]): T[] {
  const downloadedEpisodeIds = getCompletedDownloadEpisodeIds(
    episodeRows.map((row) => row.id),
  );
  return episodeRows.map((row) => {
    const isDownloaded = downloadedEpisodeIds.has(row.id);
    return row.isDownloaded === isDownloaded ? row : { ...row, isDownloaded };
  });
}

export function resetDownloadedFlagsWithoutCompletedRows(
  episodeIds: Array<number | null | undefined>,
): number {
  const ids = [...new Set(episodeIds.filter(isPositiveEpisodeId))];
  if (ids.length === 0) return 0;

  const backedEpisodeIds = getCompletedDownloadEpisodeIds(ids);
  const staleEpisodeIds = ids.filter((id) => !backedEpisodeIds.has(id));
  if (staleEpisodeIds.length === 0) return 0;

  const result = db
    .update(episodes)
    .set({ isDownloaded: false })
    .where(inArray(episodes.id, staleEpisodeIds))
    .run();
  return result.changes ?? 0;
}
