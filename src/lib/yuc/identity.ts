import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { anime, appSettings, type Anime } from "@/db/schema";
import {
  getYucEntryYear,
  findUniqueYucCatalogMatch,
  isReliableYucMovieWorkMatch,
  isReliableYucMatch,
  isYucMovieReRelease,
  yucEntryType,
  type YucMatchTarget,
} from "./match";
import { buildYucSourceKey, parseYucSourceKey } from "./parser";
import type { YucEntry, YucSourceKind } from "./types";

export const YUC_IDENTITY_SETTING_PREFIX = "yuc_anime_identity_v1:";

export interface YucIdentityRecord {
  version: 1;
  sourceKey: string;
  animeId: number;
  sourceKind: YucSourceKind;
  sourceUrl: string;
  title: string;
  titleJa: string | null;
  year: number | null;
  format: "TV" | "Movie" | "OVA" | "Web";
}

export interface YucAnimeResolution {
  anime: Anime;
  identity: YucIdentityRecord;
  created: boolean;
  matchedBy: "identity" | "local" | "created";
}

export class YucIdentityConflictError extends Error {
  readonly code = "YUC_IDENTITY_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "YucIdentityConflictError";
  }
}

export class YucIdentityValidationError extends Error {
  readonly code = "YUC_IDENTITY_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "YucIdentityValidationError";
  }
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function settingKey(sourceKey: string): string {
  if (!parseYucSourceKey(sourceKey)) {
    throw new YucIdentityValidationError("Invalid YUC source key");
  }
  return `${YUC_IDENTITY_SETTING_PREFIX}${sourceKey}`;
}

function trustedSourceUrl(
  value: string,
  sourceKind: YucSourceKind,
  pageId: string,
): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "yuc.wiki" ||
      url.username ||
      url.password
    ) {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) return null;
    const finalSegment = segments.at(-1) ?? "";
    if (sourceKind === "season" && finalSegment !== pageId) return null;
    if (sourceKind === "future" && finalSegment !== "new") return null;
    if (sourceKind === "special" && finalSegment !== "sp") return null;
    if (sourceKind === "movie" && finalSegment !== "movie") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isRecordFormat(
  value: unknown,
): value is YucIdentityRecord["format"] {
  return value === "TV" || value === "Movie" || value === "OVA" || value === "Web";
}

/** Parse persisted JSON without granting malformed values identity authority. */
export function parseYucIdentityRecord(
  value: unknown,
  expectedSourceKey?: string,
): YucIdentityRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  if (typeof candidate.sourceKey !== "string") return null;
  if (expectedSourceKey && candidate.sourceKey !== expectedSourceKey) return null;
  const sourceParts = parseYucSourceKey(candidate.sourceKey);
  if (!sourceParts) return null;
  if (candidate.sourceKind !== sourceParts.sourceKind) return null;
  if (!Number.isInteger(candidate.animeId) || Number(candidate.animeId) <= 0) {
    return null;
  }
  if (typeof candidate.sourceUrl !== "string") return null;
  const sourceUrl = trustedSourceUrl(
    candidate.sourceUrl,
    sourceParts.sourceKind,
    sourceParts.pageId,
  );
  if (!sourceUrl) return null;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) return null;
  if (candidate.titleJa !== null && typeof candidate.titleJa !== "string") return null;
  if (
    candidate.year !== null &&
    (!Number.isInteger(candidate.year) || Number(candidate.year) < 1900 || Number(candidate.year) > 2200)
  ) {
    return null;
  }
  if (!isRecordFormat(candidate.format)) return null;

  const title = candidate.title.trim();
  const titleJa =
    typeof candidate.titleJa === "string" && candidate.titleJa.trim()
      ? candidate.titleJa.trim()
      : null;
  if (
    buildYucSourceKey(sourceParts.sourceKind, sourceUrl, title, titleJa) !==
    candidate.sourceKey
  ) {
    return null;
  }

  return {
    version: 1,
    sourceKey: candidate.sourceKey,
    animeId: Number(candidate.animeId),
    sourceKind: sourceParts.sourceKind,
    sourceUrl,
    title,
    titleJa,
    year: candidate.year === null ? null : Number(candidate.year),
    format: candidate.format,
  };
}

