"use client";

import { useEffect, useState } from "react";
import { Download, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Episode } from "@/db/schema";
import { EpisodeSourceDialog } from "./EpisodeSourceDialog";
import { PlayButton } from "./PlayButton";

interface EpisodeGridProps {
  animeId: number;
  animeTitle: string;
  episodes: Episode[];
  animeStatus?: string | null;
  /**
   * 用户当前进度（下一集/当前要看的那一集）。视觉上：
   *   - EP < currentEpisode → 已看
   *   - EP === currentEpisode → 当前要看（描边 + dot）
   *   - currentEpisode = 0 表示一集都没看，此时没有当前高亮
   */
  currentEpisode: number;
  watchStatus?: string | null;
}

/**
 * 2 行 × 6 列方块网格。
 *
 * 状态：
 *   - 已看（accent 淡底，进度提示）
 *   - 当前应看（accent 描边）
 *   - 未看
 *   - 未播（lock + 虚线）
 *
 * 交互：
 *   - 点击卡片 → 弹出本集找源对话框，从 RSS 候选里选一条推到 qBit
 *   - 已下载的集会在右上角显示播放按钮，直接打开本地文件
 */
export function EpisodeGrid({
  animeId,
  animeTitle,
  episodes,
  animeStatus,
  currentEpisode,
  watchStatus,
}: EpisodeGridProps) {
  const now = Date.now();
  const hasReleasedMaterial =
    animeStatus === "completed" ||
    episodes.some(
      (episode) =>
        episode.isDownloaded ||
        (episode.airedAt && episode.airedAt.getTime() <= now),
    );
  const [openEp, setOpenEp] = useState<number | null>(null);
  const [seasonDialogOpen, setSeasonDialogOpen] = useState(false);
  const [displayCurrentEpisode, setDisplayCurrentEpisode] =
    useState(currentEpisode);
  const [displayWatchStatus, setDisplayWatchStatus] = useState(watchStatus);

  useEffect(() => {
    setDisplayCurrentEpisode(currentEpisode);
    setDisplayWatchStatus(watchStatus);
  }, [currentEpisode, watchStatus]);

  useEffect(() => {
    const handleProgressChange = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        animeId?: unknown;
        currentEpisode?: unknown;
      };

      if (detail?.animeId !== animeId) return;
      if (typeof detail.currentEpisode !== "number") return;

      setDisplayCurrentEpisode(detail.currentEpisode);
    };
    const handleWatchStatusChange = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        animeId?: unknown;
        watchStatus?: unknown;
      };

      if (detail?.animeId !== animeId) return;
      if (typeof detail.watchStatus !== "string") return;

      setDisplayWatchStatus(detail.watchStatus);
    };

    window.addEventListener("anime-progress-change", handleProgressChange);
    window.addEventListener("anime-watch-status-change", handleWatchStatusChange);
    return () => {
      window.removeEventListener("anime-progress-change", handleProgressChange);
      window.removeEventListener(
        "anime-watch-status-change",
        handleWatchStatusChange,
      );
    };
  }, [animeId]);

  return (
    <>
      {episodes.length > 1 && (
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[color:var(--text-muted)]">
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="h-3 w-4 rounded-[4px] border border-[color:var(--accent-muted)] bg-[color:var(--accent-subtle)]"
              />
              已看
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="h-3 w-4 rounded-[4px] border border-[color:var(--accent)] bg-[color:var(--bg-surface)]"
              />
              当前
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="h-3 w-4 rounded-[4px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)]"
              />
              未看
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className="h-3 w-4 rounded-[4px] border border-dashed border-[color:var(--border-subtle)] bg-transparent opacity-55"
              />
              未播出
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSeasonDialogOpen(true)}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border px-3",
              "border-[color:var(--border-default)] bg-[color:var(--bg-surface)]",
              "text-[12px] text-[color:var(--text-secondary)]",
              "hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]",
              "transition-colors max-sm:w-full",
            )}
          >
            <Download size={12} />
            搜全集
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 min-[460px]:grid-cols-3 sm:grid-cols-4 xl:grid-cols-6">
        {episodes.map((ep) => {
          const isScheduledFuture = ep.airedAt
            ? ep.airedAt.getTime() > now
            : false;
          const canSearchSources =
            ep.isDownloaded ||
            !isScheduledFuture ||
            hasReleasedMaterial;
          const isLocked = !canSearchSources;
          const displayWatchedThrough =
            displayWatchStatus === "completed"
              ? Math.max(...episodes.map((episode) => episode.number))
              : Math.max(0, displayCurrentEpisode - 1);
          // currentEpisode 是「下一集/当前要看的那一集」。
          //   小于 currentEpisode → 已看；等于 → 当前；大于 → 未看。
          // currentEpisode = 0 表示一集没看；此时没有「当前」高亮。
          const isWatched =
            displayWatchedThrough > 0 && ep.number <= displayWatchedThrough;
          const isCurrent =
            ep.number === displayCurrentEpisode &&
            displayCurrentEpisode > 0 &&
            displayWatchStatus !== "completed" &&
            !isWatched &&
            !isLocked;
          const isDownloaded = ep.isDownloaded;

          const episodeLabel = String(ep.number).padStart(2, "0");

          return (
            <div
              key={ep.id}
              className={cn(
                "group relative flex min-w-0 flex-col items-start justify-between",
                "min-h-[72px] rounded-[8px] px-3 py-2 sm:min-h-[68px]",
                "border transition-all duration-150 text-left",
                "[transition-timing-function:var(--ease-default)]",
                !isLocked &&
                  "hover:scale-[1.02] hover:border-[color:var(--accent)] cursor-pointer",
                isWatched &&
                  "bg-[color:var(--accent-subtle)] border-[color:var(--accent-muted)]",
                isCurrent &&
                  !isWatched &&
                  "border-[color:var(--accent)] bg-[color:var(--bg-surface)]",
                !isWatched &&
                  !isCurrent &&
                  !isLocked &&
                  "border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] hover:bg-[color:var(--bg-surface-hover)]",
                isLocked &&
                  "border-dashed border-[color:var(--border-subtle)] bg-transparent opacity-55 cursor-not-allowed",
              )}
            >
              {canSearchSources && (
                <button
                  type="button"
                  aria-label={`搜索 EP.${episodeLabel} 下载源`}
                  title={`第 ${ep.number} 集 · 点击找下载源`}
                  onClick={() => setOpenEp(ep.number)}
                  className="absolute inset-0 z-[1] rounded-[8px] focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
                />
              )}

              <div className="pointer-events-none relative z-[2] flex h-full w-full flex-col items-start justify-between">
                <div className="flex items-center gap-1 w-full">
                  <span
                    data-tabular
                    className={cn(
                      "text-[15px] font-semibold tracking-tight",
                      isWatched || isCurrent
                        ? "text-[color:var(--accent)]"
                        : "text-[color:var(--text-primary)]",
                    )}
                  >
                    {episodeLabel}
                  </span>
                  <div className="ml-auto flex items-center gap-1 pointer-events-auto">
                    {isLocked ? (
                      <Lock
                        size={11}
                        className="text-[color:var(--text-muted)]"
                      />
                    ) : isDownloaded ? (
                      <PlayButton
                        animeId={animeId}
                        episode={ep.number}
                        label={`播放 EP.${episodeLabel}`}
                        variant="ghost"
                        size="sm"
                        iconOnly
                        buttonClassName={cn(
                          "h-6 w-6 rounded-[6px]",
                          "bg-[color:var(--accent-subtle)] text-[color:var(--accent)]",
                          "hover:bg-[color:var(--accent-muted)] hover:text-[color:var(--accent)]",
                        )}
                      />
                    ) : isCurrent ? (
                      <span
                        aria-hidden
                        className="block w-2 h-2 rounded-full"
                        style={{ background: "var(--accent)" }}
                      />
                    ) : null}
                  </div>
                </div>
                {ep.title && (
                  <span className="text-[10px] text-[color:var(--text-muted)] truncate w-full leading-tight">
                    {ep.title}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {openEp != null && (
        <EpisodeSourceDialog
          open={openEp != null}
          onOpenChange={(o) => {
            if (!o) setOpenEp(null);
          }}
          animeId={animeId}
          animeTitle={animeTitle}
          episodeNumber={openEp}
        />
      )}

      {seasonDialogOpen && (
        <EpisodeSourceDialog
          open={seasonDialogOpen}
          onOpenChange={(o) => setSeasonDialogOpen(o)}
          animeId={animeId}
          animeTitle={animeTitle}
          episodeNumber={0}
          sourceScope="season"
        />
      )}
    </>
  );
}
