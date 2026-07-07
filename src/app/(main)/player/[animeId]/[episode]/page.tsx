import { redirect, notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  anime,
  downloadQueue,
  episodes,
  playbackProgress,
  userAnime,
} from "@/db/schema";
import { buildPlayerEpisodeNavigation } from "@/lib/player";
import { getCurrentUser } from "@/lib/session";
import {
  getCompletionEpisodeNumber,
  getWatchedThroughEpisodeNumber,
  type WatchStatus,
} from "@/lib/watch-progress";
import { PlayerClient } from "./PlayerClient";

interface PageProps {
  params: Promise<{
    animeId: string;
    episode: string;
  }>;
  searchParams?: Promise<{
    autoplay?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { animeId: animeIdRaw, episode: episodeRaw } = await params;
  const animeId = Number(animeIdRaw);
  const episodeNumber = Math.floor(Number(episodeRaw));
  if (!Number.isFinite(animeId) || !Number.isFinite(episodeNumber)) {
    notFound();
  }

  // userAnime 用 LEFT JOIN：本地库 / 成人区的内容多半没被「想看」追踪过（userAnime 行不存在），
  // 但有本地文件就该能播（不要求先追踪）。INNER JOIN 会让这些未追踪内容 404。
  const row = db
    .select({
      anime,
      episode: episodes,
      userAnime,
    })
    .from(episodes)
    .innerJoin(anime, eq(episodes.animeId, anime.id))
    .leftJoin(
      userAnime,
      and(eq(userAnime.animeId, anime.id), eq(userAnime.userId, user.id)),
    )
    .where(and(eq(anime.id, animeId), eq(episodes.number, episodeNumber)))
    .get();

  if (!row) notFound();
  const currentEpisode = row.userAnime?.currentEpisode ?? 0;

  const progress = db
    .select()
    .from(playbackProgress)
    .where(
      and(
        eq(playbackProgress.userId, user.id),
        eq(playbackProgress.animeId, animeId),
        eq(playbackProgress.episodeId, row.episode.id),
      ),
    )
    .get();

  const episodeRows = db
    .select({
      id: episodes.id,
      number: episodes.number,
      title: episodes.title,
      airedAt: episodes.airedAt,
    })
    .from(episodes)
    .where(eq(episodes.animeId, animeId))
    .orderBy(asc(episodes.number))
    .all();

  const progressRows = db
    .select({
      episodeId: playbackProgress.episodeId,
      positionSeconds: playbackProgress.positionSeconds,
      durationSeconds: playbackProgress.durationSeconds,
      completed: playbackProgress.completed,
    })
    .from(playbackProgress)
    .where(
      and(
        eq(playbackProgress.userId, user.id),
        eq(playbackProgress.animeId, animeId),
      ),
    )
    .all();
  const progressByEpisodeId = new Map(
    progressRows
      .filter((item) => item.episodeId != null)
      .map((item) => [item.episodeId as number, item]),
  );
  const completionEpisode = getCompletionEpisodeNumber({
    totalEpisodes: row.anime.totalEpisodes,
    episodeNumbers: episodeRows.map((episode) => episode.number),
  });
  const watchedThroughEpisode = row.userAnime
    ? getWatchedThroughEpisodeNumber({
        currentEpisode,
        watchStatus: row.userAnime.watchStatus as WatchStatus,
        completionEpisode,
      })
    : 0;

  const completedDownloads = db
    .select({ episodeId: downloadQueue.episodeId })
    .from(downloadQueue)
    .where(
      and(
        eq(downloadQueue.animeId, animeId),
        eq(downloadQueue.status, "completed"),
      ),
    )
    .all();
  const playableEpisodeIds = new Set(
    completedDownloads
      .map((item) => item.episodeId)
      .filter((id): id is number => typeof id === "number"),
  );

  const playerEpisodes = episodeRows.map((episode) => {
    const playback = progressByEpisodeId.get(episode.id);
    return {
      id: episode.id,
      number: episode.number,
      title: episode.title,
      isPlayable: playableEpisodeIds.has(episode.id),
      isWatched: episode.number <= watchedThroughEpisode,
      isTrackingCurrent:
        row.userAnime?.watchStatus !== "completed" &&
        episode.number === currentEpisode &&
        episode.number > watchedThroughEpisode,
      playbackPositionSeconds: playback?.positionSeconds ?? 0,
      playbackDurationSeconds: playback?.durationSeconds ?? 0,
      playbackCompleted: playback?.completed ?? false,
    };
  });
  const navigation = buildPlayerEpisodeNavigation(
    playerEpisodes.map((episode) => ({
      number: episode.number,
      isPlayable: episode.isPlayable,
    })),
    episodeNumber,
  );
  const resolvedSearchParams = await searchParams;

  return (
    <PlayerClient
      animeId={animeId}
      episodeNumber={episodeNumber}
      mediaType={row.anime.mediaType}
      animeTitle={row.anime.title}
      episodeTitle={row.episode.title}
      coverUrl={row.anime.coverUrl}
      initialPositionSeconds={progress?.positionSeconds ?? 0}
      initialDurationSeconds={progress?.durationSeconds ?? 0}
      initialCompleted={progress?.completed ?? false}
      playerEpisodes={playerEpisodes}
      previousPlayableEpisode={navigation.previousPlayableEpisode}
      nextPlayableEpisode={navigation.nextPlayableEpisode}
      autoPlayOnReady={resolvedSearchParams?.autoplay === "1"}
    />
  );
}
