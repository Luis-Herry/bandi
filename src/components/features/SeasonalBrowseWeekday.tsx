"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrowseCard } from "@/components/features/BrowseCard";
import { useCardGlow } from "@/hooks/useCardGlow";
import type { SeasonalBrowseItem } from "@/lib/db-helpers/browse";

const WEEKDAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

interface DayGroup {
  day: number;
  items: SeasonalBrowseItem[];
}

interface Props {
  groups: DayGroup[];
  /** 每天最多显示几部，默认 6 */
  perDay?: number;
}

interface AddPatch {
  inLibrary: boolean;
  localAnimeId: number | null;
}

/**
 * 首页"本季新番"按更新日分组的卡片网格。
 *
 * - 服务端已按 score 降序，这里按 weekday 横切，每天前 N 部
 * - 完结日（当天 0 部）整组不渲染，避免出现"周X · 0 部"
 * - 卡片复用 BrowseCard，显示「想看」按钮：hover 卡片底部浮出，点一下走
 *   POST /api/browse/add（与番剧库走同一接口），乐观更新 inLibrary 状态
 */
export function SeasonalBrowseWeekday({ groups, perDay = 6 }: Props) {
  // 网格挂 useCardGlow 让所有卡片共享扫描环 + 鼠标跟随描边
  const gridRef = useCardGlow<HTMLDivElement>([groups]);
  const railsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const [railState, setRailState] = useState<
    Record<number, { atStart: boolean; atEnd: boolean; hasOverflow: boolean }>
  >({});

  // adding：正在跑加入请求的 bangumiId
  // patches：本次会话里"想看"按下后的乐观状态，覆盖到 item 上
  const [adding, setAdding] = useState<Set<number>>(new Set());
  const [patches, setPatches] = useState<Map<number, AddPatch>>(new Map());

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
    } catch (e) {
      console.error("[seasonal] add failed:", e);
    } finally {
      setAdding((s) => {
        const next = new Set(s);
        next.delete(it.bangumiId);
        return next;
      });
    }
  }

  const visible = groups.filter((g) => g.items.length > 0);
  const cardWidth = `max(156px, calc((100% - ${(perDay - 1) * 16}px) / ${perDay}))`;

  const updateRailState = useCallback((day: number) => {
    const el = railsRef.current[day];
    if (!el) return;
    const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    setRailState((curr) => ({
      ...curr,
      [day]: {
        atStart: el.scrollLeft <= 1,
        atEnd: el.scrollLeft >= maxLeft - 1,
        hasOverflow: maxLeft > 1,
      },
    }));
  }, []);

  function scrollDay(day: number, direction: -1 | 1) {
    const el = railsRef.current[day];
    if (!el) return;
    el.scrollBy({
      left: direction * Math.max(240, el.clientWidth - 16),
      behavior: "smooth",
    });
  }

  useEffect(() => {
    const updateAll = () => {
      visible.forEach((g) => updateRailState(g.day));
    };
    updateAll();
    window.addEventListener("resize", updateAll);
    return () => window.removeEventListener("resize", updateAll);
  }, [visible, updateRailState]);

  if (visible.length === 0) {
    return (
      <div className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-8 text-center">
        <p className="text-[13px] text-[color:var(--text-secondary)]">
          本季暂无在播番剧数据
        </p>
      </div>
    );
  }

  return (
    <div ref={gridRef} className="space-y-8">
      {visible.map((g) => {
        const initialScrollable = g.items.length > perDay;
        const state = railState[g.day] ?? {
          atStart: true,
          atEnd: !initialScrollable,
          hasOverflow: initialScrollable,
        };
        const scrollable = state.hasOverflow || initialScrollable;
        return (
          <div key={g.day}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-baseline gap-2">
                <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                  {WEEKDAY_CN[g.day]}
                </h3>
                <span
                  data-tabular
                  className="text-[11px] text-[color:var(--text-muted)]"
                >
                  · {g.items.length} 部
                </span>
              </div>
              {scrollable && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`${WEEKDAY_CN[g.day]}上一组`}
                    onClick={() => scrollDay(g.day, -1)}
                    disabled={state.atStart}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] text-[color:var(--text-secondary)] transition-[background,color,border-color,opacity] duration-150 hover:border-[color:var(--border-default)] hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`${WEEKDAY_CN[g.day]}下一组`}
                    onClick={() => scrollDay(g.day, 1)}
                    disabled={state.atEnd}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] text-[color:var(--text-secondary)] transition-[background,color,border-color,opacity] duration-150 hover:border-[color:var(--border-default)] hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
            <div
              ref={(el) => {
                railsRef.current[g.day] = el;
              }}
              onScroll={() => updateRailState(g.day)}
              className="grid grid-flow-col gap-4 overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ gridAutoColumns: cardWidth }}
            >
              {g.items.map((it) => {
                const patch = patches.get(it.bangumiId);
                const merged: SeasonalBrowseItem = patch
                  ? {
                      ...it,
                      inLibrary: patch.inLibrary,
                      localAnimeId: patch.localAnimeId,
                    }
                  : it;
                return (
                  <div key={it.bangumiId} className="snap-start">
                    <BrowseCard
                      item={merged}
                      busy={adding.has(it.bangumiId)}
                      onAdd={() => addToPlanning(it)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
