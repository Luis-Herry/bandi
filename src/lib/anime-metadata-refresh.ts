import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import {
  anime,
  appSettings,
  downloadQueue,
  episodes,
  playbackProgress,
  rssSources,
  userAnime,
  watchEvents,
  type Anime,
} from "@/db/schema";
import { refreshFromBangumi, syncFromBangumi } from "@/db/queries/anime";
import {
  bangumiPlatformToAnimeType,
  getEpisodes,
  getSubject,
  searchSubjects,
  type BgmSeason,
  type BgmSubject,
} from "@/lib/bangumi";
import { parseAnimeMediaFileName } from "@/lib/cinema-scan";
import {
  getCanonicalEpisodeRange,
  resolveUniqueEpisodeRangeCandidate,
} from "@/lib/anime-season-range";
import {
  getDoubanInfo,
  getDoubanSubject,
  hasAnimeSeasonConflict,
  isReliableDoubanTitleSetMatch,
  type DoubanInfo,
} from "@/lib/douban";
import { parseLocalFileDownloadUrl } from "@/lib/download-reconcile";
import {
  getAutoTitleAliases,
  selectTitleAliasesFromBangumi,
} from "@/lib/anime-title-aliases";
import {
  addRssTitleAlias,
  getRssTitleAliases,
  mergeRssTitleAliasAnimeIds,
} from "@/lib/rss-title-aliases";
import { extractEpisodeNumber, extractSeason, stripSeasonSuffix } from "@/lib/rss";
import { expandZhVariants } from "@/lib/zh-convert";
import {
  isLikelyChineseSynopsis,
  selectPreferredSynopsis,
} from "@/lib/synopsis-language";
import {
  bindYucIdentity,
  listYucIdentities,
  listYucIdentitiesForAnime,
  YUC_IDENTITY_SETTING_PREFIX,
  YucIdentityConflictError,
} from "@/lib/yuc/identity";
import {
  getYucDetailMatch,
  type YucDetailMatch,
} from "@/lib/yuc/detail";
import {
  findUniqueYucCatalogTarget,
  inferYucSeasonMonth,
  isHighConfidenceYucCatalogIdentity,
  isYucCatalogTargetCandidate,
  normalizeYucCatalogTitle,
  yucCatalogTitleVariants,
} from "@/lib/yuc/match";

export type AnimeMetadataRefreshScope =
  | "anime"
  | "local-library"
  | "downloads"
  | "season";

export interface AnimeMetadataRefreshSummary {
  outcome: "updated" | "unchanged" | "partial" | "needs_review";
  requestedAnimeId: number | null;
  canonicalAnimeId: number | null;
  animeChecked: number;
  animeMerged: number;
  bangumiLinked: number;
  yucLinked: number;
  episodesUpserted: number;
  downloadsReattached: number;
  duplicateDownloadsRemoved: number;
  rssAliasesUpdated: number;
  synopsesLocalized: number;
  rssSourcesActive: number;
  warnings: string[];
}

interface RefreshCounters {
  animeMerged: number;
  bangumiLinked: number;
  yucLinked: number;
  episodesUpserted: number;
  downloadsReattached: number;
  duplicateDownloadsRemoved: number;
  rssAliasesUpdated: number;
  synopsesLocalized: number;
  warnings: string[];
}

export interface BangumiLookupDependencies {
  searchSubjects: typeof searchSubjects;
  getSubject: typeof getSubject;
}

const bangumiLookupDependencies: BangumiLookupDependencies = {
  searchSubjects,
  getSubject,
};

