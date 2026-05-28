import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../../db";
import { anime, episodes, userAnime, watchEvents } from "../../db/schema";

type RatingValue = 1 | 2 | 3 | 4 | 5;

export interface StatsReportOptions {
  year?: number;
  topLimit?: number;
}

export interface MonthlyWatchHours {
  month: number;
  label: string;
  hours: number;
  minutes: number;
}

export interface StatsReport {
  year: number;
  overview: {
    totalHours: number;
    watchedEpisodes: number;
    completedAnime: number;
    activeDays: number;
    averageMinutesPerActiveDay: number;
  };
  monthlyHours: MonthlyWatchHours[];
  tagDistribution: {
    tag: string;
    animeCount: number;
    eventCount: number;
    minutes: number;
    hours: number;
  }[];
  ratingDistribution: {
    rating: RatingValue;
    count: number;
  }[];
  completedTop: {
    animeId: number;
    title: string;
    titleJa: string | null;
    coverUrl: string | null;
    tags: string[] | null;
    rating: number | null;
    completedAt: string;
    watchedEpisodes: number;
    watchedMinutes: number;
    watchedHours: number;
  }[];
}

function startOfMonth(refDate: Date) {
  return new Date(refDate.getFullYear(), refDate.getMonth(), 1);
}

function startOfNextMonth(refDate: Date) {
  return new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1);
}

function startOfYear(year: number) {
  return new Date(year, 0, 1);
}

function startOfNextYear(year: number) {
  return new Date(year + 1, 0, 1);
}

function startOfWeek(refDate: Date) {
  const start = new Date(refDate);
  start.setHours(0, 0, 0, 0);
  const dayFromMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayFromMonday);
  return start;
}

function roundHours(minutes: number) {
  return Math.round((minutes / 60) * 10) / 10;
}

function roundNonNegativeHours(minutes: number) {
  return roundHours(Math.max(0, minutes));
}

function signedMinutes(action: "watch" | "unwatch", minutes: number) {
  return action === "watch" ? minutes : -minutes;
}

function signedCount(action: "watch" | "unwatch") {
  return action === "watch" ? 1 : -1;
}

function eventTime(value: Date | number) {
  return value instanceof Date ? value.getTime() : Number(value) * 1000;
}

const wholeEpisodeOnly = sql`${watchEvents.episode} = cast(${watchEvents.episode} as integer)`;

function toIso(value: Date | number) {
  const time = eventTime(value);
  return new Date(time).toISOString();
}

export function getMonthHours(userId: string, refDate = new Date()) {
  const rows = db
    .select({
      action: watchEvents.action,
      minutes: watchEvents.minutes,
    })
    .from(watchEvents)
    .where(
      and(
        eq(watchEvents.userId, userId),
        wholeEpisodeOnly,
        gte(watchEvents.watchedAt, startOfMonth(refDate)),
        lt(watchEvents.watchedAt, startOfNextMonth(refDate)),
      ),
    )
    .all();

  const minutes = rows.reduce(
    (total, row) => total + signedMinutes(row.action, row.minutes),
    0,
  );
  return roundNonNegativeHours(minutes);
}

