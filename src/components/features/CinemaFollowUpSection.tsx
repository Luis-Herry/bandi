"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  ExternalLink,
  PlayCircle,
  Radio,
} from "lucide-react";
import { AnimeCard } from "@/components/features/AnimeCard";
import { AnimeRowItem } from "@/components/features/AnimeRowItem";
import { PlayButton } from "@/components/features/PlayButton";
import { Button, GlassPanel } from "@/components/ui";
import { useCardGlow } from "@/hooks/useCardGlow";

const WEEKDAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export interface CinemaUpdateView {
  key: string;
  animeId: number;
  title: string;
  titleJa: string | null;
  coverUrl: string | null;
  totalEpisodes: number | null;
  episodeNumber: number;
  watched?: boolean;
  isDownloaded: boolean;
  providerLabel: string | null;
  airedAt: string | null;
}

export interface CinemaMissedUpdateView {
  animeId: number;
  title: string;
  coverUrl: string | null;
  providerLabel: string | null;
  missedCount: number;
  nextMissedEpisode: number;
  nextMissedEpisodeIsDownloaded: boolean;
  latestAiredEpisode: number;
  latestEpisodeIsDownloaded: boolean;
  daysSince: number;
}

export interface CinemaContinueView {
  animeId: number;
  title: string;
  coverUrl: string | null;
  meta: string;
  progress: number | null;
  episodeNumber: number;
  isDownloaded: boolean;
  providerLabel: string | null;
}

interface Props {
  todayUpdates: CinemaUpdateView[];
  upcomingItems: CinemaUpdateView[];
  continueItems: CinemaContinueView[];
  missedItems: CinemaMissedUpdateView[];
}

function formatEpisode(value: number) {
  return String(value).padStart(2, "0");
}

function formatUpcomingLabel(airedAtIso: string | null, episodeNumber: number) {
  if (!airedAtIso) return `EP.${formatEpisode(episodeNumber)}`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(airedAtIso);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  const prefix =
    diffDays === 1
      ? "明天"
      : diffDays === 2
        ? "后天"
        : WEEKDAY_CN[target.getDay()];
  return `${prefix} EP.${formatEpisode(episodeNumber)}`;
}

function getLocalDetailHref(item: { animeId: number }) {
  return `/cinema/${item.animeId}?from=local`;
}

