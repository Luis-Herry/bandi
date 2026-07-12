import { extractEpisodeNumber, extractSeason } from "@/lib/rss";

const COMPLETE_LABEL_RE =
  /(?:季度|全季|整季|TV)?\s*全\s*(?:集|话|話)|合集|complete|batch/i;
const PARTIAL_PACK_LABEL_RE = /前半(?:全集|部分完|完)|后半(?:全集|部分完|完)/i;
const SPECIAL_PACK_RE =
  /(?:^|[^0-9A-Za-z])(?:0*\d{1,3}\s*\+\s*)?(?:SP|OVA|OAD|NCOP|NCED)\s*0*\d{1,3}\s*(?:-|－|~|～|—|–)?\s*0*\d{0,3}(?=[^0-9A-Za-z]|$)/i;
const AUDIO_ONLY_HINT_RE =
  /(?:\bOP\b|\bED\b|OST|original\s+soundtrack|主题曲|主題曲|片头曲|片頭曲|片尾曲|插入歌|角色歌|专辑|專輯|album|single|flac|mp3|wav|hi-res)/i;
const VIDEO_HINT_RE =
  /(?:\b2160p\b|\b1080p\b|\b720p\b|\b480p\b|\b4k\b|web-?dl|web-?rip|bd-?rip|bdrip|hevc|avc|x26[45]|\bmkv\b|\bmp4\b)/i;
const EPISODE_RANGE_RE =
  /(?:^|[^0-9A-Za-z])0*(\d{1,3})\s*(?:-|－|~|～|—|–)\s*0*(\d{1,3})(?=[^0-9A-Za-z]|$)/g;
const PRECISE_ALIAS_MIN_LENGTH = 4;
const SEASON_MARKER_RE =
  /第[一二三四五六七八九十百\d]+季|\d+(?:st|nd|rd|th)season|season\d+|s\d{1,2}/i;
const FINAL_SEASON_MARKER_RE = /(?:the\s*)?final\s*season|最终季|最終季/i;
const SPECIAL_EDITION_MARKER_RE =
  /(?:^|[^0-9A-Za-z])(?:SP|OVA|OAD|NCOP|NCED)(?=[^0-9A-Za-z]|$)/i;
const LIVE_ACTION_MARKER_RE = /live\s*action|真人版|実写版/i;
const THEATRICAL_MARKER_RE = /剧场版|劇場版|\bthe\s+movie\b|\bmovie\b/i;
const VOLUME_TOKEN_RE =
  /(?:^|[^0-9A-Za-z])(?:vol(?:ume)?\.?|卷|巻)\s*0*\d{1,3}(?:v\d+)?(?=[^0-9A-Za-z]|$)/i;
const EXPLICIT_EPISODE_TOKEN_RE =
  /[总總]\s*第?\s*0*\d{1,3}|第\s*0*\d{1,3}\s*[话話集]|(?:^|[^A-Za-z0-9])E0*\d{1,3}(?:v\d+)?(?![A-Za-z0-9])|\[\d{1,3}(?:v\d+)?\]|\(\d{1,3}(?:v\d+)?\)|[-－]\s+0*\d{1,3}(?:v\d+)?(?![A-Za-z0-9p])/i;

export function containsEpisodeRelease(
  title: string,
  epNumber: number,
  seasonEpisodeNumbers: number[] = [],
): boolean {
  if (isMultiEpisodePackRelease(title)) return false;
  if (isVolumeOnlyRelease(title)) return false;
  const releaseEpisode = extractEpisodeNumber(title);
  if (releaseEpisode === null) return false;
  return buildEpisodeMatchNumbers(epNumber, seasonEpisodeNumbers).includes(
    releaseEpisode,
  );
}

export function containsAnimeTitleAlias(
  title: string,
  aliases: string[],
): boolean {
  const lower = normalizeTitleForMatch(title);
  const normalizedAliases = aliases
    .map((alias) => ({
      raw: alias,
      normalized: normalizeTitleForMatch(alias),
    }))
    .filter((alias) => alias.normalized.length >= 2);
  const preciseAliases = normalizedAliases.filter(
    (alias) => alias.normalized.length >= PRECISE_ALIAS_MIN_LENGTH,
  );
  const seasonAliases = preciseAliases.filter((alias) =>
    hasSeasonMarker(alias),
  );
  if (hasUnrequestedFranchiseVariant(title, normalizedAliases)) {
    return false;
  }
  if (seasonAliases.length > 0) {
    if (seasonAliases.some((alias) => lower.includes(alias.normalized))) {
      return true;
    }
    if (SEASON_MARKER_RE.test(lower)) {
      return containsCompatibleSeasonBaseAlias(title, lower, preciseAliases, seasonAliases);
    }
  } else {
    // 没写季号的主体条目按第一季处理。带明确续季号的发布不能仅凭
    // 基础剧名命中，否则“进击的巨人 EP.01”会混入第二/三/最终季。
    const titleSeason = extractSeason(title);
    if (titleSeason !== null && titleSeason > 1) return false;
    if (FINAL_SEASON_MARKER_RE.test(title)) return false;
  }
  const candidates =
    preciseAliases.length > 0 ? preciseAliases : normalizedAliases;
  return candidates.some((alias) => lower.includes(alias.normalized));
}

export function stripTrailingArcAfterSeason(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(
    /^(.+?(?:第[一二三四五六七八九十百\d]+季|\b\d+(?:st|nd|rd|th)\s+season\b|\bseason\s+\d+\b))\s+\S+$/i,
  );
  const seasonTitle = match?.[1]?.trim();
  return seasonTitle && seasonTitle !== trimmed ? seasonTitle : null;
}

