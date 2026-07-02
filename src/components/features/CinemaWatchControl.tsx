"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Plus } from "lucide-react";
import { showToast } from "@/components/features/ToastHost";
import { cn } from "@/lib/cn";
import type { CinemaWatchStatus } from "@/lib/db-helpers/cinema";

/**
 * 影视个人维度紧凑控件（卡片角标 / 我的影视页）。
 *
 * 复用动漫的 `/api/library`（按 animeId 操作 userAnime，与 mediaType 无关）：
 * 首次加入 POST，改状态 PATCH，移除 DELETE。文案走影视语义（想看 / 在看 / 看完 /
 * 搁置 / 弃剧），快捷加默认「想看」(planning)。改动后 router.refresh() 让卡片角标
 * 和「我的影视」分组同步。
 */
const STATUSES: {
  value: CinemaWatchStatus;
  label: string;
  bg: string;
  fg: string;
}[] = [
  { value: "planning", label: "想看", bg: "#94a3b8", fg: "#0f172a" },
  { value: "watching", label: "在看", bg: "var(--accent)", fg: "var(--accent-contrast)" },
  { value: "completed", label: "看完", bg: "#4ade80", fg: "#052e16" },
  { value: "onhold", label: "搁置", bg: "#c084fc", fg: "#2e1048" },
  { value: "dropped", label: "弃剧", bg: "#b85a4a", fg: "#3f1a13" },
];

function metaOf(s: CinemaWatchStatus) {
  return STATUSES.find((x) => x.value === s) ?? STATUSES[0];
}

export function CinemaWatchControl({
  animeId,
  initialStatus,
  size = "sm",
}: {
  animeId: number;
  initialStatus: CinemaWatchStatus | null;
  /** sm = 卡片角标（h-7）；md = 详情页 CTA（h-10） */
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [status, setStatus] = useState<CinemaWatchStatus | null>(initialStatus);
  const [pending, startTransition] = useTransition();
  const sizeCls =
    size === "md"
      ? "h-10 px-4 text-sm gap-1.5"
      : "h-7 px-2 text-[11px] gap-1";

  const apply = (next: CinemaWatchStatus | null) => {
    const prev = status;
    setStatus(next);
    startTransition(async () => {
      try {
        let res: Response;
        if (next === null) {
          res = await fetch(`/api/library/${animeId}`, { method: "DELETE" });
        } else if (prev === null) {
          res = await fetch("/api/library", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ animeId, watchStatus: next }),
          });
        } else {
          res = await fetch(`/api/library/${animeId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ watchStatus: next }),
          });
        }
        if (!res.ok) throw new Error("save failed");
        showToast({
          title:
            next === null ? "已清除标记" : `已标记「${metaOf(next).label}」`,
          tone: next === null ? "info" : "success",
        });
        router.refresh();
      } catch {
        setStatus(prev);
        showToast({
          title: "保存失败",
          description: "网络连接异常",
          tone: "error",
        });
      }
    });
  };

  if (status === null) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => apply("planning")}
        className={cn(
          "inline-flex items-center rounded-[6px] font-medium backdrop-blur",
          sizeCls,
          "border border-[color:var(--accent)]/35 bg-[color:var(--accent-subtle)] text-[color:var(--accent)]",
          "hover:border-[color:var(--accent)] transition-colors",
          pending && "opacity-60 cursor-wait",
        )}
      >
        <Plus size={12} strokeWidth={2.5} />
        想看
      </button>
    );
  }

  const tone = metaOf(status);
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={pending}
          style={{ background: tone.bg, color: tone.fg }}
          className={cn(
            "inline-flex items-center rounded-[6px] font-semibold backdrop-blur",
            sizeCls,
            "hover:brightness-110 active:brightness-95 transition-[filter]",
            pending && "opacity-60 cursor-wait",
          )}
        >
          {tone.label}
          <ChevronDown size={12} strokeWidth={2.5} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            "t-dropdown z-50 min-w-[140px] p-1 rounded-[8px]",
            "bg-[color:var(--bg-elevated)] border border-[color:var(--border-default)]",
            "shadow-[0_12px_36px_rgba(0,0,0,0.45)]",
          )}
        >
          {STATUSES.map((s) => (
            <DropdownMenu.Item
              key={s.value}
              onSelect={() => apply(s.value)}
              className={cn(
                "flex items-center justify-between gap-2 h-8 px-2 rounded-[6px] text-[13px]",
                "cursor-pointer outline-none",
                "data-[highlighted]:bg-[color:var(--bg-surface-hover)]",
              )}
            >
              {/* 左侧文字与 dot 同色（状态色）；只有右侧选中 ✅ 用主题色 */}
              <span
                className="inline-flex items-center gap-2"
                style={{ color: s.bg }}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: s.bg }}
                />
                {s.label}
              </span>
              {s.value === status && (
                <Check size={14} className="text-[color:var(--accent)]" />
              )}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-[color:var(--border-subtle)]" />
          <DropdownMenu.Item
            onSelect={() => apply(null)}
            className={cn(
              "flex items-center h-8 px-2 rounded-[6px] text-[13px]",
              "text-[color:var(--status-error)] cursor-pointer outline-none",
              "data-[highlighted]:bg-[color:var(--bg-surface-hover)]",
            )}
          >
            清除标记
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
