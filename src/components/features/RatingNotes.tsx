"use client";

import { useState, useTransition } from "react";
import { Check, FileEdit, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/features/ToastHost";
import {
  formatRatingScore,
  formatStarRatingLabel,
  getStarFillPercent,
  normalizeRatingInput,
} from "@/lib/rating";

interface RatingNotesProps {
  animeId: number;
  initialRating?: number | null;
  initialNotes?: string | null;
  initialUpdatedAt?: string | null;
  disabled?: boolean;
}

export function RatingNotes({
  animeId,
  initialRating,
  initialNotes,
  initialUpdatedAt,
  disabled,
}: RatingNotesProps) {
  const [rating, setRating] = useState<number>(initialRating ?? 0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [notes, setNotes] = useState<string>(initialNotes ?? "");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    initialUpdatedAt ?? null,
  );
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");

  const display = hoverRating || rating;
  const score = formatRatingScore(rating);

  const save = (
    next?: { rating?: number; notes?: string },
    options?: { quiet?: boolean },
  ) => {
    if (disabled) return;
    startSaving(async () => {
      try {
        const res = await fetch(`/api/library/${animeId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            rating: next?.rating ?? rating,
            notes: next?.notes ?? notes,
          }),
        });
        if (!res.ok) {
          setSaved("err");
          if (!options?.quiet) {
            showToast({ title: "笔记保存失败", tone: "error" });
          }
          setTimeout(() => setSaved("idle"), 1500);
          return;
        }
        setSaved("ok");
        setLastSavedAt(new Date().toISOString());
        if (!options?.quiet) {
          showToast({ title: "评分笔记已保存", tone: "success" });
        }
        setTimeout(() => setSaved("idle"), 1500);
      } catch {
        setSaved("err");
        if (!options?.quiet) {
          showToast({ title: "笔记保存失败", description: "网络连接异常", tone: "error" });
        }
        setTimeout(() => setSaved("idle"), 1500);
      }
    });
  };

  const chooseRating = (nextRating: number) => {
    const normalized = normalizeRatingInput(nextRating);
    if (normalized == null) return;
    setRating(normalized);
    save({ rating: normalized }, { quiet: true });
  };

  return (
    <div className={cn("relative overflow-hidden", disabled && "opacity-60")}>
      <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-[color:var(--accent-subtle)] blur-3xl" />

      <div className="relative flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
        <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
          我的评分 + 笔记
        </h3>
        <span className="text-[11px] text-[color:var(--text-muted)]">
          追番记录本
        </span>
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[13px] text-[color:var(--text-secondary)]">
            我的评分:
          </span>
          <div
            className="flex items-center gap-1"
            onMouseLeave={() => setHoverRating(0)}
          >
            {[1, 2, 3, 4, 5].map((n) => {
              const fillPercent = getStarFillPercent(n, display);
              const halfValue = n - 0.5;
              const fullValue = n;
              return (
                <span
                  key={n}
                  className="relative block h-6 w-6 rounded-[6px]"
                >
                  <Star
                    size={20}
                    strokeWidth={1.8}
                    className="pointer-events-none absolute left-0.5 top-0.5 text-[color:var(--text-muted)] transition-colors"
                    style={{ fill: "transparent" }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-0.5 top-0.5 h-5 overflow-hidden"
                    style={{ width: `${fillPercent}%` }}
                  >
                    <Star
                      size={20}
                      strokeWidth={1.8}
                      className="h-5 w-5 shrink-0 text-[color:var(--accent)] transition-colors"
                      style={{
                        fill: "var(--accent)",
                        filter:
                          fillPercent > 0
                            ? "drop-shadow(0 0 4px rgb(var(--accent-rgb) / 0.42))"
                            : undefined,
                      }}
                    />
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`评分 ${formatStarRatingLabel(halfValue)}`}
                    onMouseEnter={() => setHoverRating(halfValue)}
                    onFocus={() => setHoverRating(halfValue)}
                    onBlur={() => setHoverRating(0)}
                    onClick={() => chooseRating(halfValue)}
                    className={cn(
                      "absolute left-0 top-0 h-full w-1/2 rounded-l-[6px]",
                      "transition-transform active:scale-90",
                      "focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]",
                      disabled && "cursor-not-allowed",
                    )}
                  />
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`评分 ${formatStarRatingLabel(fullValue)}`}
                    onMouseEnter={() => setHoverRating(fullValue)}
                    onFocus={() => setHoverRating(fullValue)}
                    onBlur={() => setHoverRating(0)}
                    onClick={() => chooseRating(fullValue)}
                    className={cn(
                      "absolute right-0 top-0 h-full w-1/2 rounded-r-[6px]",
                      "transition-transform active:scale-90",
                      "focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]",
                      disabled && "cursor-not-allowed",
                    )}
                  />
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex shrink-0 items-baseline gap-1">
          <span
            data-tabular
            className="text-[26px] font-bold leading-none text-[color:var(--accent)]"
          >
            {score}
          </span>
          <span className="text-[12px] text-[color:var(--text-muted)]">
            分
          </span>
        </div>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => save(undefined, { quiet: true })}
        disabled={disabled}
        rows={4}
        placeholder={disabled ? "追番后可记录观看感受" : "写点观看感受..."}
        className={cn(
          "relative mt-4 h-24 w-full resize-none rounded-[8px] px-3 py-2.5",
          "border border-[color:var(--border-subtle)] bg-black/25",
          "text-[13px] text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]",
          "focus:border-[color:var(--accent-muted)] focus:bg-black/30 focus:outline-none",
          "transition-colors leading-relaxed",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      />

      <div className="relative mt-4 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--accent)]" />
          {saving
            ? "保存中…"
            : saved === "ok"
              ? "已保存"
              : saved === "err"
                ? "保存失败"
                : `上一次编辑：${formatSavedAt(lastSavedAt)}`}
        </span>
        <button
          type="button"
          onClick={() => save()}
          disabled={disabled || saving}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] px-4",
            "bg-[color:var(--accent)] text-[color:var(--accent-contrast)]",
            "text-[12px] font-semibold transition-[filter,opacity,transform]",
            "hover:brightness-110 active:scale-[0.98]",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : saved === "ok" ? (
            <Check size={14} />
          ) : (
            <FileEdit size={14} />
          )}
          {saving ? "同步中..." : saved === "ok" ? "已保存" : "编辑笔记"}
        </button>
      </div>
    </div>
  );
}

function formatSavedAt(value: string | null) {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无记录";
  const now = Date.now();
  if (now - date.getTime() < 60_000) return "刚刚";
  return `${date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })} 记录`;
}
