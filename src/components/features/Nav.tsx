"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { signOut } from "next-auth/react";
import {
  Check,
  LogOut,
  Menu,
  Palette,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import { setThemeAction } from "@/app/(main)/actions";
import { NotificationMenu } from "@/components/features/NotificationMenu";
import { SpaceSwitcher } from "@/components/features/SpaceSwitcher";
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
  isDesktop?: boolean;
  isManagedLocal?: boolean;
}

const TEXT = {
  account: "Bandi \u8d26\u6237",
  config: "\u914d\u7f6e",
  downloads: "\u4e0b\u8f7d\u7ba1\u7406",
  home: "\u9996\u9875",
  library: "\u6211\u7684\u8ffd\u756a",
  more: "\u66f4\u591a",
  nav: "\u5bfc\u822a",
  openUserMenu: "\u6253\u5f00\u7528\u6237\u83dc\u5355",
  overview: "\u6982\u89c8",
  profile: "\u4e2a\u4eba\u4e2d\u5fc3",
  search: "\u641c\u7d22",
  searchPlaceholder: "\u641c\u7d22\u756a\u5267\u3001\u65e5\u6587\u539f\u540d\u3001Bangumi...",
  settings: "\u8bbe\u7f6e\u4e2d\u5fc3",
  signOut: "\u9000\u51fa\u767b\u5f55",
  stats: "\u7edf\u8ba1",
  theme: "\u4e3b\u9898",
  titleHome: "Bandi \u9996\u9875",
  user: "\u7528\u6237",
} as const;

const LINKS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/", label: TEXT.home, match: (p) => p === "/" },
  {
    href: "/library",
    label: TEXT.library,
    match: (p) => p === "/library",
  },
  {
    href: "/library/local",
    label: "\u672c\u5730\u5e93",
    match: (p) => p.startsWith("/library/local"),
  },
  {
    href: "/browse",
    label: "\u756a\u5267\u5e93",
    match: (p) => p.startsWith("/browse"),
  },
  {
    href: "/stats",
    label: TEXT.stats,
    match: (p) => p.startsWith("/stats"),
  },
  {
    href: "/admin/downloads",
    label: TEXT.downloads,
    match: (p) => p.startsWith("/admin"),
  },
];

// 影视空间的子导航（进入 /cinema* 时替换动漫链接）。两块：
// 「本地库」= 有本地文件、可直接播（/cinema，切到影视的默认落地页）；
// 「影视库」= 公开影视资料 + 个人标记 + 在哪合法看（/cinema-library）。
const CINEMA_LINKS: { href: string; label: string; match: (p: string) => boolean }[] =
  [
    { href: "/cinema", label: "本地库", match: (p) => p === "/cinema" },
    {
      href: "/cinema-library",
      label: "影视库",
      match: (p) => p.startsWith("/cinema-library"),
    },
  ];

function getDetailAnimeId(pathname: string): number | null {
  const match = /^\/anime\/(\d+)(?:\/|$)/.exec(pathname);
  if (!match) return null;
  const animeId = Number(match[1]);
  return Number.isFinite(animeId) && animeId > 0 ? animeId : null;
}

