export type WatchStatus =
  | "watching"
  | "planning"
  | "completed"
  | "onhold"
  | "dropped";

export function getCompletionEpisodeNumber({
  totalEpisodes,
  episodeNumbers,
}: {
  totalEpisodes: number | null | undefined;
  episodeNumbers: number[];
}): number | null {
  const normalized = episodeNumbers.filter(
    (number) => Number.isFinite(number) && number > 0,
  );
  if (normalized.length > 0) return Math.max(...normalized);
  return typeof totalEpisodes === "number" && totalEpisodes > 0
    ? totalEpisodes
    : null;
}

export function resolveProgressWatchStatus({
  currentStatus,
  explicitStatus,
  nextEpisode,
  completionEpisode,
}: {
  currentStatus: WatchStatus;
  explicitStatus?: WatchStatus | null;
  nextEpisode: number;
  completionEpisode: number | null;
}): WatchStatus {
  if (explicitStatus) return explicitStatus;
  if (currentStatus === "dropped") return currentStatus;
  if (completionEpisode != null && nextEpisode >= completionEpisode) {
    return "completed";
  }
  if (currentStatus === "completed") return "watching";
  return currentStatus;
}