export function CinemaFollowUpSection({
  todayUpdates,
  upcomingItems,
  continueItems,
  missedItems,
}: Props) {
  const [view, setView] = useState<"today" | "upcoming">("today");
  const bothEmpty = todayUpdates.length === 0 && upcomingItems.length === 0;
  const showToday = view === "today";
  const title = showToday ? "今日更新" : "未来 7 天预告";
  const subtitle = showToday
    ? todayUpdates.length > 0
      ? `共 ${todayUpdates.length} 部剧今日更新`
      : "今天没有电视剧更新"
    : upcomingItems.length > 0
      ? `接下来 7 天预计更新 ${upcomingItems.length} 集`
      : "接下来 7 天暂无电视剧更新";
  const cardsRef = useCardGlow<HTMLDivElement>([
    view,
    todayUpdates,
    upcomingItems,
  ]);

  return (
    <div className="space-y-6">
      {/* 今日更新 / 未来 7 天预告：同一模块，右上切换（对齐动漫首页布局） */}
      <section ref={cardsRef}>
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-bold tracking-[-0.02em] text-[color:var(--text-primary)]">
              <span className="text-[color:var(--accent)]">
                <Calendar size={16} />
              </span>
              {title}
            </h2>
            <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {subtitle}
            </p>
          </div>
          {!bothEmpty && (
            <button
              type="button"
              onClick={() =>
                setView((v) => (v === "today" ? "upcoming" : "today"))
              }
              className="inline-flex items-center gap-1 text-[12px] text-[color:var(--text-muted)] outline-none transition-colors hover:text-[color:var(--accent)]"
            >
              {showToday ? (
                <>
                  未来 7 天预告
                  <ArrowRight size={12} />
                </>
              ) : (
                <>
                  <ArrowLeft size={12} />
                  今日更新
                </>
              )}
            </button>
          )}
        </header>

        {showToday ? (
          todayUpdates.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {todayUpdates.slice(0, 4).map((item) => (
                <AnimeCard
                  key={item.key}
                  id={item.animeId}
                  href={getLocalDetailHref(item)}
                  title={item.title}
                  titleJa={item.titleJa}
                  coverUrl={item.coverUrl}
                  currentEpisode={item.episodeNumber}
                  totalEpisodes={item.totalEpisodes}
                  cornerLabel={
                    item.watched
                      ? "已看"
                      : `EP.${formatEpisode(item.episodeNumber)}`
                  }
                  showProgress={false}
                  actions={<CinemaEpisodeAction item={item} />}
                />
              ))}
            </div>
          ) : (
            <GlassPanel className="p-8 text-center">
              <p className="text-[13px] text-[color:var(--text-secondary)]">
                今天没有电视剧更新
              </p>
            </GlassPanel>
          )
        ) : upcomingItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {upcomingItems.slice(0, 8).map((item) => (
              <AnimeCard
                key={item.key}
                id={item.animeId}
                href={getLocalDetailHref(item)}
                title={item.title}
                titleJa={item.titleJa}
                coverUrl={item.coverUrl}
                currentEpisode={item.episodeNumber}
                totalEpisodes={item.totalEpisodes}
                cornerLabel={formatUpcomingLabel(
                  item.airedAt,
                  item.episodeNumber,
                )}
                showProgress={false}
                actions={<CinemaEpisodeAction item={item} />}
              />
            ))}
          </div>
        ) : (
          <GlassPanel className="p-8 text-center">
            <p className="text-[13px] text-[color:var(--text-secondary)]">
              接下来 7 天暂无电视剧更新
            </p>
          </GlassPanel>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 继续观看：在看的剧，有本地文件直接播，没有就去「在哪看」 */}
        <section className="min-w-0">
          <header className="mb-4">
            <h2 className="flex items-center gap-2 text-[18px] font-bold tracking-[-0.02em] text-[color:var(--text-primary)]">
              <span className="text-[color:var(--accent)]">
                <PlayCircle size={16} />
              </span>
              继续观看
            </h2>
            <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {continueItems.length > 0
                ? "上次中断的进度，从这里接着看"
                : "暂无在看的剧集"}
            </p>
          </header>

          {continueItems.length > 0 ? (
            <GlassPanel className="p-2 space-y-1">
              {continueItems.map((item) => (
                <AnimeRowItem
                  key={item.animeId}
                  id={item.animeId}
                  href={getLocalDetailHref(item)}
                  title={item.title}
                  coverUrl={item.coverUrl}
                  meta={item.meta}
                  progress={item.progress ?? undefined}
                  action={
                    <CinemaEpisodeAction
                      item={{
                        key: `${item.animeId}-${item.episodeNumber}`,
                        animeId: item.animeId,
                        title: item.title,
                        titleJa: null,
                        coverUrl: item.coverUrl,
                        totalEpisodes: null,
                        episodeNumber: item.episodeNumber,
                        isDownloaded: item.isDownloaded,
                        providerLabel: item.providerLabel,
                        airedAt: null,
                      }}
                      includeEpisodeInLabel
                    />
                  }
                />
              ))}
            </GlassPanel>
          ) : (
            <GlassPanel className="p-6 text-center">
              <p className="text-[13px] text-[color:var(--text-secondary)]">
                暂无在看的剧集
              </p>
            </GlassPanel>
          )}
        </section>

        {/* 漏看提醒 */}
        <section className="min-w-0">
          <header className="mb-4">
            <h2 className="flex items-center gap-2 text-[18px] font-bold tracking-[-0.02em] text-[color:var(--text-primary)]">
              <span className="text-[color:var(--accent)]">
                <Radio size={16} />
              </span>
              漏看提醒
            </h2>
            <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {missedItems.length > 0
                ? `${missedItems.length} 部剧有新集数待观看`
                : "没有遗漏的剧集更新"}
            </p>
          </header>

          {missedItems.length > 0 ? (
            <GlassPanel className="p-2 space-y-1">
              {missedItems.map((item) => (
                <AnimeRowItem
                  key={item.animeId}
                  id={item.animeId}
                  href={getLocalDetailHref(item)}
                  title={item.title}
                  coverUrl={item.coverUrl}
                  meta={`落后 ${item.missedCount} 集 · 下一集 EP.${formatEpisode(item.nextMissedEpisode)}`}
                  action={
                    <CinemaEpisodeAction
                      item={{
                        key: `${item.animeId}-${item.nextMissedEpisode}`,
                        animeId: item.animeId,
                        title: item.title,
                        titleJa: null,
                        coverUrl: item.coverUrl,
                        totalEpisodes: null,
                        episodeNumber: item.nextMissedEpisode,
                        isDownloaded: item.nextMissedEpisodeIsDownloaded,
                        providerLabel: item.providerLabel,
                        airedAt: null,
                      }}
                      includeEpisodeInLabel
                    />
                  }
                />
              ))}
            </GlassPanel>
          ) : (
            <GlassPanel className="p-6 text-center">
              <p className="text-[13px] text-[color:var(--text-secondary)]">
                你已经追上了所有在看的剧
              </p>
            </GlassPanel>
          )}
        </section>
      </div>
    </div>
  );
}

function CinemaEpisodeAction({
  item,
  includeEpisodeInLabel = false,
}: {
  item: CinemaUpdateView;
  includeEpisodeInLabel?: boolean;
}) {
  const episodeLabel = formatEpisode(item.episodeNumber);
  const detailHref = getLocalDetailHref(item);
  if (item.isDownloaded) {
    return (
      <PlayButton
        animeId={item.animeId}
        episode={item.episodeNumber}
        label={
          includeEpisodeInLabel ? `播放 EP.${episodeLabel}` : "播放"
        }
        variant="primary"
        size="sm"
      />
    );
  }

  return (
    <Button asChild variant="secondary" size="sm">
      <a href={`${detailHref}#where-to-watch`}>
        <ExternalLink size={12} strokeWidth={2.5} />
        在哪看
      </a>
    </Button>
  );
}
