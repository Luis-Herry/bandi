import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  getAdultLibrary,
  getCinemaContinueWatching,
  getCinemaLibrary,
  getCinemaMissedUpdates,
  getCinemaTodayUpdates,
  getCinemaUpcomingEpisodes,
} from "@/lib/db-helpers/cinema";
import { CinemaClient } from "./CinemaClient";
import type {
  CinemaContinueView,
  CinemaMissedUpdateView,
  CinemaUpdateView,
} from "@/components/features/CinemaFollowUpSection";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmtTime(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${pad(m)}:${pad(sec)}`;
}

export const dynamic = "force-dynamic";

export const metadata = {
  title: "影视",
};

export default async function CinemaPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; genre?: string; kind?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = (await searchParams) ?? {};
  const { drama, movie } = getCinemaLibrary(user.id);
  const { jav, ova } = getAdultLibrary(user.id);
  const todayUpdates = getCinemaTodayUpdates(user.id).map(
    (item): CinemaUpdateView => ({
      key: `${item.anime.id}-${item.episode.id}`,
      animeId: item.anime.id,
      title: item.anime.title,
      titleJa: item.anime.titleJa,
      coverUrl: item.anime.coverUrl,
      totalEpisodes: item.anime.totalEpisodes,
      episodeNumber: item.episode.number,
      watched: item.watched,
      isDownloaded: item.episode.isDownloaded,
      providerLabel: item.providerLabel,
      airedAt: item.episode.airedAt ? item.episode.airedAt.toISOString() : null,
    }),
  );
  const upcomingItems = getCinemaUpcomingEpisodes(user.id, 7).map(
    (item): CinemaUpdateView => ({
      key: `${item.anime.id}-${item.episode.id}`,
      animeId: item.anime.id,
      title: item.anime.title,
      titleJa: item.anime.titleJa,
      coverUrl: item.anime.coverUrl,
      totalEpisodes: item.anime.totalEpisodes,
      episodeNumber: item.episode.number,
      isDownloaded: item.episode.isDownloaded,
      providerLabel: item.providerLabel,
      airedAt: item.episode.airedAt ? item.episode.airedAt.toISOString() : null,
    }),
  );
  const missedItems = getCinemaMissedUpdates(user.id, 4).map(
    (item): CinemaMissedUpdateView => ({
      animeId: item.anime.id,
      title: item.anime.title,
      coverUrl: item.anime.coverUrl,
      providerLabel: item.providerLabel,
      missedCount: item.missedCount,
      nextMissedEpisode: item.nextMissedEpisode,
      nextMissedEpisodeIsDownloaded: item.nextMissedEpisodeIsDownloaded,
      latestAiredEpisode: item.latestAiredEpisode,
      latestEpisodeIsDownloaded: item.latestEpisodeIsDownloaded,
      daysSince: item.daysSince,
    }),
  );
  const continueItems = getCinemaContinueWatching(user.id, 4).map(
    (it): CinemaContinueView => {
      const hasPlayback =
        it.playbackEpisodeNumber != null &&
        it.playbackPositionSeconds != null &&
        it.playbackDurationSeconds != null &&
        it.playbackDurationSeconds > 0;
      const progress = hasPlayback
        ? Math.min(
            1,
            Math.max(0, it.playbackPositionSeconds! / it.playbackDurationSeconds!),
          )
        : it.airedCount > 0
          ? it.watchedAiredCount / it.airedCount
          : null;
      const cur = it.userAnime.currentEpisode;
      const curLabel = cur > 0 ? `当前 EP.${pad(cur)}` : "未开始";
      const meta = hasPlayback
        ? `上次 EP.${pad(it.playbackEpisodeNumber!)} · ${fmtTime(it.playbackPositionSeconds!)} / ${fmtTime(it.playbackDurationSeconds!)}`
        : it.airedCount > 0
          ? `已看 ${it.watchedAiredCount} / 已播 ${it.airedCount} · ${curLabel}`
          : curLabel;
      const playEp = it.playbackEpisodeNumber ?? (cur > 0 ? cur : 1);
      return {
        animeId: it.anime.id,
        title: it.anime.title,
        coverUrl: it.anime.coverUrl,
        meta,
        progress,
        episodeNumber: playEp,
        isDownloaded: it.nextEpisodeIsDownloaded,
        providerLabel: it.providerLabel,
      };
    },
  );

  return (
    <CinemaClient
      drama={drama}
      movie={movie}
      jav={jav}
      ova={ova}
      initialTab={sp.tab}
      initialGenre={sp.genre}
      initialKind={sp.kind}
      todayUpdates={todayUpdates}
      upcomingItems={upcomingItems}
      continueItems={continueItems}
      missedItems={missedItems}
    />
  );
}
