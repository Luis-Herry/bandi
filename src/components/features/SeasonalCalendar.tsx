"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AnimeCard } from "./AnimeCard";
import { cn } from "@/lib/cn";
import type { SeasonalByDay } from "@/lib/db-helpers/library";

interface SeasonalCalendarProps {
  data: SeasonalByDay[]; // 7 entries (0..6 = Sun..Sat)
}

const DAYS = [
  { idx: 1, label: "周一" },
  { idx: 2, label: "周二" },
  { idx: 3, label: "周三" },
  { idx: 4, label: "周四" },
  { idx: 5, label: "周五" },
  { idx: 6, label: "周六" },
  { idx: 0, label: "周日" },
];

export function SeasonalCalendar({ data }: SeasonalCalendarProps) {
  const today = new Date().getDay();
  const [active, setActive] = useState<number>(today);

  const byDay = new Map(data.map((d) => [d.day, d.items]));
  const current = byDay.get(active) ?? [];

  return (
    <div>
      <div className="flex items-center gap-1 mb-4 overflow-x-auto">
        {DAYS.map((d) => {
          const isActive = active === d.idx;
          const isToday = d.idx === today;
          const count = byDay.get(d.idx)?.length ?? 0;
          return (
            <button
              key={d.idx}
              type="button"
              onClick={() => setActive(d.idx)}
              className={cn(
                "relative px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors shrink-0",
                isActive
                  ? "text-[color:var(--accent)]"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
              )}
            >
              <span className="flex items-center gap-1.5">
                {d.label}
                {isToday && (
                  <span
                    aria-hidden
                    className="block w-1 h-1 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                )}
                <span
                  data-tabular
                  className="text-[10px] opacity-60"
                >
                  {count}
                </span>
              </span>
              {isActive && (
                <motion.span
                  layoutId="seasonal-tab"
                  aria-hidden
                  className="absolute -bottom-px left-2 right-2 h-[2px] rounded-full"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {current.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-[color:var(--text-muted)]">
              这一天没有追番更新
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {current.map((it) => (
                <AnimeCard
                  key={it.anime.id}
                  id={it.anime.id}
                  title={it.anime.title}
                  titleJa={it.anime.titleJa}
                  coverUrl={it.anime.coverUrl}
                  watchStatus={it.userAnime?.watchStatus}
                  currentEpisode={it.userAnime?.currentEpisode ?? 0}
                  totalEpisodes={it.anime.totalEpisodes}
                  cornerLabel={
                    it.anime.airingTime ? it.anime.airingTime : undefined
                  }
                />
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
