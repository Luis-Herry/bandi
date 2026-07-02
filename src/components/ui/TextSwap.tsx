"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface TextSwapProps {
  value: string;
  className?: string;
  shimmer?: boolean;
}

function readSwapDuration() {
  if (typeof window === "undefined") return 150;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--text-swap-dur")
    .trim();
  if (raw.endsWith("ms")) return Number.parseFloat(raw);
  if (raw.endsWith("s")) return Number.parseFloat(raw) * 1000;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 150;
}

export function TextSwap({ value, className, shimmer = false }: TextSwapProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const currentRef = useRef(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || currentRef.current === value) return;

    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);

    const duration = readSwapDuration();
    el.classList.add("is-exit");
    timerRef.current = window.setTimeout(() => {
      currentRef.current = value;
      setDisplay(value);
      el.classList.remove("is-exit");
      el.classList.add("is-enter-start");
      frameRef.current = window.requestAnimationFrame(() => {
        void el.offsetHeight;
        el.classList.remove("is-enter-start");
      });
    }, duration);

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [value]);

  return (
    <span
      ref={ref}
      className={cn("t-text-swap", shimmer && "t-shimmer", className)}
      data-text={shimmer ? display : undefined}
    >
      {display}
    </span>
  );
}
