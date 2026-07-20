import { hasAnimeSeasonConflict } from "@/lib/douban";
import { expandZhVariants } from "@/lib/zh-convert";
import type { YucEntry, YucProvider } from "./types";

export interface YucMatchTarget {
  title: string;
  titleJa?: string | null;
  aliases?: readonly (string | null | undefined)[];
  year?: number | null;
  format?: string | null;
  premiereDate?: string | null;
  seasonMonth?: number | null;
  totalEpisodes?: number | null;
}

export function normalizeYucIdentityTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

export function yucTitleVariants(
  values: readonly (string | null | undefined)[],
): string[] {
  const variants = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const parts = [trimmed];
    if (trimmed.includes("/")) parts.push(...trimmed.split("/"));
    for (const part of parts) {
      for (const zhVariant of expandZhVariants(part)) {
        const normalized = normalizeYucIdentityTitle(zhVariant);
        if (normalized) variants.add(normalized);
      }
    }
  }
  return [...variants];
}

export function isReliableYucMatch(
  entry: YucEntry,
  target: YucMatchTarget,
): boolean {
  const entryTitles = [entry.title, entry.titleJa];
  const targetTitles = [target.title, target.titleJa, ...(target.aliases ?? [])];
  if (hasAnimeSeasonConflict(entryTitles, targetTitles)) return false;
  if (!formatsAreCompatible(entry.format, target.format)) return false;

  const entryYear = getYucEntryYear(entry);
  if (entryYear != null && target.year != null && entryYear !== target.year) {
    return false;
  }

  const entryKeys = new Set(yucTitleVariants(entryTitles));
  const targetKeys = yucTitleVariants(targetTitles);
  return targetKeys.some((key) => entryKeys.has(key));
}

/**
 * Movie pages describe a regional release event, so their year may differ from
 * the work's original year. Cross-year matching stays limited to exact,
 * normalized Movie titles and a unique candidate.
 */
export function isReliableYucMovieWorkMatch(
  entry: YucEntry,
  target: YucMatchTarget,
): boolean {
  if (yucEntryType(entry) !== "Movie") return false;
  if (!target.format || normalizedFormat(target.format) !== "Movie") return false;
  const entryTitles = [entry.title, entry.titleJa];
  const targetTitles = [target.title, target.titleJa, ...(target.aliases ?? [])];
  if (hasAnimeSeasonConflict(entryTitles, targetTitles)) return false;
  if (entry.titleJa && target.titleJa) {
    const entryJapanese = new Set(yucMovieTitleVariants([entry.titleJa]));
    const targetJapanese = yucMovieTitleVariants([
      target.titleJa,
      ...(target.aliases ?? []),
    ]);
    if (!targetJapanese.some((key) => entryJapanese.has(key))) return false;
  }
  const entryKeys = new Set(yucMovieTitleVariants(entryTitles));
  return yucMovieTitleVariants(targetTitles).some((key) => entryKeys.has(key));
}

export function isReliableYucWorkMatch(
  entry: YucEntry,
  target: YucMatchTarget,
): boolean {
  return (
    isReliableYucMatch(entry, target) ||
    isReliableYucMovieWorkMatch(entry, target)
  );
}

export function isYucMovieReRelease(entry: YucEntry): boolean {
  if (yucEntryType(entry) !== "Movie") return false;
  return /(?:重映|复映|復映|再上映|リバイバル上映|re-?release|4k\s*(?:修复|修復))/iu.test(
    [entry.title, entry.titleJa, entry.premiereRaw, entry.scheduleRaw]
      .filter(Boolean)
      .join(" "),
  );
}

export function findUniqueYucMatch(
  entries: readonly YucEntry[],
  target: YucMatchTarget,
): YucEntry | null {
  const matches = entries.filter((entry) => isReliableYucMatch(entry, target));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const ranked = matches
    .map((entry) => ({ entry, score: matchScore(entry, target) }))
    .sort((left, right) => right.score - left.score);
  return ranked.length === 1 || ranked[0].score > ranked[1].score
    ? ranked[0].entry
    : null;
}

