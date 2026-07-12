"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Check, LayoutGrid, List as ListIcon, Trash2, X } from "lucide-react";
import { AnimeCard } from "@/components/features/AnimeCard";
import { AnimeRowItem } from "@/components/features/AnimeRowItem";
import { ConfirmDialog } from "@/components/features/ConfirmDialog";
import { Button, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useCardGlow } from "@/hooks/useCardGlow";
import { useSlidingTabs } from "@/hooks/useSlidingTabs";
import type { WatchStatus } from "@/components/ui";
import type { LibraryItem } from "@/lib/db-helpers/library";

interface LibraryClientProps {
  items: LibraryItem[];
}

type StatusTab = "all" | WatchStatus;
type SortKey = "updated" | "rating" | "title" | "year";
type ViewMode = "grid" | "list";

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "watching", label: "在看" },
  { value: "planning", label: "想看" },
  { value: "completed", label: "看完" },
  { value: "onhold", label: "搁置" },
  { value: "dropped", label: "弃番" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "updated", label: "最近更新" },
  { value: "rating", label: "评分" },
  { value: "title", label: "名称" },
  { value: "year", label: "年份" },
];

export function LibraryClient({ items }: LibraryClientProps) {
  const router = useRouter();
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const years = useMemo(() => {
    const s = new Set<number>();
    for (const it of items) if (it.anime.year) s.add(it.anime.year);
    return Array.from(s).sort((a, b) => b - a);
  }, [items]);

  const filtered = useMemo(() => {
    let out = items;
    if (statusTab !== "all")
      out = out.filter((it) => it.userAnime.watchStatus === statusTab);
    if (typeFilter !== "all")
      out = out.filter((it) => it.anime.type === typeFilter);
    if (yearFilter !== "all")
      out = out.filter((it) => String(it.anime.year) === yearFilter);

    out = [...out].sort((a, b) => {
      switch (sort) {
        case "rating":
          return (b.userAnime.rating ?? 0) - (a.userAnime.rating ?? 0);
        case "title":
          return a.anime.title.localeCompare(b.anime.title, "zh-CN");
        case "year":
          return (b.anime.year ?? 0) - (a.anime.year ?? 0);
        case "updated":
        default: {
          const at =
            a.userAnime.updatedAt instanceof Date
              ? a.userAnime.updatedAt.getTime()
              : Number(a.userAnime.updatedAt);
          const bt =
            b.userAnime.updatedAt instanceof Date
              ? b.userAnime.updatedAt.getTime()
              : Number(b.userAnime.updatedAt);
          return bt - at;
        }
      }
    });
    return out;
  }, [items, statusTab, typeFilter, yearFilter, sort]);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((it) => it.anime.id)));
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const res = await fetch("/api/library/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      console.error("[library] bulk-delete failed", res.status, msg);
      alert("删除失败，看控制台");
      return;
    }
    exitSelect();
    router.refresh();
  }

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  const gridRef = useCardGlow<HTMLDivElement>([filtered, view]);
  const statusTabsRef = useSlidingTabs<HTMLDivElement>([
    statusTab,
    items.length,
  ]);

  return (
    <>
      {/* tab + filter bar */}
      <div className="mb-5 flex flex-col gap-3 min-[900px]:flex-row min-[900px]:flex-wrap min-[900px]:items-start xl:flex-nowrap">
        <div
          ref={statusTabsRef}
          role="tablist"
          aria-label="追番状态"
          className="t-tabs t-tabs-segmented flex w-full max-w-full flex-wrap items-center gap-1 overflow-visible rounded-[8px] border border-[color:var(--border-subtle)] p-1 min-[560px]:w-fit min-[900px]:shrink-0"
        >
          <span className="t-tabs-pill" aria-hidden="true" />
          {STATUS_TABS.map((t) => {
            const active = t.value === statusTab;
            const count =
              t.value === "all"
                ? items.length
                : items.filter((it) => it.userAnime.watchStatus === t.value)
                    .length;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusTab(t.value)}
                className={cn(
                  "t-tab h-8 px-3 rounded-[6px] text-[12px] font-medium",
                  "shrink-0",
                  active && "text-[color:var(--accent)]",
                )}
              >
                {t.label}
                <span
                  data-tabular
                  className="ml-1.5 text-[10px] opacity-70"
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid w-full min-w-0 grid-cols-2 gap-2 min-[640px]:flex min-[640px]:flex-wrap min-[640px]:items-center min-[900px]:justify-start xl:ml-auto xl:w-auto xl:justify-end">
          <SelectInline
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all", label: "全部类型" },
              { value: "TV", label: "TV" },
              { value: "Movie", label: "剧场版" },
              { value: "OVA", label: "OVA" },
              { value: "Web", label: "Web" },
            ]}
          />
          <SelectInline
            value={yearFilter}
            onChange={setYearFilter}
            options={[
              { value: "all", label: "全部年份" },
              ...years.map((y) => ({ value: String(y), label: String(y) })),
            ]}
          />
          <SelectInline
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            options={SORT_OPTIONS}
          />
          <div className="flex h-9 w-full shrink-0 items-center justify-center self-start rounded-[6px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-0.5 min-[640px]:w-auto min-[640px]:self-auto">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-[4px] transition-colors",
                view === "grid"
                  ? "bg-[color:var(--bg-surface-hover)] text-[color:var(--accent)]"
                  : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]",
              )}
              aria-label="网格视图"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-[4px] transition-colors",
                view === "list"
                  ? "bg-[color:var(--bg-surface-hover)] text-[color:var(--accent)]"
                  : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]",
              )}
              aria-label="列表视图"
            >
              <ListIcon size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            className={cn(
              "h-9 w-full shrink-0 self-start px-3 rounded-[6px] text-[12px] font-medium transition-colors border min-[640px]:w-auto min-[640px]:self-auto",
              selectMode
                ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border-[color:var(--accent-muted)]"
                : "bg-[color:var(--bg-surface)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-surface-hover)]",
            )}
          >
            {selectMode ? "退出" : "选择"}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-[14px] text-[color:var(--text-secondary)] mb-1">
            这个分类下还没有番剧
          </p>
          <p className="text-[12px] text-[color:var(--text-muted)]">
            试试切换状态 tab，或按 Ctrl K 搜索添加新番
          </p>
        </div>
      ) : view === "grid" ? (
        <motion.div
          ref={gridRef}
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.04 } },
          }}
          className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 xl:grid-cols-3"
        >
          {filtered.map((it) => {
            const isSelected = selected.has(it.anime.id);
            return (
              <motion.div
                key={it.anime.id}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
                }}
                className="relative"
              >
                <div className={selectMode ? "pointer-events-none" : ""}>
                  <AnimeCard
                    id={it.anime.id}
                    title={it.anime.title}
                    titleJa={it.anime.titleJa}
                    coverUrl={it.anime.coverUrl}
                    watchStatus={it.userAnime.watchStatus}
                    currentEpisode={it.userAnime.currentEpisode}
                    totalEpisodes={it.anime.totalEpisodes}
                    airedCount={it.airedCount}
                  />
                </div>
                {selectMode && (
                  <SelectionOverlay
                    selected={isSelected}
                    onToggle={() => toggleSelect(it.anime.id)}
                    title={it.anime.title}
                  />
                )}
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <div className="space-y-2">
          {filtered.map((it) => {
            const isSelected = selected.has(it.anime.id);
            return (
              <div key={it.anime.id} className="relative">
                <div className={selectMode ? "pointer-events-none" : ""}>
                  <AnimeRowItem
                    id={it.anime.id}
                    title={it.anime.title}
                    coverUrl={it.anime.coverUrl}
                    meta={`${it.anime.year ?? ""} · ${it.anime.type} · EP ${String(it.userAnime.currentEpisode).padStart(2, "0")}${it.anime.totalEpisodes ? ` / ${String(it.anime.totalEpisodes).padStart(2, "0")}` : ""}`}
                    progress={
                      it.anime.totalEpisodes
                        ? it.userAnime.currentEpisode / it.anime.totalEpisodes
                        : undefined
                    }
                    action={
                      <Tag variant="default">
                        {statusLabel(it.userAnime.watchStatus)}
                      </Tag>
                    }
                  />
                </div>
                {selectMode && (
                  <SelectionOverlay
                    selected={isSelected}
                    onToggle={() => toggleSelect(it.anime.id)}
                    title={it.anime.title}
                    rowVariant
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectMode && (
        <div
          role="region"
          aria-label="批量操作"
          className={cn(
            "fixed bottom-3 left-3 right-3 z-40 sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2",
            "flex flex-wrap items-center justify-between gap-2 rounded-[10px] px-3 py-2 sm:justify-start sm:gap-3 sm:px-4",
            "border border-[color:var(--border-default)]",
            "shadow-[0_12px_36px_rgba(0,0,0,0.55)]",
          )}
          style={{
            background: "rgba(20,20,22,0.85)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
          }}
        >
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
            <span
              data-tabular
              className="text-[12px] text-[color:var(--text-secondary)]"
            >
              已选 <span className="font-semibold text-[color:var(--text-primary)]">{selected.size}</span> 部
            </span>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-surface-hover)] transition-colors"
            >
              {allSelected ? "取消全选" : "全选当前"}
            </button>
          </div>
          <div className="hidden h-5 w-px bg-[color:var(--border-subtle)] sm:block" />
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <ConfirmDialog
              title={`删除选中的 ${selected.size} 部番剧？`}
              description="只会从你的追番列表移除，番剧元数据和下载记录都不会动。这个操作无法撤销。"
              confirmLabel="删除"
              destructive
              onConfirm={handleBulkDelete}
              trigger={
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={selected.size === 0}
                  leftIcon={<Trash2 size={12} />}
                  className="!bg-[rgba(239,68,68,0.12)] !text-[color:var(--status-error)] !border-[rgba(239,68,68,0.30)]"
                >
                  删除
                </Button>
              }
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={exitSelect}
              leftIcon={<X size={12} />}
            >
              取消
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function SelectionOverlay({
  selected,
  onToggle,
  title,
  rowVariant = false,
}: {
  selected: boolean;
  onToggle: () => void;
  title: string;
  rowVariant?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`${selected ? "取消选择" : "选择"} ${title}`}
      className={cn(
        "absolute inset-0 z-10 rounded-[8px] group",
        "transition-colors",
        selected
          ? "bg-[color:var(--accent-subtle)] ring-2 ring-[color:var(--accent)]"
          : "hover:bg-black/20 ring-1 ring-transparent hover:ring-[color:var(--border-default)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inline-flex items-center justify-center rounded-[6px] transition-colors",
          rowVariant ? "top-1/2 -translate-y-1/2 left-3" : "top-2 right-2",
          "w-6 h-6 border",
          selected
            ? "bg-[color:var(--accent)] border-[color:var(--accent)] text-[color:var(--accent-contrast)]"
            : "bg-black/55 border-white/40 text-transparent group-hover:text-white/60",
        )}
      >
        <Check size={14} strokeWidth={3} />
      </span>
    </button>
  );
}

function SelectInline({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      data-no-focus-ring
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 w-full min-w-0 rounded-[6px] px-2.5 pr-7 sm:w-auto sm:min-w-[104px]",
        "bg-[color:var(--bg-surface)] border border-[color:var(--border-subtle)]",
        "text-[12px] text-[color:var(--text-primary)] tracking-tight",
        "hover:bg-[color:var(--bg-surface-hover)] hover:border-[color:var(--border-default)]",
        "focus:outline-none focus:border-[color:var(--accent-muted)]",
        "appearance-none cursor-pointer touch-pan-y",
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='none' stroke='%23888' stroke-width='1.5' d='M1 1l4 4 4-4'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}
    >
      {options.map((o) => (
        <option
          key={o.value}
          value={o.value}
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
          }}
        >
          {o.label}
        </option>
      ))}
    </select>
  );
}

function statusLabel(s: WatchStatus): string {
  return (
    {
      watching: "在看",
      planning: "想看",
      completed: "看完",
      onhold: "搁置",
      dropped: "弃番",
    } as const
  )[s];
}