function requireTrustedEntry(entry: YucEntry): void {
  const parts = parseYucSourceKey(entry.sourceKey);
  if (!parts || parts.sourceKind !== entry.sourceKind) {
    throw new YucIdentityValidationError("YUC entry has an invalid source key");
  }
  const sourceUrl = trustedSourceUrl(entry.sourceUrl, entry.sourceKind, parts.pageId);
  if (!sourceUrl || !entry.title.trim()) {
    throw new YucIdentityValidationError("YUC entry has an invalid source page");
  }
  if (
    buildYucSourceKey(entry.sourceKind, sourceUrl, entry.title, entry.titleJa) !==
    entry.sourceKey
  ) {
    throw new YucIdentityValidationError("YUC entry identity evidence is inconsistent");
  }
}

function recordFor(entry: YucEntry, animeRow: Anime): YucIdentityRecord {
  const parts = parseYucSourceKey(entry.sourceKey)!;
  return {
    version: 1,
    sourceKey: entry.sourceKey,
    animeId: animeRow.id,
    sourceKind: entry.sourceKind,
    sourceUrl: trustedSourceUrl(entry.sourceUrl, entry.sourceKind, parts.pageId)!,
    title: entry.title.trim(),
    titleJa: entry.titleJa?.trim() || null,
    year:
      yucEntryType(entry) === "Movie" && animeRow.year != null
        ? animeRow.year
        : getYucEntryYear(entry),
    format: hasFormatEvidence(entry) ? yucEntryType(entry) : animeRow.type,
  };
}

function parseStoredRecord(
  value: unknown,
  expectedSourceKey: string,
): YucIdentityRecord {
  const record = parseYucIdentityRecord(value, expectedSourceKey);
  if (!record) {
    throw new YucIdentityConflictError("Stored YUC identity is malformed");
  }
  return record;
}

function getRecordWith(
  executor: Pick<Transaction, "select">,
  sourceKey: string,
): YucIdentityRecord | null {
  const row = executor
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, settingKey(sourceKey)))
    .get();
  return row ? parseStoredRecord(row.value, sourceKey) : null;
}

function listRecordsWith(
  executor: Pick<Transaction, "select">,
): YucIdentityRecord[] {
  return executor
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(like(appSettings.key, `${YUC_IDENTITY_SETTING_PREFIX}%`))
    .all()
    .flatMap((row) => {
      const sourceKey = row.key.slice(YUC_IDENTITY_SETTING_PREFIX.length);
      const record = parseYucIdentityRecord(row.value, sourceKey);
      if (record) return [record];
      console.warn(`[yuc-identity] ignored malformed record ${sourceKey}`);
      return [];
    });
}

export function getYucIdentity(sourceKey: string): YucIdentityRecord | null {
  if (!parseYucSourceKey(sourceKey)) return null;
  return getRecordWith(db, sourceKey);
}

export function listYucIdentities(): YucIdentityRecord[] {
  return listRecordsWith(db);
}

export function listYucIdentitiesForAnime(animeId: number): YucIdentityRecord[] {
  if (!Number.isInteger(animeId) || animeId <= 0) return [];
  return listRecordsWith(db).filter((record) => record.animeId === animeId);
}

function recordAsEntry(record: YucIdentityRecord): YucEntry {
  return {
    sourceKey: record.sourceKey,
    sourceKind: record.sourceKind,
    sourceUrl: record.sourceUrl,
    title: record.title,
    titleJa: record.titleJa,
    coverUrl: null,
    premiereRaw: null,
    premiereDate: null,
    weeklyDay: null,
    weeklyTime: null,
    scheduleRaw: null,
    totalEpisodes: null,
    format: record.format,
    tags: [],
    staff: [],
    cast: [],
    studio: null,
    original: null,
    officialUrl: null,
    pvUrl: null,
    providers: [],
    seasonYear: record.year,
    seasonMonth: null,
  };
}

function normalizedTargetFormat(
  value: string | null | undefined,
): YucIdentityRecord["format"] | null {
  if (!value) return null;
  const normalized = value.toLocaleLowerCase("en-US");
  if (/movie|剧场|電影|电影/u.test(normalized)) return "Movie";
  if (/ova|oad|special|\bsp\b|(?:^|web)sp$|特别|特別/u.test(normalized)) return "OVA";
  if (/web|网络/u.test(normalized)) return "Web";
  if (/\btv\b/u.test(normalized)) return "TV";
  return null;
}

function identityMatchesTarget(
  record: YucIdentityRecord,
  target: YucMatchTarget,
): boolean {
  const targetFormat = normalizedTargetFormat(target.format);
  if (targetFormat === "Movie" && record.format === "Movie") {
    return isReliableYucMovieWorkMatch(recordAsEntry(record), target);
  }
  if (record.year == null || target.year == null || record.year !== target.year) {
    return false;
  }
  if (targetFormat && record.format !== targetFormat) return false;
  return isReliableYucMatch(recordAsEntry(record), target);
}

