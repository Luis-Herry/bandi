export function validateEpisodeProgressBounds({
  mediaType,
  currentEpisode,
  completionEpisode,
}: {
  mediaType: string | null | undefined;
  currentEpisode: number;
  completionEpisode: number | null;
}): { error: string; status: 422 } | null {
  if (
    currentEpisode > 0 &&
    mediaType !== "anime" &&
    completionEpisode == null
  ) {
    return { error: "episode data unavailable", status: 422 };
  }
  if (completionEpisode != null && currentEpisode > completionEpisode) {
    return { error: "episode progress out of range", status: 422 };
  }
  return null;
}
