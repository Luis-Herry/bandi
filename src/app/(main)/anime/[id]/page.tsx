import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Calendar, Download, ExternalLink, Star } from "lucide-react";
import { GlassPanel, Tag } from "@/components/ui";
import { AnimeCreditsTabs } from "@/components/features/AnimeCreditsTabs";
import { AnimeSubscriptionButton } from "@/components/features/AnimeSubscriptionButton";
import { BackButton } from "@/components/features/BackButton";
import { EpisodeGrid } from "@/components/features/EpisodeGrid";
import { EpisodeProgressControl } from "@/components/features/EpisodeProgressControl";
import { PlayButton } from "@/components/features/PlayButton";
import { RatingNotes } from "@/components/features/RatingNotes";
import { RelatedResourcesPanel } from "@/components/features/RelatedResourcesPanel";
import { WatchStatusMenu } from "@/components/features/WatchStatusMenu";
import { deriveAnimeVisualVars } from "@/lib/anime-visuals";
import { getSubjectRelations } from "@/lib/bangumi";
import { selectRelatedResourceViews } from "@/lib/bangumi-relations";
import { getAnimeDetail } from "@/lib/db-helpers/library";
import { getCurrentUser } from "@/lib/session";
import {
  getCompletionEpisodeNumber,
  getWatchedThroughEpisodeNumber,
  type WatchStatus,
} from "@/lib/watch-progress";

interface PageProps {
  params: Promise<{ id: string }>;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const TYPE_LABEL: Record<string, string> = {
  TV: "TV 动画",
  Movie: "剧场版",
  OVA: "OVA",
  Web: "Web",
};
const STATUS_LABEL: Record<string, string> = {
  airing: "连载中",
  completed: "已完结",
  upcoming: "即将放送",
};
export const dynamic = "force-dynamic";

export default async function AnimeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const animeId = Number(id);
  if (!Number.isFinite(animeId)) notFound();

  const user = await getCurrentUser();
  if (!user) notFound();

  const detail = getAnimeDetail(animeId, user.id);
  if (!detail) notFound();

  // 影视条目交给 /cinema/[id] 承载，保持导航与操作语义一致。
  if (detail.anime.mediaType !== "anime") {
    redirect(`/cinema/${animeId}`);
  }

  const { anime, userAnime, episodes, completedDownloads, totalDownloads } =
    detail;
  const visualVars = deriveAnimeVisualVars(anime.accentColor);

  const watchedCount = userAnime?.currentEpisode ?? 0;
  const totalLabel = anime.totalEpisodes
    ? `共 ${anime.totalEpisodes} 集`
    : `共 ${episodes.length} 集`;
  // 最大集号（不是集数）— S2 番剧 episodes 可能是 13..24，这里要取 24 作上限
  const maxEpisodeNumber =
    episodes.length > 0
      ? Math.max(...episodes.map((e) => e.number))
      : anime.totalEpisodes ?? null;
  const completionEpisode = getCompletionEpisodeNumber({
    totalEpisodes: anime.totalEpisodes,
    episodeNumbers: episodes.map((e) => e.number),
  });
  const watchedThroughEpisode = userAnime
    ? getWatchedThroughEpisodeNumber({
        currentEpisode: watchedCount,
        watchStatus: userAnime.watchStatus as WatchStatus,
        completionEpisode,
      })
    : 0;
  const detailContinueEpisode =
    userAnime && completedDownloads > 0
      ? (episodes
          .filter(
            (e) =>
              e.airedAt &&
              e.airedAt.getTime() <= Date.now() &&
              e.number > watchedThroughEpisode &&
              e.isDownloaded,
          )
          .sort((a, b) => a.number - b.number)[0]?.number ?? null)
      : null;
  const nextAiring = episodes.find(
    (e) => e.airedAt && e.airedAt.getTime() > Date.now(),
  );
  const relatedResources = anime.bangumiId
    ? selectRelatedResourceViews(
        await getSubjectRelations(anime.bangumiId),
        anime.bangumiId,
      )
    : [];