export async function refreshAnimeMetadata({
  scope,
  animeId,
  year,
  season,
}: {
  scope: AnimeMetadataRefreshScope;
  animeId?: number;
  year?: number;
  season?: BgmSeason;
}): Promise<AnimeMetadataRefreshSummary> {
  const requestedAnimeId = scope === "anime" ? Number(animeId) : null;
  if (
    scope === "anime" &&
    (!Number.isInteger(requestedAnimeId) || Number(requestedAnimeId) <= 0)
  ) {
    throw new Error("invalid_anime_id");
  }
  const requestedYear = scope === "season" ? Number(year) : null;
  const requestedSeason = scope === "season" ? season ?? null : null;
  if (
    scope === "season" &&
    (!Number.isInteger(requestedYear) ||
      requestedYear! < 1980 ||
      requestedYear! > 2100)
  ) {
    throw new Error("invalid_year");
  }
  if (scope === "season" && requestedSeason == null) {
    throw new Error("invalid_season");
  }

  const counters: RefreshCounters = {
    animeMerged: 0,
    bangumiLinked: 0,
    yucLinked: 0,
    episodesUpserted: 0,
    downloadsReattached: 0,
    duplicateDownloadsRemoved: 0,
    rssAliasesUpdated: 0,
    synopsesLocalized: 0,
    warnings: [],
  };

  counters.duplicateDownloadsRemoved += removeExactDuplicateDownloads();
  if (scope === "local-library" || scope === "downloads") {
    counters.downloadsReattached += repairMisassignedLocalDownloads();
  }
  if (scope === "downloads") {
    counters.downloadsReattached += attachUnassignedDownloads(counters);
  }

  const initialIds = selectScopeAnimeIds(
    scope,
    requestedAnimeId,
    requestedYear,
    requestedSeason,
  );
  const canonicalIds = new Set<number>();
  let canonicalAnimeId: number | null = requestedAnimeId;
  for (const id of initialIds) {
    const canonical = reconcileDuplicateAnimeRows(id, counters);
    if (canonical == null) continue;
    canonicalIds.add(canonical);
    if (id === requestedAnimeId) canonicalAnimeId = canonical;
  }

  // Douban's suggestion endpoint can silently return an empty result under a
  // burst of seasonal lookups. Keep the manual quarter pass sequential so a
  // visible "refresh" action does not randomly leave Chinese synopses behind.
  const concurrency = scope === "season" ? 1 : 3;
  await mapWithConcurrency([...canonicalIds], concurrency, async (id) => {
    await refreshOneAnime(id, scope === "anime", counters);
  });
  counters.duplicateDownloadsRemoved += removeExactDuplicateDownloads();

  const activeRss = db
    .select({ id: rssSources.id })
    .from(rssSources)
    .where(eq(rssSources.isActive, true))
    .all().length;
  const changed =
    counters.animeMerged +
      counters.bangumiLinked +
      counters.yucLinked +
      counters.episodesUpserted +
      counters.downloadsReattached +
      counters.duplicateDownloadsRemoved +
      counters.rssAliasesUpdated >
      0 ||
    counters.synopsesLocalized > 0;
  const needsReview = counters.warnings.some((warning) =>
    warning.startsWith("AMBIGUOUS:"),
  );

  return {
    outcome: needsReview
      ? "needs_review"
      : counters.warnings.length > 0
        ? "partial"
        : changed
          ? "updated"
          : "unchanged",
    requestedAnimeId,
    canonicalAnimeId,
    animeChecked: canonicalIds.size,
    ...counters,
    rssSourcesActive: activeRss,
  };
}

function selectScopeAnimeIds(
  scope: AnimeMetadataRefreshScope,
  requestedAnimeId: number | null,
  requestedYear: number | null,
  requestedSeason: BgmSeason | null,
): number[] {
  if (scope === "anime") {
    const row = db
      .select({ id: anime.id })
      .from(anime)
      .where(eq(anime.id, requestedAnimeId!))
      .get();
    if (!row) throw new Error("anime_not_found");
    return [row.id];
  }

  if (scope === "season") {
    return db
      .select({
        id: anime.id,
        year: anime.year,
        season: anime.season,
        tags: anime.tags,
      })
      .from(anime)
      .where(eq(anime.mediaType, "anime"))
      .all()
      .filter((row) =>
        matchesRefreshQuarter(
          row,
          requestedYear!,
          requestedSeason!,
        ),
      )
      .map((row) => row.id);
  }

  const rows =
    scope === "local-library"
      ? db
          .select({ animeId: downloadQueue.animeId })
          .from(downloadQueue)
          .where(like(downloadQueue.magnetUrl, "local-file:%"))
          .all()
      : db.select({ animeId: downloadQueue.animeId }).from(downloadQueue).all();
  return [
    ...new Set(
      rows
        .map((row) => row.animeId)
        .filter((id): id is number => id != null && id > 0),
    ),
  ];
}

const LOCAL_SEASON_BY_BGM_SEASON: Record<
  BgmSeason,
  "winter" | "spring" | "summer" | "fall"
> = {
  WINTER: "winter",
  SPRING: "spring",
  SUMMER: "summer",
  FALL: "fall",
};

export function matchesRefreshQuarter(
  row: {
    year: number | null;
    season: "winter" | "spring" | "summer" | "fall" | null;
    tags: string[] | null;
  },
  year: number,
  season: BgmSeason,
): boolean {
  if (row.year !== year) return false;
  if (row.season === LOCAL_SEASON_BY_BGM_SEASON[season]) return true;
  return (row.tags ?? []).some((tag) => {
    const match = /^(\d{4})年(\d{1,2})月$/u.exec(tag);
    if (!match || Number(match[1]) !== year) return false;
    const month = Number(match[2]);
    if (season === "WINTER") return month >= 1 && month <= 3;
    if (season === "SPRING") return month >= 4 && month <= 6;
    if (season === "SUMMER") return month >= 7 && month <= 9;
    return month >= 10 && month <= 12;
  });
}

