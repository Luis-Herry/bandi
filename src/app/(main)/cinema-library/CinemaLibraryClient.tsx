"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Clapperboard, Search } from "lucide-react";
import { ClearableInput, GlassPanel } from "@/components/ui";
import { CinemaCard } from "@/components/features/CinemaCard";
import { CinemaCatalogImportButton } from "@/components/features/CinemaCatalogImportButton";
import { cn } from "@/lib/cn";
import { useCardGlow } from "@/hooks/useCardGlow";
import { useSlidingTabs } from "@/hooks/useSlidingTabs";
import type { CinemaItem, CinemaWatchStatus } from "@/lib/db-helpers/cinema";

type Tab = "all" | CinemaWatchStatus;
type MediaFilter = "all" | "drama" | "movie";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "planning", label: "想看" },
  { value: "watching", label: "在看" },
  { value: "completed", label: "看完" },
  { value: "onhold", label: "搁置" },
  { value: "dropped", label: "弃剧" },
];

const MEDIA_FILTERS: { value: MediaFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "drama", label: "电视剧" },
  { value: "movie", label: "电影" },
];

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center h-7 px-2.5 rounded-[6px] text-[12px] leading-none border",
        "transition-[background,color,border-color] duration-150 [transition-timing-function:var(--ease-default)]",
        active
          ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border-[color:var(--accent-muted)]"
          : "bg-transparent text-[color:var(--text-secondary)] border-[color:var(--border-subtle)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-default)]",
      )}
    >
      {children}
    </button>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="pt-[3px] min-w-12 shrink-0 text-[12px] text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function CinemaLibraryClient({ items }: { items: CinemaItem[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [mediaType, setMediaType] = useState<MediaFilter>("all");
  const [year, setYear] = useState<number | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [scoreOrder, setScoreOrder] = useState<"desc" | "asc">("desc");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      all: items.length,
      planning: 0,
      watching: 0,
      completed: 0,
      onhold: 0,
      dropped: 0,
    };
    for (const it of items) if (it.watchStatus) c[it.watchStatus] += 1;
    return c;
  }, [items]);

  // 动态可选值：只列当前数据里实际存在的年份 / 题材，没数据的维度整行隐藏
  const { years, genres } = useMemo(() => {
    const ys = new Set<number>();
    const gs = new Set<string>();
    for (const it of items) {
      if (it.year) ys.add(it.year);
      for (const t of it.tags) if (t.trim()) gs.add(t.trim());
    }
    return {
      years: [...ys].sort((a, b) => b - a),
      genres: [...gs].sort((a, b) => a.localeCompare(b, "zh")),
    };
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const passed = items.filter((it) => {
      if (tab !== "all" && it.watchStatus !== tab) return false;
      if (mediaType !== "all" && it.mediaType !== mediaType) return false;
      if (year != null && it.year !== year) return false;
      if (genre && !it.tags.includes(genre)) return false;
      if (q) {
        const hay = `${it.title} ${it.titleJa ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const hasScore = (it: CinemaItem) => it.rating != null && it.rating > 0;
    const scored = passed.filter(hasScore);
    const unscored = passed.filter((it) => !hasScore(it));
    scored.sort((a, b) =>
      scoreOrder === "desc"
        ? (b.rating ?? 0) - (a.rating ?? 0)
        : (a.rating ?? 0) - (b.rating ?? 0),
    );
    return [...scored, ...unscored];
  }, [items, tab, mediaType, year, genre, query, scoreOrder]);
  const gridRef = useCardGlow<HTMLDivElement>([filtered]);
  const statusTabsRef = useSlidingTabs<HTMLDivElement>([
    tab,
    items.length,
  ]);

  return (
    <div className="app-page-container py-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Clapperboard size={20} className="text-[color:var(--accent)]" />
            <h1 className="text-[22px] font-semibold tracking-tight text-[color:var(--text-primary)]">
              影视库
            </h1>
          </div>
          <p className="text-[13px] text-[color:var(--text-secondary)]">
            热播、高分、上映中的电视剧和电影 · 详情页内查看正版观看入口 · 共 {items.length} 部
          </p>
        </div>
        <CinemaCatalogImportButton />
      </header>

      {/* 追踪状态 tab */}
      <div
        ref={statusTabsRef}
        role="tablist"
        aria-label="追踪状态"
        className="t-tabs t-tabs-segmented flex w-fit max-w-full flex-wrap items-center gap-1 rounded-[8px] border border-[color:var(--border-subtle)] p-1"
      >
        <span className="t-tabs-pill" aria-hidden="true" />
        {TABS.map((t) => {
          const on = t.value === tab;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.value)}
              className={cn(
                "t-tab h-8 shrink-0 rounded-[6px] px-3 text-[12px] font-medium",
                on && "text-[color:var(--accent)]",
              )}
            >
              {t.label}
              <span data-tabular className="ml-1.5 text-[10px] opacity-70">
                {counts[t.value]}
              </span>
            </button>
          );
        })}
      </div>

      {/* 筛选区：分类 / 年份 / 题材（动态）/ 搜索 + 评分排序 */}
      <div className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-4 space-y-3">
        <FilterRow label="分类">
          {MEDIA_FILTERS.map((m) => (
            <FilterChip
              key={m.value}
              active={mediaType === m.value}
              onClick={() => setMediaType(m.value)}
            >
              {m.label}
            </FilterChip>
          ))}
        </FilterRow>

        {years.length > 0 && (
          <FilterRow label="年份">
            <FilterChip active={year === null} onClick={() => setYear(null)}>
              全部
            </FilterChip>
            {years.map((y) => (
              <FilterChip
                key={y}
                active={year === y}
                onClick={() => setYear(year === y ? null : y)}
              >
                {y}
              </FilterChip>
            ))}
          </FilterRow>
        )}

        {genres.length > 0 && (
          <FilterRow label="题材">
            <FilterChip active={genre === null} onClick={() => setGenre(null)}>
              全部
            </FilterChip>
            {genres.map((g) => (
              <FilterChip
                key={g}
                active={genre === g}
                onClick={() => setGenre(genre === g ? null : g)}
              >
                {g}
              </FilterChip>
            ))}
          </FilterRow>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--border-subtle)] pt-3">
          <div className="min-w-12 shrink-0 text-[12px] text-[color:var(--text-muted)]">
            搜索
          </div>
          <div className="min-w-[200px] flex-1">
            <ClearableInput
              value={query}
              onValueChange={setQuery}
              placeholder="搜索标题（中文或外文）"
              prefixIcon={<Search size={14} />}
              spellCheck={false}
              className="h-8 rounded-[6px] bg-[color:var(--bg-surface-hover)]"
              inputClassName="text-[12px]"
            />
          </div>
          <span className="ml-auto text-[12px] text-[color:var(--text-muted)]">
            评分
          </span>
          <FilterChip
            active={scoreOrder === "desc"}
            onClick={() => setScoreOrder("desc")}
          >
            高在前
          </FilterChip>
          <FilterChip
            active={scoreOrder === "asc"}
            onClick={() => setScoreOrder("asc")}
          >
            低在前
          </FilterChip>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div
          ref={gridRef}
          className="grid grid-cols-2 gap-4 min-[640px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
        >
          {filtered.map((item, i) => (
            <CinemaCard
              key={item.id}
              item={item}
              priority={i < 6}
              detailSource="library"
            />
          ))}
        </div>
      ) : (
        <GlassPanel className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <Clapperboard size={28} className="text-[color:var(--text-muted)]" />
          <p className="text-[14px] font-medium text-[color:var(--text-primary)]">
            {items.length === 0 ? "影视库还是空的" : "没有符合筛选的影视"}
          </p>
          <p className="max-w-[420px] text-[12px] leading-relaxed text-[color:var(--text-muted)]">
            点「更新影视库」从 TMDb 公开榜单拉取热播、高分、上映中的影视资料；有了本地文件会归到「本地库」。
          </p>
        </GlassPanel>
      )}
    </div>
  );
}
