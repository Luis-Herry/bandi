"use client";

import { useEffect, useState } from "react";
import { Lock, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Episode } from "@/db/schema";

/**
 * 影视（电视剧）剧集列表。与动漫 `EpisodeGrid` 视觉同款，但**不接 RSS 找源**——
 * 影视模块走合法形态：有本地自有片（`isDownloaded`，即 local-file 完成记录）的集才可点，
 * 点击进入与动漫共用的内置剧院播放器 `/player/[animeId]/[episode]`；没有本地文件的集
 * 只展示集号 / 标题 / 播出日期，不提供盗版下载入口。
 *
 * 进度高亮沿用：EP < currentEpisode 已看；=== 当前；未播出 lock + 虚线。
 * 内置播放器看到 90% 会回写 currentEpisode（与动漫一致），所以这里的高亮对影视也成立。
 */
export function CinemaEpisodeList({
  animeId,
  episodes,
  currentEpisode,
}: {
  animeId: number;
  episodes: Episode[];
  currentEpisode: number;
}) {
  const now = Date.now();
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
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[color:var(--text-muted)]">
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
      )}

      <div className="grid grid-cols-2 gap-2.5 min-[460px]:grid-cols-3 sm:grid-cols-4 xl:grid-cols-6">
        {episodes.map((ep) => {
          const isUnaired = ep.airedAt ? ep.airedAt.getTime() > now : false;
          const isWatched =
            displayCurrentEpisode > 0 && ep.number < displayCurrentEpisode;
          const isCurrent =
            ep.number === displayCurrentEpisode &&
            displayCurrentEpisode > 0 &&
            !isUnaired;
          const isDownloaded = ep.isDownloaded;
          const label = String(ep.number).padStart(2, "0");
          const airedLabel = ep.airedAt
            ? ep.airedAt.toLocaleDateString("zh-CN", {
                month: "numeric",
                day: "numeric",
              })
            : null;

          const tile = (
            <div
              className={cn(
                "flex min-h-[72px] flex-col items-start justify-between rounded-[8px] border px-3 py-2 text-left transition-all duration-150",
                "[transition-timing-function:var(--ease-default)]",
                isWatched &&
                  "border-[color:var(--accent-muted)] bg-[color:var(--accent-subtle)]",
                isCurrent &&
                  !isWatched &&
                  "border-[color:var(--accent)] bg-[color:var(--bg-surface)]",
                !isWatched &&
                  !isCurrent &&
                  !isUnaired &&
                  "border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)]",
                isUnaired &&
                  "border-dashed border-[color:var(--border-subtle)] bg-transparent opacity-55",
                isDownloaded &&
                  "cursor-pointer hover:scale-[1.02] hover:border-[color:var(--accent)]",
              )}
            >
              <div className="flex w-full items-center gap-1">
                <span
                  data-tabular
                  className={cn(
                    "text-[15px] font-semibold tracking-tight",
                    isWatched || isCurrent
                      ? "text-[color:var(--accent)]"
                      : "text-[color:var(--text-primary)]",
                  )}
                >
                  {label}
                </span>
                <span className="ml-auto inline-flex items-center">
                  {isUnaired ? (
                    <Lock
                      size={11}
                      className="text-[color:var(--text-muted)]"
                    />
                  ) : isDownloaded ? (
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] bg-[color:var(--accent-subtle)] text-[color:var(--accent)]">
                      <Play size={12} strokeWidth={2.8} />
                    </span>
                  ) : null}
                </span>
              </div>
              {ep.title && (
                <span className="w-full truncate text-[10px] leading-tight text-[color:var(--text-muted)]">
                  {ep.title}
                </span>
              )}
              {airedLabel && (
                <span className="text-[10px] text-[color:var(--text-muted)]">
                  {airedLabel}
                  {isUnaired ? " 播出" : ""}
                </span>
              )}
            </div>
          );

          // 有本地文件 → 整块是播放链接（接内置播放器）；否则只是信息块
          return isDownloaded ? (
            <a
              key={ep.id}
              href={`/player/${animeId}/${ep.number}`}
              aria-label={`播放 EP.${label}`}
              className="group block focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
            >
              {tile}
            </a>
          ) : (
            <div key={ep.id}>{tile}</div>
          );
        })}
      </div>
    </>
  );
}
