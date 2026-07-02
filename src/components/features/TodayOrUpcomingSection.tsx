"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Calendar, Search } from "lucide-react";
import { GlassPanel } from "@/components/ui";
import { AnimeCard } from "@/components/features/AnimeCard";
import { EpisodeSourceDialog } from "@/components/features/EpisodeSourceDialog";
import { PlayButton } from "@/components/features/PlayButton";
import { cn } from "@/lib/cn";
import { useCardGlow } from "@/hooks/useCardGlow";

const WEEKDAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** plain JSON-friendly shape from server */
export interface TodayUpdateView {
  animeId: number;
  title: string;
  titleJa: string | null;
  coverUrl: string | null;
  totalEpisodes: number | null;
  episodeNumber: number;
  seasonEpisodeNumber: number;
  watched: boolean;
  isDownloaded: boolean;
}

export interface UpcomingItemView {
  key: string;
  animeId: number;
  title: string;
  titleJa: string | null;
  coverUrl: string | null;
  totalEpisodes: number | null;
  episodeNumber: number;
  seasonEpisodeNumber: number;
  /** ISO string; null 表示没排期 */
  airedAt: string | null;
}

interface Props {
  todayUpdates: TodayUpdateView[];
  upcomingItems: UpcomingItemView[];
}

function formatUpcomingLabel(
  airedAtIso: string | null,
  episodeNumber: number,
): string {
  if (!airedAtIso) return `EP.${String(episodeNumber).padStart(2, "0")}`;
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
  return `${prefix} EP.${String(episodeNumber).padStart(2, "0")}`;
}

/**
 * 今日更新 / 未来 7 天预告 双视图模块。
 *
 * - 今天有更新：默认显示今日更新；右上提供"未来 7 天预告 →"切换
 * - 今天空：默认显示今日更新空状态；右上提供"未来 7 天预告 →"切换
 * - 切换：内容区水平 slide 切换，标题 / 副标题同步切换
 * - 两边都空：直接显示空 panel，不显示切换按钮
 */
export function TodayOrUpcomingSection({ todayUpdates, upcomingItems }: Props) {
  const [view, setView] = useState<"today" | "upcoming">("today");
  const [sourceEpisode, setSourceEpisode] = useState<TodayUpdateView | null>(
    null,
  );

  const bothEmpty = todayUpdates.length === 0 && upcomingItems.length === 0;
  // 两边都空就不显示切换按钮
  const canToggle = !bothEmpty;

  const title = view === "today" ? "今日更新" : "未来 7 天预告";
  const subtitle =
    view === "today"
      ? todayUpdates.length > 0
        ? `共 ${todayUpdates.length} 部番剧今日更新`
        : "今天没有追番更新"
      : upcomingItems.length > 0
        ? `接下来 7 天预计更新 ${upcomingItems.length} 集`
        : "接下来 7 天暂无追番更新";

  const toggleLabel =
    view === "today" ? "未来 7 天预告" : "今日更新";
  const cardsRef = useCardGlow<HTMLDivElement>([
    view,
    todayUpdates,
    upcomingItems,
  ]);

  return (
    <section>
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
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
        {canToggle && (
          <button
            type="button"
            onClick={() =>
              setView((v) => (v === "today" ? "upcoming" : "today"))
            }
            className="text-[12px] text-[color:var(--text-muted)] hover:text-[color:var(--accent)] inline-flex items-center gap-1 transition-colors outline-none"
          >
            {view === "today" ? (
              <>
                {toggleLabel}
                <ArrowRight size={12} />
              </>
            ) : (
              <>
                <ArrowLeft size={12} />
                {toggleLabel}
              </>
            )}
          </button>
        )}
      </header>

      <div ref={cardsRef} className="relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {view === "today" ? (
            <motion.div
              key="today"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {todayUpdates.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {todayUpdates.slice(0, 4).map((u) => (
                    <AnimeCard
                      key={u.animeId}
                      id={u.animeId}
                      title={u.title}
                      titleJa={u.titleJa}
                      coverUrl={u.coverUrl}
                      currentEpisode={u.seasonEpisodeNumber}
                      totalEpisodes={u.totalEpisodes}
                      cornerLabel={
                        u.watched
                          ? "已看"
                          : `EP.${String(u.episodeNumber).padStart(2, "0")}`
                      }
                      showProgress={false}
                      actions={
                        <TodayUpdateActions
                          item={u}
                          onSearch={() => setSourceEpisode(u)}
                        />
                      }
                    />
                  ))}
                </div>
              ) : (
                <GlassPanel className="p-8 text-center">
                  <p className="text-[13px] text-[color:var(--text-secondary)]">
                    今天没有追番更新
                  </p>
                </GlassPanel>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="upcoming"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {upcomingItems.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {upcomingItems.slice(0, 8).map((u) => (
                    <AnimeCard
                      key={u.key}
                      id={u.animeId}
                      title={u.title}
                      titleJa={u.titleJa}
                      coverUrl={u.coverUrl}
                      currentEpisode={u.seasonEpisodeNumber}
                      totalEpisodes={u.totalEpisodes}
                      cornerLabel={formatUpcomingLabel(
                        u.airedAt,
                        u.episodeNumber,
                      )}
                      showProgress={false}
                    />
                  ))}
                </div>
              ) : (
                <GlassPanel className="p-8 text-center">
                  <p className="text-[13px] text-[color:var(--text-secondary)]">
                    接下来 7 天暂无追番更新
                  </p>
                </GlassPanel>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {sourceEpisode && (
        <EpisodeSourceDialog
          open={sourceEpisode != null}
          onOpenChange={(open) => {
            if (!open) setSourceEpisode(null);
          }}
          animeId={sourceEpisode.animeId}
          animeTitle={sourceEpisode.title}
          episodeNumber={sourceEpisode.episodeNumber}
        />
      )}
    </section>
  );
}

function TodayUpdateActions({
  item,
  onSearch,
}: {
  item: TodayUpdateView;
  onSearch: () => void;
}) {
  const episodeLabel = String(item.episodeNumber).padStart(2, "0");
  return (
    <>
      {item.isDownloaded && (
        <PlayButton
          animeId={item.animeId}
          episode={item.episodeNumber}
          label="播放"
          variant="primary"
          size="sm"
        />
      )}
      <button
        type="button"
        onClick={onSearch}
        aria-label={`搜索 EP.${episodeLabel} 下载源`}
        className={cn(
          "inline-flex h-8 items-center justify-center gap-2 rounded-[6px] px-3",
          "border border-[color:var(--accent-muted)] bg-[color:var(--accent-subtle)]",
          "text-xs font-medium text-[color:var(--accent)]",
          "transition-colors hover:bg-[color:var(--accent-muted)]",
          "focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]",
        )}
      >
        <Search size={12} strokeWidth={2.5} />
        找资源
      </button>
    </>
  );
}