/**
 * Pure high-confidence resolver for later Bangumi synchronization. Multiple
 * source pages may resolve to one anime id; competing anime ids fail closed.
 */
export function findUniqueYucIdentityAnimeId(
  records: readonly YucIdentityRecord[],
  target: YucMatchTarget,
): number | null {
  let ids = new Set(
    records
      .filter((record) => identityMatchesTarget(record, target))
      .map((record) => record.animeId),
  );
  if (ids.size === 0 && target.year != null) {
    ids = new Set(
      records
        .filter(
          (record) =>
            findUniqueYucCatalogMatch([recordAsEntry(record)], target) != null,
        )
        .map((record) => record.animeId),
    );
  }
  if (ids.size > 1) {
    throw new YucIdentityConflictError("Multiple YUC identities match this work");
  }
  return ids.values().next().value ?? null;
}

export function findUniqueBoundAnimeForYucTarget(
  target: YucMatchTarget,
): Anime | null {
  const animeId = findUniqueYucIdentityAnimeId(listRecordsWith(db), target);
  if (animeId == null) return null;
  const row = db.select().from(anime).where(eq(anime.id, animeId)).get();
  if (!row || row.mediaType !== "anime") {
    throw new YucIdentityConflictError("YUC identity points to an unavailable anime row");
  }
  return row;
}

function getBoundAnimeWith(
  tx: Transaction,
  record: YucIdentityRecord,
): Anime {
  const row = tx.select().from(anime).where(eq(anime.id, record.animeId)).get();
  if (!row || row.mediaType !== "anime") {
    throw new YucIdentityConflictError("YUC identity points to an unavailable anime row");
  }
  return row;
}

function findIdentityCandidateWith(tx: Transaction, entry: YucEntry): Anime | null {
  const target: YucMatchTarget = {
    title: entry.title,
    titleJa: entry.titleJa,
    year: getYucEntryYear(entry),
    format: hasFormatEvidence(entry) ? yucEntryType(entry) : null,
  };
  const records = listRecordsWith(tx);
  const animeId = findUniqueYucIdentityAnimeId(records, target);
  if (animeId == null) return null;
  const record = records.find((item) => item.animeId === animeId);
  if (!record) return null;
  return getBoundAnimeWith(tx, record);
}

function hasFormatEvidence(entry: YucEntry): boolean {
  return entry.sourceKind === "movie" || Boolean(entry.format);
}

function isHighConfidenceLocalMatch(entry: YucEntry, row: Anime): boolean {
  const year = getYucEntryYear(entry);
  if (row.mediaType !== "anime") return false;
  if (yucEntryType(entry) === "Movie") {
    return (
      row.type === "Movie" &&
      isReliableYucMovieWorkMatch(entry, {
        title: row.title,
        titleJa: row.titleJa,
        year: row.year,
        format: row.type,
      })
    );
  }
  if (year == null || row.year !== year) return false;
  if (hasFormatEvidence(entry) && row.type !== yucEntryType(entry)) return false;
  return isReliableYucMatch(entry, {
    title: row.title,
    titleJa: row.titleJa,
    year: row.year,
    format: row.type,
  });
}

function findLocalCandidateWith(tx: Transaction, entry: YucEntry): Anime | null {
  const year = getYucEntryYear(entry);
  const type = yucEntryType(entry);
  if (type !== "Movie" && year == null) return null;
  const candidates =
    type === "Movie"
      ? tx
          .select()
          .from(anime)
          .where(and(eq(anime.mediaType, "anime"), eq(anime.type, "Movie")))
          .all()
      : hasFormatEvidence(entry)
        ? tx
            .select()
            .from(anime)
            .where(
              and(
                eq(anime.mediaType, "anime"),
                eq(anime.year, year!),
                eq(anime.type, type),
              ),
            )
            .all()
        : tx
            .select()
            .from(anime)
            .where(and(eq(anime.mediaType, "anime"), eq(anime.year, year!)))
            .all();
  const matches = candidates.filter((row) => isHighConfidenceLocalMatch(entry, row));
  if (matches.length > 1) {
    throw new YucIdentityConflictError("Multiple local anime rows match this YUC work");
  }
  return matches[0] ?? null;
}

