import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, Play, Clock, AlertCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import {
  getHeroCandidates,
  getTodayUpdates,
  getContinueWatching,
  getLibraryStats,
  getMissedUpdates,
  getUpcomingEpisodes,
} from "@/lib/db-helpers/library";
import {
  getSeasonalBrowse,
  groupSeasonalBrowseByWeekday,
} from "@/lib/db-helpers/browse";
import { currentSeason } from "@/lib/bangumi";
import { attachSeasonalUpdateStates } from "@/lib/seasonal-update-state";
import { Button, GlassPanel, Tag } from "@/components/ui";
import { HomeHero, type HeroSlide } from "@/components/features/HomeHero";
import { EmberBackground } from "@/components/features/EmberBackground";
import { SearchOpenButton } from "@/components/features/SearchOpenButton";
import {
  SeasonalBrowseWeekday,
} from "@/components/features/SeasonalBrowseWeekday";
import { AnimeRowItem } from "@/components/features/AnimeRowItem";
import { PlayButton } from "@/components/features/PlayButton";
import { MissedUpdateActions } from "@/components/features/MissedUpdateActions";
import {
  TodayOrUpcomingSection,
  type TodayUpdateView,
  type UpcomingItemView,
} from "@/components/features/TodayOrUpcomingSection";
import type { SeasonalBrowseItem } from "@/lib/db-helpers/browse";

export const dynamic = "force-dynamic";

