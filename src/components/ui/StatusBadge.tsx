import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type WatchStatus =
  | "watching"
  | "planning"
  | "completed"
  | "onhold"
  | "dropped";

export type DownloadStatus = "pending" | "downloading" | "completed" | "failed";

interface Tone {
  label: string;
  dot: string;
  text: string;
  bg: string;
  border: string;
}

// 追番状态：用中性灰 + accent，避免色彩污染
const WATCH_TONES: Record<WatchStatus, Tone> = {
  watching: {
    label: "在看",
    dot: "bg-[color:var(--accent)]",
    text: "text-[color:var(--accent)]",
    bg: "bg-[color:var(--accent-subtle)]",
    border: "border-[color:var(--accent-muted)]",
  },
  planning: {
    label: "想看",
    dot: "bg-[#94a3b8]",
    text: "text-[#cbd5e1]",
    bg: "bg-[rgba(148,163,184,0.08)]",
    border: "border-[rgba(148,163,184,0.20)]",
  },
  completed: {
    label: "看完",
    dot: "bg-[color:var(--status-success)]",
    text: "text-[color:var(--status-success)]",
    bg: "bg-[rgba(74,222,128,0.08)]",
    border: "border-[rgba(74,222,128,0.20)]",
  },
  onhold: {
    label: "搁置",
    dot: "bg-[#c084fc]",
    text: "text-[#d8b4fe]",
    bg: "bg-[rgba(192,132,252,0.09)]",
    border: "border-[rgba(192,132,252,0.28)]",
  },
  dropped: {
    label: "弃番",
    dot: "bg-[#b85a4a]",
    text: "text-[#c97464]",
    bg: "bg-[rgba(184,90,74,0.08)]",
    border: "border-[rgba(184,90,74,0.22)]",
  },
};

// 下载状态
const DOWNLOAD_TONES: Record<DownloadStatus, Tone> = {
  pending: {
    label: "排队中",
    dot: "bg-[color:var(--text-secondary)]",
    text: "text-[color:var(--text-secondary)]",
    bg: "bg-[color:var(--bg-surface)]",
    border: "border-[color:var(--border-subtle)]",
  },
  downloading: {
    label: "下载中",
    dot: "bg-[color:var(--accent)] animate-pulse",
    text: "text-[color:var(--accent)]",
    bg: "bg-[color:var(--accent-subtle)]",
    border: "border-[color:var(--accent-muted)]",
  },
  completed: {
    label: "下载完成",
    dot: "bg-[color:var(--status-success)]",
    text: "text-[color:var(--status-success)]",
    bg: "bg-[rgba(74,222,128,0.08)]",
    border: "border-[rgba(74,222,128,0.20)]",
  },
  failed: {
    label: "失败",
    dot: "bg-[color:var(--status-error)]",
    text: "text-[color:var(--status-error)]",
    bg: "bg-[rgba(239,68,68,0.08)]",
    border: "border-[rgba(239,68,68,0.20)]",
  },
};

type StatusBadgeProps =
  | (HTMLAttributes<HTMLSpanElement> & {
      kind?: "watch";
      status: WatchStatus;
      label?: string;
      hideDot?: boolean;
    })
  | (HTMLAttributes<HTMLSpanElement> & {
      kind: "download";
      status: DownloadStatus;
      label?: string;
      hideDot?: boolean;
    });

export function StatusBadge({
  kind = "watch",
  status,
  label,
  hideDot,
  className,
  ...rest
}: StatusBadgeProps) {
  const tone =
    kind === "download"
      ? DOWNLOAD_TONES[status as DownloadStatus]
      : WATCH_TONES[status as WatchStatus];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] border text-xs font-medium",
        tone.bg,
        tone.text,
        tone.border,
        className,
      )}
      {...rest}
    >
      {!hideDot && (
        <span
          aria-hidden
          className={cn("w-1.5 h-1.5 rounded-full", tone.dot)}
        />
      )}
      {label ?? tone.label}
    </span>
  );
}