  return (
    <div
      className="anime-detail-scope relative isolate"
      style={visualVars as CSSProperties}
    >
      {/* ========== Hero ========== */}
      <section className="relative min-h-[430px] w-full overflow-hidden sm:min-h-[460px] lg:h-[460px]">
        {anime.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={anime.coverUrl}
            alt={anime.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {/* 多层渐变遮罩，让左侧字够看 */}
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

        {/* 返回按钮：浮在封面左上角 */}
        <div className="fixed left-4 top-20 z-40 sm:left-6 lg:left-8">
          <BackButton />
        </div>

        <div className="relative mx-auto flex min-h-[430px] max-w-[1440px] flex-col justify-end px-4 pb-8 pt-20 sm:min-h-[460px] sm:px-6 sm:pb-10 lg:h-full lg:px-8 lg:pb-12 lg:pt-16">
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[color:var(--text-secondary)]">
            <span data-tabular>{anime.year ?? "—"}</span>
            <span>·</span>
            <span>{TYPE_LABEL[anime.type] ?? anime.type}</span>
            <span>·</span>
            <span>{STATUS_LABEL[anime.status] ?? anime.status}</span>
            {anime.airingDay !== null && anime.airingDay !== undefined && (
              <>
                <span>·</span>
                <span>
                  {WEEKDAYS[anime.airingDay]}更新
                  {anime.airingTime ? ` ${anime.airingTime}` : ""}
                </span>
              </>
            )}
          </div>
          <h1
            className="max-w-[980px] text-[32px] font-extrabold leading-[1.08] tracking-[-0.025em] text-[color:var(--text-primary)] [overflow-wrap:anywhere] sm:text-[42px] lg:text-[56px] lg:tracking-[-0.03em]"
            style={{ textShadow: "0 4px 24px rgba(0,0,0,0.6)" }}
          >
            {anime.title}
          </h1>
          {anime.titleJa && (
            <p className="mt-1 max-w-[760px] text-[13px] text-[color:var(--text-secondary)] [overflow-wrap:anywhere] sm:text-[14px]">
              {anime.titleJa}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1.5">
              <Star
                size={16}
                className="text-[color:var(--accent)]"
                style={{ fill: "var(--accent)" }}
              />
              <span
                data-tabular
                className="text-[18px] font-semibold tracking-tight text-[color:var(--text-primary)]"
              >
                9.2
              </span>
              <span className="text-[11px] text-[color:var(--text-muted)]">
                (1,287 评分)
              </span>
            </div>
            <span className="text-[12px] text-[color:var(--text-muted)]">
              {totalLabel}
              {userAnime && (
                <>
                  {" · "}
                  已看 {watchedThroughEpisode} 集
                </>
              )}
            </span>
          </div>

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
            {/* 继续观看：仅在已追番 + 下载队列有 completed 条目时显示。
                "纯查看详情"链路（userAnime 为 null）和"还没下完"场景都不显示。 */}
            {detailContinueEpisode != null && (() => {
              const playEp = detailContinueEpisode;
              return (
                <PlayButton
                  animeId={anime.id}
                  episode={playEp}
                  label={`继续观看 EP.${String(playEp).padStart(2, "0")}`}
                  variant="primary"
                  size="md"
                  className="max-sm:w-full"
                  buttonClassName="max-sm:w-full"
                />
              );
            })()}
            {userAnime && (
              <WatchStatusMenu animeId={anime.id} current={userAnime.watchStatus} />
            )}
            <AnimeSubscriptionButton
              animeId={anime.id}
              initialSubscribed={!!userAnime}
            />
            {/* 下载管理：仅在该番剧在 downloadQueue 有任意记录时显示，
                没下过的番剧跳过去也看不到对应资源。 */}
            {userAnime && totalDownloads > 0 && (
              <Link
                href="/admin/downloads"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] px-4 text-[13px] text-[color:var(--text-primary)] backdrop-blur-[12px] transition-colors hover:bg-[color:var(--bg-surface-hover)] max-sm:flex-[1_1_calc(50%-5px)]"
              >
                <Download size={15} />
                下载管理
              </Link>
            )}
            {anime.bangumiId && (
              <a
                href={`https://bangumi.tv/subject/${anime.bangumiId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] px-4 text-[13px] text-[color:var(--text-primary)] backdrop-blur-[12px] transition-colors hover:bg-[color:var(--bg-surface-hover)] max-sm:flex-[1_1_calc(50%-5px)]"
              >
                <ExternalLink size={15} />
                Bangumi
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ========== Body ========== */}
      <section className="relative mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-12 lg:px-8">
        {/* 左主区 */}
        <div className="min-w-0 space-y-6 lg:col-span-8">
          <AnimeCreditsTabs
            animeId={anime.id}
            synopsis={anime.synopsis}
            tags={anime.tags ?? null}
            hasBangumi={!!anime.bangumiId}
          />

          {/* 剧集列表 */}
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
                  {episodes.length > 0
                    ? `${episodes.length} 集`
                    : "暂无剧集数据"}
                </span>
              </div>
              <EpisodeProgressControl
                animeId={anime.id}
                initialCurrent={watchedCount}
                maxEpisode={maxEpisodeNumber}
                enabled={!!userAnime}
              />
            </div>
            {episodes.length > 0 ? (
              <EpisodeGrid
                animeId={anime.id}
                animeTitle={anime.title}
                episodes={episodes}
                animeStatus={anime.status}
                currentEpisode={watchedCount}
                watchStatus={userAnime?.watchStatus}
              />
            ) : (
              <GlassPanel className="p-6 text-center text-[13px] text-[color:var(--text-muted)]">
                未拉取到剧集，加入追番后可同步
              </GlassPanel>
            )}
            {nextAiring && (
              <p className="mt-3 text-[12px] text-[color:var(--text-muted)] flex items-center gap-1.5">
                <Calendar size={12} />
                EP.{String(nextAiring.number).padStart(2, "0")} 预计{" "}
                {nextAiring.airedAt!.toLocaleDateString("zh-CN", {
                  month: "long",
                  day: "numeric",
                })}{" "}
                播出
              </p>
            )}
          </div>
        </div>

        {/* 右栏 */}
        <aside className="min-w-0 space-y-4 lg:col-span-4">
          <GlassPanel className="p-5">
            <RatingNotes
              animeId={anime.id}
              initialRating={userAnime?.rating}
              initialNotes={userAnime?.notes}
              initialUpdatedAt={userAnime?.updatedAt?.toISOString() ?? null}
              disabled={!userAnime}
            />
          </GlassPanel>

          <GlassPanel className="p-5">
            <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)] mb-3">
              基本信息
            </h3>
            <dl className="text-[12px] space-y-2">
              {[
                ["原名", anime.titleJa ?? "—"],
                ["类型", TYPE_LABEL[anime.type] ?? anime.type],
                ["状态", STATUS_LABEL[anime.status] ?? anime.status],
                ["集数", anime.totalEpisodes ? `${anime.totalEpisodes} 集` : "—"],
                [
                  "首播",
                  anime.year
                    ? `${anime.year}${anime.season ? " 年" : ""}`
                    : "—",
                ],
                [
                  "更新时间",
                  anime.airingDay !== null && anime.airingDay !== undefined
                    ? `${WEEKDAYS[anime.airingDay]}${anime.airingTime ? ` ${anime.airingTime}` : ""}`
                    : "—",
                ],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="text-[color:var(--text-muted)] shrink-0">
                    {k}
                  </dt>
                  <dd className="text-[color:var(--text-primary)] text-right truncate">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </GlassPanel>

          <RelatedResourcesPanel
            bangumiId={anime.bangumiId}
            anilistId={anime.anilistId}
            resources={relatedResources}
          />
        </aside>
      </section>
    </div>
  );
}
