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
  /**
   * 用户当前进度（正在/最后看的那一集）。视觉上：
   *   - EP < currentEpisode → 已看
   *   - EP === currentEpisode → 当前在看（描边 + dot）
   *   - currentEpisode = 0 表示一集都没看，此时第一集播放过的为 current
   */
  currentEpisode: number;
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
  currentEpisode,
}: EpisodeGridProps) {
  const now = Date.now();
  const [openEp, setOpenEp] = useState<number | null>(null);
  const [seasonDialogOpen, setSeasonDialogOpen] = useState(false);
  const [displayCurrentEpisode, setDisplayCurrentEpisode] =
    useState(currentEpisode);

  useEffect(() => {
    setDisplayCurrentEpisode(currentEpisode);
  }, [currentEpisode]);

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

    window.addEventListener("anime-progress-change", handleProgressChange);
    return () => {
      window.removeEventListener("anime-progress-change", handleProgressChange);
    };
  }, [animeId]);

  return (
    <>
      {episodes.length > 1 && (
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-[11px] text-[color:var(--text-muted)]">
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
              "inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border",
              "border-[color:var(--border-default)] bg-[color:var(--bg-surface)]",
              "text-[12px] text-[color:var(--text-secondary)]",
              "hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]",
              "transition-colors",
            )}
          >
            <Download size={12} />
            搜全集
          </button>
        </div>
      )}

      <div className="grid grid-cols-6 gap-2.5">
        {episodes.map((ep) => {
          const isUnaired = ep.airedAt ? ep.airedAt.getTime() > now : false;
          // currentEpisode 是「当前/最后看的那一集」（用户的心智模型）。
          //   严格小于 → 已看；等于 → 当前；大于 → 未看。
          // currentEpisode = 0 表示一集没看；此时没有「当前」高亮。
          const isWatched =
            displayCurrentEpisode > 0 && ep.number < displayCurrentEpisode;
          const isCurrent =
            ep.number === displayCurrentEpisode &&
            displayCurrentEpisode > 0 &&
            !isUnaired;
          const isDownloaded = ep.isDownloaded;

          const episodeLabel = String(ep.number).padStart(2, "0");

          return (
            <div
              key={ep.id}
              className={cn(
                "group relative flex flex-col items-start justify-between",
                "h-[68px] px-3 py-2 rounded-[8px]",
                "border transition-all duration-150 text-left",
                "[transition-timing-function:var(--ease-default)]",
                !isUnaired &&
                  "hover:scale-[1.02] hover:border-[color:var(--accent)] cursor-pointer",
                isWatched &&
                  "bg-[color:var(--accent-subtle)] border-[color:var(--accent-muted)]",
                isCurrent &&
                  !isWatched &&
                  "border-[color:var(--accent)] bg-[color:var(--bg-surface)]",
                !isWatched &&
                  !isCurrent &&
                  !isUnaired &&
                  "border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] hover:bg-[color:var(--bg-surface-hover)]",
                isUnaired &&
                  "border-dashed border-[color:var(--border-subtle)] bg-transparent opacity-55 cursor-not-allowed",
              )}
            >
              {!isUnaired && (
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
                    {isUnaired ? (
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
