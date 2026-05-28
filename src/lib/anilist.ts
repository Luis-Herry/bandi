/**
 * AniList GraphQL client. Only used as a fallback when Bangumi can't find a
 * subject (censored / regional / very new). Title translation strategy:
 *  1. AniList returns Japanese romaji + native (kanji/kana)
 *  2. Take `native` (Japanese) → re-query Bangumi for cn name
 *  3. If still no hit: keep Japanese, mark tag `needs_translation`
 */

const ENDPOINT = "https://graphql.anilist.co";

export interface AniMedia {
  id: number;
  title: {
    romaji: string;
    native: string;
    english: string | null;
  };
  episodes: number | null;
  seasonYear: number | null;
  season: "WINTER" | "SPRING" | "SUMMER" | "FALL" | null;
  coverImage: { extraLarge: string | null; large: string | null };
  description: string | null;
  status: string | null;
  format: string | null;
}

const QUERY = /* GraphQL */ `
  query ($search: String!) {
    Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      title { romaji native english }
      episodes
      seasonYear
      season
      coverImage { extraLarge large }
      description(asHtml: false)
      status
      format
    }
  }
`;

export async function getMediaByRomajiTitle(
  search: string,
  options: { revalidate?: number } = {},
): Promise<AniMedia | null> {
  if (!search.trim()) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: QUERY, variables: { search } }),
      signal: AbortSignal.timeout(15_000),
      next:
        typeof options.revalidate === "number"
          ? { revalidate: options.revalidate }
          : undefined,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { Media?: AniMedia | null } };
    return json.data?.Media ?? null;
  } catch {
    return null;
  }
}

/* ─────────── seasonal browse ─────────── */

export type AniSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

const SEASON_QUERY = /* GraphQL */ `
  query ($season: MediaSeason!, $seasonYear: Int!, $perPage: Int!) {
    Page(page: 1, perPage: $perPage) {
      media(
        season: $season
        seasonYear: $seasonYear
        type: ANIME
        format_in: [TV, TV_SHORT, MOVIE, OVA, ONA, SPECIAL]
        sort: POPULARITY_DESC
      ) {
        id
        title { romaji native english }
        episodes
        seasonYear
        season
        coverImage { extraLarge large }
        description(asHtml: false)
        status
        format
        averageScore
        popularity
        genres
        startDate { year month day }
      }
    }
  }
`;

export interface AniSeasonalMedia {
  id: number;
  title: { romaji: string; native: string; english: string | null };
  episodes: number | null;
  seasonYear: number | null;
  season: AniSeason | null;
  coverImage: { extraLarge: string | null; large: string | null };
  description: string | null;
  status: string | null;
  format: string | null;
  averageScore: number | null;
  popularity: number | null;
  genres: string[];
  startDate: { year: number | null; month: number | null; day: number | null } | null;
}

/**
 * 按季度从 AniList 拉番剧列表（按热度倒序），用于"番剧库"浏览页。
 * 同步到本地时再用 native 标题去 Bangumi 匹配，故此处不需要 Bangumi ID。
 */
export async function getMediaBySeason(
  season: AniSeason,
  seasonYear: number,
  perPage = 50,
): Promise<AniSeasonalMedia[]> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: SEASON_QUERY,
        variables: { season, seasonYear, perPage },
      }),
      signal: AbortSignal.timeout(15_000),
      next: { revalidate: 60 * 60 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { Page?: { media?: AniSeasonalMedia[] } };
    };
    return json.data?.Page?.media ?? [];
  } catch {
    return [];
  }
}

/** 由 (年, 月) 得到 AniList 的 (season, year)，月份从 1 开始。 */
export function monthToSeason(year: number, month: number): {
  season: AniSeason;
  year: number;
} {
  if (month <= 3) return { season: "WINTER", year };
  if (month <= 6) return { season: "SPRING", year };
  if (month <= 9) return { season: "SUMMER", year };
  return { season: "FALL", year };
}

/** 当前季度的 (season, year)。 */
export function currentSeason(now: Date = new Date()) {
  return monthToSeason(now.getFullYear(), now.getMonth() + 1);
}

/** 相对当前季度的偏移（-4 = 一年前同季，-1 = 上季，0 = 本季，1 = 下季）。 */
export function shiftSeason(
  ref: { season: AniSeason; year: number },
  delta: number,
): { season: AniSeason; year: number } {
  const order: AniSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const idx = order.indexOf(ref.season) + delta;
  const yearDelta = Math.floor(idx / 4);
  const newIdx = ((idx % 4) + 4) % 4;
  return { season: order[newIdx], year: ref.year + yearDelta };
}
