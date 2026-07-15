export interface EpisodeRangeCandidate<T> {
  value: T;
  totalEpisodes: number | null | undefined;
  episodeNumbers: number[];
}

export interface CanonicalEpisodeRange {
  first: number;
  last: number;
}

export function getCanonicalEpisodeRange<T>(
  candidate: EpisodeRangeCandidate<T>,
): CanonicalEpisodeRange | null {
  const numbers = [...new Set(candidate.episodeNumbers)]
    .filter((number) => Number.isInteger(number) && number > 0)
    .sort((left, right) => left - right);
  if (numbers.length === 0) return null;

  const runs: number[][] = [];
  for (const number of numbers) {
    const current = runs[runs.length - 1];
    if (!current || current[current.length - 1] !== number - 1) {
      runs.push([number]);
    } else {
      current.push(number);
    }
  }
  const canonicalRun = [...runs].sort(
    (left, right) => right.length - left.length || left[0]! - right[0]!,
  )[0]!;
  const first = canonicalRun[0]!;
  const declared = candidate.totalEpisodes;
  if (declared == null || !Number.isInteger(declared) || declared <= 0) {
    return { first, last: canonicalRun[canonicalRun.length - 1]! };
  }
  return {
    first,
    last: first > 1 && declared >= first ? declared : first + declared - 1,
  };
}

export function resolveUniqueEpisodeRangeCandidate<T>(
  candidates: Array<EpisodeRangeCandidate<T>>,
  requestedEpisodes: number[],
): T | null {
  const requested = [...new Set(requestedEpisodes)].filter(
    (number) => Number.isInteger(number) && number > 0,
  );
  if (requested.length === 0) return null;
  const matches = candidates.filter((candidate) => {
    const range = getCanonicalEpisodeRange(candidate);
    return (
      range != null &&
      requested.every((number) => number >= range.first && number <= range.last)
    );
  });
  return matches.length === 1 ? matches[0]!.value : null;
}
