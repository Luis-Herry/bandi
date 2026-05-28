"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { signOut } from "next-auth/react";
import {
  Check,
  Flame,
  LogOut,
  Palette,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import { setThemeAction } from "@/app/(main)/actions";
import { NotificationMenu } from "@/components/features/NotificationMenu";
import SearchCommand from "@/components/features/SearchCommand";
import { Avatar, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { applyClientTheme } from "@/lib/theme-client";
import { THEME_OPTIONS, type UserTheme } from "@/lib/theme-options";
import type { NavNotificationSummary } from "@/lib/nav-notifications";

interface NavProps {
  username?: string | null;
  currentTheme: UserTheme;
  notifications: NavNotificationSummary;
}

const LINKS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/", label: "首页", match: (p) => p === "/" },
  {
    href: "/library",
    label: "我的追番",
    match: (p) => p.startsWith("/library"),
  },
  {
    href: "/browse",
    label: "番剧库",
    match: (p) => p.startsWith("/browse"),
  },
  {
    href: "/stats",
    label: "统计",
    match: (p) => p.startsWith("/stats"),
  },
  {
    href: "/admin/downloads",
    label: "下载管理",
    match: (p) => p.startsWith("/admin"),
  },
];

function getDetailAnimeId(pathname: string): number | null {
  const match = /^\/anime\/(\d+)(?:\/|$)/.exec(pathname);
  if (!match) return null;
  const animeId = Number(match[1]);
  return Number.isFinite(animeId) && animeId > 0 ? animeId : null;
}

export function Nav({ username, currentTheme, notifications }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<UserTheme>(currentTheme);
  const [savingTheme, setSavingTheme] = useState(false);
  const [isTrackedAnimeDetail, setIsTrackedAnimeDetail] = useState(false);
  const [, startTransition] = useTransition();
  const detailAnimeId = getDetailAnimeId(pathname);

  useEffect(() => {
    setTheme(currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    if (!detailAnimeId) {
      setIsTrackedAnimeDetail(false);
      return;
    }

    let cancelled = false;
    setIsTrackedAnimeDetail(false);

    fetch(`/api/anime/${detailAnimeId}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setIsTrackedAnimeDetail(Boolean(data?.userAnime));
        }
      })
      .catch(() => {
        if (!cancelled) setIsTrackedAnimeDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailAnimeId]);

  useEffect(() => {
    const handleLibraryChange = (event: Event) => {
      if (!detailAnimeId) return;
      const detail = (event as CustomEvent<{ animeId?: number; inLibrary?: boolean }>).detail;
      if (detail?.animeId !== detailAnimeId) return;
      if (typeof detail.inLibrary === "boolean") {
        setIsTrackedAnimeDetail(detail.inLibrary);
      }
    };

    window.addEventListener("anime-library-status-change", handleLibraryChange);
    return () => {
      window.removeEventListener("anime-library-status-change", handleLibraryChange);
    };
  }, [detailAnimeId]);

  const selectTheme = (next: UserTheme) => {
    if (savingTheme || next === theme) return;
    const previous = theme;
    setTheme(next);
    setSavingTheme(true);
    applyClientTheme(next);
    void setThemeAction(next)
      .then((result) => {
        setTheme(result.theme);
        applyClientTheme(result.theme);
        startTransition(() => router.refresh());
      })
      .catch(() => {
        setTheme(previous);
        applyClientTheme(previous);
      })
      .finally(() => setSavingTheme(false));
  };

  const handleSignOut = () => {
    void signOut({ callbackUrl: "/login" });
  };

  return (
    <>
      <SearchCommand />
      <header
        className={cn(
          "pointer-events-none fixed top-0 left-0 right-0 z-[45] w-full",
          "border-b border-[color:var(--border-default)]",
        )}
        style={{
          // 背景全靠 backdrop-filter，纯磨砂玻璃，不带任何底色
          background: "transparent",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
        }}
      >
        <div className="pointer-events-auto relative mx-auto flex h-14 max-w-[1440px] items-center px-4 sm:px-6 lg:px-8">
          {/* 左：brand + nav */}
          <div className="flex items-center gap-5 xl:gap-8 shrink-0">
            <a
              href="/"
              className="flex items-center gap-2 shrink-0"
              aria-label="追番中心 首页"
            >
              <span
                className="inline-flex items-center justify-center w-7 h-7 rounded-[6px]"
                style={{
                  background:
                    "linear-gradient(180deg, rgb(var(--accent-rgb) / 0.20) 0%, rgb(var(--accent-rgb) / 0.08) 100%)",
                  border: "1px solid rgb(var(--accent-rgb) / 0.28)",
                }}
              >
                <Flame
                  size={14}
                  style={{
                    color: "var(--accent)",
                    fill: "rgb(var(--accent-rgb) / 0.25)",
                  }}
                />
              </span>
              <span className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                追番中心
              </span>
            </a>

            {/* nav links */}
            <nav className="hidden min-[980px]:flex items-center gap-4 xl:gap-5">
              {LINKS.map((l) => {
                const active =
                  l.match(pathname) ||
                  (l.href === "/library" && isTrackedAnimeDetail);
                return (
                  <a
                    key={l.href}
                    href={l.href}
                    className={cn(
                      "relative text-[13px] tracking-tight py-1 transition-colors",
                      active
                        ? "text-[color:var(--text-primary)] font-medium"
                        : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                    )}
                  >
                    {l.label}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute -bottom-[3px] left-0 right-0 h-[2px] rounded-full"
                        style={{ background: "var(--accent)" }}
                      />
                    )}
                  </a>
                );
              })}
            </nav>
          </div>

          {/* 中：search trigger，绝对居中于 header */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden w-full max-w-[280px] -translate-x-1/2 -translate-y-1/2 px-4 md:block lg:max-w-[320px] xl:max-w-[420px]">
            <button
              type="button"
              onClick={() => {
                // dispatch a synthetic cmd+k for the stub; real component will
                // listen the same way and open its dialog.
                window.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    key: "k",
                    ctrlKey: true,
                    metaKey: true,
                  }),
                );
              }}
              className={cn(
                "pointer-events-auto w-full flex items-center gap-2 h-9 px-3 rounded-[8px] border",
                // 同 Avatar：半透明白 + 浅描边
                "bg-[color:var(--bg-surface-hover)] border-[color:var(--border-default)]",
                "text-[13px] text-[color:var(--text-primary)]",
                "hover:bg-white/[0.14] hover:border-white/20",
                "transition-colors",
              )}
            >
              <Search
                size={14}
                className="text-[color:var(--text-primary)] shrink-0"
              />
              <span className="min-w-0 flex-1 truncate text-left">搜索番剧、日文原名、Bangumi…</span>
            </button>
          </div>

          {/* 右：cluster */}
          <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
            <NotificationMenu notifications={notifications} />
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <IconButton
                  label="主题"
                  size="sm"
                  className={cn(
                    "bg-[color:var(--bg-surface-hover)] border-[color:var(--border-default)]",
                    "text-[color:var(--text-primary)]",
                    "hover:bg-white/[0.14] hover:border-white/20",
                  )}
                >
                  <Palette />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className={cn(
                    "z-50 w-[220px] rounded-[8px] p-1.5",
                    "border border-[color:var(--border-default)]",
                    "bg-[color:var(--bg-elevated)]",
                    "shadow-[0_12px_36px_rgba(0,0,0,0.45)]",
                  )}
                >
                  <div className="flex items-center gap-2 px-2 py-2 text-[12px] font-medium text-[color:var(--text-primary)]">
                    <Palette size={13} className="text-[color:var(--accent)]" />
                    主题
                  </div>
                  {THEME_OPTIONS.map((item) => (
                    <DropdownMenu.Item
                      key={item.value}
                      disabled={savingTheme}
                      onSelect={() => selectTheme(item.value)}
                      className={cn(
                        "grid grid-cols-[18px_1fr_auto] items-center gap-2 rounded-[6px] px-2 py-2",
                        "cursor-pointer outline-none",
                        "text-[12px] text-[color:var(--text-secondary)]",
                        "data-[disabled]:cursor-wait data-[disabled]:opacity-60",
                        "data-[highlighted]:bg-[color:var(--bg-surface-hover)]",
                        theme === item.value && "text-[color:var(--text-primary)]",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-3.5 w-3.5 items-center justify-center rounded-full border transition-colors",
                          theme === item.value
                            ? "border-[color:var(--accent)]"
                            : "border-white/15",
                        )}
                        style={{ background: item.bgBase }}
                      >
                        {theme === item.value && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                        )}
                      </span>
                      <span className="min-w-0 truncate">
                        {item.label}
                      </span>
                      {theme === item.value && (
                        <Check size={13} className="text-[color:var(--accent)]" />
                      )}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label="打开用户菜单"
                  className={cn(
                    "rounded-full outline-none",
                    "focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]",
                  )}
                >
                  <Avatar
                    name={username ?? "U"}
                    size="md"
                    title={username ?? "用户"}
                  />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className={cn(
                    "z-50 w-[220px] rounded-[8px] p-1.5",
                    "border border-[color:var(--border-default)]",
                    "bg-[color:var(--bg-elevated)]",
                    "shadow-[0_12px_36px_rgba(0,0,0,0.45)]",
                  )}
                >
                  <div className="px-2 py-2">
                    <div className="text-[12px] font-medium text-[color:var(--text-primary)]">
                      {username ?? "用户"}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[color:var(--text-muted)]">
                      追番中心账户
                    </div>
                  </div>
                  <DropdownMenu.Item
                    asChild
                    className={cn(
                      "grid grid-cols-[18px_1fr_auto] items-center gap-2 rounded-[6px] px-2 py-2",
                      "cursor-pointer outline-none",
                      "text-[12px] text-[color:var(--text-secondary)]",
                      "data-[highlighted]:bg-[color:var(--bg-surface-hover)] data-[highlighted]:text-[color:var(--text-primary)]",
                    )}
                  >
                    <a href="/profile">
                      <UserRound size={14} />
                      <span>个人中心</span>
                      <span className="text-[10px] text-[color:var(--text-muted)]">
                        概览
                      </span>
                    </a>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    asChild
                    className={cn(
                      "grid grid-cols-[18px_1fr_auto] items-center gap-2 rounded-[6px] px-2 py-2",
                      "cursor-pointer outline-none",
                      "text-[12px] text-[color:var(--text-secondary)]",
                      "data-[highlighted]:bg-[color:var(--bg-surface-hover)] data-[highlighted]:text-[color:var(--text-primary)]",
                    )}
                  >
                    <a href="/settings">
                      <Settings size={14} />
                      <span>设置中心</span>
                      <span className="text-[10px] text-[color:var(--text-muted)]">
                        配置
                      </span>
                    </a>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="my-1 h-px bg-[color:var(--border-subtle)]" />
                  <DropdownMenu.Item
                    onSelect={handleSignOut}
                    className={cn(
                      "grid grid-cols-[18px_1fr] items-center gap-2 rounded-[6px] px-2 py-2",
                      "cursor-pointer outline-none",
                      "text-[12px] text-[color:var(--text-primary)]",
                      "data-[highlighted]:bg-[color:var(--bg-surface-hover)]",
                    )}
                  >
                    <LogOut size={14} className="text-[color:var(--accent)]" />
                    <span>退出登录</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </header>
    </>
  );
}
