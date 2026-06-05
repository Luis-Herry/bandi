"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { GlassPanel, TextField } from "@/components/ui";
import { BrowseCard } from "@/components/features/BrowseCard";
import { showToast } from "@/components/features/ToastHost";
import type { BgmSeason } from "@/lib/bangumi";
import type { SeasonalBrowseItem } from "@/lib/db-helpers/browse";
import { useCardGlow } from "@/hooks/useCardGlow";
import { cn } from "@/lib/cn";

const SEASON_START_MONTH: Record<BgmSeason, number> = {
  WINTER: 1,
  SPRING: 4,
  SUMMER: 7,
  FALL: 10,
};

interface QuarterTab {
  season: BgmSeason;
  year: number;
}

/* ─────────── 筛选词表 ─────────── */

const CATEGORY_VOCAB = ["TV", "WEB", "OVA", "剧场版", "动态漫画", "其他"];

const SOURCE_VOCAB = ["原创", "漫画改", "游戏改", "小说改", "动画改", "影视改"];

const GENRE_VOCAB = [
  "科幻",
  "喜剧",
  "同人",
  "百合",
  "校园",
  "惊悚",
  "后宫",
  "机战",
  "悬疑",
  "恋爱",
  "奇幻",
  "推理",
  "运动",
  "耽美",
  "音乐",
  "战斗",
  "冒险",
  "萌系",
  "穿越",
  "玄幻",
  "乙女",
  "恐怖",
  "历史",
  "日常",
  "剧情",
  "武侠",
  "美食",
  "职场",
];

const REGION_VOCAB = ["日本", "中国"];

type FilterKey = "category" | "source" | "genre" | "region";

const FILTER_LABEL: Record<FilterKey, string> = {
  category: "分类",
  source: "来源",
  genre: "类型",
  region: "地区",
};

interface BrowseClientProps {
  initialSeason: BgmSeason;
  initialYear: number;
  initialItems: SeasonalBrowseItem[];
  quarters: QuarterTab[];
  yearOptions: number[];
  dataStatus: "fresh" | "fallback" | "unavailable";
}

