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
  if (currentStatus === "planning" && nextEpisode > 0) return "watching";
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
    nextEpisode: watchedThroughEpisode,
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
  return Math.max(0, safeCurrent - 1);
}

export function getCurrentEpisodeAfterWatchedThrough({
  watchedThroughEpisode,
  episodeNumbers,
  completionEpisode,
}: {
  watchedThroughEpisode: number;
  episodeNumbers: number[];
  completionEpisode: number | null;
}): number {
  const safeWatchedThrough = Math.max(0, Math.floor(watchedThroughEpisode));
  const nextEpisode = Array.from(
    new Set(
      episodeNumbers
        .map((number) => Math.floor(number))
        .filter((number) => Number.isFinite(number) && number > safeWatchedThrough),
    ),
  ).sort((a, b) => a - b)[0];

  if (nextEpisode != null) return nextEpisode;
  return completionEpisode ?? safeWatchedThrough;
}

export function resolveCompletedPlaybackProgress({
  currentEpisode,
  currentStatus,
  completedEpisode,
  episodeNumbers,
  completionEpisode,
}: {
  currentEpisode: number;
  currentStatus: WatchStatus;
  completedEpisode: number;
  episodeNumbers: number[];
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
    currentEpisode: getCurrentEpisodeAfterWatchedThrough({
      watchedThroughEpisode,
      episodeNumbers,
      completionEpisode,
    }),
    watchStatus: resolveWatchedThroughWatchStatus({
      currentStatus,
      watchedThroughEpisode,
      completionEpisode,
    }),
  };
}
