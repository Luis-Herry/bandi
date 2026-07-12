"use client";

import type { ReactNode } from "react";
import { AnimeCover } from "./AnimeCover";
import { StatusBadge, type WatchStatus } from "@/components/ui";
import { cn } from "@/lib/cn";

interface AnimeCardProps {
  id: number;
  title: string;
  titleJa?: string | null;
  coverUrl?: string | null;
  watchStatus?: WatchStatus;
  currentEpisode?: number;
  totalEpisodes?: number | null;
  airedCount?: number;
  /** small chip on the cover, e.g. EP.08 or 进度 */
  cornerLabel?: string;
  /** show progress bar at the bottom */
  showProgress?: boolean;
  actions?: ReactNode;
  className?: string;
  href?: string;
}

/**
 * The standard library / grid card. Cover on top, meta on the bottom.
 *
 * 卡片悬停 / 进场动效由 `.anime-card-glow` 类承担（见 globals.css）；
 * 配套的 IntersectionObserver / mousemove 由父级 useCardGlow 钩子接管。
 */
export function AnimeCard({
  id,
  title,
  titleJa,
  coverUrl,
  watchStatus,
  currentEpisode = 0,
  totalEpisodes,
  airedCount,
  cornerLabel,
  showProgress = true,
  actions,
  className,
  href,
}: AnimeCardProps) {
  const cardHref = href ?? `/anime/${id}`;
  const episodesHref = `${cardHref.split("#")[0]}#episodes`;
  const denom = totalEpisodes && totalEpisodes > 0 ? totalEpisodes : null;
  const pct = denom ? Math.min(1, currentEpisode / denom) : 0;
  const unwatchedCount =
    airedCount !== undefined && denom
      ? Math.max(0, airedCount - currentEpisode)
      : 0;
  const epLabel = denom
    ? `EP ${String(currentEpisode).padStart(2, "0")} / ${String(denom).padStart(2, "0")}`
    : `EP ${String(currentEpisode).padStart(2, "0")}`;

  return (
    <div className="t-tilt group rounded-[8px]">
      <article
        className={cn(
          "anime-card-glow t-tilt-card",
          "rounded-[8px] overflow-hidden",
          "border border-[color:var(--border-subtle)]",
          "bg-[color:var(--bg-surface)]",
          "touch-pan-y",
          className,
        )}
      >
        {/* Keep the glow host outside the anchor; Chrome can freeze conic-gradient angles inside link subtrees. */}
        <a
          href={cardHref}
          aria-label={`查看 ${title}`}
          className="absolute inset-0 z-[8] rounded-[8px] touch-pan-y"
        >
          <span className="sr-only">查看 {title}</span>
        </a>

        <div className="pointer-events-none">
          <div className="relative">
            <AnimeCover src={coverUrl} alt={title} ratio="16/9" />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 35%, transparent 60%, rgba(0,0,0,0.55) 100%)",
              }}
            />

            {watchStatus && (
              <div className="absolute top-2 left-2">
                <StatusBadge status={watchStatus} />
              </div>
            )}

            {cornerLabel && (
              <div className="absolute top-2 right-2">
                <span
                  data-tabular
                  className="px-1.5 py-0.5 rounded-[6px] text-[10px] font-semibold tracking-tight bg-black/55 text-[color:var(--text-primary)] border border-white/10 backdrop-blur"
                >
                  {cornerLabel}
                </span>
              </div>
            )}

            <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
              <span
                data-tabular
                className="text-[11px] font-medium text-white/90 tracking-tight"
              >
                {epLabel}
              </span>
              {unwatchedCount > 0 && (
                <a
                  href={episodesHref}
                  aria-label={`查看 ${title} 的 ${unwatchedCount} 集待看`}
                  title={`${unwatchedCount} 集待看`}
                  data-tabular
                  className="pointer-events-auto relative z-[20] inline-flex rounded-full bg-[color:var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--accent-contrast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
                >
                  待看 {unwatchedCount}
                </a>
              )}
            </div>
          </div>

          <div className="p-3">
            <p className="text-[13px] font-semibold tracking-tight text-[color:var(--text-primary)] truncate">
              {title}
            </p>
            {titleJa && (
              <p className="mt-0.5 text-[11px] text-[color:var(--text-muted)] truncate">
                {titleJa}
              </p>
            )}

            {showProgress && denom && (
              <div className="mt-2 h-[3px] w-full rounded-full bg-[color:var(--bg-surface-hover)] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct * 100}%`,
                    background: "var(--accent)",
                    transition: "width 250ms var(--ease-default)",
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {actions && (
          <div className="relative z-[20] px-3 pb-3 -mt-1 flex flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
        <div className="t-tilt-glare" aria-hidden />
      </article>
    </div>
  );
}
