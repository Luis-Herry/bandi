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

const WATCH_STATUSES = [
  "watching",
  "planning",
  "completed",
  "onhold",
  "dropped",
] as const;

function isStatus(v: unknown): v is WatchStatus {
  return typeof v === "string" && (WATCH_STATUSES as readonly string[]).includes(v);
}

/**
 * PATCH /api/library/[id]
 * id = anime.id（业务侧自然主键；user_anime 行内部解析）
 * body: partial { watchStatus, currentEpisode, rating, notes }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  const { id } = await params;
  const animeId = Number(id);
  if (!Number.isFinite(animeId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const existing = db
    .select()
    .from(userAnime)
    .where(
      and(eq(userAnime.userId, user.id), eq(userAnime.animeId, animeId)),
    )
    .get();
  if (!existing) {
    return NextResponse.json({ error: "not in library" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    watchStatus?: unknown;
    currentEpisode?: unknown;
    rating?: unknown;
    notes?: unknown;
  };

  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };
  const explicitStatus = isStatus(body.watchStatus) ? body.watchStatus : null;
  if (explicitStatus) updates.watchStatus = explicitStatus;
  let nextEp: number | null = null;
  if (typeof body.currentEpisode === "number") {
    nextEp = Math.max(0, Math.floor(body.currentEpisode));
    updates.currentEpisode = nextEp;
  }
  if (body.rating === null) updates.rating = null;
  else if (typeof body.rating === "number")
    updates.rating = Math.max(1, Math.min(5, Math.floor(body.rating)));
  if (body.notes === null) updates.notes = null;
  else if (typeof body.notes === "string") updates.notes = body.notes;

  let autoCompleted = false;
  let resolvedWatchStatus: WatchStatus | null = explicitStatus;
  let episodeRows: Array<{ id: number; number: number }> = [];
  if (nextEp != null && !explicitStatus) {
    const a = db
      .select({ totalEpisodes: anime.totalEpisodes })
      .from(anime)
      .where(eq(anime.id, animeId))
      .get();
    episodeRows = db
      .select({ id: episodes.id, number: episodes.number })
      .from(episodes)
      .where(eq(episodes.animeId, animeId))
      .all();
    const completionEpisode = getCompletionEpisodeNumber({
      totalEpisodes: a?.totalEpisodes,
      episodeNumbers: episodeRows.map((row) => row.number),
    });
    resolvedWatchStatus = resolveProgressWatchStatus({
      currentStatus: existing.watchStatus as WatchStatus,
      nextEpisode: nextEp,
      completionEpisode,
    });
    updates.watchStatus = resolvedWatchStatus;
    autoCompleted =
      resolvedWatchStatus === "completed" &&
      existing.watchStatus !== "completed";
  }

  const eventDrafts =
    nextEp == null
      ? []
      : (() => {
          const lower = Math.min(existing.currentEpisode, nextEp);
          const upper = Math.max(existing.currentEpisode, nextEp);
          if (episodeRows.length === 0) {
            episodeRows = db
              .select({ id: episodes.id, number: episodes.number })
              .from(episodes)
              .where(eq(episodes.animeId, animeId))
              .all();
          }
          const episodeIdsByNumber = new Map<number, number>();
          const knownEpisodeNumbers: number[] = [];
          if (upper > lower) {
            for (const row of episodeRows) {
              if (row.number <= lower || row.number > upper) continue;
              episodeIdsByNumber.set(row.number, row.id);
              knownEpisodeNumbers.push(row.number);
            }
          }
          return buildWatchEventDrafts({
            userId: user.id,
            animeId,
            oldEpisode: existing.currentEpisode,
            newEpisode: nextEp,
            watchedAt: now,
            episodeIdsByNumber,
            knownEpisodeNumbers,
          });
        })();

  db.transaction((tx) => {
    if (eventDrafts.length > 0) {
      tx.insert(watchEvents).values(eventDrafts).run();
    }
    tx.update(userAnime).set(updates).where(eq(userAnime.id, existing.id)).run();
  });

  return NextResponse.json({
    ok: true,
    autoCompleted,
    watchStatus:
      resolvedWatchStatus ?? (updates.watchStatus as WatchStatus | undefined),
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  const { id } = await params;
  const animeId = Number(id);
  if (!Number.isFinite(animeId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  db.delete(userAnime)
    .where(
      and(eq(userAnime.userId, user.id), eq(userAnime.animeId, animeId)),
    )
    .run();
  return NextResponse.json({ ok: true });
}
