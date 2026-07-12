"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRatingScore } from "@/lib/rating";
import { Button, Tag } from "@/components/ui";
import { PlayButton } from "./PlayButton";

export interface HeroSlide {
  id: number;
  title: string;
  titleJa?: string | null;
  synopsis?: string | null;
  coverUrl?: string | null;
  year?: number | null;
  type: string;
  tags?: string[] | null;
  currentEpisode: number;
  watchedThroughEpisode: number;
  airedCount: number;
  watchedAiredCount: number;
  latestAiredEpisode: number | null;
  continueEpisodeNumber: number | null;
  totalEpisodes?: number | null;
  rating?: number;
}

interface HomeHeroProps {
  slides: HeroSlide[];
}

const AUTOPLAY_MS = 6000;
const THUMBNAIL_GROUP_SIZE = 5;

export function HomeHero({ slides }: HomeHeroProps) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  const slide = slides[idx];
  const thumbnailGroupStart =
    Math.floor(idx / THUMBNAIL_GROUP_SIZE) * THUMBNAIL_GROUP_SIZE;
  const visibleThumbnailSlides = slides.slice(
    thumbnailGroupStart,
    thumbnailGroupStart + THUMBNAIL_GROUP_SIZE,
  );

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const t = setTimeout(
      () => setIdx((i) => (i + 1) % slides.length),
      AUTOPLAY_MS,
    );
    return () => clearTimeout(t);
  }, [idx, paused, slides.length]);

  if (!slide) return null;

  const epLabel =
    slide.airedCount > 0
      ? `已看 ${slide.watchedAiredCount} / 已播 ${slide.airedCount}`
      : slide.totalEpisodes && slide.totalEpisodes > 0
        ? `EP.${String(slide.currentEpisode).padStart(2, "0")} / ${String(slide.totalEpisodes).padStart(2, "0")}`
        : `EP.${String(slide.currentEpisode).padStart(2, "0")}`;

  const playEp = slide.continueEpisodeNumber;
  const detailHref = `/anime/${slide.id}`;

  return (
    <section
      className="relative h-[560px] w-full overflow-hidden -mt-16 lg:h-[640px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* crossfade background */}
      <AnimatePresence mode="sync">
        {slide.coverUrl && (
          <motion.div
            key={slide.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="pointer-events-none absolute inset-0 z-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.coverUrl}
              alt={slide.title}
              className="pointer-events-none absolute inset-0 w-full h-full object-cover"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* gradient overlays */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background:
            "linear-gradient(90deg, rgba(10,10,11,0.92) 0%, rgba(10,10,11,0.55) 40%, rgba(10,10,11,0.05) 70%, rgba(10,10,11,0) 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-48 z-[2]"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,10,11,0) 0%, rgba(10,10,11,0.85) 70%, rgba(10,10,11,1) 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background:
            "radial-gradient(ellipse at 22% 55%, rgb(var(--accent-rgb) / 0.08) 0%, transparent 55%)",
        }}
      />

      {/* 内容层正常接收点击；背景和遮罩层禁点击。 */}
      <div className="relative z-20 mx-auto max-w-[1440px] h-full px-4 flex flex-col justify-end pb-8 gap-6 sm:px-8 lg:px-12 lg:pb-10 lg:gap-7">
        <div className="w-full">
          <div className="max-w-[900px]">
            <div className="flex items-center gap-2 mb-3 text-[12px] text-[color:var(--text-secondary)]">
              <span data-tabular>{slide.year ?? "—"}</span>
              <span>·</span>
              <span>{slide.type}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="block w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
                本季热门
              </span>
            </div>

            <motion.h1
              key={slide.id + "-title"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.05 }}
              className="max-w-full text-balance text-[36px] font-extrabold leading-[1.04] text-[color:var(--text-primary)] sm:text-[52px] lg:text-[68px]"
              style={{ textShadow: "0 4px 24px rgba(0,0,0,0.55)" }}
            >
              {slide.title}
            </motion.h1>
            {slide.titleJa && (
              <p className="mt-1.5 text-[14px] text-[color:var(--text-secondary)]">
                {slide.titleJa}
              </p>
            )}
          </div>

          <motion.div
            key={slide.id + "-meta"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 }}
            className="w-full"
          >
            <div className="max-w-[900px]">
              <div className="mt-4 flex flex-wrap items-center gap-4 sm:gap-5">
                <div className="flex items-center gap-1.5">
                  <Star
                    size={15}
                    className="text-[color:var(--accent)]"
                    style={{ fill: "var(--accent)" }}
                  />
                  <span
                    data-tabular
                    className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]"
                  >
                    {formatRatingScore(slide.rating)}
                  </span>
                </div>
                <span
                  data-tabular
                  className="text-[12px] text-[color:var(--text-muted)]"
                >
                  {epLabel}
                </span>
              </div>

              {slide.synopsis && (
                <p className="mt-4 max-w-[680px] text-[13px] leading-[1.7] text-[color:var(--text-secondary)] line-clamp-2">
                  {slide.synopsis}
                </p>
              )}

              {slide.tags && slide.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {slide.tags.slice(0, 4).map((t) => (
                    <Tag key={t} variant="outline">
                      {t}
                    </Tag>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-5 pointer-events-auto lg:flex-row lg:items-center lg:justify-between lg:gap-8">
              <div className="flex flex-wrap items-center gap-3">
                {playEp != null && (
                  <PlayButton
                    animeId={slide.id}
                    episode={playEp}
                    label={`继续观看 EP.${String(playEp).padStart(2, "0")}`}
                    variant="primary"
                    size="md"
                  />
                )}
                <Button variant="secondary" size="md" asChild>
                  <a href={detailHref}>查看详情</a>
                </Button>
              </div>

              {slides.length > 1 && (
                <div className="hidden shrink-0 justify-end gap-2 lg:flex">
                  {visibleThumbnailSlides.map((s, groupIndex) => {
                    const slideIndex = thumbnailGroupStart + groupIndex;
                    const active = slideIndex === idx;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIdx(slideIndex);
                        }}
                        className={cn(
                          "relative rounded-[8px] overflow-hidden transition-all duration-200",
                          "border-2",
                          active
                            ? "w-[120px] h-[72px] border-[color:var(--accent)] shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
                            : "w-[100px] h-[60px] border-transparent opacity-60 hover:opacity-100",
                        )}
                        aria-label={`切换到 ${s.title}`}
                      >
                        {s.coverUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.coverUrl}
                            alt={s.title}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )}
                        <div
                          aria-hidden
                          className="absolute inset-0"
                          style={{
                            background:
                              "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.7) 100%)",
                          }}
                        />
                        <span className="absolute bottom-1 left-1.5 right-1.5 text-[10px] font-medium text-white truncate">
                          {s.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