function attachUnassignedDownloads(counters: RefreshCounters): number {
  const rows = db
    .select()
    .from(downloadQueue)
    .where(isNull(downloadQueue.animeId))
    .all();
  if (rows.length === 0) return 0;

  let attached = 0;
  for (const row of rows) {
    const episodeNumber = extractEpisodeNumber(row.title);
    if (episodeNumber == null || episodeNumber <= 0) continue;
    const parsed = parseAnimeMediaFileName(row.title);
    const title =
      parsed.kind === "tv" && (parsed.season ?? 1) > 1
        ? `${parsed.title} 第${parsed.season}季`
        : parsed.title;
    const matches = findSeasonAwareAnimeRowsForDownload({
      releaseTitle: row.title,
      parsedTitle: parsed.title,
      displayTitle: title,
      type: parsed.kind === "movie" ? "Movie" : "TV",
      year: parsed.year,
      episodeNumber,
    });
    if (matches.length > 1) {
      counters.warnings.push(`AMBIGUOUS:下载记录 ${row.id} 找到多个番剧候选`);
      continue;
    }

    let target = matches[0];
    if (!target) {
      target = db
        .insert(anime)
        .values({
          title,
          type: parsed.kind === "movie" ? "Movie" : "TV",
          status: parsed.kind === "movie" ? "completed" : "airing",
          totalEpisodes: parsed.kind === "movie" ? 1 : null,
          year: parsed.year,
          mediaType: "anime",
        })
        .returning()
        .get();
    }

    let episode = db
      .select()
      .from(episodes)
      .where(
        and(
          eq(episodes.animeId, target.id),
          eq(episodes.number, episodeNumber),
        ),
      )
      .all()
      .sort((left, right) =>
        Number(right.isDownloaded) - Number(left.isDownloaded) ||
        left.id - right.id,
      )[0];
    if (!episode) {
      episode = db
        .insert(episodes)
        .values({
          animeId: target.id,
          number: episodeNumber,
          title: row.title,
          isDownloaded: row.status === "completed",
        })
        .returning()
        .get();
    }
    db.update(downloadQueue)
      .set({ animeId: target.id, episodeId: episode.id })
      .where(eq(downloadQueue.id, row.id))
      .run();
    addRssTitleAlias(target.id, parsed.title);
    attached += 1;
  }
  return attached;
}

function findSeasonAwareAnimeRowsForDownload({
  releaseTitle,
  parsedTitle,
  displayTitle,
  type,
  year,
  episodeNumber,
}: {
  releaseTitle: string;
  parsedTitle: string;
  displayTitle: string;
  type: Anime["type"];
  year: number | null;
  episodeNumber: number;
}): Anime[] {
  if (type !== "TV" || extractSeason(releaseTitle) != null) {
    return findAnimeRowsByTitles([displayTitle, parsedTitle], { type, year });
  }
  const keys = new Set(
    yucCatalogTitleVariants([stripSeasonSuffix(parsedTitle)]).filter(isSafeIdentityKey),
  );
  const candidates = db
    .select()
    .from(anime)
    .where(eq(anime.mediaType, "anime"))
    .all()
    .filter((row) => {
      if (row.type !== type) return false;
      if (row.year != null && year != null && row.year !== year) return false;
      return yucCatalogTitleVariants([
        stripSeasonSuffix(row.title),
        stripSeasonSuffix(row.titleJa ?? ""),
      ]).some((key) => keys.has(key));
    });
  if (candidates.length <= 1) return candidates;
  const episodeRows = db.select().from(episodes).all();
  const resolved = resolveUniqueEpisodeRangeCandidate(
    candidates.map((candidate) => ({
      value: candidate,
      totalEpisodes: candidate.totalEpisodes,
      episodeNumbers: episodeRows
        .filter((episode) => episode.animeId === candidate.id)
        .map((episode) => episode.number),
    })),
    [episodeNumber],
  );
  return resolved ? [resolved] : candidates;
}