export function normalizeTitleForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[：]/g, ":")
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, "")
    .trim();
}

export function isSeasonPackRelease(
  title: string,
  maxEpisodeNumber: number | null | undefined,
): boolean {
  if (!title.trim()) return false;
  if (isAudioOnlyRelease(title)) return false;
  if (COMPLETE_LABEL_RE.test(title)) return true;

  const targetMax =
    typeof maxEpisodeNumber === "number" && Number.isFinite(maxEpisodeNumber)
      ? maxEpisodeNumber
      : null;

  for (const range of extractEpisodeRanges(title)) {
    if (range.start > 1) continue;
    if (targetMax !== null && range.end >= targetMax) return true;
    if (targetMax === null && range.end - range.start + 1 >= 3) return true;
  }

  return false;
}

function isAudioOnlyRelease(title: string): boolean {
  return AUDIO_ONLY_HINT_RE.test(title) && !VIDEO_HINT_RE.test(title);
}

function isVolumeOnlyRelease(title: string): boolean {
  return VOLUME_TOKEN_RE.test(title) && !EXPLICIT_EPISODE_TOKEN_RE.test(title);
}

function isMultiEpisodePackRelease(title: string): boolean {
  if (COMPLETE_LABEL_RE.test(title)) return true;
  if (PARTIAL_PACK_LABEL_RE.test(title)) return true;
  if (SPECIAL_PACK_RE.test(title)) return true;
  return extractEpisodeRanges(title).length > 0;
}

function hasSeasonMarker(alias: { raw: string; normalized: string }): boolean {
  return (
    SEASON_MARKER_RE.test(alias.normalized) ||
    FINAL_SEASON_MARKER_RE.test(alias.raw) ||
    extractSeason(alias.raw) !== null
  );
}

function hasUnrequestedFranchiseVariant(
  title: string,
  aliases: Array<{ raw: string; normalized: string }>,
): boolean {
  const markerPairs: Array<[RegExp, RegExp]> = [
    [FINAL_SEASON_MARKER_RE, FINAL_SEASON_MARKER_RE],
    [SPECIAL_EDITION_MARKER_RE, SPECIAL_EDITION_MARKER_RE],
    [LIVE_ACTION_MARKER_RE, LIVE_ACTION_MARKER_RE],
    [THEATRICAL_MARKER_RE, THEATRICAL_MARKER_RE],
  ];
  return markerPairs.some(([titleMarker, aliasMarker]) =>
    titleMarker.test(title) && !aliases.some((alias) => aliasMarker.test(alias.raw)),
  );
}

function containsCompatibleSeasonBaseAlias(
  title: string,
  normalizedTitle: string,
  preciseAliases: Array<{ raw: string; normalized: string }>,
  seasonAliases: Array<{ raw: string; normalized: string }>,
): boolean {
  const titleSeason = extractSeason(title);
  if (titleSeason === null) return false;

  const expectedSeasons = new Set<number>();
  for (const alias of seasonAliases) {
    const season = extractSeason(alias.raw) ?? extractSeason(alias.normalized);
    if (season !== null) expectedSeasons.add(season);
  }
  if (!expectedSeasons.has(titleSeason)) return false;

  return preciseAliases.some((alias) => {
    if (hasSeasonMarker(alias)) return false;
    return normalizedTitle.includes(alias.normalized);
  });
}

function extractEpisodeRanges(title: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const rangeRe = new RegExp(EPISODE_RANGE_RE.source, EPISODE_RANGE_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = rangeRe.exec(title)) !== null) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    const startIndex = getCaptureStartIndex(match, match[1]);
    if (startIndex !== null && isSeasonNumberBeforeEpisodeDash(title, startIndex)) {
      rangeRe.lastIndex = startIndex + match[1].length;
      continue;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start <= 0 || end <= 0 || end < start) continue;
    if (start >= 480 || end >= 480) continue;
    ranges.push({ start, end });
  }
  return ranges;
}

function getCaptureStartIndex(
  match: RegExpExecArray,
  capture: string | undefined,
): number | null {
  if (match.index === undefined || !capture) return null;
  const offset = match[0].indexOf(capture);
  if (offset < 0) return null;
  return match.index + offset;
}

function isSeasonNumberBeforeEpisodeDash(
  title: string,
  startNumberIndex: number,
): boolean {
  const before = title.slice(Math.max(0, startNumberIndex - 24), startNumberIndex);
  return /\bseason\s*$/i.test(before);
}

function buildEpisodeMatchNumbers(
  epNumber: number,
  seasonEpisodeNumbers: number[],
): number[] {
  const matchNumbers = new Set<number>();
  if (Number.isFinite(epNumber) && epNumber > 0) {
    matchNumbers.add(epNumber);
  }

  const normalized = [...new Set(seasonEpisodeNumbers)]
    .filter((number) => Number.isFinite(number) && number > 0)
    .sort((a, b) => a - b);
  const seasonStart = normalized[0];
  if (seasonStart === undefined || seasonStart <= 1) return [...matchNumbers];
  if (!isContiguousEpisodeSequence(normalized)) return [...matchNumbers];

  const localEpisodeNumber = epNumber - seasonStart + 1;
  if (localEpisodeNumber > 0 && localEpisodeNumber <= normalized.length) {
    matchNumbers.add(localEpisodeNumber);
  }

  return [...matchNumbers];
}

function isContiguousEpisodeSequence(numbers: number[]): boolean {
  return numbers.every((number, index) => number === numbers[0] + index);
}
