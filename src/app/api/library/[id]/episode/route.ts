import { NextResponse } from "next/server";
import { db } from "@/db";
import { anime, episodes, userAnime, watchEvents } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { buildWatchEventDrafts } from "@/lib/watch-events";
import {
  getCompletionEpisodeNumber,
  resolveProgressWatchStatus,
} from "@/lib/watch-progress";
import type { WatchStatus } from "@/lib/watch-progress";

export const dynamic = "force-dynamic";

/**
 * POST /api/library/[id]/episode
 * id = anime.id（业务侧自然主键；user_anime 行内部解析）
 * body: { episode: number, watched: boolean }
 *
 * Semantics:
 *   - currentEpisode is the absolute current/last watched episode number.
 *   - Diff writes watch/unwatch events for real episode rows in
 *     (old,new] or (new,old].
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  const { id } = await params;
  const animeId = Number(id);
  if (!Number.isFinite(animeId))
    return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    episode?: number;
    watched?: boolean;
  };
  const ep = Math.floor(Number(body.episode));
  const watched = !!body.watched;
  if (!Number.isFinite(ep) || ep < 0)
    return NextResponse.json({ error: "invalid episode" }, { status: 400 });

  const existing = db
    .select()
    .from(userAnime)
    .where(
      and(eq(userAnime.userId, user.id), eq(userAnime.animeId, animeId)),
    )
    .get();
  if (!existing)
    return NextResponse.json({ error: "not in library" }, { status: 404 });

  const next = watched
    ? Math.max(existing.currentEpisode, ep)
    : Math.max(0, Math.min(existing.currentEpisode, ep - 1));

  const a = db
    .select({ totalEpisodes: anime.totalEpisodes })
    .from(anime)
    .where(eq(anime.id, animeId))
    .get();
  const episodeRows = db
    .select({ id: episodes.id, number: episodes.number })
    .from(episodes)
    .where(eq(episodes.animeId, animeId))
    .all();
  const completionEpisode = getCompletionEpisodeNumber({
    totalEpisodes: a?.totalEpisodes,
    episodeNumbers: episodeRows.map((row) => row.number),
  });
  const finalStatus = resolveProgressWatchStatus({
    currentStatus: existing.watchStatus as WatchStatus,
    nextEpisode: next,
    completionEpisode,
  });
  const autoCompleted =
    finalStatus === "completed" && existing.watchStatus !== "completed";

  const now = new Date();
  const lower = Math.min(existing.currentEpisode, next);
  const upper = Math.max(existing.currentEpisode, next);
  const episodeIdsByNumber = new Map<number, number>();
  const knownEpisodeNumbers: number[] = [];
  if (upper > lower) {
    for (const row of episodeRows) {
      if (row.number <= lower || row.number > upper) continue;
      episodeIdsByNumber.set(row.number, row.id);
      knownEpisodeNumbers.push(row.number);
    }
  }

  const eventDrafts = buildWatchEventDrafts({
    userId: user.id,
    animeId,
    oldEpisode: existing.currentEpisode,
    newEpisode: next,
    watchedAt: now,
    episodeIdsByNumber,
    knownEpisodeNumbers,
  });

  db.transaction((tx) => {
    if (eventDrafts.length > 0) {
      tx.insert(watchEvents).values(eventDrafts).run();
    }
    tx.update(userAnime)
      .set({
        currentEpisode: next,
        watchStatus: finalStatus,
        updatedAt: now,
      })
      .where(eq(userAnime.id, existing.id))
      .run();
  });

  return NextResponse.json({
    currentEpisode: next,
    watchStatus: finalStatus,
    autoCompleted,
  });
}
