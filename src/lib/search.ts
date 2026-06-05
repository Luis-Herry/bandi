/**
 * Search aggregation: local SQLite first, Bangumi fallback when local
 * returns fewer than `localMin` hits. Hits from Bangumi carry a `source`
 * flag so the client can mark them as "not yet in library".
 */

import { db } from "@/db";
import { anime as animeTable } from "@/db/schema";
import { or, like, sql } from "drizzle-orm";
import { searchSubjects, type BgmSearchHit } from "@/lib/bangumi";
import { selectBangumiImageByRole } from "@/lib/bangumi-image";

export interface SearchHit {
  source: "local" | "bangumi";
  id: number | null; // local anime.id when source=local; null otherwise
  bangumiId: number | null;
  title: string;
  titleJa: string | null;
  year: number | null;
  coverUrl: string | null;
  inLibrary?: boolean; // set in route handler when caller has a userId
}

const LOCAL_LIMIT = 8;
const LOCAL_MIN_BEFORE_FALLBACK = 5;

export async function searchAnime(q: string): Promise<SearchHit[]> {
  const query = q.trim();
  if (!query) return [];

  const pattern = `%${query}%`;
  const local = await db
    .select({
      id: animeTable.id,
      bangumiId: animeTable.bangumiId,
      title: animeTable.title,
      titleJa: animeTable.titleJa,
      year: animeTable.year,
      coverUrl: animeTable.coverUrl,
    })
    .from(animeTable)
    .where(or(like(animeTable.title, pattern), like(animeTable.titleJa, pattern)))
    .limit(LOCAL_LIMIT)
    .all();

  const localHits: SearchHit[] = local.map((row) => ({
    source: "local",
    id: row.id,
    bangumiId: row.bangumiId,
    title: row.title,
    titleJa: row.titleJa,
    year: row.year,
    coverUrl: row.coverUrl,
  }));

  if (localHits.length >= LOCAL_MIN_BEFORE_FALLBACK) {
    return localHits;
  }

  const remote = await searchSubjects(query, 10);
  const knownBgmIds = new Set(
    local.map((r) => r.bangumiId).filter((x): x is number => x != null),
  );
  const remoteHits: SearchHit[] = remote
    .filter((r: BgmSearchHit) => !knownBgmIds.has(r.id))
    .map((r) => ({
      source: "bangumi",
      id: null,
      bangumiId: r.id,
      title: r.name_cn || r.name,
      titleJa: r.name,
      year:
        r.date && /^\d{4}/.test(r.date)
          ? parseInt(r.date.slice(0, 4), 10)
          : null,
      coverUrl: selectBangumiImageByRole(r.images, "thumb"),
    }));

  return [...localHits, ...remoteHits];
}

/** Mark which hits the user already has in their library. */
export async function annotateInLibrary(
  hits: SearchHit[],
  userId: string,
): Promise<SearchHit[]> {
  if (hits.length === 0) return hits;
  const localIds = hits
    .map((h) => h.id)
    .filter((x): x is number => x != null);
  if (localIds.length === 0) return hits;

  const rows = await db.all<{ anime_id: number }>(sql`
    select anime_id from user_anime
    where user_id = ${userId}
      and anime_id in (${sql.join(localIds, sql`, `)})
  `);
  const owned = new Set(rows.map((r) => r.anime_id));
  return hits.map((h) =>
    h.id != null ? { ...h, inLibrary: owned.has(h.id) } : h,
  );
}
