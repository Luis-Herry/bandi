import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  anime,
  episodes,
  playbackProgress,
  userAnime,
  watchEvents,
} from "@/db/schema";
import {
  getPlaybackCompletionState,
  getPreferredPlaybackEpisode,
} from "@/lib/player";
import { requireUser } from "@/lib/session";
import { buildWatchEventDrafts } from "@/lib/watch-events";
import {
  getCompletionEpisodeNumber,
  resolveCompletedPlaybackProgress,
  type WatchStatus,
} from "@/lib/watch-progress";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ProgressBody {
  animeId?: unknown;
  episode?: unknown;
  positionSeconds?: unknown;
  durationSeconds?: unknown;
}

export async function GET(req: Request) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  const animeId = Number(url.searchParams.get("animeId"));
  const episodeNumber = Number(url.searchParams.get("episode"));
  if (!Number.isFinite(animeId) || !Number.isFinite(episodeNumber)) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const ep = getPreferredPlaybackEpisode(
    animeId,
    Math.floor(episodeNumber),
  );
  if (!ep) return NextResponse.json({ progress: null });

  const progress = db
    .select()
    .from(playbackProgress)
    .where(
      and(
        eq(playbackProgress.userId, user.id),
        eq(playbackProgress.animeId, animeId),
        eq(playbackProgress.episodeId, ep.id),
      ),
    )
    .get();

  return NextResponse.json({
    progress: progress
      ? {
          positionSeconds: progress.positionSeconds,
          durationSeconds: progress.durationSeconds,
          completed: progress.completed,
          lastPlayedAt: progress.lastPlayedAt.toISOString(),
        }
      : null,
  });
}

export async function PATCH(req: Request) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  const body = (await req.json().catch(() => ({}))) as ProgressBody;
  const animeId = Number(body.animeId);
  const episodeNumber = Math.floor(Number(body.episode));
  const positionSeconds = Math.max(0, Math.floor(Number(body.positionSeconds)));
  const durationSeconds = Math.max(0, Math.floor(Number(body.durationSeconds)));

  if (
    !Number.isFinite(animeId) ||
    !Number.isFinite(episodeNumber) ||
    episodeNumber <= 0 ||
    !Number.isFinite(positionSeconds) ||
    !Number.isFinite(durationSeconds)
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const existing = db
    .select()
    .from(userAnime)
    .where(and(eq(userAnime.userId, user.id), eq(userAnime.animeId, animeId)))
    .get();

  const ep = getPreferredPlaybackEpisode(animeId, episodeNumber);
  if (!ep) {
    return NextResponse.json({ error: "episode_not_found" }, { status: 404 });
  }

  const completion = getPlaybackCompletionState({
    positionSeconds,
    durationSeconds,
  });
  const now = new Date();
  db.insert(playbackProgress)
    .values({
      userId: user.id,
      animeId,
      episodeId: ep.id,
      episodeNumber: ep.number,
      positionSeconds,
      durationSeconds,
      completed: completion.completed,
      lastPlayedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        playbackProgress.userId,
        playbackProgress.animeId,
        playbackProgress.episodeId,
      ],
      set: {
        episodeNumber: ep.number,
        positionSeconds,
        durationSeconds,
        completed: completion.completed,
        lastPlayedAt: sql`(unixepoch())`,
        updatedAt: sql`(unixepoch())`,
      },
    })
    .run();

  if (!existing) {
    return NextResponse.json({
      ok: true,
      completed: completion.completed,
      progressRatio: completion.progressRatio,
      currentEpisode: null,
      watchStatus: null,
      autoCompleted: false,
    });
  }

  let currentEpisode = existing.currentEpisode;
  let watchStatus = existing.watchStatus as WatchStatus;
  let autoCompleted = false;
  const hasStartedPlayback = positionSeconds > 0 && durationSeconds > 0;
  const shouldMarkStarted =
    hasStartedPlayback &&
    watchStatus !== "dropped" &&
    watchStatus !== "completed" &&
    watchStatus !== "watching";

  if (shouldMarkStarted) {
    watchStatus = "watching";
  }

  if (completion.completed) {
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
    const nextProgress = resolveCompletedPlaybackProgress({
      currentEpisode,
      currentStatus: watchStatus,
      completedEpisode: ep.number,
      completionEpisode,
    });

    if (!nextProgress.advanced) {
      if (shouldMarkStarted) {
        db.update(userAnime)
          .set({
            currentEpisode,
            watchStatus,
            updatedAt: now,
          })
          .where(eq(userAnime.id, existing.id))
          .run();
      }
      return NextResponse.json({
        ok: true,
        completed: completion.completed,
        progressRatio: completion.progressRatio,
        currentEpisode,
        watchStatus,
        autoCompleted,
      });
    }

    currentEpisode = nextProgress.currentEpisode;
    watchStatus = nextProgress.watchStatus;
    autoCompleted =
      watchStatus === "completed" && existing.watchStatus !== "completed";

    const episodeIdsByNumber = new Map<number, number>();
    const knownEpisodeNumbers: number[] = [];
    for (const row of episodeRows) {
      if (
        row.number <= nextProgress.previousWatchedThrough ||
        row.number > nextProgress.watchedThroughEpisode
      ) {
        continue;
      }
      episodeIdsByNumber.set(row.number, row.id);
      knownEpisodeNumbers.push(row.number);
    }

    const eventDrafts = buildWatchEventDrafts({
      userId: user.id,
      animeId,
      oldEpisode: nextProgress.previousWatchedThrough,
      newEpisode: nextProgress.watchedThroughEpisode,
      watchedAt: now,
      episodeIdsByNumber,
      knownEpisodeNumbers,
      minutes: Math.max(1, Math.round(durationSeconds / 60)),
    });

    db.transaction((tx) => {
      if (eventDrafts.length > 0) {
        tx.insert(watchEvents).values(eventDrafts).run();
      }
      tx.update(userAnime)
        .set({
          currentEpisode,
          watchStatus,
          updatedAt: now,
        })
        .where(eq(userAnime.id, existing.id))
        .run();
    });
  }

  if (!completion.completed && shouldMarkStarted) {
    db.update(userAnime)
      .set({
        currentEpisode,
        watchStatus,
        updatedAt: now,
      })
      .where(eq(userAnime.id, existing.id))
      .run();
  }

  return NextResponse.json({
    ok: true,
    completed: completion.completed,
    progressRatio: completion.progressRatio,
    currentEpisode,
    watchStatus,
    autoCompleted,
  });
}