/**
 * Read-only catalog matching may accept one additional case: an exact base
 * title with a longer subtitle/cour suffix on one source. It still requires an
 * explicit equal year and compatible format, and it fails closed unless one
 * candidate has uniquely stronger identity evidence.
 */
export function findUniqueYucCatalogMatch(
  entries: readonly YucEntry[],
  target: YucMatchTarget,
): YucEntry | null {
  return selectUniqueCatalogCandidate(
    entries.map((entry) => ({
      value: entry,
      score: yucCatalogTargetScore(entry, target, false),
    })),
  );
}

/**
 * Select one durable work identity for a YUC entry. Subtitle/cour-only title
 * relations must also agree on an exact premiere date or on both quarter and
 * main episode count. Equal scores fail closed.
 */
export function findUniqueYucCatalogTarget<T extends YucMatchTarget>(
  entry: YucEntry,
  targets: readonly T[],
): T | null {
  return selectUniqueCatalogCandidate(
    targets.map((target) => ({
      value: target,
      score: yucCatalogTargetScore(entry, target, true),
    })),
  );
}

/**
 * Broad admission check for search results; the final identity resolver still
 * applies metadata corroboration and unique-score selection.
 */
export function isYucCatalogTargetCandidate(
  entry: YucEntry,
  target: YucMatchTarget,
): boolean {
  return yucCatalogTargetScore(entry, target, false) != null;
}

export function isHighConfidenceYucCatalogIdentity(
  left: YucMatchTarget,
  right: YucMatchTarget,
): boolean {
  const relation = catalogTitleRelation(left, right);
  if (relation == null) return false;
  if (!catalogTargetsAreCompatible(left, right)) return false;
  if (relation !== "relaxed") return true;
  const metadata = catalogMetadataEvidence(left, right);
  return metadata.dateMatch || (metadata.monthMatch && metadata.episodeMatch);
}

export function inferYucSeasonMonth(input: {
  premiereDate?: string | null;
  seasonMonth?: number | null;
  season?: string | null;
  tags?: readonly string[] | null;
  year?: number | null;
}): number | null {
  if (isCalendarMonth(input.seasonMonth)) return input.seasonMonth;
  const dateMonth = monthFromDate(input.premiereDate);
  if (dateMonth != null) return dateMonth;
  const seasonMonths: Record<string, number> = {
    winter: 1,
    spring: 4,
    summer: 7,
    fall: 10,
  };
  if (input.season && input.season in seasonMonths) {
    return seasonMonths[input.season];
  }
  for (const tag of input.tags ?? []) {
    const match = tag.match(/(?:^|\D)(\d{4})年\s*(\d{1,2})月/u);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (input.year != null && year !== input.year) continue;
    if (isCalendarMonth(month)) return month;
  }
  return null;
}

function hasExactTitleVariant(
  left: readonly (string | null | undefined)[],
  right: readonly (string | null | undefined)[],
): boolean {
  const leftKeys = new Set(yucTitleVariants(left));
  return yucTitleVariants(right).some((key) => leftKeys.has(key));
}

type CatalogTitleRelation = "exact" | "catalog" | "relaxed";

function yucCatalogTargetScore(
  entry: YucEntry,
  target: YucMatchTarget,
  requireRelaxedCorroboration: boolean,
): number | null {
  const entryTarget: YucMatchTarget = {
    title: entry.title,
    titleJa: entry.titleJa,
    year: getYucEntryYear(entry),
    format: entry.format,
    premiereDate: entry.premiereDate,
    seasonMonth: inferYucSeasonMonth(entry),
    totalEpisodes: entry.totalEpisodes,
  };
  const relation = catalogTitleRelation(entryTarget, target);
  if (relation == null) return null;

  if (isReliableYucMovieWorkMatch(entry, target)) {
    return 380 + catalogMetadataScore(entryTarget, target);
  }
  if (
    !catalogTargetsAreCompatible(
      entryTarget,
      target,
      entry.sourceKind === "special",
    )
  ) {
    return null;
  }

  const metadata = catalogMetadataEvidence(entryTarget, target);
  if (relation === "relaxed") {
    const entryYear = getYucEntryYear(entry);
    if (entryYear == null || target.year == null || entryYear !== target.year) {
      return null;
    }
    if (metadata.dateConflict || metadata.monthConflict) return null;
    if (
      requireRelaxedCorroboration &&
      !metadata.dateMatch &&
      !(metadata.monthMatch && metadata.episodeMatch)
    ) {
      return null;
    }
  }

  const tier = isReliableYucMatch(entry, target)
    ? 400
    : relation === "exact"
      ? 340
      : relation === "catalog"
        ? 300
        : 200;
  return tier + catalogMetadataScore(entryTarget, target);
}