function bindWith(
  tx: Transaction,
  entry: YucEntry,
  animeRow: Anime,
): YucIdentityRecord {
  if (animeRow.mediaType !== "anime") {
    throw new YucIdentityConflictError("YUC identities may only bind to anime rows");
  }
  const existing = getRecordWith(tx, entry.sourceKey);
  if (existing) {
    if (existing.animeId !== animeRow.id) {
      throw new YucIdentityConflictError("YUC source key is already bound elsewhere");
    }
    getBoundAnimeWith(tx, existing);
    return existing;
  }

  const related = findIdentityCandidateWith(tx, entry);
  if (related && related.id !== animeRow.id) {
    throw new YucIdentityConflictError("A matching YUC identity is already bound elsewhere");
  }
  if (!related) {
    const localCandidate = findLocalCandidateWith(tx, entry);
    if (!localCandidate || localCandidate.id !== animeRow.id) {
      throw new YucIdentityConflictError("Anime row lacks unique YUC identity evidence");
    }
  }

  const record = recordFor(entry, animeRow);
  tx.insert(appSettings)
    .values({
      key: settingKey(entry.sourceKey),
      value: record,
      updatedAt: new Date(),
    })
    .run();
  return record;
}

export function bindYucIdentity(
  entry: YucEntry,
  animeId: number,
): YucIdentityRecord {
  requireTrustedEntry(entry);
  if (!Number.isInteger(animeId) || animeId <= 0) {
    throw new YucIdentityValidationError("Invalid anime id");
  }
  return db.transaction((tx) => {
    const row = tx.select().from(anime).where(eq(anime.id, animeId)).get();
    if (!row) {
      throw new YucIdentityConflictError("Anime row does not exist");
    }
    return bindWith(tx, entry, row);
  });
}

function safeCoverUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "i0.hdslb.com" ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function seasonFor(entry: YucEntry): Anime["season"] {
  const premiereMonth = entry.premiereDate?.match(/^\d{4}-(\d{2})-/u)?.[1];
  const month = entry.seasonMonth ?? (premiereMonth ? Number(premiereMonth) : null);
  if (month == null || month < 1 || month > 12) return null;
  if (month <= 3) return "winter";
  if (month <= 6) return "spring";
  if (month <= 9) return "summer";
  return "fall";
}

function statusFor(entry: YucEntry, type: Anime["type"]): Anime["status"] {
  if (entry.sourceKind === "future") return "upcoming";
  if (entry.premiereDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (entry.premiereDate > today) return "upcoming";
  }
  return type === "Movie" ? "completed" : "airing";
}

function cleanTags(values: readonly string[]): string[] | null {
  const tags = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return tags.length > 0 ? tags : null;
}

function safeAiringTime(value: string | null): string | null {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/u);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 47 && minute <= 59 ? value : null;
}

function createAnimeWith(tx: Transaction, entry: YucEntry): Anime {
  const type = yucEntryType(entry);
  return tx
    .insert(anime)
    .values({
      title: entry.title.trim(),
      titleJa: entry.titleJa?.trim() || null,
      coverUrl: safeCoverUrl(entry.coverUrl),
      type,
      status: statusFor(entry, type),
      totalEpisodes:
        Number.isInteger(entry.totalEpisodes) && Number(entry.totalEpisodes) > 0
          ? entry.totalEpisodes
          : null,
      airingDay:
        Number.isInteger(entry.weeklyDay) &&
        Number(entry.weeklyDay) >= 0 &&
        Number(entry.weeklyDay) <= 6
          ? entry.weeklyDay
          : null,
      airingTime: safeAiringTime(entry.weeklyTime),
      season: seasonFor(entry),
      year: getYucEntryYear(entry),
      tags: cleanTags(entry.tags),
      mediaType: "anime",
    })
    .returning()
    .get();
}

/** Resolve one trusted cached YUC item atomically and idempotently. */
export function resolveYucAnime(entry: YucEntry): YucAnimeResolution {
  requireTrustedEntry(entry);
  return db.transaction((tx) => {
    const exact = getRecordWith(tx, entry.sourceKey);
    if (exact) {
      return {
        anime: getBoundAnimeWith(tx, exact),
        identity: exact,
        created: false,
        matchedBy: "identity" as const,
      };
    }

    const identityCandidate = findIdentityCandidateWith(tx, entry);
    const localCandidate = identityCandidate ?? findLocalCandidateWith(tx, entry);
    if (localCandidate) {
      return {
        anime: localCandidate,
        identity: bindWith(tx, entry, localCandidate),
        created: false,
        matchedBy: identityCandidate ? "identity" as const : "local" as const,
      };
    }

    if (isYucMovieReRelease(entry)) {
      throw new YucIdentityConflictError(
        "A re-release YUC movie needs one existing work match before it can be added",
      );
    }

    const created = createAnimeWith(tx, entry);
    return {
      anime: created,
      identity: bindWith(tx, entry, created),
      created: true,
      matchedBy: "created" as const,
    };
  });
}
