"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Clock, Search, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRatingScore } from "@/lib/rating";
import { Button, Tag } from "@/components/ui";
import { EpisodeSourceDialog } from "./EpisodeSourceDialog";
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
  sourceEpisodeNumber: number | null;
  nextAiringEpisodeNumber: number | null;
  nextAiringAt: string | null;
  totalEpisodes?: number | null;
  rating?: number;
}

interface HomeHeroProps {
  slides: HeroSlide[];
}

const AUTOPLAY_MS = 6000;
const THUMBNAILS_PER_GROUP = 5;
const thumbnailNavigationButtonClassName =
  "inline-flex h-11 w-5 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-white/55 transition-[color,opacity,transform] duration-[var(--duration-quick)] [transition-timing-function:var(--ease-smooth-out)] hover:text-white active:scale-[0.9] focus-visible:outline-none focus-visible:text-[color:var(--accent)]";

interface SourceTarget {
  animeId: number;
  animeTitle: string;
  episodeNumber: number;
}

export function HomeHero({ slides }: HomeHeroProps) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sourceTarget, setSourceTarget] = useState<SourceTarget | null>(null);
  const thumbnailViewportRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const shouldReduceMotion = useReducedMotion();

  const slide = slides[idx];

  useEffect(() => {
    if (paused || sourceTarget || slides.length < 2) return;
    const t = setTimeout(
      () => setIdx((i) => (i + 1) % slides.length),
      AUTOPLAY_MS,
    );
    return () => clearTimeout(t);
  }, [idx, paused, slides.length, sourceTarget]);

  useEffect(() => {
    const viewport = thumbnailViewportRef.current;
    const firstThumbnail = thumbnailRefs.current[0];
    const groupStart = getThumbnailGroupStart(idx, slides.length);
    const groupStartThumbnail = thumbnailRefs.current[groupStart];
    if (!viewport || !firstThumbnail || !groupStartThumbnail) return;

    const alignThumbnailGroup = () => {
      const alignedGroupLeft =
        groupStartThumbnail.offsetLeft - firstThumbnail.offsetLeft;
      const maxScrollLeft = Math.max(
        0,
        viewport.scrollWidth - viewport.clientWidth,
      );

      viewport.scrollTo({
        left: Math.min(Math.max(alignedGroupLeft, 0), maxScrollLeft),
        behavior: shouldReduceMotion ? "auto" : "smooth",
      });
    };

    alignThumbnailGroup();
    const resizeObserver = new ResizeObserver(alignThumbnailGroup);
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, [idx, shouldReduceMotion, slides.length]);

  if (!slide) return null;

  const epLabel =
    slide.airedCount > 0
      ? `已看 ${slide.watchedAiredCount} / 已播 ${slide.airedCount}`
      : slide.totalEpisodes && slide.totalEpisodes > 0
        ? `EP.${String(slide.currentEpisode).padStart(2, "0")} / ${String(slide.totalEpisodes).padStart(2, "0")}`
        : `EP.${String(slide.currentEpisode).padStart(2, "0")}`;

  const playEp = slide.continueEpisodeNumber;
  const sourceEp = playEp == null ? slide.sourceEpisodeNumber : null;
  const upcomingEpisode =
    playEp == null && sourceEp == null
      ? slide.nextAiringEpisodeNumber
      : null;
  const upcomingLabel =
    upcomingEpisode != null && slide.nextAiringAt
      ? formatHeroAiringTime(slide.nextAiringAt)
      : null;
  const detailHref = `/anime/${slide.id}`;
  const showPreviousSlide = () => {
    setIdx((current) => (current - 1 + slides.length) % slides.length);
  };
  const showNextSlide = () => {
    setIdx((current) => (current + 1) % slides.length);
  };

  return (
    <section
      className="home-hero relative h-[560px] w-full overflow-hidden -mt-16 lg:h-[640px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
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
      <div className="app-page-container relative z-20 flex h-full flex-col justify-end gap-6 pb-8 lg:gap-7 lg:pb-10">
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
          </motion.div>

          <div className="pointer-events-auto mt-6 flex flex-col gap-5 min-[1180px]:flex-row min-[1180px]:items-center min-[1180px]:justify-between min-[1180px]:gap-6">
            <motion.div
              key={slide.id + "-actions"}
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: shouldReduceMotion ? 0 : 0.2,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="flex flex-wrap items-center gap-3"
            >
              {playEp != null ? (
                <PlayButton
                  animeId={slide.id}
                  episode={playEp}
                  label={`继续观看 EP.${String(playEp).padStart(2, "0")}`}
                  variant="primary"
                  size="md"
                />
              ) : sourceEp != null ? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() =>
                    setSourceTarget({
                      animeId: slide.id,
                      animeTitle: slide.title,
                      episodeNumber: sourceEp,
                    })
                  }
                >
                  <Search size={16} />
                  找资源 EP.{String(sourceEp).padStart(2, "0")}
                </Button>
              ) : upcomingEpisode != null && upcomingLabel ? (
                <div className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-[color:var(--border-default)] bg-black/20 px-3.5 text-[12px] text-[color:var(--text-secondary)] backdrop-blur-[10px]">
                  <Clock size={15} className="text-[color:var(--accent)]" />
                  <span data-tabular>
                    下集 EP.{String(upcomingEpisode).padStart(2, "0")} · {upcomingLabel}
                  </span>
                </div>
              ) : null}
              <Button variant="secondary" size="md" asChild>
                <a href={detailHref}>查看详情</a>
              </Button>
            </motion.div>

            {slides.length > 1 && (
              <div className="hidden shrink-0 items-center justify-end gap-1.5 lg:flex">
                <button
                  type="button"
                  onClick={showPreviousSlide}
                  aria-label="上一张海报"
                  title="上一张"
                  className={thumbnailNavigationButtonClassName}
                >
                  <ChevronLeft size={20} strokeWidth={2.2} />
                </button>
                <div
                  ref={thumbnailViewportRef}
                  className="no-scrollbar w-[440px] overflow-x-hidden px-1 py-2 min-[1280px]:w-[480px] min-[1440px]:w-[520px]"
                >
                  <div className="flex w-max items-center gap-2">
                    {slides.map((s, slideIndex) => {
                      const active = slideIndex === idx;
                      return (
                        <motion.button
                          key={s.id}
                          ref={(node) => {
                            thumbnailRefs.current[slideIndex] = node;
                          }}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIdx(slideIndex);
                          }}
                          animate={{
                            opacity: active ? 1 : 0.62,
                            scale: shouldReduceMotion ? 1 : active ? 1.06 : 1,
                          }}
                          whileHover={{
                            opacity: 1,
                            scale: shouldReduceMotion
                              ? 1
                              : active
                                ? 1.06
                                : 1.03,
                          }}
                          whileTap={{ scale: shouldReduceMotion ? 1 : 0.98 }}
                          transition={{
                            duration: shouldReduceMotion ? 0 : 0.25,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className={cn(
                            "relative h-12 w-20 shrink-0 overflow-hidden rounded-[7px] border-2",
                            "transition-[border-color,box-shadow] duration-[var(--duration-fast)] [transition-timing-function:var(--ease-smooth-out)]",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                            "min-[1280px]:h-[52px] min-[1280px]:w-[88px] min-[1440px]:h-14 min-[1440px]:w-24",
                            active
                              ? "z-10 border-[color:var(--accent)] shadow-[0_4px_8px_rgba(0,0,0,0.45)]"
                              : "border-transparent",
                          )}
                          aria-label={`切换到 ${s.title}`}
                          aria-current={active ? "true" : undefined}
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
                          <span className="absolute bottom-1 left-1.5 right-1.5 truncate text-[10px] font-medium text-white">
                            {s.title}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={showNextSlide}
                  aria-label="下一张海报"
                  title="下一张"
                  className={thumbnailNavigationButtonClassName}
                >
                  <ChevronRight size={20} strokeWidth={2.2} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {sourceTarget && (
        <EpisodeSourceDialog
          open={sourceTarget != null}
          onOpenChange={(open) => {
            if (!open) setSourceTarget(null);
          }}
          animeId={sourceTarget.animeId}
          animeTitle={sourceTarget.animeTitle}
          episodeNumber={sourceTarget.episodeNumber}
        />
      )}
    </section>
  );
}

function getThumbnailGroupStart(activeIndex: number, total: number) {
  const requestedGroupStart =
    Math.floor(activeIndex / THUMBNAILS_PER_GROUP) * THUMBNAILS_PER_GROUP;
  const finalFullGroupStart = Math.max(0, total - THUMBNAILS_PER_GROUP);
  return Math.min(requestedGroupStart, finalFullGroupStart);
}

function formatHeroAiringTime(value: string) {
  const airedAt = new Date(value);
  if (!Number.isFinite(airedAt.getTime())) return "待定";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(airedAt);
}
