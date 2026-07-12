/**
 * High-level anime queries used by API routes and pages. Hides Drizzle
 * details from callers so route handlers stay short.
 */

import { db } from "@/db";
import {
  anime,
  episodes,
  userAnime,
  type Anime,
  type Episode,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  subjectToAnimeRow,
  getSubject,
  getEpisodes,
  selectMainBangumiEpisodes,
} from "@/lib/bangumi";
import { dedupeEpisodesByNumber } from "@/lib/episode-normalize";

export function getAnimeById(id: number): Anime | undefined {
  return db.select().from(anime).where(eq(anime.id, id)).get();
}

export function getAnimeByBangumiId(bgmId: number): Anime | undefined {
  return db.select().from(anime).where(eq(anime.bangumiId, bgmId)).get();
}

export function listEpisodes(animeId: number): Episode[] {
  const rows = db
    .select()
    .from(episodes)
    .where(eq(episodes.animeId, animeId))
    .orderBy(episodes.number)
    .all();
  return dedupeEpisodesByNumber(rows);
}

export function getUserAnime(userId: string, animeId: number) {
  return db
    .select()
    .from(userAnime)
    .where(and(eq(userAnime.userId, userId), eq(userAnime.animeId, animeId)))
    .get();
}

/** Sync from Bangumi: upsert anime + episodes. Cache: skip if updatedAt < 2h. */
export async function syncFromBangumi(
  bangumiId: number,
): Promise<{ animeId: number; created: boolean } | null> {
  const existing = getAnimeByBangumiId(bangumiId);
  if (existing) {
    const updated = existing.updatedAt as Date | number;
    const updatedMs =
      updated instanceof Date ? updated.getTime() : Number(updated) * 1000;
    const ageMs = Date.now() - updatedMs;
    if (ageMs < 2 * 60 * 60 * 1000) {
      return { animeId: existing.id, created: false };
    }
  }

  // 两个 Bangumi 请求彼此独立。并发获取可把首次从搜索打开详情时的
  // 网络等待从两段串行延迟收敛为一段。
  const [subject, rawEpisodes] = await Promise.all([
    getSubject(bangumiId),
    getEpisodes(bangumiId, 200),
  ]);
  if (!subject) {
    // Bangumi miss: keep the local row as-is if it exists.
    return existing ? { animeId: existing.id, created: false } : null;
  }
  const row = subjectToAnimeRow(subject);

  let animeId: number;
  let created: boolean;
  if (existing) {
    db.update(anime)
      .set({
        title: row.title,
        titleJa: row.titleJa,
        coverUrl: row.coverUrl,
        synopsis: row.synopsis,
        totalEpisodes: row.totalEpisodes,
        year: row.year,
        tags: row.tags,
        updatedAt: new Date(),
      })
      .where(eq(anime.id, existing.id))
      .run();
    animeId = existing.id;
    created = false;
  } else {
    const inserted = db
      .insert(anime)
      .values({
        bangumiId: row.bangumiId,
        title: row.title,
        titleJa: row.titleJa,
        coverUrl: row.coverUrl,
        synopsis: row.synopsis,
        type: row.type,
        status: row.status,
        totalEpisodes: row.totalEpisodes,
        year: row.year,
        tags: row.tags,
      })
      .returning({ id: anime.id })
      .get();
    animeId = inserted.id;
    created = true;
  }

  // Episodes sync
  const eps = selectMainBangumiEpisodes(rawEpisodes);
  if (eps.length > 0) {
    db.delete(episodes).where(eq(episodes.animeId, animeId)).run();
    for (const e of eps) {
      db.insert(episodes)
        .values({
          animeId,
          number: e.sort,
          title: e.name_cn || e.name || null,
          airedAt: e.airdate ? new Date(e.airdate) : null,
        })
        .run();
    }
  }

  return { animeId, created };
}

/** Watching anime that aired today/yesterday — feeds the home "missed" rail. */
export function recentlyAiringForUser(userId: string) {
  return db.all<{
    animeId: number;
    title: string;
    coverUrl: string | null;
    latestNumber: number;
    latestAired: number;
    currentEpisode: number;
  }>(sql`
    SELECT a.id as animeId, a.title as title, a.cover_url as coverUrl,
           e.number as latestNumber, e.aired_at as latestAired,
           ua.current_episode as currentEpisode
    FROM anime a
    INNER JOIN user_anime ua ON ua.anime_id = a.id
    INNER JOIN episodes e ON e.anime_id = a.id
    WHERE ua.user_id = ${userId}
      AND ua.watch_status = 'watching'
      AND e.aired_at IS NOT NULL
      AND e.aired_at <= unixepoch()
    GROUP BY a.id
    HAVING e.aired_at = MAX(e.aired_at)
    ORDER BY e.aired_at DESC
    LIMIT 12
  `);
}