function catalogTitleRelation(
  left: YucMatchTarget,
  right: YucMatchTarget,
): CatalogTitleRelation | null {
  const leftTitles = [left.title, left.titleJa, ...(left.aliases ?? [])];
  const rightTitles = [right.title, right.titleJa, ...(right.aliases ?? [])];
  if (hasAnimeSeasonConflict(leftTitles, rightTitles)) return null;
  if (hasExactTitleVariant(leftTitles, rightTitles)) return "exact";
  if (hasRelocatedRomanSeasonMarkerIdentity(leftTitles, rightTitles)) {
    return "catalog";
  }

  const leftCatalog = new Set(yucCatalogTitleVariants(leftTitles));
  if (yucCatalogTitleVariants(rightTitles).some((key) => leftCatalog.has(key))) {
    return "catalog";
  }
  return hasCatalogTitleIdentity(leftTitles, rightTitles) ? "relaxed" : null;
}

function catalogTargetsAreCompatible(
  left: YucMatchTarget,
  right: YucMatchTarget,
  allowFormatMismatch = false,
): boolean {
  if (left.year != null && right.year != null && left.year !== right.year) {
    return false;
  }
  return allowFormatMismatch || formatsAreCompatible(left.format, right.format);
}

function catalogMetadataEvidence(
  left: YucMatchTarget,
  right: YucMatchTarget,
): {
  dateMatch: boolean;
  dateConflict: boolean;
  monthMatch: boolean;
  monthConflict: boolean;
  episodeMatch: boolean;
} {
  const leftDate = normalizedPremiereDate(left.premiereDate);
  const rightDate = normalizedPremiereDate(right.premiereDate);
  const leftMonth = inferYucSeasonMonth(left);
  const rightMonth = inferYucSeasonMonth(right);
  const leftEpisodes = positiveEpisodeCount(left.totalEpisodes);
  const rightEpisodes = positiveEpisodeCount(right.totalEpisodes);
  return {
    dateMatch: leftDate != null && rightDate != null && leftDate === rightDate,
    dateConflict: leftDate != null && rightDate != null && leftDate !== rightDate,
    monthMatch:
      leftMonth != null && rightMonth != null && leftMonth === rightMonth,
    monthConflict:
      leftMonth != null && rightMonth != null && leftMonth !== rightMonth,
    episodeMatch:
      leftEpisodes != null &&
      rightEpisodes != null &&
      leftEpisodes === rightEpisodes,
  };
}

function catalogMetadataScore(
  left: YucMatchTarget,
  right: YucMatchTarget,
): number {
  const evidence = catalogMetadataEvidence(left, right);
  return (
    Number(evidence.dateMatch) * 30 +
    Number(evidence.monthMatch) * 10 +
    Number(evidence.episodeMatch) * 20
  );
}

function selectUniqueCatalogCandidate<T>(
  candidates: readonly { value: T; score: number | null }[],
): T | null {
  const ranked = candidates
    .filter(
      (candidate): candidate is { value: T; score: number } =>
        candidate.score != null,
    )
    .sort((left, right) => right.score - left.score);
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
  return ranked[0].value;
}

function normalizedPremiereDate(value: string | null | undefined): string | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  return match ? match[0] : null;
}

function monthFromDate(value: string | null | undefined): number | null {
  const match = value?.match(/^\d{4}-(\d{2})-/u);
  if (!match) return null;
  const month = Number(match[1]);
  return isCalendarMonth(month) ? month : null;
}