export function repairMisassignedLocalDownloads(): number {
  const localRows = db
    .select()
    .from(downloadQueue)
    .where(like(downloadQueue.magnetUrl, "local-file:%"))
    .all();
  const animeRows = db
    .select()
    .from(anime)
    .where(eq(anime.mediaType, "anime"))
    .all();
  const episodeRows = db.select().from(episodes).all();
  const episodesByAnime = new Map<number, typeof episodeRows>();
  const episodeById = new Map(episodeRows.map((episode) => [episode.id, episode]));
  for (const episode of episodeRows) {
    const group = episodesByAnime.get(episode.animeId) ?? [];
    group.push(episode);
    episodesByAnime.set(episode.animeId, group);
  }

  let repaired = 0;
  for (const row of localRows) {
    if (row.animeId == null || row.episodeId == null) continue;
    if (!parseLocalFileDownloadUrl(row.magnetUrl)) continue;
    if (extractSeason(row.title) != null) continue;
    const parsed = parseAnimeMediaFileName(row.title);
    if (parsed.kind !== "tv") continue;
    const episodeNumber = extractEpisodeNumber(row.title) ?? parsed.episode;
    if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) continue;

    const familyKeys = new Set(
      yucCatalogTitleVariants([stripSeasonSuffix(parsed.title)]).filter(isSafeIdentityKey),
    );
    if (familyKeys.size === 0) continue;
    const candidates = animeRows.filter((candidate) =>
      yucCatalogTitleVariants([
        stripSeasonSuffix(candidate.title),
        stripSeasonSuffix(candidate.titleJa ?? ""),
      ]).some((key) => familyKeys.has(key)),
    );
    if (candidates.length < 2) continue;
    const target = resolveUniqueEpisodeRangeCandidate(
      candidates.map((candidate) => ({
        value: candidate,
        totalEpisodes: candidate.totalEpisodes,
        episodeNumbers: (episodesByAnime.get(candidate.id) ?? []).map(
          (episode) => episode.number,
        ),
      })),
      [episodeNumber],
    );
    if (!target || target.id === row.animeId) continue;

    const sourceAnime = animeRows.find((candidate) => candidate.id === row.animeId);
    const sourceEpisode = episodeById.get(row.episodeId);
    const targetEpisode = (episodesByAnime.get(target.id) ?? []).find(
      (episode) => episode.number === episodeNumber,
    );
    if (!sourceAnime || !sourceEpisode || !targetEpisode) continue;
    const sourceRange = getCanonicalEpisodeRange({
      value: sourceAnime,
      totalEpisodes: sourceAnime.totalEpisodes,
      episodeNumbers: (episodesByAnime.get(sourceAnime.id) ?? []).map(
        (episode) => episode.number,
      ),
    });
    const safeSyntheticEpisode =
      sourceEpisode.animeId === sourceAnime.id &&
      sourceEpisode.number === episodeNumber &&
      sourceEpisode.airedAt == null &&
      sourceEpisode.title === row.title &&
      sourceRange != null &&
      (episodeNumber < sourceRange.first || episodeNumber > sourceRange.last);
    if (!safeSyntheticEpisode) continue;

    db.transaction((tx) => {
      movePlaybackProgress(tx, {
        sourceAnimeId: sourceAnime.id,
        targetAnimeId: target.id,
        sourceEpisodeId: sourceEpisode.id,
        targetEpisodeId: targetEpisode.id,
      });
      tx.update(watchEvents)
        .set({
          animeId: target.id,
          episodeId: targetEpisode.id,
          episode: targetEpisode.number,
        })
        .where(eq(watchEvents.episodeId, sourceEpisode.id))
        .run();
      tx.update(downloadQueue)
        .set({ animeId: target.id, episodeId: targetEpisode.id })
        .where(eq(downloadQueue.id, row.id))
        .run();
      tx.update(episodes)
        .set({ isDownloaded: true })
        .where(eq(episodes.id, targetEpisode.id))
        .run();

      const hasDownload = tx
        .select({ id: downloadQueue.id })
        .from(downloadQueue)
        .where(eq(downloadQueue.episodeId, sourceEpisode.id))
        .limit(1)
        .get();
      const hasWatchEvent = tx
        .select({ id: watchEvents.id })
        .from(watchEvents)
        .where(eq(watchEvents.episodeId, sourceEpisode.id))
        .limit(1)
        .get();
      const hasProgress = tx
        .select({ id: playbackProgress.id })
        .from(playbackProgress)
        .where(eq(playbackProgress.episodeId, sourceEpisode.id))
        .limit(1)
        .get();
      if (!hasDownload && !hasWatchEvent && !hasProgress) {
        tx.delete(episodes).where(eq(episodes.id, sourceEpisode.id)).run();
      }
    });
    repaired += 1;
  }
  return repaired;
}

function removeExactDuplicateDownloads(): number {
  const rows = db.select().from(downloadQueue).all();
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.magnetUrl.trim();
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const removeIds: number[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((left, right) =>
      downloadCompletenessScore(right) - downloadCompletenessScore(left) ||
      right.id - left.id,
    );
    removeIds.push(...ordered.slice(1).map((row) => row.id));
  }
  if (removeIds.length > 0) {
    db.delete(downloadQueue).where(inArray(downloadQueue.id, removeIds)).run();
  }
  return removeIds.length;
}

function downloadCompletenessScore(
  row: typeof downloadQueue.$inferSelect,
): number {
  return (
    Number(row.animeId != null) * 8 +
    Number(row.episodeId != null) * 4 +
    Number(row.status === "completed") * 2 +
    Number(parseLocalFileDownloadUrl(row.magnetUrl) != null)
  );
}

function reconcileDuplicateAnimeRows(
  seedId: number,
  counters: RefreshCounters,
): number | null {
  const seed = db.select().from(anime).where(eq(anime.id, seedId)).get();
  if (!seed || seed.mediaType !== "anime") return null;
  const candidates = db
    .select()
    .from(anime)
    .where(eq(anime.mediaType, "anime"))
    .all()
    .filter((row) => animeRowsShareIdentity(seed, row));
  if (candidates.length <= 1) return seed.id;

  const bangumiIds = new Set(
    candidates
      .map((row) => row.bangumiId)
      .filter((id): id is number => id != null),
  );
  if (bangumiIds.size > 1) {
    counters.warnings.push(`AMBIGUOUS:${seed.title} 存在多个 Bangumi 身份`);
    return seed.id;
  }

  const canonical = [...candidates].sort(
    (left, right) => animeIdentityScore(right) - animeIdentityScore(left) || left.id - right.id,
  )[0]!;
  for (const source of candidates) {
    if (source.id === canonical.id) continue;
    mergeAnimeRows(canonical.id, source.id);
    counters.animeMerged += 1;
  }
  return canonical.id;
}

function animeIdentityScore(row: Anime): number {
  const yuc = listYucIdentitiesForAnime(row.id).length > 0;
  const tracked = db
    .select({ id: userAnime.id })
    .from(userAnime)
    .where(eq(userAnime.animeId, row.id))
    .limit(1)
    .get();
  return (
    Number(row.bangumiId != null) * 1000 +
    Number(yuc) * 500 +
    Number(row.coverUrl != null) * 100 +
    Number(tracked != null) * 80 +
    Number(row.year != null) * 30 +
    Number(row.titleJa != null) * 20
  );
}

