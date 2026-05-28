export type WatchEventAction = "watch" | "unwatch";

export interface WatchEventDraft {
  userId: string;
  animeId: number;
  episodeId: number | null;
  episode: number;
  action: WatchEventAction;
  minutes: number;
  watchedAt: Date;
}

interface BuildWatchEventDraftsInput {
  userId: string;
  animeId: number;
  oldEpisode: number;
  newEpisode: number;
  watchedAt: Date;
  episodeIdsByNumber?: Map<number, number>;
  knownEpisodeNumbers?: Iterable<number>;
  minutes?: number;
}

const DEFAULT_EPISODE_MINUTES = 24;

export function buildWatchEventDrafts({
  userId,
  animeId,
  oldEpisode,
  newEpisode,
  watchedAt,
  episodeIdsByNumber = new Map(),
  knownEpisodeNumbers,
  minutes = DEFAULT_EPISODE_MINUTES,
}: BuildWatchEventDraftsInput): WatchEventDraft[] {
  const oldEp = Math.max(0, Math.floor(oldEpisode));
  const newEp = Math.max(0, Math.floor(newEpisode));
  if (oldEp === newEp) return [];

  const action: WatchEventAction = newEp > oldEp ? "watch" : "unwatch";
  const start = Math.min(oldEp, newEp) + 1;
  const end = Math.max(oldEp, newEp);
  const knownSet =
    knownEpisodeNumbers == null ? null : new Set(knownEpisodeNumbers);
  const events: WatchEventDraft[] = [];

  for (let episode = start; episode <= end; episode += 1) {
    if (knownSet && !knownSet.has(episode)) continue;
    events.push({
      userId,
      animeId,
      episodeId: episodeIdsByNumber.get(episode) ?? null,
      episode,
      action,
      minutes,
      watchedAt,
    });
  }

  return events;
}
