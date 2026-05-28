import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  /** 0..1 */
  value?: number;
  indeterminate?: boolean;
  /** show numeric label on the right */
  showLabel?: boolean;
}

export function ProgressBar({
  value = 0,
  indeterminate = false,
  showLabel = false,
  className,
  ...rest
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn("flex items-center gap-3", className)} {...rest}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(pct)}
        className="relative flex-1 h-1 rounded-full overflow-hidden bg-[color:var(--bg-surface)] border border-[color:var(--border-subtle)]"
      >
        {indeterminate ? (
          <div
            className="absolute top-0 h-full w-1/3 bg-[color:var(--accent)] opacity-80"
            style={{
              animation: "progress-indeterminate 1.4s ease-in-out infinite",
            }}
          />
        ) : (
          <div
            className="h-full bg-[color:var(--accent)]"
            style={{
              width: `${pct}%`,
              transition: "width 250ms var(--ease-default)",
            }}
          />
        )}
      </div>
      {showLabel && !indeterminate && (
        <span
          data-tabular
          className="text-xs text-[color:var(--text-secondary)] min-w-[3ch] text-right"
        >
          {Math.round(pct)}%
        </span>
      )}
      <style>{`
        @keyframes progress-indeterminate {
          0% { left: -33%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
}
