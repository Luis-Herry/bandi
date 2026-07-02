"use client";

import { useEffect, useRef } from "react";

const TILT_MAX = 8;

/**
 * 给 `.anime-card-glow` 卡片接上两层动效：
 *   1. 进场扫描环：IntersectionObserver 触发 .is-revealed → CSS 跑一次性 keyframe
 *   2. 悬停描边：mousemove 写 --mx / --my，CSS ::after 用 radial 跟随鼠标
 *
 * 触摸设备和 prefers-reduced-motion 用户：跳过 mousemove 监听，
 * 进场环本身也已在 CSS 里被 reduced-motion 媒体查询禁用。
 *
 * 用法：在卡片网格容器上拿 ref，子卡片用 `.anime-card-glow` 类名即可。
 */
export function useCardGlow<T extends HTMLElement = HTMLElement>(
  deps: unknown[] = [],
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const cards = Array.from(
      root.querySelectorAll<HTMLElement>(".anime-card-glow"),
    );
    if (cards.length === 0) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;

    const revealTimers: number[] = [];
    const revealFrames: number[] = [];

    const restartOrbit = (el: HTMLElement, delay: number) => {
      el.classList.remove("is-revealed");
      const timer = window.setTimeout(() => {
        const firstFrame = window.requestAnimationFrame(() => {
          const secondFrame = window.requestAnimationFrame(() => {
            el.classList.add("is-revealed");
          });
          revealFrames.push(secondFrame);
        });
        revealFrames.push(firstFrame);
      }, delay);
      revealTimers.push(timer);
    };

    // —— 进场扫描环
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window && !reduceMotion) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target as HTMLElement;
            io?.unobserve(el);
            // 错开一点点，让网格里的卡片不要一起闪。
            // 先等一小段时间，避免父级入场淡入还没结束时 orbit 已经跑完。
            const delay =
              cards.indexOf(el) >= 0
                ? 140 + Math.min(cards.indexOf(el), 8) * 70
                : 0;
            restartOrbit(el, delay);
          });
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
      );
      cards.forEach((c) => io!.observe(c));
    } else {
      cards.forEach((c, idx) => restartOrbit(c, Math.min(idx, 8) * 70));
    }

    // —— 鼠标跟随描边
    const moveHandlers: Array<{
      el: HTMLElement;
      trackHost: HTMLElement;
      tiltCard: HTMLElement | null;
      onMove: (e: PointerEvent) => void;
      onLeave: () => void;
    }> = [];

    if (isFinePointer && !reduceMotion) {
      cards.forEach((el) => {
        const trackHost = el.closest<HTMLElement>(".t-tilt") ?? el;
        const tiltCard = trackHost.querySelector<HTMLElement>(".t-tilt-card");
        const onMove = (e: PointerEvent) => {
          if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
          const r = trackHost.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
          const mx = px * 100;
          const my = py * 100;
          el.style.setProperty("--mx", `${mx.toFixed(1)}%`);
          el.style.setProperty("--my", `${my.toFixed(1)}%`);
          if (!tiltCard) return;
          trackHost.classList.add("is-hover");
          tiltCard.classList.add("is-tilting");
          tiltCard.style.setProperty(
            "--tilt-ry",
            `${((px - 0.5) * TILT_MAX).toFixed(2)}deg`,
          );
          tiltCard.style.setProperty(
            "--tilt-rx",
            `${((0.5 - py) * TILT_MAX).toFixed(2)}deg`,
          );
          tiltCard.style.setProperty("--tilt-gx", `${mx.toFixed(1)}%`);
          tiltCard.style.setProperty("--tilt-gy", `${my.toFixed(1)}%`);
        };
        const onLeave = () => {
          el.style.removeProperty("--mx");
          el.style.removeProperty("--my");
          trackHost.classList.remove("is-hover");
          if (!tiltCard) return;
          tiltCard.classList.remove("is-tilting");
          tiltCard.style.setProperty("--tilt-rx", "0deg");
          tiltCard.style.setProperty("--tilt-ry", "0deg");
        };
        trackHost.addEventListener("pointermove", onMove);
        trackHost.addEventListener("pointerleave", onLeave);
        moveHandlers.push({ el, trackHost, tiltCard, onMove, onLeave });
      });
    }

    return () => {
      io?.disconnect();
      revealTimers.forEach((timer) => window.clearTimeout(timer));
      revealFrames.forEach((frame) => window.cancelAnimationFrame(frame));
      moveHandlers.forEach(({ el, trackHost, tiltCard, onMove, onLeave }) => {
        trackHost.removeEventListener("pointermove", onMove);
        trackHost.removeEventListener("pointerleave", onLeave);
        el.style.removeProperty("--mx");
        el.style.removeProperty("--my");
        trackHost.classList.remove("is-hover");
        tiltCard?.classList.remove("is-tilting");
        tiltCard?.style.removeProperty("--tilt-rx");
        tiltCard?.style.removeProperty("--tilt-ry");
        tiltCard?.style.removeProperty("--tilt-gx");
        tiltCard?.style.removeProperty("--tilt-gy");
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