function animeRowsShareIdentity(left: Anime, right: Anime): boolean {
  if (left.id === right.id) return true;
  if (
    left.bangumiId != null &&
    right.bangumiId != null &&
    left.bangumiId !== right.bangumiId
  ) {
    return false;
  }
  if (left.type !== right.type) return false;
  if (left.year != null && right.year != null && left.year !== right.year) {
    return false;
  }
  const leftTitles = [left.title, left.titleJa];
  const rightTitles = [right.title, right.titleJa];
  if (hasAnimeSeasonConflict(leftTitles, rightTitles)) return false;
  const leftKeys = new Set(yucCatalogTitleVariants(leftTitles));
  const rightKeys = yucCatalogTitleVariants(rightTitles);
  if (
    rightKeys.some(
      (key) => isSafeIdentityKey(key) && leftKeys.has(key),
    )
  ) {
    return true;
  }
  if (![...leftKeys, ...rightKeys].some(isSafeIdentityKey)) return false;
  return isHighConfidenceYucCatalogIdentity(
    {
      title: left.title,
      titleJa: left.titleJa,
      year: left.year,
      format: left.type,
      seasonMonth: inferAnimeSeasonMonth(left),
      totalEpisodes: left.totalEpisodes,
    },
    {
      title: right.title,
      titleJa: right.titleJa,
      year: right.year,
      format: right.type,
      seasonMonth: inferAnimeSeasonMonth(right),
      totalEpisodes: right.totalEpisodes,
    },
  );
}

function findAnimeRowsByTitles(
  titles: Array<string | null | undefined>,
  constraints: { type: Anime["type"]; year: number | null },
): Anime[] {
  const keys = new Set(
    yucCatalogTitleVariants(titles).filter(isSafeIdentityKey),
  );
  if (keys.size === 0) return [];
  return db
    .select()
    .from(anime)
    .where(eq(anime.mediaType, "anime"))
    .all()
    .filter((row) => {
      if (row.type !== constraints.type) return false;
      if (
        row.year != null &&
        constraints.year != null &&
        row.year !== constraints.year
      ) {
        return false;
      }
      if (hasAnimeSeasonConflict([row.title, row.titleJa], titles)) return false;
      return yucCatalogTitleVariants([row.title, row.titleJa]).some((key) =>
        keys.has(key),
      );
    });
}

function isSafeIdentityKey(value: string): boolean {
  if (value.length >= 4) return true;
  return (value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? [])
    .length >= 3;
}

function inferAnimeSeasonMonth(
  row: Pick<Anime, "season" | "tags" | "year">,
): number | null {
  return inferYucSeasonMonth({
    season: row.season,
    tags: row.tags,
    year: row.year,
  });
}

