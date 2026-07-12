import type { CSSProperties } from "react";
import { ExternalLink, Star } from "lucide-react";
import { GlassPanel, Tag } from "@/components/ui";
import { BackButton } from "@/components/features/BackButton";
import { AnimeCover } from "@/components/features/AnimeCover";
import { CinemaEpisodeList } from "@/components/features/CinemaEpisodeList";
import { CinemaDetailEnrichButton } from "@/components/features/CinemaDetailEnrichButton";
import { CinemaWatchControl } from "@/components/features/CinemaWatchControl";
import { EpisodeProgressControl } from "@/components/features/EpisodeProgressControl";
import { PlayButton } from "@/components/features/PlayButton";
import { RatingNotes } from "@/components/features/RatingNotes";
import { deriveAnimeVisualVars } from "@/lib/anime-visuals";
import { normalizeWatchProviders } from "@/db/schema";
import type { AnimeDetail } from "@/lib/db-helpers/library";
import type { CinemaWatchStatus } from "@/lib/db-helpers/cinema";
import {
  getCompletionEpisodeNumber,
  getWatchedThroughEpisodeNumber,
  type WatchStatus,
} from "@/lib/watch-progress";

/**
 * 影视（电视剧 / 电影）详情页。当前由 `/cinema/[id]` 承载。
 * 影视模板使用电影/剧集评分、正版观看入口和影视追踪控件。
 *
 * - 评分：豆瓣优先，回退 TMDB（10 分制，真实值）。
 * - 在哪看：国内（豆瓣 vendors，可点平台链接）/ 海外（TMDB watch-providers，整组跳 JustWatch）分组。
 * - 外链：豆瓣 / IMDb / TMDB。
 * - 追踪：影视专用 `CinemaWatchControl`（想看 / 在看…）。
 * - 播放：有本地自有片的集走与动漫共用的内置剧院播放器 `/player/[animeId]/[ep]`。
 */
const TYPE_LABEL: Record<string, string> = {
  drama: "电视剧",
  movie: "电影",
};