const SEASON_CN = {
  WINTER: "冬",
  SPRING: "春",
  SUMMER: "夏",
  FALL: "秋",
} as const;

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const heroItems = getHeroCandidates(user.id);
  const todayUpdatesRaw = getTodayUpdates(user.id);
  const continueItems = getContinueWatching(user.id, 4);
  const watchingCount = getLibraryStats(user.id).watching;
  const missedItems = getMissedUpdates(user.id, 4);
  // 始终拿两份：客户端用来切换视图，不再以"今日为空"作分支
  const upcomingItemsRaw = getUpcomingEpisodes(user.id, 7);

  // 空库状态
  if (heroItems.length === 0 && continueItems.length === 0) {
    return (
      <HomeShell>
        <EmptyHome username={user.username} />
      </HomeShell>
    );
  }

  const slides: HeroSlide[] = heroItems.map((it) => ({
    id: it.anime.id,
    title: it.anime.title,
    titleJa: it.anime.titleJa,
    synopsis: it.anime.synopsis,
    coverUrl: it.anime.coverUrl,
    year: it.anime.year,
    type: it.anime.type,
    tags: it.anime.tags ?? null,
    currentEpisode: it.userAnime.currentEpisode,
    watchedThroughEpisode: it.watchedThroughEpisode,
    airedCount: it.airedCount,
    watchedAiredCount: it.watchedAiredCount,
    latestAiredEpisode: it.latestAiredEpisode,
    continueEpisodeNumber: it.continueEpisodeNumber,
    totalEpisodes: it.anime.totalEpisodes,
    rating: it.userAnime.rating ?? undefined,
  }));

  // 转成 JSON-friendly 给 client 组件
  const todayUpdates: TodayUpdateView[] = todayUpdatesRaw.map((u) => ({
    animeId: u.anime.id,
    title: u.anime.title,
    titleJa: u.anime.titleJa,
    coverUrl: u.anime.coverUrl,
    totalEpisodes: u.seasonEpisodeTotal,
    episodeNumber: u.episode.number,
    seasonEpisodeNumber: u.seasonEpisodeNumber,
    watched: u.watched,
    isDownloaded: u.episode.isDownloaded,
  }));

  const upcomingItems: UpcomingItemView[] = upcomingItemsRaw.map((u) => ({
    key: `${u.anime.id}-${u.episode.id}`,
    animeId: u.anime.id,
    title: u.anime.title,
    titleJa: u.anime.titleJa,
    coverUrl: u.anime.coverUrl,
    totalEpisodes: u.seasonEpisodeTotal,
    episodeNumber: u.episode.number,
    seasonEpisodeNumber: u.seasonEpisodeNumber,
    airedAt: u.episode.airedAt ? u.episode.airedAt.toISOString() : null,
  }));

  return (
    <HomeShell>
      {/* Hero 区 */}
      {slides.length > 0 && <HomeHero slides={slides} />}

      {/* 主体信息流 */}
      <section className="app-page-container py-8 space-y-8 lg:py-10 lg:space-y-10">
        {/* ── 今日更新 / 未来 7 天预告 ── */}
        <TodayOrUpcomingSection
          todayUpdates={todayUpdates}
          upcomingItems={upcomingItems}
        />

        {/* ── 继续观看 + 漏看提醒（左右两栏） ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <Section
              icon={<Play size={16} />}
              title="可继续播放"
              subtitle="有播放记录或已下载的在看条目"
              className="flex h-full flex-col"
              right={
                <a
                  href="/library"
                  className="text-[12px] text-[color:var(--text-muted)] hover:text-[color:var(--accent)] inline-flex items-center gap-1 transition-colors"
                >
                  全部追番 <ArrowRight size={12} />
                </a>
              }
            >
              {continueItems.length === 0 ? (
                <GlassPanel className="flex flex-1 items-center justify-center p-6 text-center">
                  <p className="text-[13px] text-[color:var(--text-secondary)]">
                    {watchingCount > 0
                      ? `暂无可播放内容，${watchingCount} 部在看可去追番列表找资源`
                      : "还没有正在观看的番剧"}
                  </p>
                </GlassPanel>
              ) : (
                <GlassPanel className="flex-1 p-2 space-y-1">
                  {continueItems.map((it) => {
                    const airedCount = it.airedCount;
                    const watchedAiredCount = Math.min(
                      it.watchedAiredCount,
                      airedCount,
                    );
                    const hasPlaybackProgress =
                      it.hasIncompletePlayback &&
                      it.playbackEpisodeNumber != null &&
                      it.playbackPositionSeconds != null &&
                      it.playbackDurationSeconds != null &&
                      it.playbackDurationSeconds > 0;
                    const playbackProgressRatio = hasPlaybackProgress
                      ? Math.min(
                          1,
                          Math.max(
                            0,
                            it.playbackPositionSeconds! /
                              it.playbackDurationSeconds!,
                          ),
                        )
                      : null;
                    const playEp = it.continueEpisodeNumber;
                    const currentLabel =
                      playEp > 0
                        ? `当前 EP.${String(playEp).padStart(2, "0")}`
                        : "未开始";
                    const meta = hasPlaybackProgress
                      ? `上次 EP.${String(it.playbackEpisodeNumber).padStart(2, "0")} · ${formatPlaybackTime(it.playbackPositionSeconds!)} / ${formatPlaybackTime(it.playbackDurationSeconds!)} · ${it.anime.type}`
                      : airedCount > 0
                        ? `已看 ${watchedAiredCount} / 已播 ${airedCount} · ${currentLabel} · ${it.anime.type}`
                        : `${currentLabel} · ${it.anime.type}`;
                    return (
                      <AnimeRowItem
                        key={it.anime.id}
                        id={it.anime.id}
                        title={it.anime.title}
                        coverUrl={it.anime.coverUrl}
                        meta={meta}
                        progress={
                          playbackProgressRatio ??
                          (airedCount > 0
                            ? watchedAiredCount / airedCount
                            : undefined)
                        }
                        action={
                          <PlayButton
                            animeId={it.anime.id}
                            episode={playEp}
                            label={`播放 EP.${String(playEp).padStart(2, "0")}`}
                            variant="primary"
                            size="sm"
                          />
                        }
                      />
                    );
                  })}
                </GlassPanel>
              )}
            </Section>
          </div>

          <div className="min-w-0">
            <Section
              icon={<AlertCircle size={16} />}
              title="漏看提醒"
              className="flex h-full flex-col"
              subtitle={
                missedItems.length > 0
                  ? `${missedItems.length} 部番剧有新集数待观看`
                  : "没有遗漏的更新"
              }
            >
              {missedItems.length === 0 ? (
                <GlassPanel className="flex flex-1 items-center justify-center p-6 text-center">
                  <p className="text-[13px] text-[color:var(--text-secondary)]">
                    你已经追上了所有进度
                  </p>
                </GlassPanel>
              ) : (
                <GlassPanel className="flex-1 p-2 space-y-1">
                  {missedItems.map((m) => {
                    return (
                      <AnimeRowItem
                        key={m.anime.id}
                        id={m.anime.id}
                        title={m.anime.title}
                        coverUrl={m.anime.coverUrl}
                        meta={`落后 ${m.missedCount} 集 · 下一集 EP.${String(m.nextMissedEpisode).padStart(2, "0")}`}
                        action={
                          <MissedUpdateActions
                            animeId={m.anime.id}
                            animeTitle={m.anime.title}
                            episodeNumber={m.nextMissedEpisode}
                            isDownloaded={m.nextMissedEpisodeIsDownloaded}
                          />
                        }
                      />
                    );
                  })}
                </GlassPanel>
              )}
            </Section>
          </div>
        </div>

        {/* ── 本季新番（按星期，来自 Bangumi 全集） ── */}
        <Suspense fallback={<SeasonalBrowseSkeleton />}>
          <SeasonalBrowseSection userId={user.id} />
        </Suspense>
      </section>
    </HomeShell>
  );
}