export function mergeAnimeRows(targetId: number, sourceId: number): void {
  const target = db.select().from(anime).where(eq(anime.id, targetId)).get();
  const source = db.select().from(anime).where(eq(anime.id, sourceId)).get();
  if (!target || !source || target.id === source.id) return;
  const sourceYucRecords = listYucIdentities().filter(
    (item) => item.animeId === sourceId,
  );

  db.transaction((tx) => {
    const targetEpisodes = tx
      .select()
      .from(episodes)
      .where(eq(episodes.animeId, targetId))
      .all();
    const targetByNumber = new Map(
      targetEpisodes.map((episode) => [episode.number, episode]),
    );
    const sourceEpisodes = tx
      .select()
      .from(episodes)
      .where(eq(episodes.animeId, sourceId))
      .all();

    for (const sourceEpisode of sourceEpisodes) {
      const targetEpisode = targetByNumber.get(sourceEpisode.number);
      if (!targetEpisode) {
        tx.update(episodes)
          .set({ animeId: targetId })
          .where(eq(episodes.id, sourceEpisode.id))
          .run();
        targetByNumber.set(sourceEpisode.number, {
          ...sourceEpisode,
          animeId: targetId,
        });
        continue;
      }

      movePlaybackProgress(tx, {
        sourceAnimeId: sourceId,
        targetAnimeId: targetId,
        sourceEpisodeId: sourceEpisode.id,
        targetEpisodeId: targetEpisode.id,
      });
      tx.update(downloadQueue)
        .set({ animeId: targetId, episodeId: targetEpisode.id })
        .where(eq(downloadQueue.episodeId, sourceEpisode.id))
        .run();
      tx.update(watchEvents)
        .set({ animeId: targetId, episodeId: targetEpisode.id })
        .where(eq(watchEvents.episodeId, sourceEpisode.id))
        .run();
      tx.update(episodes)
        .set({
          title: targetEpisode.title ?? sourceEpisode.title,
          airedAt: targetEpisode.airedAt ?? sourceEpisode.airedAt,
          isDownloaded:
            Boolean(targetEpisode.isDownloaded) || Boolean(sourceEpisode.isDownloaded),
        })
        .where(eq(episodes.id, targetEpisode.id))
        .run();
      tx.delete(episodes).where(eq(episodes.id, sourceEpisode.id)).run();
    }

    tx.update(downloadQueue)
      .set({ animeId: targetId })
      .where(eq(downloadQueue.animeId, sourceId))
      .run();
    tx.update(watchEvents)
      .set({ animeId: targetId })
      .where(eq(watchEvents.animeId, sourceId))
      .run();
    tx.update(playbackProgress)
      .set({ animeId: targetId })
      .where(eq(playbackProgress.animeId, sourceId))
      .run();
    mergeUserAnimeRows(tx, targetId, sourceId);

    for (const record of sourceYucRecords) {
      tx.update(appSettings)
        .set({ value: { ...record, animeId: targetId }, updatedAt: new Date() })
        .where(
          eq(
            appSettings.key,
            `${YUC_IDENTITY_SETTING_PREFIX}${record.sourceKey}`,
          ),
        )
        .run();
    }

    tx.update(anime)
      .set({
        bangumiId: target.bangumiId ?? source.bangumiId,
        anilistId: target.anilistId ?? source.anilistId,
        titleJa: target.titleJa ?? source.titleJa,
        coverUrl: target.coverUrl ?? source.coverUrl,
        synopsis: selectPreferredSynopsis(target.synopsis, source.synopsis),
        totalEpisodes: target.totalEpisodes ?? source.totalEpisodes,
        airingDay: target.airingDay ?? source.airingDay,
        airingTime: target.airingTime ?? source.airingTime,
        season: target.season ?? source.season,
        year: target.year ?? source.year,
        tags: [...new Set([...(target.tags ?? []), ...(source.tags ?? [])])],
        updatedAt: new Date(),
      })
      .where(eq(anime.id, targetId))
      .run();
    tx.delete(anime).where(eq(anime.id, sourceId)).run();
  });

  mergeRssTitleAliasAnimeIds(targetId, sourceId, [
    source.title,
    source.titleJa,
  ]);
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function movePlaybackProgress(
  tx: Transaction,
  input: {
    sourceAnimeId: number;
    targetAnimeId: number;
    sourceEpisodeId: number;
    targetEpisodeId: number;
  },
): void {
  const rows = tx
    .select()
    .from(playbackProgress)
    .where(eq(playbackProgress.episodeId, input.sourceEpisodeId))
    .all();
  for (const row of rows) {
    const existing = tx
      .select()
      .from(playbackProgress)
      .where(
        and(
          eq(playbackProgress.userId, row.userId),
          eq(playbackProgress.animeId, input.targetAnimeId),
          eq(playbackProgress.episodeId, input.targetEpisodeId),
        ),
      )
      .get();
    if (!existing) {
      tx.update(playbackProgress)
        .set({
          animeId: input.targetAnimeId,
          episodeId: input.targetEpisodeId,
        })
        .where(eq(playbackProgress.id, row.id))
        .run();
      continue;
    }
    tx.update(playbackProgress)
      .set({
        positionSeconds: Math.max(existing.positionSeconds, row.positionSeconds),
        durationSeconds: Math.max(existing.durationSeconds, row.durationSeconds),
        completed: Boolean(existing.completed) || Boolean(row.completed),
        lastPlayedAt:
          existing.lastPlayedAt > row.lastPlayedAt
            ? existing.lastPlayedAt
            : row.lastPlayedAt,
        updatedAt: new Date(),
      })
      .where(eq(playbackProgress.id, existing.id))
      .run();
    tx.delete(playbackProgress).where(eq(playbackProgress.id, row.id)).run();
  }
}

function mergeUserAnimeRows(
  tx: Transaction,
  targetAnimeId: number,
  sourceAnimeId: number,
): void {
  const sourceRows = tx
    .select()
    .from(userAnime)
    .where(eq(userAnime.animeId, sourceAnimeId))
    .all();
  for (const source of sourceRows) {
    const target = tx
      .select()
      .from(userAnime)
      .where(
        and(
          eq(userAnime.userId, source.userId),
          eq(userAnime.animeId, targetAnimeId),
        ),
      )
      .get();
    if (!target) {
      tx.update(userAnime)
        .set({ animeId: targetAnimeId })
        .where(eq(userAnime.id, source.id))
        .run();
      continue;
    }
    tx.update(userAnime)
      .set({
        watchStatus:
          target.watchStatus === "planning"
            ? source.watchStatus
            : target.watchStatus,
        currentEpisode: Math.max(target.currentEpisode, source.currentEpisode),
        rating: target.rating ?? source.rating,
        notes: target.notes ?? source.notes,
        updatedAt:
          target.updatedAt > source.updatedAt
            ? target.updatedAt
            : source.updatedAt,
      })
      .where(eq(userAnime.id, target.id))
      .run();
    tx.delete(userAnime).where(eq(userAnime.id, source.id)).run();
  }
}

async function refreshOneAnime(
  animeId: number,
  forceYuc: boolean,
  counters: RefreshCounters,
): Promise<void> {
  const before = db.select().from(anime).where(eq(anime.id, animeId)).get();
  if (!before) return;
  const beforeEpisodeCount = countEpisodes(animeId);
  const beforeBangumiId = before.bangumiId;
  const beforeYucCount = listYucIdentitiesForAnime(animeId).length;
  const originalAliases = [before.title, before.titleJa];
  let yucMatch = await readYucMatch(before, forceYuc);
  let subject: BgmSubject | null = null;

  if (before.bangumiId != null && forceYuc) {
    subject = await getSubject(before.bangumiId);
  } else if (before.bangumiId != null) {
    await syncFromBangumi(before.bangumiId).catch(() => {
      counters.warnings.push(`${before.title} 的 Bangumi 更新失败`);
    });
  } else {
    subject = await findUniqueBangumiSubject(
      before,
      yucMatch,
      bangumiLookupDependencies,
    );
  }

  if (subject) {
    try {
      await refreshFromBangumi(
        subject.id,
        {
          targetAnimeId: animeId,
          preserveTitle: Boolean(yucMatch),
        },
        {
          getSubject: async () => subject,
          getEpisodes,
        },
      );
    } catch (error) {
      counters.warnings.push(
        error instanceof YucIdentityConflictError
          ? `AMBIGUOUS:${before.title} 的 Bangumi 身份冲突`
          : `${before.title} 的 Bangumi 更新失败`,
      );
    }
  } else if (beforeBangumiId == null) {
    counters.warnings.push(`${before.title} 暂未找到唯一 Bangumi 条目`);
  } else if (forceYuc) {
    counters.warnings.push(`${before.title} 的 Bangumi 更新失败`);
  }

  const refreshed = db.select().from(anime).where(eq(anime.id, animeId)).get();
  if (!refreshed) return;
  if (!yucMatch) yucMatch = await readYucMatch(refreshed, forceYuc);
  if (yucMatch && listYucIdentitiesForAnime(animeId).length === 0) {
    try {
      bindYucIdentity(yucMatch.entry, animeId);
    } catch (error) {
      counters.warnings.push(
        error instanceof YucIdentityConflictError
          ? `AMBIGUOUS:${refreshed.title} 的长门身份冲突`
          : `${refreshed.title} 的长门身份更新失败`,
      );
    }
  }

  const aliases = [
    ...originalAliases,
    refreshed.title,
    refreshed.titleJa,
    yucMatch?.entry.title,
    yucMatch?.entry.titleJa,
    ...(subject ? selectTitleAliasesFromBangumi(subject) : []),
    ...(forceYuc || beforeBangumiId == null
      ? await getAutoTitleAliases({
          bangumiId: refreshed.bangumiId,
          titles: [refreshed.title, refreshed.titleJa],
        }).catch(() => [])
      : []),
  ];
  if (await localizeAnimeSynopsis(refreshed, aliases)) {
    counters.synopsesLocalized += 1;
  }
  const existingAliases = new Set(getRssTitleAliases(animeId));
  for (const alias of aliases) {
    if (!alias?.trim()) continue;
    const next = addRssTitleAlias(animeId, alias);
    if (next.length > existingAliases.size) {
      counters.rssAliasesUpdated += 1;
      next.forEach((item) => existingAliases.add(item));
    }
  }

  const afterEpisodeCount = countEpisodes(animeId);
  if (beforeBangumiId == null && refreshed.bangumiId != null) {
    counters.bangumiLinked += 1;
  }
  const afterYucCount = listYucIdentitiesForAnime(animeId).length;
  if (afterYucCount > beforeYucCount) counters.yucLinked += 1;
  counters.episodesUpserted += Math.max(0, afterEpisodeCount - beforeEpisodeCount);
}

async function localizeAnimeSynopsis(
  row: Anime,
  aliases: Array<string | null | undefined>,
): Promise<boolean> {
  if (isLikelyChineseSynopsis(row.synopsis)) return false;

  const localTitles = [row.title, row.titleJa, ...aliases]
    .filter((title): title is string => Boolean(title?.trim()))
    .flatMap((title) => expandZhVariants(title));
  const type = row.type === "Movie" ? "movie" : "tv";
  let detail: DoubanInfo | null = null;

  if (row.doubanId) {
    detail = await getDoubanSubject(row.doubanId, type).catch(() => null);
  } else {
    const queries = [...new Set(localTitles)].slice(0, 3);
    for (const query of queries) {
      const candidate = await getDoubanInfo(query, {
        type,
        year: row.year,
      }).catch(() => null);
      if (
        candidate &&
        isReliableDoubanTitleSetMatch({
          doubanTitles: [candidate.title, candidate.originalTitle],
          localTitles,
          doubanYear: candidate.year,
          localYear: row.year,
        })
      ) {
        detail = candidate;
        break;
      }
    }
  }

  if (
    !detail ||
    !isReliableDoubanTitleSetMatch({
      doubanTitles: [detail.title, detail.originalTitle],
      localTitles,
      doubanYear: detail.year,
      localYear: row.year,
    })
  ) {
    return false;
  }

  const synopsis = selectPreferredSynopsis(row.synopsis, detail.synopsis);
  if (!isLikelyChineseSynopsis(synopsis) || synopsis === row.synopsis) {
    return false;
  }
  db.update(anime)
    .set({
      synopsis,
      doubanId: row.doubanId ?? detail.doubanId,
      updatedAt: new Date(),
    })
    .where(eq(anime.id, row.id))
    .run();
  return true;
}

async function readYucMatch(
  row: Anime,
  force: boolean,
): Promise<YucDetailMatch | null> {
  if (!force) return getYucDetailMatch(row);
  const { getYucEntryBySourceKey, getYucFuturePage, getYucMoviePage, getYucSeasonPage, getYucSpecialPage } =
    await import("@/lib/yuc/client");
  return getYucDetailMatch(row, {
    getEntryBySourceKey: (key) => getYucEntryBySourceKey(key, true),
    getSeasonPage: (year, month) =>
      getYucSeasonPage(year, month, null, undefined, true),
    getFuturePage: () => getYucFuturePage(null, undefined, true),
    getSpecialPage: () => getYucSpecialPage(null, undefined, true),
    getMoviePage: () => getYucMoviePage(null, undefined, true),
  });
}

export async function findUniqueBangumiSubject(
  row: Pick<Anime, "title" | "titleJa" | "year" | "type">,
  yucMatch: YucDetailMatch | null,
  dependencies: BangumiLookupDependencies = bangumiLookupDependencies,
): Promise<BgmSubject | null> {
  const identityTitles = [
    row.title,
    row.titleJa,
    yucMatch?.entry.title,
    yucMatch?.entry.titleJa,
  ];
  const identityKeys = new Set(
    yucCatalogTitleVariants(identityTitles).filter(isSafeIdentityKey),
  );
  if (identityKeys.size === 0) return null;

  const queries = [
    ...new Set(
      identityTitles
        .filter(isNonEmptyString)
        .flatMap((title) => expandZhVariants(title)),
    ),
  ]
    .sort((left, right) =>
      Number(right === row.titleJa) - Number(left === row.titleJa) ||
      left.length - right.length,
    )
    .slice(0, 3);
  const hits = (
    await Promise.all(
      queries.map((query) => dependencies.searchSubjects(query, 10)),
    )
  ).flat();
  const ids = new Set<number>();
  for (const hit of hits) {
    const hitTitles = [hit.name_cn, hit.name];
    if (hasAnimeSeasonConflict(identityTitles, hitTitles)) continue;
    const hitYear = hit.date?.match(/^\d{4}/u)?.[0];
    if (row.year != null && hitYear && Number(hitYear) !== row.year) continue;
    const directTitleMatch = yucCatalogTitleVariants(hitTitles).some((key) =>
      identityKeys.has(key),
    );
    const yucTitleCandidate =
      yucMatch != null &&
      isYucCatalogTargetCandidate(
        yucMatch.entry,
        bangumiCatalogTarget(hit),
      );
    if (!directTitleMatch && !yucTitleCandidate) {
      continue;
    }
    ids.add(hit.id);
  }
  const subjects = (
    await Promise.all([...ids].map((id) => dependencies.getSubject(id)))
  ).filter((subject): subject is BgmSubject => subject != null);
  const compatibleSubjects = subjects
    .filter((subject) => {
      if (bangumiPlatformToAnimeType(subject.platform) !== row.type) return false;
      const aliases = selectTitleAliasesFromBangumi(subject);
      return !hasAnimeSeasonConflict(identityTitles, aliases);
    });
  if (yucMatch) {
    const match = findUniqueYucCatalogTarget(
      yucMatch.entry,
      compatibleSubjects.map((subject) => ({
        subject,
        ...bangumiCatalogTarget(subject),
      })),
    );
    return match?.subject ?? null;
  }
  const ranked = compatibleSubjects
    .filter((subject) =>
      yucCatalogTitleVariants(selectTitleAliasesFromBangumi(subject)).some(
        (key) => identityKeys.has(key),
      ),
    )
    .map((subject) => ({
      subject,
      score: bangumiMatchScore(subject, row, yucMatch),
    }))
    .sort((left, right) => right.score - left.score || left.subject.id - right.subject.id);
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0]!.score === ranked[1]!.score) return null;
  return ranked[0]!.subject;
}