export function BrowseClient({
  initialSeason,
  initialYear,
  initialItems,
  quarters,
  yearOptions,
  dataStatus,
}: BrowseClientProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const activeKey = `${initialSeason}-${initialYear}`;

  // 不再把 initialItems 拍进 useState：那样换季后 prop 变了 state 不会同步，
  // 用户看到的还是切换前的列表（曾经的 "三季数据一样" bug）。
  // 现在的列表直接从 props 派生，本地乐观补丁单独存在 Map 里覆盖 server 数据。
  const [patches, setPatches] = useState<
    Map<number, { inLibrary: boolean; localAnimeId: number | null }>
  >(new Map());
  const [adding, setAdding] = useState<Set<number>>(new Set());

  // 筛选状态：每类一个选中值（null = 全部）
  // 默认：分类=TV、地区=日本（如果该季实际命中不到这两个值，下面会自动 fallback 到全部）
  const DEFAULT_FILTERS: Record<FilterKey, string | null> = {
    category: "TV",
    source: null,
    genre: null,
    region: "日本",
  };
  const [activeFilters, setActiveFilters] = useState<
    Record<FilterKey, string | null>
  >(DEFAULT_FILTERS);
  const [query, setQuery] = useState("");
  // 评分排序方向，默认高在前
  const [scoreOrder, setScoreOrder] = useState<"desc" | "asc">("desc");

  // 切换季度时（activeKey 变化）重置筛选 + 搜索到默认值
  useEffect(() => {
    setActiveFilters(DEFAULT_FILTERS);
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const items = useMemo<SeasonalBrowseItem[]>(() => {
    if (patches.size === 0) return initialItems;
    return initialItems.map((it) => {
      const p = patches.get(it.bangumiId);
      if (!p) return it;
      return {
        ...it,
        inLibrary: p.inLibrary,
        localAnimeId: p.localAnimeId ?? it.localAnimeId,
      };
    });
  }, [initialItems, patches]);

  // 计算每类「该季实际命中」的可选项
  const availableOptions = useMemo<Record<FilterKey, string[]>>(() => {
    const category = new Set<string>();
    const source = new Set<string>();
    const genre = new Set<string>();
    const region = new Set<string>();

    for (const it of items) {
      if (it.platform && CATEGORY_VOCAB.includes(it.platform)) {
        category.add(it.platform);
      }
      for (const t of it.tags) {
        if (SOURCE_VOCAB.includes(t)) source.add(t);
        if (GENRE_VOCAB.includes(t)) genre.add(t);
        if (REGION_VOCAB.includes(t)) region.add(t);
      }
    }

    // 按词表顺序排序，保持视觉稳定
    return {
      category: CATEGORY_VOCAB.filter((v) => category.has(v)),
      source: SOURCE_VOCAB.filter((v) => source.has(v)),
      genre: GENRE_VOCAB.filter((v) => genre.has(v)),
      region: REGION_VOCAB.filter((v) => region.has(v)),
    };
  }, [items]);

  // 当前季度若某类选中值不在 availableOptions 中（默认值或切季残留），静默回退到 null
  useEffect(() => {
    let dirty = false;
    const next = { ...activeFilters };
    (Object.keys(next) as FilterKey[]).forEach((k) => {
      const v = next[k];
      if (v != null && !availableOptions[k].includes(v)) {
        next[k] = null;
        dirty = true;
      }
    });
    if (dirty) setActiveFilters(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableOptions]);

  // 应用筛选 + 搜索 + 评分排序
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const passed = items.filter((it) => {
      // 分类
      if (
        activeFilters.category &&
        it.platform !== activeFilters.category
      ) {
        return false;
      }
      // 来源
      if (
        activeFilters.source &&
        !it.tags.includes(activeFilters.source)
      ) {
        return false;
      }
      // 类型
      if (
        activeFilters.genre &&
        !it.tags.includes(activeFilters.genre)
      ) {
        return false;
      }
      // 地区
      if (
        activeFilters.region &&
        !it.tags.includes(activeFilters.region)
      ) {
        return false;
      }
      // 搜索：title + titleJa
      if (q) {
        const hay = `${it.title} ${it.titleJa ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // 评分排序：无评分（null 或 0）一律压底，方向只对有评分的部分生效
    const hasScore = (it: SeasonalBrowseItem) =>
      it.score != null && it.score > 0;
    const scored = passed.filter(hasScore);
    const unscored = passed.filter((it) => !hasScore(it));
    scored.sort((a, b) => {
      const sa = a.score as number;
      const sb = b.score as number;
      return scoreOrder === "desc" ? sb - sa : sa - sb;
    });
    return [...scored, ...unscored];
  }, [items, activeFilters, query, scoreOrder]);

  const gridRef = useCardGlow<HTMLDivElement>([filteredItems, activeKey]);

  function switchTo(q: QuarterTab) {
    const params = new URLSearchParams(sp.toString());
    params.set("season", q.season);
    params.set("year", String(q.year));
    startTransition(() => {
      router.push(`/browse?${params.toString()}`);
    });
  }

  function switchYear(nextYear: number) {
    if (nextYear === initialYear) return;
    const params = new URLSearchParams(sp.toString());
    params.set("season", initialSeason);
    params.set("year", String(nextYear));
    startTransition(() => {
      router.push(`/browse?${params.toString()}`);
    });
  }

  async function addToPlanning(it: SeasonalBrowseItem) {
    if (adding.has(it.bangumiId)) return;
    setAdding((s) => new Set(s).add(it.bangumiId));
    try {
      const res = await fetch("/api/browse/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bangumiId: it.bangumiId }),
      });
      if (!res.ok) throw new Error(`add failed ${res.status}`);
      const j = (await res.json()) as { animeId?: number };
      setPatches((curr) => {
        const next = new Map(curr);
        next.set(it.bangumiId, {
          inLibrary: true,
          localAnimeId: j.animeId ?? it.localAnimeId ?? null,
        });
        return next;
      });
      showToast({
        title: "已加入想看",
        description: it.title,
        tone: "success",
      });
    } catch (e) {
      console.error("[browse] add failed:", e);
      showToast({
        title: "加入想看失败",
        description: it.title,
        tone: "error",
      });
    } finally {
      setAdding((s) => {
        const next = new Set(s);
        next.delete(it.bangumiId);
        return next;
      });
    }
  }

  const heroCovers = useMemo(
    () =>
      items
        .filter((it) => it.coverUrl)
        .slice(0, 4)
        .map((it) => it.coverUrl as string),
    [items],
  );

  const seasonLabel = formatQuarterLabel(initialYear, initialSeason);
  const totalCount = items.length;
  const filteredCount = filteredItems.length;
  const isFiltered = filteredCount !== totalCount;
  const sourceLabel =
    dataStatus === "fresh"
      ? "数据来源 Bangumi"
      : dataStatus === "fallback"
        ? "Bangumi 暂时不可用，显示本地已有数据"
        : "Bangumi 暂时不可用";
  const summary = isFiltered
    ? `共 ${filteredCount} 部（已筛选自 ${totalCount} 部）`
    : `共 ${totalCount} 部 · ${sourceLabel}`;

  function setFilter(key: FilterKey, value: string | null) {
    setActiveFilters((prev) => ({ ...prev, [key]: value }));
  }

  // 至少一类有可选项才显示筛选区
  const showFilters =
    yearOptions.length > 0 ||
    availableOptions.category.length > 0 ||
    availableOptions.source.length > 0 ||
    availableOptions.genre.length > 0 ||
    availableOptions.region.length > 0;

  return (
    <div className="relative">
      {/* ========== Hero ========== */}
      <section className="relative min-h-[220px] w-full overflow-hidden sm:h-[240px]">
        <div className="absolute inset-0 flex">
          {heroCovers.length > 0 ? (
            heroCovers.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${url}-${i}`}
                src={url}
                alt=""
                className="flex-1 object-cover h-full"
                style={{ filter: "blur(22px) saturate(0.85)" }}
              />
            ))
          ) : (
            <div className="flex-1 bg-[color:var(--bg-elevated)]" />
          )}
        </div>
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,10,11,0.65) 0%, rgba(10,10,11,0.80) 60%, rgba(10,10,11,1) 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 30% 50%, rgb(var(--accent-rgb) / 0.10) 0%, transparent 60%)",
          }}
        />
        <div className="app-page-container relative flex min-h-[220px] items-end pb-6 sm:h-full">
          <div>
            <h1
              className="text-[34px] font-extrabold leading-none tracking-[-0.025em] text-[color:var(--text-primary)] sm:text-[44px] sm:tracking-[-0.03em]"
              style={{ textShadow: "0 2px 16px rgba(0,0,0,0.5)" }}
            >
              番剧库
            </h1>
            <p className="mt-3 max-w-[28rem] text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
              按季度浏览 Bangumi 番剧，一键加入想看
            </p>
          </div>
        </div>
      </section>

      {/* ========== Tabs + 筛选 + 列表 ========== */}
      <section className="app-page-container py-6 sm:py-8">
        <div className="mb-6 border-b border-[color:var(--border-subtle)]">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
            <div className="no-scrollbar grid w-full grid-cols-4 items-center gap-0 overflow-visible touch-pan-y sm:flex sm:max-w-full sm:min-w-0 sm:gap-1 sm:overflow-x-auto sm:touch-pan-x">
              {quarters.map((q) => {
                const key = `${q.season}-${q.year}`;
                const active = key === activeKey;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={pending && active}
                    onClick={() => switchTo(q)}
                    className={cn(
                      "relative h-10 min-w-0 px-1 text-center text-[12px] tracking-tight transition-colors outline-none sm:shrink-0 sm:px-4 sm:text-[13px]",
                      active
                        ? "text-[color:var(--text-primary)] font-medium"
                        : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
                    )}
                  >
                    <span className="flex items-center justify-center gap-1 whitespace-nowrap sm:justify-start sm:gap-2">
                      {formatQuarterLabel(q.year, q.season)}
                    </span>
                    {active && (
                      <span
                        aria-hidden
                        className="absolute -bottom-px left-1 right-1 h-[2px] rounded-full sm:left-3 sm:right-3"
                        style={{ background: "var(--accent)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="pb-2 text-[12px] leading-relaxed text-[color:var(--text-muted)] lg:shrink-0 lg:text-right">
              {seasonLabel} · {summary}
            </div>
          </div>
        </div>

        {dataStatus === "fallback" && (
          <div className="mb-6 flex items-center gap-2 rounded-[8px] border border-[color:var(--accent-muted)] bg-[color:var(--accent-subtle)] px-4 py-3 text-[12px] text-[color:var(--accent)]">
            <AlertCircle size={14} />
            <span>
              Bangumi 暂时连接失败，已显示本地已有数据。稍后刷新可同步完整季度列表。
            </span>
          </div>
        )}

        {/* ─────── 筛选区 ─────── */}
        {showFilters && (
          <div
            className={cn(
              "mb-6 rounded-[8px] border border-[color:var(--border-subtle)]",
              "bg-[color:var(--bg-surface)] p-4 touch-pan-y",
            )}
          >
            <div className="flex flex-col gap-3">
              <div className="flex min-h-[28px] flex-col gap-2 min-[520px]:flex-row min-[520px]:items-start min-[520px]:gap-3">
                <div
                  className={cn(
                    "shrink-0 pt-[3px] min-[520px]:w-12",
                    "text-[12px] text-[color:var(--text-muted)]",
                  )}
                >
                  年份
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {yearOptions.map((option) => (
                    <FilterChip
                      key={option}
                      active={option === initialYear}
                      onClick={() => switchYear(option)}
                    >
                      {option}年
                    </FilterChip>
                  ))}
                </div>
              </div>

              {(Object.keys(FILTER_LABEL) as FilterKey[]).map((key) => {
                const opts = availableOptions[key];
                if (opts.length === 0) return null;
                const selected = activeFilters[key];
                return (
                  <div
                    key={key}
                    className="flex min-h-[28px] flex-col gap-2 min-[520px]:flex-row min-[520px]:items-start min-[520px]:gap-3"
                  >
                    <div
                      className={cn(
                        "shrink-0 pt-[3px] min-[520px]:w-12",
                        "text-[12px] text-[color:var(--text-muted)]",
                      )}
                    >
                      {FILTER_LABEL[key]}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <FilterChip
                        active={selected === null}
                        onClick={() => setFilter(key, null)}
                      >
                        全部
                      </FilterChip>
                      {opts.map((opt) => (
                        <FilterChip
                          key={opt}
                          active={selected === opt}
                          onClick={() =>
                            setFilter(key, selected === opt ? null : opt)
                          }
                        >
                          {opt}
                        </FilterChip>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* 搜索框 + 评分排序：独立一行，放筛选区底部 */}
              <div className="mt-1 flex flex-col gap-3 border-t border-[color:var(--border-subtle)] pt-3 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center min-[520px]:gap-3 md:flex-1">
                  <div className="shrink-0 text-[12px] text-[color:var(--text-muted)] min-[520px]:w-12">
                    搜索
                  </div>
                  <div className="w-full min-w-0 md:max-w-[360px]">
                    <TextField
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="搜索番剧标题（中文或日文）"
                      prefixIcon={<Search size={14} />}
                    />
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 md:ml-auto">
                  <span className="shrink-0 text-[12px] text-[color:var(--text-muted)]">
                    评分
                  </span>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
              </div>
            </div>
          </div>
        )}

        {pending && (
          <div className="flex items-center justify-center py-12">
            <Loader2
              size={20}
              className="animate-spin text-[color:var(--text-muted)]"
            />
          </div>
        )}

        {!pending && items.length === 0 && dataStatus === "unavailable" && (
          <GlassPanel className="p-10 text-center">
            <p className="text-[14px] text-[color:var(--text-secondary)]">
              Bangumi 暂时连接失败
            </p>
            <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              本地也没有这个季度的数据。稍后刷新，或先切换到其他季度。
            </p>
          </GlassPanel>
        )}

        {!pending && items.length === 0 && dataStatus !== "unavailable" && (
          <GlassPanel className="p-10 text-center">
            <p className="text-[14px] text-[color:var(--text-muted)]">
              这个季度暂时没有数据
            </p>
            <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              试试切换其他季度，或稍后再来
            </p>
          </GlassPanel>
        )}

        {!pending && items.length > 0 && filteredItems.length === 0 && (
          <GlassPanel className="p-10 text-center">
            <p className="text-[14px] text-[color:var(--text-muted)]">
              没有匹配的番剧
            </p>
            <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              试试调整筛选条件或清空搜索词
            </p>
          </GlassPanel>
        )}

        {!pending && filteredItems.length > 0 && (
          <div
            ref={gridRef}
            className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
          >
            {filteredItems.map((it, idx) => (
              <BrowseCard
                key={it.bangumiId}
                item={it}
                busy={adding.has(it.bangumiId)}
                onAdd={() => addToPlanning(it)}
                // 首屏 4 张 priority，避免 next/image lazy 让首屏空一秒
                priority={idx < 4}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatQuarterLabel(year: number, season: BgmSeason) {
  return `${year}年${SEASON_START_MONTH[season]}月`;
}

/* ─────────── 筛选 chip ─────────── */

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
        "inline-flex items-center h-7 px-2.5 rounded-[6px] text-[12px] leading-none",
        "touch-pan-y",
        "transition-[background,color,border-color] duration-150",
        "[transition-timing-function:var(--ease-default)]",
        "border",
        active
          ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border-[color:var(--accent-muted)]"
          : "bg-transparent text-[color:var(--text-secondary)] border-[color:var(--border-subtle)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-default)]",
      )}
    >
      {children}
    </button>
  );
}
