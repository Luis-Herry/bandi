"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { AnimeCover } from "./AnimeCover";
import { cn } from "@/lib/cn";

interface AnimeRowItemProps {
  id: number;
  title: string;
  coverUrl?: string | null;
  /** secondary line e.g. EP.08 / 已看 7 集 */
  meta?: string;
  /** progress 0..1, omit to hide */
  progress?: number;
  /** trailing slot, e.g. a button */
  action?: ReactNode;
  className?: string;
}

/**
 * Horizontal list item used by 继续观看 / 漏看提醒 / 详情页相关推荐。
 * Layout: small landscape cover · title + meta + progress · trailing slot
 */
export function AnimeRowItem({
  id,
  title,
  coverUrl,
  meta,
  progress,
  action,
  className,
}: AnimeRowItemProps) {
  return (
    <motion.div
      whileHover={{ x: 2 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "relative",
        "group flex flex-wrap sm:flex-nowrap items-center gap-3 p-2 rounded-[8px]",
        "border border-transparent",
        "transition-colors hover:bg-[color:var(--bg-surface)] hover:border-[color:var(--border-subtle)]",
        className,
      )}
    >
      <a
        href={`/anime/${id}`}
        aria-label={`查看 ${title}`}
        className="absolute inset-0 z-[1] rounded-[8px]"
      >
        <span className="sr-only">查看 {title}</span>
      </a>
      <div className="pointer-events-none shrink-0">
        <AnimeCover
          src={coverUrl}
          alt={title}
          ratio="16/9"
          className="w-[88px] rounded-[6px] sm:w-[120px]"
        />
      </div>
      <div className="pointer-events-none flex-1 min-w-0">
        <p className="block text-[13px] font-semibold tracking-tight text-[color:var(--text-primary)] truncate transition-colors group-hover:text-[color:var(--accent)]">
          {title}
        </p>
        {meta && (
          <p
            data-tabular
            className="mt-0.5 text-[11px] text-[color:var(--text-secondary)] truncate"
          >
            {meta}
          </p>
        )}
        {progress !== undefined && (
          <div className="mt-1.5 h-[3px] w-full rounded-full bg-[color:var(--bg-surface-hover)] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                background: "var(--accent)",
              }}
            />
          </div>
        )}
      </div>
      {action && (
        <div className="relative z-[2] ml-auto flex shrink-0 items-center justify-end">
          {action}
        </div>
      )}
    </motion.div>
  );
}
