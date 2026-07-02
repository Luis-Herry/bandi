"use client";

import { Film, Tv } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 顶部导航的「动漫 ⇄ 影视」空间切换器。
 *
 * 两个空间各自有干净的子导航（动漫走顶部链接，影视走页面内 看剧/电影 子 tab），
 * 这里只负责在两个空间之间跳转。用原生 `<a>` 跳转，避免 soft navigation 偶发失效。
 */
const SPACES = [
  { key: "anime", label: "动漫", href: "/", Icon: Tv },
  { key: "cinema", label: "影视", href: "/cinema", Icon: Film },
] as const;

export function SpaceSwitcher({
  active,
  variant = "desktop",
}: {
  active: "anime" | "cinema";
  variant?: "desktop" | "mobile";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[8px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface-hover)] p-0.5",
        variant === "mobile" && "w-full",
      )}
    >
      {SPACES.map((s) => {
        const on = s.key === active;
        return (
          <a
            key={s.key}
            href={s.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 h-7 rounded-[6px] px-2.5 text-[12px] transition-colors",
              variant === "mobile" && "flex-1",
              on
                ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-medium"
                : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
            )}
          >
            <s.Icon size={14} className="shrink-0" />
            {s.label}
          </a>
        );
      })}
    </div>
  );
}