async function SeasonalBrowseSection({ userId }: { userId: string }) {
  const season = currentSeason();

  try {
    const seasonalAll = await attachSeasonalUpdateStates(
      await getSeasonalBrowse(userId, season.season, season.year),
    );
    const seasonalGroups = groupSeasonalBrowseByWeekday(seasonalAll);
    const seasonalTotal = seasonalAll.filter(
      (item) => item.airingDay != null,
    ).length;

    return (
      <Section
        icon={<Clock size={16} />}
        title="本季新番"
        subtitle={`${season.year} ${SEASON_CN[season.season]}季 · 共 ${seasonalTotal} 部在播`}
        right={<SeasonalBrowseLink />}
      >
        <SeasonalBrowseWeekday groups={seasonalGroups} />
      </Section>
    );
  } catch (error) {
    console.error("[home] getSeasonalBrowse failed:", error);
    return (
      <Section
        icon={<Clock size={16} />}
        title="本季新番"
        subtitle={`${season.year} ${SEASON_CN[season.season]}季`}
        right={<SeasonalBrowseLink />}
      >
        <GlassPanel className="p-8 text-center">
          <p className="text-[13px] text-[color:var(--text-secondary)]">
            本季新番暂时加载失败
          </p>
          <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">
            其他追番内容仍可正常使用，稍后可再试
          </p>
        </GlassPanel>
      </Section>
    );
  }
}

function SeasonalBrowseSkeleton() {
  return (
    <Section
      icon={<Clock size={16} />}
      title="本季新番"
      subtitle="正在载入季度数据"
      right={<SeasonalBrowseLink />}
    >
      <div aria-label="本季新番加载中" aria-busy="true">
        <div className="mb-3 flex gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((item) => (
            <HomeSkeletonBlock key={item} className="h-8 w-12" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <HomeSkeletonBlock key={item} className="h-[190px] w-full" />
          ))}
        </div>
      </div>
    </Section>
  );
}

function SeasonalBrowseLink() {
  return (
    <a
      href="/browse"
      className="inline-flex items-center gap-1 text-[12px] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--accent)]"
    >
      查看全部 <ArrowRight size={12} />
    </a>
  );
}

function HomeSkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[8px] bg-[color:var(--bg-elevated)] ${className}`}
    >
      <div className="t-skel-skeleton is-pulsing">
        <div className="t-skel-block" />
      </div>
    </div>
  );
}

function HomeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate">
      <EmberBackground />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────── */

function Section({
  icon,
  title,
  subtitle,
  right,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="t-stagger is-shown">
          <h2 className="t-stagger-line t-stagger-line--1 flex items-center gap-2 text-[18px] font-bold tracking-[-0.02em] text-[color:var(--text-primary)]">
            <span className="text-[color:var(--accent)]">{icon}</span>
            {title}
          </h2>
          {subtitle && (
            <p className="t-stagger-line t-stagger-line--2 mt-1 text-[12px] text-[color:var(--text-muted)]">
              {subtitle}
            </p>
          )}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function EmptyHome({ username }: { username: string }) {
  return (
    <div className="relative min-h-[calc(100vh-56px)] overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, rgb(var(--accent-rgb) / 0.08) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-[720px] px-4 pt-28 pb-20 text-center sm:px-8 sm:pt-32 sm:pb-24">
        <div className="t-stagger is-shown">
          <Tag variant="accent">Bandi</Tag>
          <h1 className="t-stagger-line t-stagger-line--1 mt-5 text-[40px] font-extrabold tracking-[-0.03em] leading-[1.1] text-[color:var(--text-primary)]">
            {username}，欢迎回来
          </h1>
          <p className="t-stagger-line t-stagger-line--2 mt-3 text-[14px] text-[color:var(--text-secondary)] leading-relaxed">
            你的追番库还是空的。添加第一部番剧，开始管理你的追番清单。
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" size="lg" asChild>
            <a href="/browse">前往番剧库</a>
          </Button>
          <SearchOpenButton />
        </div>

        <p className="mt-5 text-[11px] text-[color:var(--text-muted)]">
          提示：任何页面按 <kbd className="px-1.5 py-0.5 mx-0.5 rounded-[4px] bg-[color:var(--bg-surface)] border border-[color:var(--border-subtle)] text-[10px]">Ctrl K</kbd> 快速搜索
        </p>

        <div className="mt-16">
          <GlassPanel className="p-6 text-left">
            <h3 className="text-[13px] font-semibold text-[color:var(--text-primary)] mb-3">
              你可以做什么
            </h3>
            <ul className="space-y-2 text-[12px] text-[color:var(--text-secondary)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 block w-1 h-1 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                在番剧库发现本季新番，加入想看或在看
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 block w-1 h-1 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                首页集中查看今日更新、漏看提醒和继续观看
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 block w-1 h-1 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                扫描本地动画和影视文件，用内置播放器接着看
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 block w-1 h-1 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                需要时再用 RSS 找源和下载管理补齐资源
              </li>
            </ul>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}

function formatPlaybackTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
