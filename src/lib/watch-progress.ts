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
  const highestStoredEpisode =
    normalized.length > 0 ? Math.max(...normalized) : null;
  const declaredTotal =
    typeof totalEpisodes === "number" && totalEpisodes > 0
      ? totalEpisodes
      : null;
  if (highestStoredEpisode == null) return declaredTotal;
  if (declaredTotal == null) return highestStoredEpisode;
  return Math.max(highestStoredEpisode, declaredTotal);
}

export function resolveProgressWatchStatus({
  currentStatus,
  explicitStatus,
  currentEpisode,
  completionEpisode,
}: {
  currentStatus: WatchStatus;
  explicitStatus?: WatchStatus | null;
  currentEpisode: number;
  completionEpisode: number | null;
}): WatchStatus {
  if (explicitStatus) return explicitStatus;
  if (currentStatus === "dropped") return currentStatus;
  if (currentEpisode <= 0) return "planning";
  if (completionEpisode != null && currentEpisode >= completionEpisode) {
    return "completed";
  }
  if (currentStatus === "planning" && currentEpisode > 0) return "watching";
  if (currentStatus === "completed") return "watching";
  return currentStatus;
}

export function resolveWatchedThroughWatchStatus({
  currentStatus,
  explicitStatus,
  watchedThroughEpisode,
  completionEpisode,
}: {
  currentStatus: WatchStatus;
  explicitStatus?: WatchStatus | null;
  watchedThroughEpisode: number;
  completionEpisode: number | null;
}): WatchStatus {
  return resolveProgressWatchStatus({
    currentStatus,
    explicitStatus,
    currentEpisode: watchedThroughEpisode,
    completionEpisode,
  });
}

export function getWatchedThroughEpisodeNumber({
  currentEpisode,
  watchStatus,
  completionEpisode,
}: {
  currentEpisode: number;
  watchStatus: WatchStatus;
  completionEpisode: number | null;
}): number {
  const safeCurrent = Math.max(0, Math.floor(currentEpisode));
  if (watchStatus === "completed") {
    return completionEpisode ?? safeCurrent;
  }
  return safeCurrent;
}

export function resolveCompletedPlaybackProgress({
  currentEpisode,
  currentStatus,
  completedEpisode,
  completionEpisode,
}: {
  currentEpisode: number;
  currentStatus: WatchStatus;
  completedEpisode: number;
  completionEpisode: number | null;
}): {
  advanced: boolean;
  previousWatchedThrough: number;
  watchedThroughEpisode: number;
  currentEpisode: number;
  watchStatus: WatchStatus;
} {
  const previousWatchedThrough = getWatchedThroughEpisodeNumber({
    currentEpisode,
    watchStatus: currentStatus,
    completionEpisode,
  });
  const watchedThroughEpisode = Math.max(
    previousWatchedThrough,
    Math.max(0, Math.floor(completedEpisode)),
  );
  const advanced = watchedThroughEpisode > previousWatchedThrough;

  if (!advanced) {
    return {
      advanced,
      previousWatchedThrough,
      watchedThroughEpisode,
      currentEpisode,
      watchStatus: currentStatus,
    };
  }

  return {
    advanced,
    previousWatchedThrough,
    watchedThroughEpisode,
    currentEpisode: watchedThroughEpisode,
    watchStatus: resolveWatchedThroughWatchStatus({
      currentStatus,
      watchedThroughEpisode,
      completionEpisode,
    }),
  };
}
