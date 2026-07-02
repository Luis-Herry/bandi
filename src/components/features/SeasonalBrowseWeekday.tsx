"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BrowseCard } from "@/components/features/BrowseCard";
import { showToast } from "@/components/features/ToastHost";
import { useCardGlow } from "@/hooks/useCardGlow";
import { useSlidingTabs } from "@/hooks/useSlidingTabs";
import type { SeasonalBrowseItem } from "@/lib/db-helpers/browse";
import { cn } from "@/lib/cn";

const WEEKDAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

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
 * 首页"本季新番"按更新日切换的卡片轨道。
 *
 * - 服务端已按 score 降序，这里按 weekday 横切，每天独立成 tab
 * - 完结日（当天 0 部）整组不渲染，避免出现"周X · 0 部"
 * - 卡片复用 BrowseCard，显示「想看」按钮：hover 卡片底部浮出，点一下走
 *   POST /api/browse/add（与番剧库走同一接口），乐观更新 inLibrary 状态
 */
export function SeasonalBrowseWeekday({ groups, perDay = 6 }: Props) {
  const visible = useMemo(
    () => groups.filter((g) => g.items.length > 0),
    [groups],
  );
  const visibleDays = useMemo(
    () => new Set(visible.map((g) => g.day)),
    [visible],
  );
  const defaultDay = useMemo(() => getInitialActiveDay(visible), [visible]);
  const [activeDay, setActiveDay] = useState(defaultDay);
  const activeGroup = visible.find((g) => g.day === activeDay) ?? visible[0] ?? null;

  // 网格挂 useCardGlow 让当前 tab 卡片共享扫描环 + 鼠标跟随描边
  const gridRef = useCardGlow<HTMLDivElement>([groups, activeDay]);
  const tabsRef = useSlidingTabs<HTMLDivElement>([activeDay, visible.length]);
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
      showToast({
        title: "已加入想看",
        description: it.title,
        tone: "success",
      });
    } catch (e) {
      console.error("[seasonal] add failed:", e);
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

  const cardWidth = `max(156px, calc((100% - ${(perDay - 1) * 16}px) / ${perDay}))`;

  useEffect(() => {
    if (visible.length === 0) return;
    if (!visibleDays.has(activeDay)) setActiveDay(defaultDay);
  }, [activeDay, defaultDay, visible.length, visibleDays]);

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

  const handleRailWheel = useCallback(
    (day: number, event: WheelEvent) => {
      const el = railsRef.current[day];
      if (!el) return;

      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      if (maxLeft <= 1) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      const delta = normalizeWheelDelta(event.deltaY, event.deltaMode);
      if (Math.abs(delta) < 1) return;

      const nextLeft = Math.max(0, Math.min(maxLeft, el.scrollLeft + delta));
      if (Math.abs(nextLeft - el.scrollLeft) < 1) return;

      event.preventDefault();
      el.scrollLeft = nextLeft;
      updateRailState(day);
    },
    [updateRailState],
  );

  useEffect(() => {
    if (!activeGroup) return;
    const updateActive = () => updateRailState(activeGroup.day);
    updateActive();
    window.addEventListener("resize", updateActive);
    return () => window.removeEventListener("resize", updateActive);
  }, [activeGroup, updateRailState]);

  useEffect(() => {
    if (!activeGroup) return;
    const el = railsRef.current[activeGroup.day];
    if (!el) return;

    const handleWheel = (event: WheelEvent) => {
      handleRailWheel(activeGroup.day, event);
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [activeGroup, handleRailWheel]);

  if (visible.length === 0) {
    return (
      <div className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-8 text-center">
        <p className="text-[13px] text-[color:var(--text-secondary)]">
          本季暂无在播番剧数据
        </p>
      </div>
    );
  }
  if (!activeGroup) return null;

  const initialScrollable = activeGroup.items.length > perDay;
  const state = railState[activeGroup.day] ?? {
    atStart: true,
    atEnd: !initialScrollable,
    hasOverflow: initialScrollable,
  };
  const scrollable = state.hasOverflow || initialScrollable;

  return (
    <div ref={gridRef}>
      <div
        ref={tabsRef}
        role="tablist"
        aria-label="按更新日筛选本季新番"
        className="t-tabs t-tabs-segmented grid grid-cols-7 gap-1 rounded-[8px] border border-[color:var(--border-subtle)] p-1"
      >
        <span className="t-tabs-pill" aria-hidden="true" />
        {WEEKDAY_ORDER.map((day) => {
          const count = groups.find((g) => g.day === day)?.items.length ?? 0;
          const active = day === activeGroup.day;
          const disabled = count === 0;
          return (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => setActiveDay(day)}
              className={cn(
                "t-tab inline-flex h-10 items-center justify-center rounded-[6px]",
                "text-[13px] font-semibold",
                disabled && "cursor-not-allowed opacity-35",
              )}
            >
              {WEEKDAY_CN[day]}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {WEEKDAY_CN[activeGroup.day]}
          </h3>
          <span
            data-tabular
            className="text-[11px] text-[color:var(--text-muted)]"
          >
            · {activeGroup.items.length} 部
          </span>
        </div>
        {scrollable && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`${WEEKDAY_CN[activeGroup.day]}上一组`}
              onClick={() => scrollDay(activeGroup.day, -1)}
              disabled={state.atStart}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] text-[color:var(--text-secondary)] transition-[background,color,border-color,opacity] duration-150 hover:border-[color:var(--border-default)] hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              aria-label={`${WEEKDAY_CN[activeGroup.day]}下一组`}
              onClick={() => scrollDay(activeGroup.day, 1)}
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
          railsRef.current[activeGroup.day] = el;
        }}
        onScroll={() => updateRailState(activeGroup.day)}
        className="no-scrollbar mt-3 grid grid-flow-col gap-4 overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory pb-1"
        style={{ gridAutoColumns: cardWidth }}
      >
        {activeGroup.items.map((it) => {
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
                updateState={it.updateState}
                busy={adding.has(it.bangumiId)}
                onAdd={() => addToPlanning(it)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getInitialActiveDay(groups: DayGroup[]) {
  const today = new Date().getDay();
  if (groups.some((g) => g.day === today)) return today;
  return groups[0]?.day ?? WEEKDAY_ORDER[0];
}

function normalizeWheelDelta(delta: number, mode: number) {
  if (mode === 1) return delta * 16;
  if (mode === 2) return delta * 360;
  return delta;
}
