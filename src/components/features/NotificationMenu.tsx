"use client";

import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type {
  NavNotificationItem,
  NavNotificationSummary,
} from "@/lib/nav-notifications";

interface NotificationMenuProps {
  notifications: NavNotificationSummary;
}

const TONE_CLASS: Record<NavNotificationItem["tone"], string> = {
  alert: "text-[color:var(--status-warning)] bg-[rgba(245,158,11,0.12)]",
  accent: "text-[color:var(--accent)] bg-[color:var(--accent-subtle)]",
  muted: "text-[color:var(--text-muted)] bg-[color:var(--bg-surface-hover)]",
};

export function NotificationMenu({ notifications }: NotificationMenuProps) {
  const [summary, setSummary] = useState(notifications);
  const hasItems = summary.items.length > 0;
  const unreadCount = summary.unreadCount;

  useEffect(() => {
    setSummary(notifications);
  }, [notifications]);

  function applyReadState(ids: string[], clearBadge = false) {
    if (ids.length === 0 && !clearBadge) return;
    const readIds = new Set(ids);
    setSummary((current) => ({
      unreadCount: clearBadge
        ? 0
        : Math.max(
            0,
            current.unreadCount -
              current.items.filter(
                (item) =>
                  readIds.has(item.id) && item.countsAsUnread && !item.isRead,
              ).length,
          ),
      items: current.items.map((item) =>
        readIds.has(item.id) || clearBadge ? { ...item, isRead: true } : item,
      ),
    }));
  }

  async function persistRead(payload: { ids?: string[]; all?: boolean }) {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("[notifications] mark read failed", error);
    }
  }

  function markItemAsRead(item: NavNotificationItem) {
    if (item.isRead) return;
    applyReadState([item.id]);
    void persistRead({ ids: [item.id] });
  }

  function markAllAsRead() {
    if (unreadCount === 0) return;
    const ids = summary.items.filter((item) => !item.isRead).map((item) => item.id);
    applyReadState(ids, true);
    void persistRead({ all: true });
  }

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`通知，${unreadCount} 条未读`}
          title="通知"
          className={cn(
            "relative inline-flex h-8 w-8 items-center justify-center rounded-[6px] border",
            "border-[color:var(--border-default)] bg-[color:var(--bg-surface-hover)]",
            "text-[color:var(--text-primary)]",
            "transition-[background,color,border-color,opacity] duration-150",
            "hover:border-white/20 hover:bg-white/[0.14]",
            "focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]",
            "[&_svg]:h-4 [&_svg]:w-4",
          )}
        >
          <Bell />
          {unreadCount > 0 && (
            <span
              data-tabular
              className={cn(
                "absolute -right-1 -top-1 min-w-4 rounded-full px-1",
                "border border-[color:var(--bg-base)] bg-[color:var(--accent)]",
                "text-center text-[9px] font-bold leading-4 text-[color:var(--accent-contrast)]",
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 w-[min(calc(100vw-24px),360px)] rounded-[8px] p-1.5",
            "border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)]",
            "shadow-[0_12px_36px_rgba(0,0,0,0.45)]",
          )}
        >
          <div className="flex items-center justify-between gap-3 px-2 py-2">
            <div className="flex items-center gap-2 text-[12px] font-medium text-[color:var(--text-primary)]">
              <Bell size={13} className="text-[color:var(--accent)]" />
              最新通知
            </div>
            <button
              type="button"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className={cn(
                "inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1",
                "text-[10px] text-[color:var(--text-muted)]",
                "transition-colors hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--accent)]",
                "disabled:pointer-events-none disabled:opacity-45",
              )}
            >
              <CheckCheck size={12} />
              全部已读
            </button>
          </div>

          {hasItems ? (
            <div className="max-h-[min(70vh,420px)] overflow-y-auto pr-0.5">
              {summary.items.map((item) => (
                <DropdownMenu.Item
                  key={item.id}
                  asChild
                  className={cn(
                    "group rounded-[6px] outline-none",
                    "data-[highlighted]:bg-[color:var(--bg-surface-hover)]",
                  )}
                >
                  <a
                    href={item.href}
                    onClick={() => markItemAsRead(item)}
                    className={cn(
                      "grid grid-cols-[28px_1fr_auto] items-start gap-2 px-2 py-2.5",
                      item.isRead && "opacity-60",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-[6px]",
                        item.isRead
                          ? "bg-[color:var(--bg-surface-hover)] text-[color:var(--text-muted)]"
                          : TONE_CLASS[item.tone],
                      )}
                    >
                      {item.isRead ? (
                        <CheckCircle2 size={13} />
                      ) : item.tone === "muted" ? (
                        <CalendarClock size={13} />
                      ) : (
                        <AlertCircle size={13} />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block text-[12px] font-medium",
                          item.isRead
                            ? "text-[color:var(--text-secondary)]"
                            : "text-[color:var(--text-primary)]",
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
                        {item.description}
                      </span>
                    </span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-[color:var(--text-muted)] transition-colors group-data-[highlighted]:text-[color:var(--accent)]">
                      {item.isRead ? "已读" : item.actionLabel}
                      {item.isRead ? <CheckCircle2 size={11} /> : <ArrowRight size={11} />}
                    </span>
                  </a>
                </DropdownMenu.Item>
              ))}
            </div>
          ) : (
            <div className="px-2 py-6 text-center">
              <p className="text-[12px] font-medium text-[color:var(--text-primary)]">
                暂无新通知
              </p>
              <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                有新集、漏看或临近更新时会出现在这里
              </p>
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