function bangumiCatalogTarget(subject: BgmSubject) {
  const year = subject.date?.match(/^\d{4}/u)?.[0];
  return {
    title: subject.name_cn?.trim() || subject.name,
    titleJa: subject.name,
    aliases: selectTitleAliasesFromBangumi(subject),
    year: year ? Number(year) : null,
    format: bangumiPlatformToAnimeType(subject.platform),
    premiereDate: subject.date ?? null,
    seasonMonth: inferYucSeasonMonth({ premiereDate: subject.date }),
    totalEpisodes:
      subject.eps != null && subject.eps > 0
        ? subject.eps
        : subject.total_episodes ?? null,
  };
}

function bangumiMatchScore(
  subject: BgmSubject,
  row: Pick<Anime, "titleJa" | "year" | "type">,
  yucMatch: YucDetailMatch | null,
): number {
  const subjectAliases = selectTitleAliasesFromBangumi(subject);
  const japaneseKeys = new Set(
    yucCatalogTitleVariants([row.titleJa, yucMatch?.entry.titleJa]),
  );
  let score = subjectAliases.some((alias) =>
    japaneseKeys.has(normalizeYucCatalogTitle(alias)),
  )
    ? 8
    : 4;
  const year = subject.date?.match(/^\d{4}/u)?.[0];
  if (row.year != null && year && Number(year) === row.year) score += 2;
  if (bangumiPlatformToAnimeType(subject.platform) === row.type) score += 1;
  return score;
}

function countEpisodes(animeId: number): number {
  return db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.animeId, animeId))
    .all().length;
}

function isNonEmptyString(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const run = async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (current !== undefined) await worker(current);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}