function isCalendarMonth(value: number | null | undefined): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 12;
}

function positiveEpisodeCount(value: number | null | undefined): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

export function dedupeYucEntries(entries: readonly YucEntry[]): YucEntry[] {
  const result: YucEntry[] = [];
  for (const entry of entries) {
    const matches = result
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) =>
        isReliableYucMatch(entry, {
          title: candidate.title,
          titleJa: candidate.titleJa,
          year: getYucEntryYear(candidate),
          format: candidate.format,
        }),
      );
    if (matches.length !== 1) {
      result.push(entry);
      continue;
    }
    const { candidate, index } = matches[0];
    result[index] = mergeYucEntries(candidate, entry);
  }
  return result;
}

export function getYucEntryYear(entry: YucEntry): number | null {
  if (entry.seasonYear != null) return entry.seasonYear;
  if (entry.premiereDate && /^\d{4}-/u.test(entry.premiereDate)) {
    return Number(entry.premiereDate.slice(0, 4));
  }
  return null;
}

export function yucEntryType(entry: YucEntry): "TV" | "Movie" | "OVA" | "Web" {
  if (entry.sourceKind === "movie") return "Movie";
  if (entry.sourceKind === "special") return "OVA";
  const normalized = entry.format?.toLocaleLowerCase("en-US") ?? "";
  if (/movie|剧场|電影|电影/u.test(normalized)) return "Movie";
  if (/ova|oad|special|\bsp\b|(?:^|web)sp$|特别|特別/u.test(normalized)) return "OVA";
  if (/web|网络/u.test(normalized)) return "Web";
  return "TV";
}

function formatsAreCompatible(
  entryFormat: string | null | undefined,
  targetFormat: string | null | undefined,
): boolean {
  if (!entryFormat || !targetFormat) return true;
  const left = normalizedFormat(entryFormat);
  const right = normalizedFormat(targetFormat);
  if (left === right) return true;
  return left === "OVA" && right === "OVA";
}

function normalizedFormat(value: string): "TV" | "Movie" | "OVA" | "Web" | "Other" {
  const normalized = value.toLocaleLowerCase("en-US");
  if (/movie|剧场|電影|电影/u.test(normalized)) return "Movie";
  if (/ova|oad|special|\bsp\b|(?:^|web)sp$|特别|特別/u.test(normalized)) return "OVA";
  if (/web|网络/u.test(normalized)) return "Web";
  if (/\btv\b/u.test(normalized)) return "TV";
  return "Other";
}

function matchScore(entry: YucEntry, target: YucMatchTarget): number {
  const entryJapanese = new Set(yucTitleVariants([entry.titleJa]));
  const targetJapanese = yucTitleVariants([target.titleJa]);
  let score = targetJapanese.some((key) => entryJapanese.has(key)) ? 4 : 2;
  const year = getYucEntryYear(entry);
  if (year != null && target.year != null && year === target.year) score += 1;
  if (
    entry.format &&
    target.format &&
    normalizedFormat(entry.format) === normalizedFormat(target.format)
  ) {
    score += 1;
  }
  return score;
}

function mergeYucEntries(current: YucEntry, incoming: YucEntry): YucEntry {
  const primary = sourcePriority(incoming) > sourcePriority(current) ? incoming : current;
  const secondary = primary === current ? incoming : current;
  return {
    ...primary,
    titleJa: primary.titleJa ?? secondary.titleJa,
    coverUrl: primary.coverUrl ?? secondary.coverUrl,
    premiereRaw: primary.premiereRaw ?? secondary.premiereRaw,
    premiereDate: primary.premiereDate ?? secondary.premiereDate,
    weeklyDay: primary.weeklyDay ?? secondary.weeklyDay,
    weeklyTime: primary.weeklyTime ?? secondary.weeklyTime,
    scheduleRaw:
      unique([primary.scheduleRaw, secondary.scheduleRaw]).join(" · ") || null,
    totalEpisodes: primary.totalEpisodes ?? secondary.totalEpisodes,
    format: primary.format ?? secondary.format,
    tags: unique([...primary.tags, ...secondary.tags]),
    staff: unique([...primary.staff, ...secondary.staff]),
    cast: unique([...primary.cast, ...secondary.cast]),
    studio: primary.studio ?? secondary.studio,
    original: primary.original ?? secondary.original,
    officialUrl: primary.officialUrl ?? secondary.officialUrl,
    pvUrl: primary.pvUrl ?? secondary.pvUrl,
    providers: mergeProviders(primary.providers, secondary.providers),
    seasonYear: primary.seasonYear ?? secondary.seasonYear,
    seasonMonth: primary.seasonMonth ?? secondary.seasonMonth,
  };
}

