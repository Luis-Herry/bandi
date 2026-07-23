"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { cn } from "@/lib/cn";

interface SpinningCounterProps {
  value: number | string;
  className?: string;
  digitClassName?: string;
  spins?: number;
}

function readRootNumber(name: string, fallback: number) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readRootDuration(name: string, fallback: number) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return raw.endsWith("s") && !raw.endsWith("ms") ? parsed * 1000 : parsed;
}

export function SpinningCounter({
  value,
  className,
  digitClassName,
  spins = 2,
}: SpinningCounterProps) {
  const valueText = String(value);
  let reelIndex = 0;

  return (
    <span className={cn("t-reel", className)} aria-live="polite">
      <span className="sr-only">{valueText}</span>
      {Array.from(valueText).map((char, index) => {
        if (!/\d/.test(char)) {
          return (
            <span
              key={`${char}-${index}`}
              aria-hidden
              className={cn(
                "inline-flex h-[var(--reel-cell)] items-center",
                digitClassName,
              )}
            >
              {char}
            </span>
          );
        }

        const columnIndex = reelIndex;
        reelIndex += 1;
        return (
          <ReelDigit
            key={`${valueText}-${index}`}
            digit={Number(char)}
            columnIndex={columnIndex}
            spins={spins}
            className={digitClassName}
          />
        );
      })}
    </span>
  );
}

function ReelDigit({
  digit,
  columnIndex,
  spins,
  className,
}: {
  digit: number;
  columnIndex: number;
  spins: number;
  className?: string;
}) {
  const filterId = `reel-blur-${useId().replace(/:/g, "")}`;
  const blurRef = useRef<SVGFEGaussianBlurElement>(null);
  const [spinning, setSpinning] = useState(false);
  const targetIndex = Math.max(0, spins) * 10 + digit;
  const cells = useMemo(
    () => Array.from({ length: targetIndex + 1 }, (_, index) => index % 10),
    [targetIndex],
  );

  useEffect(() => {
    const blur = blurRef.current;
    if (!blur) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    blur.setAttribute("stdDeviation", "0 0");

    let startFrame = 0;
    let spinFrame = 0;
    let blurFrame = 0;
    let cancelled = false;

    startFrame = window.requestAnimationFrame(() => {
      spinFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        setSpinning(true);
        if (reduceMotion) return;

        const duration = readRootDuration("--reel-dur", 1400);
        const stagger = readRootDuration("--reel-stagger", 90);
        const maxBlur = readRootNumber("--reel-spin-blur", 3);
        const startsAt = performance.now() + columnIndex * stagger;

        const updateBlur = (now: number) => {
          if (cancelled) return;
          if (now < startsAt) {
            blurFrame = window.requestAnimationFrame(updateBlur);
            return;
          }

          const progress = Math.min(1, (now - startsAt) / duration);
          const amount = maxBlur * (1 - progress) ** 2;
          blur.setAttribute("stdDeviation", `0 ${amount.toFixed(2)}`);
          if (progress < 1) {
            blurFrame = window.requestAnimationFrame(updateBlur);
          }
        };

        blurFrame = window.requestAnimationFrame(updateBlur);
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(startFrame);
      window.cancelAnimationFrame(spinFrame);
      window.cancelAnimationFrame(blurFrame);
    };
  }, [columnIndex, digit, spins]);

  const stripStyle: CSSProperties = {
    filter: `url(#${filterId})`,
    transform: `translateY(calc(var(--reel-cell) * -${
      spinning ? targetIndex : 0
    }))`,
    transition: spinning
      ? `transform var(--reel-dur) var(--reel-ease) calc(var(--reel-stagger) * ${columnIndex})`
      : "none",
  };

  return (
    <span className="t-reel-col" aria-hidden>
      <svg
        aria-hidden
        width="0"
        height="0"
        className="pointer-events-none absolute"
      >
        <filter id={filterId}>
          <feGaussianBlur ref={blurRef} in="SourceGraphic" stdDeviation="0 0" />
        </filter>
      </svg>
      <span className="t-reel-strip" style={stripStyle}>
        {cells.map((cell, index) => (
          <span
            key={`${cell}-${index}`}
            className={cn("t-reel-digit", className)}
          >
            {cell}
          </span>
        ))}
      </span>
    </span>
  );
}
