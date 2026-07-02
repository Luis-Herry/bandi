"use client";

import { useEffect, useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Plus } from "lucide-react";
import { Button, StatusBadge } from "@/components/ui";
import type { WatchStatus } from "@/components/ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/features/ToastHost";

const ALL_STATUSES: { value: WatchStatus; label: string }[] = [
  { value: "watching", label: "在看" },
  { value: "planning", label: "想看" },
  { value: "completed", label: "看完" },
  { value: "onhold", label: "搁置" },
  { value: "dropped", label: "弃番" },
];

function isWatchStatus(value: unknown): value is WatchStatus {
  return ALL_STATUSES.some((status) => status.value === value);
}

// 主按钮配色：与 StatusBadge 一致；文字用各色深底反色。
const BUTTON_TONE: Record<WatchStatus, { bg: string; fg: string }> = {
  watching:  { bg: "var(--accent)", fg: "var(--accent-contrast)" },
  planning:  { bg: "#94a3b8", fg: "#0f172a" },
  completed: { bg: "#4ade80", fg: "#052e16" },
  onhold:    { bg: "#c084fc", fg: "#2e1048" },
  dropped:   { bg: "#b85a4a", fg: "#3f1a13" },
};

interface WatchStatusMenuProps {
  animeId: number;
  current: WatchStatus | null;
}

/**
 * 详情页主 CTA：未追时显示「追番」accent 实心按钮；
 * 已追时显示当前状态 + 下拉切换。
 */
export function WatchStatusMenu({ animeId, current }: WatchStatusMenuProps) {
  const [status, setStatus] = useState<WatchStatus | null>(current);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onProgressChange = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        animeId?: number;
        watchStatus?: unknown;
      };
      if (detail?.animeId !== animeId) return;
      if (!isWatchStatus(detail.watchStatus)) return;
      setStatus(detail.watchStatus);
    };
    window.addEventListener("anime-watch-status-change", onProgressChange);
    return () =>
      window.removeEventListener("anime-watch-status-change", onProgressChange);
  }, [animeId]);

  const updateStatus = (next: WatchStatus) => {
    const prev = status;
    setStatus(next);
    startTransition(async () => {
      const isAdd = prev === null;
      try {
        const res = await fetch(
          isAdd ? "/api/library" : `/api/library/${animeId}`,
          {
            method: isAdd ? "POST" : "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              isAdd
                ? { animeId, watchStatus: next }
                : { watchStatus: next },
            ),
          },
        );
        if (!res.ok) {
          setStatus(prev);
          showToast({ title: "追番状态保存失败", tone: "error" });
          return;
        }

        showToast({
          title: isAdd ? "已加入追番" : "追番状态已更新",
          description: ALL_STATUSES.find((s) => s.value === next)?.label,
          tone: "success",
        });
        window.dispatchEvent(
          new CustomEvent("anime-library-status-change", {
            detail: { animeId, inLibrary: true },
          }),
        );
      } catch {
        setStatus(prev);
        showToast({
          title: "追番状态保存失败",
          description: "网络连接异常",
          tone: "error",
        });
      }
    });
  };

  if (status === null) {
    return (
      <Button
        variant="primary"
        size="md"
        leftIcon={<Plus size={16} strokeWidth={2.5} />}
        disabled={pending}
        onClick={() => updateStatus("watching")}
        className="max-sm:flex-[1_1_calc(50%-5px)]"
      >
        追番
      </Button>
    );
  }

  const currentLabel =
    ALL_STATUSES.find((s) => s.value === status)?.label ?? "在看";
  const tone = BUTTON_TONE[status];

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={pending}
          style={{ background: tone.bg, color: tone.fg }}
          className={cn(
            "inline-flex items-center gap-2 h-10 px-4 rounded-[6px]",
            "justify-center max-sm:flex-[1_1_calc(50%-5px)]",
            "font-medium text-sm",
            "hover:brightness-110 active:brightness-95 transition-[filter]",
            "focus-visible:outline-1 focus-visible:outline-offset-2",
            pending && "opacity-60 cursor-wait",
          )}
        >
          <span>{currentLabel}</span>
          <ChevronDown size={14} strokeWidth={2.5} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className={cn(
            "t-dropdown z-50 min-w-[160px] p-1 rounded-[8px]",
            "bg-[color:var(--bg-elevated)] border border-[color:var(--border-default)]",
            "shadow-[0_12px_36px_rgba(0,0,0,0.45)]",
          )}
        >
          {ALL_STATUSES.map((s) => (
            <DropdownMenu.Item
              key={s.value}
              onSelect={() => updateStatus(s.value)}
              className={cn(
                "flex items-center justify-between gap-2 h-8 px-2 rounded-[6px] text-[13px]",
                "text-[color:var(--text-primary)]",
                "cursor-pointer outline-none",
                "data-[highlighted]:bg-[color:var(--bg-surface-hover)]",
                s.value === status && "text-[color:var(--accent)]",
              )}
            >
              <StatusBadge status={s.value} />
              {s.value === status && (
                <Check size={14} className="text-[color:var(--accent)]" />
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