function sourcePriority(entry: YucEntry): number {
  if (entry.sourceKind === "season") return 4;
  if (entry.sourceKind === "special") return 3;
  if (entry.sourceKind === "movie") return 2;
  return 1;
}

function mergeProviders(
  left: readonly YucProvider[],
  right: readonly YucProvider[],
): YucProvider[] {
  return [
    ...new Map([...left, ...right].map((provider) => [provider.url, provider])).values(),
  ];
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function hasCatalogTitleIdentity(
  left: readonly (string | null | undefined)[],
  right: readonly (string | null | undefined)[],
): boolean {
  const leftKeys = unique(left.map(normalizeYucCatalogTitle));
  const rightKeys = unique(right.map(normalizeYucCatalogTitle));
  for (const leftKey of leftKeys) {
    for (const rightKey of rightKeys) {
      if (leftKey === rightKey) return true;
      const shorter = leftKey.length <= rightKey.length ? leftKey : rightKey;
      const longer = shorter === leftKey ? rightKey : leftKey;
      if (
        shorter.length >= 6 &&
        shorter.length / longer.length >= 0.45 &&
        longer.startsWith(shorter)
      ) {
        return true;
      }
      const leftSignature = unorderedCjkSignature(leftKey);
      if (
        leftSignature &&
        leftSignature === unorderedCjkSignature(rightKey)
      ) {
        return true;
      }
      const leftAscii = leftKey.replace(/[^a-z0-9]+/gu, "");
      const rightAscii = rightKey.replace(/[^a-z0-9]+/gu, "");
      const shorterAscii =
        leftAscii.length <= rightAscii.length ? leftAscii : rightAscii;
      const longerAscii = shorterAscii === leftAscii ? rightAscii : leftAscii;
      if (
        shorterAscii.length >= 8 &&
        shorterAscii.length / longerAscii.length >= 0.5 &&
        longerAscii.endsWith(shorterAscii)
      ) {
        return true;
      }
    }
  }
  return false;
}

function hasRelocatedRomanSeasonMarkerIdentity(
  left: readonly (string | null | undefined)[],
  right: readonly (string | null | undefined)[],
): boolean {
  return (
    hasRomanAndExplicitSeasonIdentity(left, right) ||
    hasRomanAndExplicitSeasonIdentity(right, left)
  );
}

function hasRomanAndExplicitSeasonIdentity(
  romanTitles: readonly (string | null | undefined)[],
  explicitTitles: readonly (string | null | undefined)[],
): boolean {
  for (const romanTitle of romanTitles) {
    const roman = splitRelocatedRomanSeasonTitle(romanTitle);
    if (!roman) continue;
    const romanBaseKeys = new Set(yucCatalogTitleVariants([roman.base]));

    for (const explicitTitle of explicitTitles) {
      const explicit = splitExplicitSeasonTitle(explicitTitle);
      if (!explicit || explicit.season !== roman.season) continue;
      if (
        yucCatalogTitleVariants([explicit.base]).some((key) =>
          romanBaseKeys.has(key),
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function splitRelocatedRomanSeasonTitle(
  value: string | null | undefined,
): { season: number; base: string } | null {
  if (!value) return null;
  const matches = [...value.matchAll(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/gu)];
  if (matches.length !== 1 || matches[0].index == null) return null;

  const marker = matches[0][0];
  const trailing = value
    .slice(matches[0].index + marker.length)
    .replace(/^[\s~～:：\-—–・·（）()【】\[\]]+/gu, "")
    .trim();
  // A numeral embedded before a real subtitle is the catalog spelling used by
  // works such as 無職転生Ⅲ. A numeral at the end may be part of the work name.
  if (normalizeYucCatalogTitle(trailing).length < 4) return null;

  return {
    season: "ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ".indexOf(marker) + 1,
    base: `${value.slice(0, matches[0].index)}${value.slice(
      matches[0].index + marker.length,
    )}`,
  };
}

function splitExplicitSeasonTitle(
  value: string | null | undefined,
): { season: number; base: string } | null {
  if (!value) return null;
  const normalized = value.normalize("NFKC");
  const matches = [
    ...normalized.matchAll(/第\s*([一二三四五六七八九十\d]+)\s*(?:季|期)/gu),
  ];
  if (matches.length !== 1 || matches[0].index == null) return null;
  const season = parseSeasonNumber(matches[0][1]);
  if (season == null) return null;
  return {
    season,
    base: `${normalized.slice(0, matches[0].index)}${normalized.slice(
      matches[0].index + matches[0][0].length,
    )}`,
  };
}

function unorderedCjkSignature(value: string): string {
  const cjk = value.replace(/[的之两]/gu, (character) =>
    character === "两" ? "2" : "",
  );
  const characters = [...cjk];
  const cjkCount = characters.filter((character) => /[\p{Script=Han}]/u.test(character)).length;
  if (characters.length < 8 || cjkCount / characters.length < 0.65) return "";
  return characters.sort().join("");
}

export function normalizeYucCatalogTitle(
  value: string | null | undefined,
): string {
  if (!value) return "";
  return value
    .replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/gu, (roman) =>
      String("ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ".indexOf(roman) + 1),
    )
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(
      /第([一二三四五六七八九十\d]+)(?:季|期)/gu,
      (_, number: string) => `season${parseSeasonNumber(number) ?? number}`,
    )
    .replace(/(\d+)(?:st|nd|rd|th)?\s*season/giu, "season$1")
    .replace(
      /第([一二三四五六七八九十\d]+)(?:クール|部分|部|章)/gu,
      (_, number: string) => `part${parseSeasonNumber(number) ?? number}`,
    )
    .replace(/part\.?\s*(\d+)/giu, "part$1")
    .replace(/file\.?\s*(\d+)/giu, "part$1")
    .replace(/剧场版|劇場版|電影|电影|映画/gu, "")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

export function yucCatalogTitleVariants(
  values: readonly (string | null | undefined)[],
): string[] {
  const variants = new Set<string>();
  for (const value of values) {
    if (!value?.trim()) continue;
    for (const zhVariant of expandZhVariants(value)) {
      const normalized = normalizeYucCatalogTitle(zhVariant);
      if (normalized) variants.add(normalized);
    }
  }
  return [...variants];
}

function yucMovieTitleVariants(
  values: readonly (string | null | undefined)[],
): string[] {
  return yucTitleVariants(
    values.flatMap((value) => {
      if (!value) return [];
      const stripped = value
        .replace(
          /[\s（(【\[]*(?:重映(?:版)?|复映|復映|再上映|リバイバル上映|re-?release|4k\s*(?:修复|修復)(?:版)?)[\s）)】\]]*/giu,
          " ",
        )
        .replace(/^(?:剧场版|劇場版)\s*/u, "")
        .replace(/\s*(?:映画)\s*$/u, "")
        .trim();
      return stripped && stripped !== value ? [value, stripped] : [value];
    }),
  );
}

function parseSeasonNumber(value: string): number | null {
  if (/^\d+$/u.test(value)) return Number(value);
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (value in digits) return digits[value];
  if (value.startsWith("十") && value.length === 2) {
    return 10 + (digits[value[1]] ?? 0);
  }
  if (value.endsWith("十") && value.length === 2) {
    return (digits[value[0]] ?? 0) * 10;
  }
  return null;
}
