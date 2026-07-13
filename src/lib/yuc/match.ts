import { hasAnimeSeasonConflict } from "@/lib/douban";
import { expandZhVariants } from "@/lib/zh-convert";
import type { YucEntry, YucProvider } from "./types";

export interface YucMatchTarget {
  title: string;
  titleJa?: string | null;
  aliases?: readonly (string | null | undefined)[];
  year?: number | null;
  format?: string | null;
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
 * explicit equal year and compatible format, and it fails closed unless there
 * is exactly one candidate. Identity writes continue using isReliableYucMatch.
 */
export function findUniqueYucCatalogMatch(
  entries: readonly YucEntry[],
  target: YucMatchTarget,
): YucEntry | null {
  const exact = findUniqueYucMatch(entries, target);
  if (exact) return exact;
  const movieMatches = entries.filter((entry) =>
    isReliableYucMovieWorkMatch(entry, target),
  );
  if (movieMatches.length === 1) return movieMatches[0];
  if (movieMatches.length > 1) return null;
  if (target.year == null) return null;

  const matches = entries.filter((entry) => {
    const year = getYucEntryYear(entry);
    if (year == null || year !== target.year) return false;
    if (hasAnimeSeasonConflict([entry.title, entry.titleJa], [
      target.title,
      target.titleJa,
      ...(target.aliases ?? []),
    ])) {
      return false;
    }
    const exactTitle = hasExactTitleVariant(
      [entry.title, entry.titleJa],
      [target.title, target.titleJa, ...(target.aliases ?? [])],
    );
    const catalogTitle = hasCatalogTitleIdentity(
      [entry.title, entry.titleJa],
      [target.title, target.titleJa, ...(target.aliases ?? [])],
    );
    if (
      !formatsAreCompatible(entry.format, target.format) &&
      !(entry.sourceKind === "special" && (exactTitle || catalogTitle))
    ) {
      return false;
    }
    return catalogTitle;
  });
  return matches.length === 1 ? matches[0] : null;
}

function hasExactTitleVariant(
  left: readonly (string | null | undefined)[],
  right: readonly (string | null | undefined)[],
): boolean {
  const leftKeys = new Set(yucTitleVariants(left));
  return yucTitleVariants(right).some((key) => leftKeys.has(key));
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
  entryFormat: string | null,
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
  const leftKeys = unique(left.map(normalizeCatalogTitle));
  const rightKeys = unique(right.map(normalizeCatalogTitle));
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

function unorderedCjkSignature(value: string): string {
  const cjk = value.replace(/[的之两]/gu, (character) =>
    character === "两" ? "2" : "",
  );
  const characters = [...cjk];
  const cjkCount = characters.filter((character) => /[\p{Script=Han}]/u.test(character)).length;
  if (characters.length < 8 || cjkCount / characters.length < 0.65) return "";
  return characters.sort().join("");
}

function normalizeCatalogTitle(value: string | null | undefined): string {
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
