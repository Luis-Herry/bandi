"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Minus, Plus, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { TextSwap } from "@/components/ui";

interface EpisodeProgressControlProps {
  animeId: number;
  /** 数据库里的「看到第几集」（绝对集号，0 表示还未开始） */
  initialCurrent: number;
  /** 该季最大集号；用作上限。未知时为 null，不做封顶。
   *  注意：这是集号，不是集数。S2 从 13 起到 24，这里应传 24。 */
  maxEpisode: number | null;
  /** 最小集号；通常 0 */
  minEpisode?: number;
  /** 当前是否在追番列表里；不在则不可编辑 */
  enabled: boolean;
  /** 禁用时的解释文案；默认用于尚未加入追踪的条目。 */
  disabledLabel?: string;
}

/**
 * 详情页的「我看到第几集」显式控件。
 *
 * 形态：
 *    看到  ┌────┐  [ 14 ]  ┌────┐  / 24
 *          │ -  │          │ +  │
 *          └────┘          └────┘
 *
 * 数字本身就是输入框，可直接键入跳跃集号。Enter / blur 提交，Esc 撤回。
 */
export function EpisodeProgressControl({
  animeId,
  initialCurrent,
  maxEpisode,
  minEpisode = 0,
  enabled,
  disabledLabel = "追番后可记录",
}: EpisodeProgressControlProps) {
  const [current, setCurrent] = useState(initialCurrent);
  const [draft, setDraft] = useState(String(initialCurrent));
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<"ok" | "err" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // initialCurrent 由父级 SSR 数据变化驱动（路由切换/刷新）
  useEffect(() => {
    setCurrent(initialCurrent);
    setDraft(String(initialCurrent));
  }, [initialCurrent]);

  const clamp = (n: number) =>
    Math.max(minEpisode, maxEpisode != null ? Math.min(maxEpisode, n) : n);

  const canDec = enabled && current > minEpisode;
  const canInc =
    enabled && (maxEpisode == null || current < maxEpisode);
  const progressStateText =
    flash === "ok"
      ? "已保存"
      : flash === "err"
        ? "保存失败"
        : pending
          ? "保存中…"
          : "";

  const persist = (next: number) => {
    if (next === current) {
      setDraft(String(next));
      return;
    }
    const prev = current;
    setCurrent(next);
    setDraft(String(next));
    startTransition(async () => {
      try {
        const res = await fetch(`/api/library/${animeId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ currentEpisode: next }),
        });
        const data = (await res.json().catch(() => null)) as {
          watchStatus?: string;
        } | null;
        if (!res.ok) {
          setCurrent(prev);
          setDraft(String(prev));
          setFlash("err");
        } else {
          window.dispatchEvent(
            new CustomEvent("anime-progress-change", {
              detail: { animeId, currentEpisode: next },
            }),
          );
          if (data?.watchStatus) {
            window.dispatchEvent(
              new CustomEvent("anime-watch-status-change", {
                detail: { animeId, watchStatus: data.watchStatus },
              }),
            );
          }
          setFlash("ok");
        }
        setTimeout(() => setFlash(null), 1200);
      } catch {
        setCurrent(prev);
        setDraft(String(prev));
        setFlash("err");
        setTimeout(() => setFlash(null), 1500);
      }
    });
  };

  const step = (delta: number) => {
    if (!enabled) return;
    persist(clamp(current + delta));
  };

  const commitDraft = () => {
    if (!enabled) return;
    const n = Number(draft);
    if (!Number.isFinite(n)) {
      setDraft(String(current));
      return;
    }
    persist(clamp(Math.floor(n)));
  };

  return (
    <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
      {/* 状态消息位放最前：固定宽度占位避免抖动，同时让控件区域贴父容器右边 */}
      <span
        className={cn(
          "w-14 text-right text-[11px] transition-opacity",
          flash || pending ? "opacity-100" : "opacity-0",
          flash === "err"
            ? "text-[color:var(--status-error)]"
            : "text-[color:var(--accent)]",
        )}
      >
        <span className="inline-flex items-center gap-0.5">
          {flash === "ok" && (
            <Check size={11} strokeWidth={2.8} />
          )}
          <TextSwap value={progressStateText} shimmer={pending} />
        </span>
      </span>

      <span
        className="text-[11px] text-[color:var(--text-muted)] mr-1 hidden sm:inline"
      >
        看到
      </span>

      <div
        className={cn(
          "inline-flex h-9 items-center overflow-hidden rounded-[8px] sm:h-8",
          "bg-[color:var(--bg-surface)] border border-[color:var(--border-subtle)]",
          "focus-within:border-[color:var(--accent-muted)]",
          !enabled && "opacity-50",
        )}
      >
        <button
          type="button"
          aria-label="减一集"
          onClick={() => step(-1)}
          disabled={!canDec || pending}
          className={cn(
            "grid h-full w-9 place-items-center sm:w-8",
            "text-[color:var(--text-secondary)]",
            "hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]",
            "disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[color:var(--text-muted)]",
            "transition-colors",
          )}
        >
          <Minus size={13} strokeWidth={2.5} />
        </button>

        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          aria-label="看到第几集"
          data-tabular
          value={draft}
          min={minEpisode}
          max={maxEpisode ?? undefined}
          disabled={!enabled || pending}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraft(String(current));
              e.currentTarget.blur();
            }
          }}
          className={cn(
            "h-full w-14 bg-transparent px-1 text-center outline-none",
            "text-[13px] font-semibold tracking-tight",
            "text-[color:var(--text-primary)]",
            "border-x border-[color:var(--border-subtle)]",
            "disabled:cursor-not-allowed",
            "[appearance:textfield]",
            "[&::-webkit-inner-spin-button]:appearance-none",
            "[&::-webkit-outer-spin-button]:appearance-none",
          )}
        />

        <button
          type="button"
          aria-label="加一集"
          onClick={() => step(1)}
          disabled={!canInc || pending}
          className={cn(
            "grid h-full w-9 place-items-center sm:w-8",
            "text-[color:var(--text-secondary)]",
            "hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]",
            "disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[color:var(--text-muted)]",
            "transition-colors",
          )}
        >
          <Plus size={13} strokeWidth={2.5} />
        </button>
      </div>

      {maxEpisode != null && (
        <span
          data-tabular
          className="text-[11px] text-[color:var(--text-muted)]"
        >
          / {maxEpisode}
        </span>
      )}

      {!enabled && (
        <span className="text-[11px] text-[color:var(--text-muted)]">
          {disabledLabel}
        </span>
      )}
    </div>
  );
}
