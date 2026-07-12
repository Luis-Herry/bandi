import { NextResponse } from "next/server";
import { db } from "@/db";
import { anime, episodes, userAnime, watchEvents } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { buildWatchEventDrafts } from "@/lib/watch-events";
import {
  getCompletionEpisodeNumber,
  getWatchedThroughEpisodeNumber,
  resolveProgressWatchStatus,
} from "@/lib/watch-progress";
import type { WatchStatus } from "@/lib/watch-progress";
import { normalizeRatingInput } from "@/lib/rating";
import { validateEpisodeProgressBounds } from "@/lib/episode-progress-bounds";

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

  const body = (await req.json().catch(() => ({}))) as {
    watchStatus?: unknown;
    currentEpisode?: unknown;
    rating?: unknown;
    notes?: unknown;
  };
  const explicitStatus = isStatus(body.watchStatus) ? body.watchStatus : null;
  let nextEp: number | null = null;
  if (typeof body.currentEpisode === "number") {
    nextEp = Math.max(0, Math.floor(body.currentEpisode));
  }

  let episodeRows: Array<{ id: number; number: number }> = [];
  let completionEpisode: number | null = null;
  if (nextEp != null) {
    const a = db
      .select({
        mediaType: anime.mediaType,
        totalEpisodes: anime.totalEpisodes,
      })
      .from(anime)
      .where(eq(anime.id, animeId))
      .get();
    episodeRows = db
      .select({ id: episodes.id, number: episodes.number })
      .from(episodes)
      .where(eq(episodes.animeId, animeId))
      .all();
    completionEpisode = getCompletionEpisodeNumber({
      totalEpisodes: a?.totalEpisodes,
      episodeNumbers: episodeRows.map((row) => row.number),
    });
    const boundsError = validateEpisodeProgressBounds({
      mediaType: a?.mediaType,
      currentEpisode: nextEp,
      completionEpisode,
    });
    if (boundsError) {
      return NextResponse.json(
        { error: boundsError.error },
        { status: boundsError.status },
      );
    }
  }

  // 没有追踪行时按需创建：成人区 / 本地库可直接评分 + 影评，不强制先「想看」。
  // watchStatus 不可为空，缺省给 "watching"；成人区 UI 不显示状态、且 movie 不进
  // cinema 追更（只查 drama）、不进动漫统计（只查 anime），这个内部默认值不可见。
  let existing = db
    .select()
    .from(userAnime)
    .where(
      and(eq(userAnime.userId, user.id), eq(userAnime.animeId, animeId)),
    )
    .get();
  if (!existing) {
    existing = db
      .insert(userAnime)
      .values({
        userId: user.id,
        animeId,
        watchStatus: explicitStatus ?? "watching",
        currentEpisode: 0,
      })
      .returning()
      .get();
  }

  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (explicitStatus) updates.watchStatus = explicitStatus;
  if (nextEp != null) updates.currentEpisode = nextEp;
  if (body.rating === null) updates.rating = null;
  else if (typeof body.rating === "number") {
    const normalizedRating = normalizeRatingInput(body.rating);
    if (normalizedRating != null) updates.rating = normalizedRating;
  }
  if (body.notes === null) updates.notes = null;
  else if (typeof body.notes === "string") updates.notes = body.notes;

  let autoCompleted = false;
  let resolvedWatchStatus: WatchStatus | null = explicitStatus;
  if (nextEp != null && !explicitStatus) {
    resolvedWatchStatus = resolveProgressWatchStatus({
      currentStatus: existing.watchStatus as WatchStatus,
      currentEpisode: nextEp,
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
          if (episodeRows.length === 0) {
            episodeRows = db
              .select({ id: episodes.id, number: episodes.number })
              .from(episodes)
              .where(eq(episodes.animeId, animeId))
              .all();
          }
          const a = db
            .select({ totalEpisodes: anime.totalEpisodes })
            .from(anime)
            .where(eq(anime.id, animeId))
            .get();
          const completionEpisode = getCompletionEpisodeNumber({
            totalEpisodes: a?.totalEpisodes,
            episodeNumbers: episodeRows.map((row) => row.number),
          });
          const oldWatchedThrough = getWatchedThroughEpisodeNumber({
            currentEpisode: existing.currentEpisode,
            watchStatus: existing.watchStatus as WatchStatus,
            completionEpisode,
          });
          const newWatchedThrough = getWatchedThroughEpisodeNumber({
            currentEpisode: nextEp,
            watchStatus: resolvedWatchStatus ?? (existing.watchStatus as WatchStatus),
            completionEpisode,
          });
          const lower = Math.min(oldWatchedThrough, newWatchedThrough);
          const upper = Math.max(oldWatchedThrough, newWatchedThrough);
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
            oldEpisode: oldWatchedThrough,
            newEpisode: newWatchedThrough,
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