export function Nav({
  username,
  currentTheme,
  notifications,
  isDesktop = false,
  isManagedLocal = false,
}: NavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [theme, setTheme] = useState<UserTheme>(currentTheme);
  const [displayName, setDisplayName] = useState(username ?? TEXT.user);
  const [savingTheme, setSavingTheme] = useState(false);
  const [isTrackedAnimeDetail, setIsTrackedAnimeDetail] = useState(false);
  const [, startTransition] = useTransition();
  const detailAnimeId = getDetailAnimeId(pathname);
  const isLocalAnimeDetail =
    detailAnimeId != null && searchParams.get("from") === "local";
  const cinemaDetailSource = pathname.startsWith("/cinema/")
    ? searchParams.get("from")
    : null;
  const isCinemaSpace = pathname.startsWith("/cinema");
  const navLinks = isCinemaSpace ? CINEMA_LINKS : LINKS;

  useEffect(() => {
    setTheme(currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    setDisplayName(username ?? TEXT.user);
  }, [username]);

  useEffect(() => {
    const handleDisplayNameChange = (event: Event) => {
      const nextName = (
        event as CustomEvent<{ displayName?: string }>
      ).detail?.displayName?.trim();
      if (nextName) setDisplayName(nextName);
    };

    window.addEventListener(
      "bandi:profile-display-name-change",
      handleDisplayNameChange,
    );
    return () => {
      window.removeEventListener(
        "bandi:profile-display-name-change",
        handleDisplayNameChange,
      );
    };
  }, []);

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

  const openSearch = () => {
    window.dispatchEvent(new Event("bandi:open-search"));
  };

  const renderThemeItems = () =>
    THEME_OPTIONS.map((item) => (
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
        <span className="min-w-0 truncate">{item.label}</span>
        {theme === item.value && (
          <Check size={13} className="text-[color:var(--accent)]" />
        )}
      </DropdownMenu.Item>
    ));

  const renderAccountItems = () => (
    <>
      <div className="px-2 py-2">
        <div className="text-[12px] font-medium text-[color:var(--text-primary)]">
          {displayName}
        </div>
        <div className="mt-0.5 text-[10px] text-[color:var(--text-muted)]">
          {isManagedLocal ? "本机资料" : TEXT.account}
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
          <span>{TEXT.profile}</span>
          <span className="text-[10px] text-[color:var(--text-muted)]">
            {TEXT.overview}
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
          <span>{TEXT.settings}</span>
          <span className="text-[10px] text-[color:var(--text-muted)]">
            {TEXT.config}
          </span>
        </a>
      </DropdownMenu.Item>
      {!isManagedLocal && (
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
          <span>{TEXT.signOut}</span>
        </DropdownMenu.Item>
      )}
    </>
  );

  return (
    <>
      <SearchCommand />
      <header
        className={cn(
          "pointer-events-none fixed left-0 right-0 z-[45] w-full",
          isDesktop
            ? "top-[var(--desktop-titlebar-shell-height)]"
            : "top-0",
          "border-b border-[color:var(--border-default)]",
        )}
        style={{
          background: "transparent",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
        }}
      >
        <div className="pointer-events-auto relative flex h-16 w-full items-center border-b border-transparent px-6">
          <div className="relative z-10 flex min-w-0 shrink-0 items-center">
            <SpaceSwitcher active={isCinemaSpace ? "cinema" : "anime"} />
          </div>

          <nav className="pointer-events-auto absolute top-1/2 left-[var(--app-page-gutter)] hidden -translate-y-1/2 items-center gap-4 min-[1100px]:flex xl:gap-5">
            {navLinks.map((l) => {
              const active =
                l.match(pathname) ||
                (l.href === "/cinema" && cinemaDetailSource === "local") ||
                (l.href === "/cinema-library" &&
                  cinemaDetailSource === "library") ||
                (l.href === "/library/local" && isLocalAnimeDetail) ||
                (l.href === "/library" &&
                  isTrackedAnimeDetail &&
                  !isLocalAnimeDetail);
              return (
                <a
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "relative py-1 text-[13px] tracking-tight transition-colors",
                    active
                      ? "font-medium text-[color:var(--text-primary)]"
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

          <div className="pointer-events-none absolute top-1/2 right-[var(--app-page-gutter)] hidden w-[280px] -translate-y-1/2 min-[1100px]:block lg:w-[320px] xl:w-[388px]">
            <button
              type="button"
              onClick={openSearch}
              className={cn(
                "pointer-events-auto w-full flex items-center gap-2 h-9 px-3 rounded-[8px] border",
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
              <span className="min-w-0 flex-1 truncate text-left">
                {TEXT.searchPlaceholder}
              </span>
            </button>
          </div>

          <div className="relative z-10 ml-auto hidden shrink-0 items-center gap-3 min-[1100px]:flex">
            <NotificationMenu notifications={notifications} />
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <IconButton
                  label={TEXT.theme}
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
                    "t-dropdown z-50 w-[220px] rounded-[8px] p-1.5",
                    "border border-[color:var(--border-default)]",
                    "bg-[color:var(--bg-elevated)]",
                    "shadow-[0_12px_36px_rgba(0,0,0,0.45)]",
                  )}
                >
                  <div className="flex items-center gap-2 px-2 py-2 text-[12px] font-medium text-[color:var(--text-primary)]">
                    <Palette size={13} className="text-[color:var(--accent)]" />
                    {TEXT.theme}
                  </div>
                  {renderThemeItems()}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label={TEXT.openUserMenu}
                  className={cn(
                    "rounded-full outline-none",
                    "focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]",
                  )}
                >
                  <Avatar
                    name={displayName}
                    size="md"
                    title={displayName}
                  />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className={cn(
                    "t-dropdown z-50 w-[220px] rounded-[8px] p-1.5",
                    "border border-[color:var(--border-default)]",
                    "bg-[color:var(--bg-elevated)]",
                    "shadow-[0_12px_36px_rgba(0,0,0,0.45)]",
                  )}
                >
                  {renderAccountItems()}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

          <div className="relative z-10 ml-auto flex shrink-0 items-center gap-2 min-[1100px]:hidden">
            <IconButton
              label={TEXT.search}
              size="sm"
              onClick={openSearch}
              className={cn(
                "bg-[color:var(--bg-surface-hover)] border-[color:var(--border-default)]",
                "text-[color:var(--text-primary)]",
                "hover:bg-white/[0.14] hover:border-white/20",
              )}
            >
              <Search />
            </IconButton>

            <NotificationMenu notifications={notifications} />

            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <IconButton
                  label={TEXT.theme}
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
                    "t-dropdown z-50 w-[220px] rounded-[8px] p-1.5",
                    "border border-[color:var(--border-default)]",
                    "bg-[color:var(--bg-elevated)]",
                    "shadow-[0_12px_36px_rgba(0,0,0,0.45)]",
                  )}
                >
                  <div className="flex items-center gap-2 px-2 py-2 text-[12px] font-medium text-[color:var(--text-primary)]">
                    <Palette size={13} className="text-[color:var(--accent)]" />
                    {TEXT.theme}
                  </div>
                  {renderThemeItems()}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <IconButton
                  label={TEXT.more}
                  size="sm"
                  className={cn(
                    "bg-[color:var(--bg-surface-hover)] border-[color:var(--border-default)]",
                    "text-[color:var(--text-primary)]",
                    "hover:bg-white/[0.14] hover:border-white/20",
                  )}
                >
                  <Menu />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className={cn(
                    "t-dropdown z-50 max-h-[calc(100vh-72px)] w-[min(calc(100vw-24px),360px)] overflow-y-auto rounded-[8px] p-1.5",
                    "border border-[color:var(--border-default)]",
                    "bg-[color:var(--bg-elevated)]",
                    "shadow-[0_12px_36px_rgba(0,0,0,0.45)]",
                  )}
                >
                  <>
                    <div className="px-2 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                      {TEXT.nav}
                    </div>
                    {navLinks.map((l) => {
                        const active =
                          l.match(pathname) ||
                          (l.href === "/cinema" &&
                            cinemaDetailSource === "local") ||
                          (l.href === "/cinema-library" &&
                            cinemaDetailSource === "library") ||
                          (l.href === "/library/local" &&
                            isLocalAnimeDetail) ||
                          (l.href === "/library" &&
                            isTrackedAnimeDetail &&
                            !isLocalAnimeDetail);
                        return (
                          <DropdownMenu.Item
                            key={l.href}
                            asChild
                            className={cn(
                              "grid grid-cols-[1fr_auto] items-center gap-2 rounded-[6px] px-2 py-2",
                              "cursor-pointer outline-none",
                              "text-[12px] text-[color:var(--text-secondary)]",
                              "data-[highlighted]:bg-[color:var(--bg-surface-hover)] data-[highlighted]:text-[color:var(--text-primary)]",
                              active && "text-[color:var(--text-primary)]",
                            )}
                          >
                            <a href={l.href}>
                              <span>{l.label}</span>
                              {active && (
                                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                              )}
                            </a>
                          </DropdownMenu.Item>
                        );
                      })}
                    </>

                  <DropdownMenu.Separator className="my-1 h-px bg-[color:var(--border-subtle)]" />
                  {renderAccountItems()}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </header>
    </>
  );
}
