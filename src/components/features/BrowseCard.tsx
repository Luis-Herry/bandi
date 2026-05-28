"use client";

import { Check, Loader2, Plus, Star } from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "@/components/ui";
import { AnimeCover } from "@/components/features/AnimeCover";
import type { SeasonalBrowseItem } from "@/lib/db-helpers/browse";
import { cn } from "@/lib/cn";

/**
 * 番剧库 / 首页本季新番共用的卡片。
 *
 * - 包裹容器带 `.anime-card-glow`：父网格挂 `useCardGlow` 可触发扫描环 + 鼠标跟随描边
 * - hover：封面放大、文字上移、底部 tag + 想看按钮浮现
 * - 链接策略：
 * - 链接策略：整卡详情入口统一使用原生 `<a>`。
 *   首页刚登录 / 切回首页后 Next soft navigation 偶发失效，原生跳转能保证点了必达。
 * - 想看按钮通过 `showAddButton` 控制；首页通常关掉，引导用户去番剧库批量操作
 */
export interface BrowseCardProps {
  item: SeasonalBrowseItem;
  /** 是否显示「想看」按钮，false 时 hover 浮层只显示 tags */
  showAddButton?: boolean;
  /** 加入中状态（外部管理） */
  busy?: boolean;
  /** 点击「想看」回调；showAddButton=true 时必须传 */
  onAdd?: () => void;
  /** 是否给 next/image 加 priority（首屏卡片避免 lazy 空白） */
  priority?: boolean;
}

export function BrowseCard({
  item,
  showAddButton = true,
  busy = false,
  onAdd,
  priority = false,
}: BrowseCardProps) {
  const cover = item.coverUrl;
  // bgm rating 已是 10 分制
  const score = item.score != null && item.score > 0 ? item.score.toFixed(1) : null;
  const eps = item.episodes != null ? `${item.episodes} 集` : null;
  const year =
    item.date && /^\d{4}/.test(item.date) ? item.date.slice(0, 4) : null;
  const href =
    item.localAnimeId != null
      ? `/anime/${item.localAnimeId}`
      : `/anime/bgm/${item.bangumiId}`;

  const cardBody: ReactNode = (
    <div className="relative w-full">
      {/* 封面图：hover 时整体放大；AnimeCover 自带 aspect 3/4，撑出卡片高度 */}
      <div className="transition-transform duration-[700ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105">
        <AnimeCover
          src={cover}
          alt={item.title}
          ratio="3/4"
          priority={priority}
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
        />
      </div>

      {/* 顶部渐变：保住右上角 badge 可读性；底部渐变：保住文字可读性 */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-[8px] pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 30%, transparent 45%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.92) 100%)",
        }}
      />

      {/* 左上：评分 */}
      {score && (
        <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] bg-black/55 border border-white/10 backdrop-blur z-10">
          <Star
            size={11}
            className="text-[color:var(--accent)]"
            style={{ fill: "var(--accent)" }}
          />
          <span
            data-tabular
            className="text-[11px] font-semibold text-white/95"
          >
            {score}
          </span>
        </div>
      )}

      {/* 右上：已收藏 */}
      {item.inLibrary && (
        <div className="absolute top-2 right-2 z-10">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] text-[10px] font-semibold bg-[color:var(--accent-muted)] text-[color:var(--accent)] border border-[color:var(--accent)]/40 backdrop-blur">
            <Check size={10} strokeWidth={3} />
            已收藏
          </span>
        </div>
      )}

      {/* 底部文字块：常态在卡片底部，hover 时整体上移给底部按钮腾位 */}
      <div
        className={cn(
          "absolute left-3 right-3 bottom-3 z-10",
          "transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
          "group-hover:-translate-y-12",
        )}
      >
        <div className="flex items-center gap-1.5 text-[10px] text-white/75 mb-1">
          {year && <span data-tabular>{year}</span>}
          {year && eps && <span className="text-white/40">·</span>}
          {eps && <span data-tabular>{eps}</span>}
        </div>
        <p className="text-[14px] font-semibold tracking-tight text-white leading-tight line-clamp-2 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
          {item.title}
        </p>
        {item.titleJa && item.titleJa !== item.title && (
          <p className="mt-0.5 text-[11px] text-white/70 truncate [text-shadow:0_1px_6px_rgba(0,0,0,0.55)]">
            {item.titleJa}
          </p>
        )}
      </div>

      {/* 底部浮现区：tags + 「想看」按钮，常态 opacity-0 + 下沉，hover 浮上来 */}
      <div
        className={cn(
          "absolute left-3 right-3 bottom-3 z-10",
          "flex items-center justify-between gap-2",
          "opacity-0 pointer-events-none",
          "[transform:translateY(12px)]",
          "group-hover:opacity-100 group-hover:[transform:translateY(0)]",
        )}
        style={{
          transition:
            "transform 500ms cubic-bezier(0.22, 1, 0.36, 1), opacity 380ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="flex flex-wrap gap-1 min-w-0">
          {item.tags.slice(0, 2).map((g) => (
            <span
              key={g}
              className={cn(
                "inline-flex items-center px-1.5 h-5 rounded-[4px]",
                "text-[10px] leading-none font-medium",
                "bg-black/45 border border-white/15 text-white/85 backdrop-blur",
              )}
            >
              {g}
            </span>
          ))}
        </div>
        {showAddButton && !item.inLibrary && onAdd && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="pointer-events-none group-hover:pointer-events-auto"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAdd();
            }}
            disabled={busy}
            leftIcon={
              busy ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Plus size={12} strokeWidth={2.8} />
              )
            }
          >
            {busy ? "加入中" : "想看"}
          </Button>
        )}
      </div>
    </div>
  );

  const cardClass = cn(
    "anime-card-glow group",
    "rounded-[8px] overflow-hidden",
    "border border-[color:var(--border-subtle)]",
    "bg-[color:var(--bg-surface)]",
  );

  return (
    <article
      className={cardClass}
      onClick={(event) => {
        if (event.defaultPrevented) return;
        const target = event.target as HTMLElement;
        if (target.closest("button,a")) return;
        window.location.href = href;
      }}
    >
      {/* Keep the glow host outside the anchor; Chrome can freeze conic-gradient angles inside link subtrees. */}
      <a
        href={href}
        aria-label={`查看 ${item.title}`}
        className="absolute inset-0 z-[8] block cursor-pointer rounded-[8px]"
      >
        <span className="sr-only">查看 {item.title}</span>
      </a>
      <div className="pointer-events-none">{cardBody}</div>
    </article>
  );
}
