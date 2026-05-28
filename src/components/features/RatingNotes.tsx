"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";

interface RatingNotesProps {
  animeId: number;
  initialRating?: number | null;
  initialNotes?: string | null;
  disabled?: boolean;
}

export function RatingNotes({
  animeId,
  initialRating,
  initialNotes,
  disabled,
}: RatingNotesProps) {
  const [rating, setRating] = useState<number>(initialRating ?? 0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [notes, setNotes] = useState<string>(initialNotes ?? "");
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");

  const display = hoverRating || rating;

  const save = (next?: { rating?: number; notes?: string }) => {
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
        setSaved(res.ok ? "ok" : "err");
        setTimeout(() => setSaved("idle"), 1500);
      } catch {
        setSaved("err");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= display;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => {
                setRating(n);
                save({ rating: n });
              }}
              className={cn(
                "p-1 rounded-[6px] transition-colors",
                "hover:bg-[color:var(--bg-surface)]",
                disabled && "cursor-not-allowed opacity-50",
              )}
              aria-label={`评分 ${n} 星`}
            >
              <Star
                size={20}
                strokeWidth={1.5}
                className={cn(
                  "transition-colors",
                  active
                    ? "text-[color:var(--accent)]"
                    : "text-[color:var(--text-muted)]",
                )}
                style={{
                  fill: active ? "var(--accent)" : "transparent",
                }}
              />
            </button>
          );
        })}
        {rating > 0 && (
          <span
            data-tabular
            className="ml-2 text-[12px] text-[color:var(--text-secondary)]"
          >
            {rating}.0
          </span>
        )}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => save()}
        disabled={disabled}
        rows={4}
        placeholder="写点观看感受…"
        className={cn(
          "w-full px-3 py-2 rounded-[8px] resize-none",
          "bg-[color:var(--bg-surface)] border border-[color:var(--border-subtle)]",
          "text-[13px] text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]",
          "focus:border-[color:var(--accent-muted)] focus:outline-none focus:bg-[color:var(--bg-surface-hover)]",
          "transition-colors leading-relaxed",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      />

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[color:var(--text-muted)]">
          {saving
            ? "保存中…"
            : saved === "ok"
              ? "已保存"
              : saved === "err"
                ? "保存失败"
                : "失焦自动保存"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => save()}
          disabled={disabled || saving}
        >
          保存
        </Button>
      </div>
    </div>
  );
}
