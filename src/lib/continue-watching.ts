export interface ContinueEpisodeCandidate {
  number: number;
  isDownloaded: boolean;
  airedAt: Date | null;
}

export interface ContinuePlaybackState {
  episodeNumber: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
}

export interface ContinueEpisodeSelection {
  episodeNumber: number | null;
  source: "incomplete-playback" | "next-download" | null;
}

interface SelectContinueEpisodeInput {
  watchedThroughEpisode: number;
  episodes: ContinueEpisodeCandidate[];
  playbackProgress?: ContinuePlaybackState | null;
  now?: Date;
}

interface SelectHeroEpisodeAvailabilityInput {
  watchedThroughEpisode: number;
  episodes: ContinueEpisodeCandidate[];
  now?: Date;
}

export interface HeroEpisodeAvailability {
  sourceEpisodeNumber: number | null;
  nextAiringEpisodeNumber: number | null;
  nextAiringAt: Date | null;
}

/**
 * Pick the most useful local episode to resume.
 *
 * Priority: incomplete playback at/after the completed episode, then the first
 * later downloaded episode. A downloaded completed episode alone is not a
 * continue target.
 */
export function selectContinueEpisode({
  watchedThroughEpisode,
  episodes,
  playbackProgress,
  now = new Date(),
}: SelectContinueEpisodeInput): ContinueEpisodeSelection {
  const downloadedEpisodes = episodes
    .filter((episode) => episode.isDownloaded)
    .sort((a, b) => a.number - b.number);
  const hasDownloadedPlaybackEpisode =
    !!playbackProgress &&
    downloadedEpisodes.some(
      (episode) => episode.number === playbackProgress.episodeNumber,
    );
  const hasIncompletePlayback =
    !!playbackProgress &&
    !playbackProgress.completed &&
    playbackProgress.positionSeconds > 0 &&
    playbackProgress.durationSeconds > 0 &&
    playbackProgress.episodeNumber >= watchedThroughEpisode &&
    hasDownloadedPlaybackEpisode;

  if (hasIncompletePlayback) {
    return {
      episodeNumber: playbackProgress.episodeNumber,
      source: "incomplete-playback",
    };
  }

  const nextDownloadedEpisode = downloadedEpisodes.find(
    (episode) =>
      episode.number > watchedThroughEpisode &&
      episode.airedAt != null &&
      episode.airedAt.getTime() <= now.getTime(),
  );
  if (nextDownloadedEpisode) {
    return {
      episodeNumber: nextDownloadedEpisode.number,
      source: "next-download",
    };
  }

  return { episodeNumber: null, source: null };
}

/**
 * Describe the first non-playback action after the watched-through episode.
 * Aired episodes can search RSS; future episodes only expose their schedule.
 */
export function selectHeroEpisodeAvailability({
  watchedThroughEpisode,
  episodes,
  now = new Date(),
}: SelectHeroEpisodeAvailabilityInput): HeroEpisodeAvailability {
  const scheduledEpisodes = episodes
    .filter(
      (episode) =>
        episode.number > watchedThroughEpisode && episode.airedAt != null,
    )
    .sort((a, b) => a.number - b.number);
  const sourceEpisode = scheduledEpisodes.find(
    (episode) => episode.airedAt!.getTime() <= now.getTime(),
  );
  if (sourceEpisode) {
    return {
      sourceEpisodeNumber: sourceEpisode.number,
      nextAiringEpisodeNumber: null,
      nextAiringAt: null,
    };
  }

  const nextAiringEpisode = scheduledEpisodes.find(
    (episode) => episode.airedAt!.getTime() > now.getTime(),
  );
  if (nextAiringEpisode) {
    return {
      sourceEpisodeNumber: null,
      nextAiringEpisodeNumber: nextAiringEpisode.number,
      nextAiringAt: nextAiringEpisode.airedAt,
    };
  }

  return {
    sourceEpisodeNumber: null,
    nextAiringEpisodeNumber: null,
    nextAiringAt: null,
  };
}