export function getWeekDailyHours(userId: string, refDate = new Date()) {
  const start = startOfWeek(refDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const rows = db
    .select({
      action: watchEvents.action,
      minutes: watchEvents.minutes,
      watchedAt: watchEvents.watchedAt,
    })
    .from(watchEvents)
    .where(
      and(
        eq(watchEvents.userId, userId),
        wholeEpisodeOnly,
        gte(watchEvents.watchedAt, start),
        lt(watchEvents.watchedAt, end),
      ),
    )
    .all();

  const dailyMinutes = [0, 0, 0, 0, 0, 0, 0];
  for (const row of rows) {
    const index = Math.floor((eventTime(row.watchedAt) - start.getTime()) / 86400000);
    if (index >= 0 && index < 7) {
      dailyMinutes[index] += signedMinutes(row.action, row.minutes);
    }
  }

  return dailyMinutes.map(roundNonNegativeHours);
}

function getYearEventRows(userId: string, year: number) {
  return db
    .select({
      id: watchEvents.id,
      userId: watchEvents.userId,
      animeId: watchEvents.animeId,
      episode: watchEvents.episode,
      action: watchEvents.action,
      minutes: watchEvents.minutes,
      watchedAt: watchEvents.watchedAt,
      title: anime.title,
      titleJa: anime.titleJa,
      coverUrl: anime.coverUrl,
      tags: anime.tags,
      rating: userAnime.rating,
      watchStatus: userAnime.watchStatus,
      totalEpisodes: anime.totalEpisodes,
    })
    .from(watchEvents)
    .innerJoin(anime, eq(watchEvents.animeId, anime.id))
    .leftJoin(
      userAnime,
      and(eq(userAnime.userId, userId), eq(userAnime.animeId, anime.id)),
    )
    .where(
      and(
        eq(watchEvents.userId, userId),
        wholeEpisodeOnly,
        gte(watchEvents.watchedAt, startOfYear(year)),
        lt(watchEvents.watchedAt, startOfNextYear(year)),
      ),
    )
    .orderBy(asc(watchEvents.watchedAt), asc(watchEvents.id))
    .all();
}

function getEventsUntilYearEnd(userId: string, year: number) {
  return db
    .select({
      id: watchEvents.id,
      animeId: watchEvents.animeId,
      episode: watchEvents.episode,
      action: watchEvents.action,
      minutes: watchEvents.minutes,
      watchedAt: watchEvents.watchedAt,
      title: anime.title,
      titleJa: anime.titleJa,
      coverUrl: anime.coverUrl,
      tags: anime.tags,
      rating: userAnime.rating,
      watchStatus: userAnime.watchStatus,
      totalEpisodes: anime.totalEpisodes,
    })
    .from(watchEvents)
    .innerJoin(anime, eq(watchEvents.animeId, anime.id))
    .leftJoin(
      userAnime,
      and(eq(userAnime.userId, userId), eq(userAnime.animeId, anime.id)),
    )
    .where(
      and(
        eq(watchEvents.userId, userId),
        wholeEpisodeOnly,
        lt(watchEvents.watchedAt, startOfNextYear(year)),
      ),
    )
    .orderBy(asc(watchEvents.watchedAt), asc(watchEvents.id))
    .all();
}

function getKnownEpisodeNumbers(animeIds: number[]) {
  const map = new Map<number, Set<number>>();
  if (animeIds.length === 0) return map;

  const rows = db
    .select({
      animeId: episodes.animeId,
      number: episodes.number,
    })
    .from(episodes)
    .where(
      and(
        inArray(episodes.animeId, animeIds),
        sql`${episodes.number} = cast(${episodes.number} as integer)`,
      ),
    )
    .all();

  for (const row of rows) {
    const set = map.get(row.animeId) ?? new Set<number>();
    set.add(row.number);
    map.set(row.animeId, set);
  }
  return map;
}

function getMonthlyWatchHoursFromRows(
  rows: ReturnType<typeof getYearEventRows>,
): MonthlyWatchHours[] {
  const buckets = Array.from({ length: 12 }, () => 0);
  for (const row of rows) {
    const month = new Date(eventTime(row.watchedAt)).getMonth();
    buckets[month] += signedMinutes(row.action, row.minutes);
  }

  return buckets.map((minutes, index) => {
    const safeMinutes = Math.max(0, minutes);
    return {
      month: index + 1,
      label: `${index + 1}月`,
      hours: roundHours(safeMinutes),
      minutes: safeMinutes,
    };
  });
}

function getRatingDistribution(userId: string): StatsReport["ratingDistribution"] {
  const counts = new Map<RatingValue, number>(
    ([1, 2, 3, 4, 5] as RatingValue[]).map((rating) => [rating, 0]),
  );
  const rows = db
    .select({ rating: userAnime.rating })
    .from(userAnime)
    .where(eq(userAnime.userId, userId))
    .all();

  for (const row of rows) {
    if (row.rating && row.rating >= 1 && row.rating <= 5) {
      const rating = row.rating as RatingValue;
      counts.set(rating, (counts.get(rating) ?? 0) + 1);
    }
  }

  return ([1, 2, 3, 4, 5] as RatingValue[]).map((rating) => ({
    rating,
    count: counts.get(rating) ?? 0,
  }));
}

function getTagDistributionFromRows(
  rows: ReturnType<typeof getYearEventRows>,
): StatsReport["tagDistribution"] {
  const map = new Map<
    string,
    {
      animeIds: Set<number>;
      eventCount: number;
      minutes: number;
    }
  >();

  for (const row of rows) {
    const tags = row.tags ?? [];
    if (tags.length === 0) continue;
    for (const tag of tags) {
      const entry =
        map.get(tag) ?? {
          animeIds: new Set<number>(),
          eventCount: 0,
          minutes: 0,
        };
      entry.animeIds.add(row.animeId);
      entry.eventCount += signedCount(row.action);
      entry.minutes += signedMinutes(row.action, row.minutes);
      map.set(tag, entry);
    }
  }

  return Array.from(map.entries())
    .map(([tag, entry]) => {
      const minutes = Math.max(0, entry.minutes);
      return {
        tag,
        animeCount: entry.animeIds.size,
        eventCount: Math.max(0, entry.eventCount),
        minutes,
        hours: roundHours(minutes),
      };
    })
    .filter((entry) => entry.minutes > 0 || entry.eventCount > 0)
    .sort(
      (a, b) =>
        b.minutes - a.minutes ||
        b.animeCount - a.animeCount ||
        a.tag.localeCompare(b.tag, "zh-Hans-CN"),
    )
    .slice(0, 8);
}

function buildOverview(
  rows: ReturnType<typeof getYearEventRows>,
  completedAnime: number,
): StatsReport["overview"] {
  let minutes = 0;
  let watchedEpisodes = 0;
  const dailyMinutes = new Map<string, number>();

  for (const row of rows) {
    const signed = signedMinutes(row.action, row.minutes);
    minutes += signed;
    watchedEpisodes += signedCount(row.action);

    const dayKey = new Date(eventTime(row.watchedAt)).toDateString();
    dailyMinutes.set(dayKey, (dailyMinutes.get(dayKey) ?? 0) + signed);
  }

  const safeMinutes = Math.max(0, minutes);
  const activeDays = Array.from(dailyMinutes.values()).filter(
    (value) => value > 0,
  ).length;

  return {
    totalHours: roundHours(safeMinutes),
    watchedEpisodes: Math.max(0, watchedEpisodes),
    completedAnime,
    activeDays,
    averageMinutesPerActiveDay:
      activeDays > 0 ? Math.round(safeMinutes / activeDays) : 0,
  };
}

function getCompletedTop(
  userId: string,
  year: number,
  topLimit: number,
): StatsReport["completedTop"] {
  const rows = getEventsUntilYearEnd(userId, year);
  if (rows.length === 0) return [];

  const animeIds = Array.from(new Set(rows.map((row) => row.animeId)));
  const knownEpisodeNumbers = getKnownEpisodeNumbers(animeIds);
  const start = startOfYear(year).getTime();
  const end = startOfNextYear(year).getTime();
  const state = new Map<
    number,
    {
      watched: Set<number>;
      completed: boolean;
      completedAt: Date | number | null;
      watchedMinutesInYear: number;
      meta: (typeof rows)[number];
    }
  >();

  for (const row of rows) {
    const current =
      state.get(row.animeId) ?? {
        watched: new Set<number>(),
        completed: false,
        completedAt: null,
        watchedMinutesInYear: 0,
        meta: row,
      };
    current.meta = row;

    const time = eventTime(row.watchedAt);
    if (time >= start && time < end) {
      current.watchedMinutesInYear += signedMinutes(row.action, row.minutes);
    }

    if (row.action === "watch") {
      current.watched.add(row.episode);
    } else {
      current.watched.delete(row.episode);
      current.completed = false;
    }

    const known = knownEpisodeNumbers.get(row.animeId);
    const completeByKnown =
      known != null &&
      known.size > 0 &&
      Array.from(known).every((episodeNumber) =>
        current.watched.has(episodeNumber),
      );
    const completeByTotal =
      (!known || known.size === 0) &&
      row.totalEpisodes != null &&
      row.totalEpisodes > 0 &&
      current.watched.size >= row.totalEpisodes;
    const isComplete = completeByKnown || completeByTotal;

    if (isComplete && !current.completed) {
      current.completed = true;
      current.completedAt = row.watchedAt;
    }

    state.set(row.animeId, current);
  }

  return Array.from(state.entries())
    .filter(([, entry]) => {
      if (entry.meta.watchStatus !== "completed") return false;
      if (!entry.completedAt) return false;
      const time = eventTime(entry.completedAt);
      return time >= start && time < end;
    })
    .map(([animeId, entry]) => {
      const minutes = Math.max(0, entry.watchedMinutesInYear);
      return {
        animeId,
        title: entry.meta.title,
        titleJa: entry.meta.titleJa,
        coverUrl: entry.meta.coverUrl,
        tags: entry.meta.tags ?? null,
        rating: entry.meta.rating,
        completedAt: toIso(entry.completedAt!),
        watchedEpisodes: entry.watched.size,
        watchedMinutes: minutes,
        watchedHours: roundHours(minutes),
      };
    })
    .sort(
      (a, b) =>
        b.watchedMinutes - a.watchedMinutes ||
        Date.parse(b.completedAt) - Date.parse(a.completedAt),
    )
    .slice(0, topLimit);
}

export function getStatsReport(
  userId: string,
  options: StatsReportOptions = {},
): StatsReport {
  const year = options.year ?? new Date().getFullYear();
  const topLimit = options.topLimit ?? 5;
  const rows = getYearEventRows(userId, year);
  const completedEntries = getCompletedTop(
    userId,
    year,
    Number.POSITIVE_INFINITY,
  );

  return {
    year,
    overview: buildOverview(rows, completedEntries.length),
    monthlyHours: getMonthlyWatchHoursFromRows(rows),
    tagDistribution: getTagDistributionFromRows(rows),
    ratingDistribution: getRatingDistribution(userId),
    completedTop: completedEntries.slice(0, topLimit),
  };
}
