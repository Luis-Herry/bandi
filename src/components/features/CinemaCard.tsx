"use client";

import { Star } from "lucide-react";
import { AnimeCover } from "@/components/features/AnimeCover";
import { CinemaWatchControl } from "@/components/features/CinemaWatchControl";
import { cn } from "@/lib/cn";
import type { CinemaItem } from "@/lib/db-helpers/cinema";

/**
 * 影视（电视剧 / 电影）海报卡。
 *
 * 复用现有设计语言：与 `BrowseCard` 同款玻璃容器、封面渐变遮罩、左上评分、底部标题块；
 * 海报比例 2:3（影视惯例），去掉番剧专属的 orbit glow。
 * 右上角是个人维度控件（想看 / 在看…），独立于卡片链接；未追踪时 hover 才出现，
 * 已追踪时常显状态。「在哪合法看 / 本地已有」挪到底部标题上方作信息行。
 * 点击进入 `/cinema/[id]` 影视详情。
 */
export function CinemaCard({
  item,
  priority = false,
  detailSource,
  hideWatchControl = false,
}: {
  item: CinemaItem;
  priority?: boolean;
  detailSource?: "local" | "library";
  /** 成人区：不显示「想看/在看」追踪控件 */
  hideWatchControl?: boolean;
}) {
  const score =
    item.rating != null && item.rating > 0 ? item.rating.toFixed(1) : null;
  const info = item.isLocal
    ? { label: "本地已有", className: "text-[color:var(--status-success)]" }
    : item.providerLabel
      ? { label: item.providerLabel, className: "text-[color:var(--accent)]" }
      : null;
  const href = detailSource
    ? `/cinema/${item.id}?from=${detailSource}`
    : `/cinema/${item.id}`;

  return (
    <div className="t-tilt group rounded-[8px]">
      <article
        className={cn(
          "anime-card-glow t-tilt-card relative rounded-[8px] overflow-hidden",
          "border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)]",
          "transition-colors hover:border-[color:var(--border-default)] group-hover:border-[color:var(--border-default)]",
        )}
      >
      <a href={href} aria-label={`查看 ${item.title}`} className="block">
        <div className="relative w-full">
          <div className="transition-transform duration-[700ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105">
            <AnimeCover
              src={item.posterUrl}
              alt={item.title}
              ratio="2/3"
              priority={priority}
              sizes="(min-width: 1280px) 20vw, (min-width: 768px) 25vw, (min-width: 520px) 33vw, 50vw"
            />
          </div>

          <div
            aria-hidden
            className="absolute inset-0 rounded-[8px] pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 28%, transparent 46%, rgba(0,0,0,0.58) 74%, rgba(0,0,0,0.92) 100%)",
            }}
          />

          {score && (
            <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] bg-black/55 border border-white/10 backdrop-blur z-10">
              <Star
                size={11}
                className="text-[color:var(--accent)]"
                style={{ fill: "var(--accent)" }}
              />
              <span data-tabular className="text-[11px] font-semibold text-white/95">
                {score}
              </span>
            </div>
          )}

          <div className="absolute left-3 right-3 bottom-3 z-10">
            {info && (
              <div
                className={cn(
                  "mb-1 inline-flex max-w-full items-center gap-1 text-[10px] font-medium [text-shadow:0_1px_6px_rgba(0,0,0,0.7)]",
                  info.className,
                )}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
                />
                <span className="truncate">{info.label}</span>
              </div>
            )}
            {item.year && (
              <div className="text-[10px] text-white/75 mb-1" data-tabular>
                {item.year}
              </div>
            )}
            <p className="text-[14px] font-semibold tracking-tight text-white leading-tight line-clamp-2 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
              {item.title}
            </p>
            {item.titleJa && item.titleJa !== item.title && (
              <p className="mt-0.5 text-[11px] text-white/70 truncate [text-shadow:0_1px_6px_rgba(0,0,0,0.55)]">
                {item.titleJa}
              </p>
            )}
          </div>
        </div>
      </a>

      {/* 个人维度控件，独立于卡片链接；未追踪 hover 才现，已追踪常显。成人区不显示。 */}
      {!hideWatchControl && (
        <div
          className={cn(
            "absolute top-2 right-2 z-20",
            item.watchStatus === null &&
              "opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
          )}
        >
          <CinemaWatchControl animeId={item.id} initialStatus={item.watchStatus} />
        </div>
        )}
        <div className="t-tilt-glare" aria-hidden />
      </article>
    </div>
  );
}