export function CinemaDetail({ detail }: { detail: AnimeDetail }) {
  const { anime, userAnime, episodes, completedDownloads } = detail;
  const visualVars = deriveAnimeVisualVars(anime.accentColor);
  const isMovie = anime.mediaType === "movie";
  // 成人区：不显示「想看/在看」追踪控件，评分 + 影评直接默认打开。
  const isAdult = anime.isAdult;
  // 剧集列表：电视剧显示；合并后的 OVA 系列虽是 movie 但有多集，也要显示剧集列表。
  const hasEpisodeSection = !isMovie || episodes.length > 1;

  const rating = anime.doubanRating ?? anime.tmdbRating ?? null;
  const ratingSource =
    anime.doubanRating != null
      ? "豆瓣"
      : anime.tmdbRating != null
        ? "TMDB"
        : null;

  const doubanUrl = anime.doubanId
    ? `https://movie.douban.com/subject/${anime.doubanId}/`
    : null;
  const imdbUrl = anime.imdbId
    ? `https://www.imdb.com/title/${anime.imdbId}/`
    : null;
  const tmdbUrl = anime.tmdbId
    ? `https://www.themoviedb.org/${isMovie ? "movie" : "tv"}/${anime.tmdbId}`
    : null;

  const lanes = normalizeWatchProviders(anime.watchProviders);
  const cnLane = lanes.find((l) => l.region === "CN");
  const overseasLanes = lanes.filter((l) => l.region !== "CN");
  const metadataAttempted = anime.doubanRatingFetchedAt != null;
  const needsMetadata =
    !metadataAttempted ||
    rating == null ||
    anime.year == null ||
    (!isMovie && episodes.length === 0);

  const watchedCount = userAnime?.currentEpisode ?? 0;
  const maxEpisodeNumber =
    episodes.length > 0
      ? Math.max(...episodes.map((episode) => episode.number))
      : anime.totalEpisodes;
  const canEditEpisodeProgress =
    maxEpisodeNumber != null && maxEpisodeNumber > 0;
  const episodeCountLabel =
    episodes.length === 0
      ? "暂无剧集数据"
      : anime.totalEpisodes != null && anime.totalEpisodes > episodes.length
        ? `已收录 ${episodes.length} / 共 ${anime.totalEpisodes} 集`
        : `${episodes.length} 集`;
  const completionEpisode = getCompletionEpisodeNumber({
    totalEpisodes: anime.totalEpisodes,
    episodeNumbers: episodes.map((episode) => episode.number),
  });
  const watchedThroughEpisode = userAnime
    ? getWatchedThroughEpisodeNumber({
        currentEpisode: watchedCount,
        watchStatus: userAnime.watchStatus as WatchStatus,
        completionEpisode,
      })
    : 0;
  const downloadedPlayableEpisodes = episodes
    .filter(
      (episode) =>
        episode.isDownloaded &&
        (!episode.airedAt || episode.airedAt.getTime() <= Date.now()),
    )
    .sort((a, b) => a.number - b.number);
  const detailContinueEpisode =
    hasEpisodeSection && completedDownloads > 0
      ? (downloadedPlayableEpisodes.find(
          (episode) => episode.number > watchedThroughEpisode,
        )?.number ?? null)
      : null;
  const moviePlayEpisode =
    isMovie && completedDownloads > 0
      ? (downloadedPlayableEpisodes[0]?.number ??
        episodes.find((episode) => episode.isDownloaded)?.number ??
        1)
      : null;
  const playEpisode = isMovie ? moviePlayEpisode : detailContinueEpisode;
  // 电影有本地文件就能播；电视剧只在还有未看的本地集时显示入口。
  // 「想看/在看」只服务公开影视库里的个人标记，不是本地文件播放前置。

  const externalLinks = [
    doubanUrl && { href: doubanUrl, label: "豆瓣" },
    imdbUrl && { href: imdbUrl, label: "IMDb" },
    tmdbUrl && { href: tmdbUrl, label: "TMDB" },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <div
      className="anime-detail-scope relative isolate"
      style={visualVars as CSSProperties}
    >
      {/* ========== Hero ========== */}
      <section className="relative min-h-[430px] w-full overflow-hidden sm:min-h-[460px] lg:h-[460px]">
        {anime.coverUrl && (
          <AnimeCover
            src={anime.coverUrl}
            alt={anime.title}
            ratio="auto"
            className="!absolute inset-0 z-0 h-full w-full"
            priority
            sizes="100vw"
            imageRole="hero"
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(10,10,11,0.95) 0%, rgba(10,10,11,0.75) 35%, rgba(10,10,11,0.15) 65%, rgba(10,10,11,0) 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-40"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,10,11,0) 0%, rgba(10,10,11,1) 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 25% 60%, rgb(var(--anime-accent-rgb) / var(--anime-halo-intensity)) 0%, transparent 55%)",
          }}
        />

        <div className="fixed left-4 top-20 z-40 sm:left-6 lg:left-8">
          <BackButton />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[430px] max-w-[1440px] flex-col justify-end px-4 pb-8 pt-20 sm:min-h-[460px] sm:px-6 sm:pb-10 lg:h-full lg:px-8 lg:pb-12 lg:pt-16">
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[color:var(--text-secondary)]">
            <span data-tabular>{anime.year ?? "—"}</span>
            <span>·</span>
            <span>{TYPE_LABEL[anime.mediaType] ?? "影视"}</span>
            {hasEpisodeSection && episodes.length > 0 && (
              <>
                <span>·</span>
                <span data-tabular>{episodeCountLabel}</span>
              </>
            )}
          </div>
          <h1
            className="max-w-[980px] text-[32px] font-extrabold leading-[1.08] tracking-[-0.025em] text-[color:var(--text-primary)] [overflow-wrap:anywhere] sm:text-[42px] lg:text-[56px] lg:tracking-[-0.03em]"
            style={{ textShadow: "0 4px 24px rgba(0,0,0,0.6)" }}
          >
            {anime.title}
          </h1>
          {anime.titleJa && anime.titleJa !== anime.title && (
            <p className="mt-1 max-w-[760px] text-[13px] text-[color:var(--text-secondary)] [overflow-wrap:anywhere] sm:text-[14px]">
              {anime.titleJa}
            </p>
          )}

          {rating != null && (
            <div className="mt-4 flex items-center gap-1.5">
              <Star
                size={16}
                className="text-[color:var(--accent)]"
                style={{ fill: "var(--accent)" }}
              />
              <span
                data-tabular
                className="text-[18px] font-semibold tracking-tight text-[color:var(--text-primary)]"
              >
                {rating.toFixed(1)}
              </span>
              <span className="text-[11px] text-[color:var(--text-muted)]">
                {ratingSource}
              </span>
            </div>
          )}

          {anime.tags && anime.tags.length > 0 && (
            <div className="mt-4 flex max-w-[640px] flex-wrap gap-1.5">
              {anime.tags.slice(0, 6).map((t) => (
                <Tag key={t} variant="outline">
                  {t}
                </Tag>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:gap-3">
            {playEpisode != null && (
              <PlayButton
                animeId={anime.id}
                episode={playEpisode}
                label={
                  isMovie
                    ? "播放"
                    : `${userAnime ? "继续观看" : "播放"} EP.${String(
                        playEpisode,
                      ).padStart(2, "0")}`
                }
                variant="primary"
                size="md"
                className="max-sm:w-full"
                buttonClassName="max-sm:w-full"
              />
            )}
            {!isAdult && (
              <CinemaWatchControl
                animeId={anime.id}
                initialStatus={
                  (userAnime?.watchStatus as CinemaWatchStatus) ?? null
                }
                size="md"
              />
            )}
            {externalLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] px-4 text-[13px] text-[color:var(--text-primary)] backdrop-blur-[12px] transition-colors hover:bg-[color:var(--bg-surface-hover)] max-sm:flex-[1_1_calc(50%-5px)]"
              >
                <ExternalLink size={15} />
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ========== Body ========== */}
      <section className="relative mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-12 lg:px-8">
        {/* 左主区 */}
        <div className="min-w-0 space-y-6 lg:col-span-8">
          {anime.synopsis && (
            <GlassPanel className="p-5">
              <h2 className="mb-3 text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                简介
              </h2>
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
                {anime.synopsis}
              </p>
            </GlassPanel>
          )}

          <GlassPanel className="p-5">
            <RatingNotes
              animeId={anime.id}
              initialRating={userAnime?.rating}
              initialNotes={userAnime?.notes}
              initialUpdatedAt={userAnime?.updatedAt?.toISOString()}
              disabled={!isAdult && !userAnime}
              title="我的评分 + 影评"
              eyebrow="影视记录"
              placeholder="写点观后感或影评..."
              disabledPlaceholder="标记想看或在看后可记录影评"
              savedToastTitle="影评已保存"
              errorToastTitle="影评保存失败"
            />
          </GlassPanel>

          {hasEpisodeSection && (
            <div>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[color:var(--text-primary)]">
                    剧集列表
                  </h2>
                  <span
                    data-tabular
                    className="text-[12px] text-[color:var(--text-muted)]"
                  >
                    {episodeCountLabel}
                  </span>
                </div>
                <EpisodeProgressControl
                  animeId={anime.id}
                  initialCurrent={watchedCount}
                  maxEpisode={maxEpisodeNumber}
                  enabled={canEditEpisodeProgress}
                  disabledLabel="同步剧集后可记录"
                />
              </div>
              {episodes.length > 0 ? (
                <CinemaEpisodeList
                  animeId={anime.id}
                  episodes={episodes}
                  currentEpisode={watchedCount}
                  watchStatus={userAnime?.watchStatus}
                />
              ) : (
                <GlassPanel className="p-6 text-center text-[13px] text-[color:var(--text-muted)]">
                  暂无剧集数据，补全资料后会尝试同步可用剧集
                </GlassPanel>
              )}
            </div>
          )}
        </div>

        {/* 右栏 */}
        <aside className="min-w-0 space-y-4 lg:col-span-4">
          <GlassPanel id="where-to-watch" className="p-5 scroll-mt-24">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                在哪看
              </h3>
              {needsMetadata && <CinemaDetailEnrichButton animeId={anime.id} />}
            </div>
            {lanes.length === 0 ? (
              <p className="text-[12px] text-[color:var(--text-muted)]">
                {metadataAttempted && anime.doubanId
                  ? "豆瓣当前未提供正版平台数据"
                  : "暂无在哪看数据，补全资料后会尝试查找"}
              </p>
            ) : (
              <div className="space-y-3">
                {cnLane && cnLane.providers.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-medium text-[color:var(--text-muted)]">
                      国内
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cnLane.providers.map((p) =>
                        p.url ? (
                          <a
                            key={p.providerId}
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-[color:var(--accent)]/35 bg-[color:var(--accent-subtle)] px-2 text-[12px] text-[color:var(--accent)] transition-colors hover:border-[color:var(--accent)]"
                          >
                            {p.providerName}
                            <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span
                            key={p.providerId}
                            className="inline-flex h-7 items-center rounded-[6px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] px-2 text-[12px] text-[color:var(--text-secondary)]"
                          >
                            {p.providerName}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                )}
                {overseasLanes.map((lane) => (
                  <div key={lane.region}>
                    <div className="mb-1.5 text-[11px] font-medium text-[color:var(--text-muted)]">
                      海外 · {lane.region}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {lane.providers.map((p) => (
                        <span
                          key={p.providerId}
                          className="inline-flex h-7 items-center rounded-[6px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] px-2 text-[12px] text-[color:var(--text-secondary)]"
                        >
                          {p.providerName}
                        </span>
                      ))}
                    </div>
                    {lane.link && (
                      <a
                        href={lane.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--accent)]"
                      >
                        在 JustWatch 查看
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>

          <GlassPanel className="p-5">
            <h3 className="mb-3 text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
              基本信息
            </h3>
            <dl className="space-y-2 text-[12px]">
              {[
                ["原名", anime.titleJa ?? "—"],
                ["类型", TYPE_LABEL[anime.mediaType] ?? "影视"],
                ["年份", anime.year ? String(anime.year) : "—"],
                [
                  "集数",
                  isMovie
                    ? "—"
                    : anime.totalEpisodes != null
                      ? `${anime.totalEpisodes} 集`
                      : episodes.length > 0
                        ? `${episodes.length} 集`
                        : "—",
                ],
                [
                  "豆瓣",
                  anime.doubanRating != null
                    ? anime.doubanRating.toFixed(1)
                    : "—",
                ],
                [
                  "TMDB",
                  anime.tmdbRating != null ? anime.tmdbRating.toFixed(1) : "—",
                ],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="shrink-0 text-[color:var(--text-muted)]">
                    {k}
                  </dt>
                  <dd className="truncate text-right text-[color:var(--text-primary)]">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </GlassPanel>
        </aside>
      </section>
    </div>
  );
}
