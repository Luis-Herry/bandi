"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type InputHTMLAttributes,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type ClearableInputVariant = "field" | "bare";

interface ClearableInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onValueChange: (next: string) => void;
  onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
  prefixIcon?: ReactNode;
  suffix?: ReactNode;
  variant?: ClearableInputVariant;
  inputClassName?: string;
  clearLabel?: string;
}

const NBSP = "\u00a0";

function numberToken(name: string, fallback: number) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function durationToken(name: string, fallbackMs: number) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return fallbackMs;
  return raw.endsWith("ms") ? parsed : parsed * 1000;
}

function bezier(value: string) {
  const match = String(value).match(
    /cubic-bezier\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/,
  );
  if (!match) return (t: number) => t;
  const [x1, y1, x2, y2] = match.slice(1).map(Number.parseFloat);
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {
      const dx = ((ax * s + bx) * s + cx) * s - t;
      const d = (3 * ax * s + 2 * bx) * s + cx;
      if (Math.abs(dx) < 1e-6 || d === 0) break;
      s -= dx / d;
    }
    return ((ay * s + by) * s + cy) * s;
  };
}

function buildGlow(input: HTMLInputElement, wrap: HTMLElement, text: string) {
  const canvas = document.createElement("canvas").getContext("2d");
  if (!canvas) return "";

  canvas.font = getComputedStyle(input).font;
  const width = wrap.clientWidth || 280;
  const padLeft = Number.parseFloat(
    getComputedStyle(wrap).getPropertyValue("--clear-text-left"),
  ) || 12;
  const spread = numberToken("--glow-spread", 1.5);
  const layers: string[] = [];
  let x = 0;

  text.split(/(\s+)/).forEach((segment) => {
    const segmentWidth = canvas.measureText(segment).width;
    if (segment.trim()) {
      const centerX = padLeft + x + segmentWidth / 2;
      const halfWidth = Math.max(segmentWidth * 0.45, 8) * spread;
      [
        [0, 0.8, 7, 0.22],
        [halfWidth * 0.45, 0.55, 8, 0.18],
        [-halfWidth * 0.4, 0.65, 6, 0.16],
        [halfWidth * 0.15, 0.9, 5, 0.14],
      ].forEach(([dx, radiusScale, radiusHeight, alpha]) => {
        const left = (((centerX + dx) / width) * 100).toFixed(2);
        layers.push(
          `radial-gradient(ellipse ${Math.max(halfWidth * radiusScale, 2).toFixed(1)}px ${radiusHeight}px at ${left}% 100%, rgba(255,255,255,${alpha}), transparent)`,
        );
      });
    }
    x += segmentWidth;
  });

  return layers.join(", ");
}

export const ClearableInput = forwardRef<HTMLInputElement, ClearableInputProps>(
  function ClearableInput(
    {
      value,
      onValueChange,
      prefixIcon,
      suffix,
      variant = "field",
      inputClassName,
      clearLabel = "清空搜索",
      placeholder,
      className,
      onChange,
      ...rest
    },
    forwardedRef,
  ) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const mirrorRef = useRef<HTMLDivElement | null>(null);
    const placeholderRef = useRef<HTMLDivElement | null>(null);
    const glowRef = useRef<HTMLDivElement | null>(null);
    const frameRef = useRef<number | null>(null);
    const [clearing, setClearing] = useState(false);
    const [clearingText, setClearingText] = useState("");

    const showClear = value.length > 0 || clearing;
    const textLeft = prefixIcon ? "36px" : "12px";
    const textRight = showClear
      ? suffix
        ? "68px"
        : "38px"
      : suffix
        ? "40px"
        : "12px";

    const setInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) {
          (forwardedRef as MutableRefObject<HTMLInputElement | null>).current =
            node;
        }
      },
      [forwardedRef],
    );

    useEffect(() => {
      return () => {
        if (frameRef.current != null) {
          window.cancelAnimationFrame(frameRef.current);
        }
      };
    }, []);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      onValueChange(event.currentTarget.value);
      onChange?.(event);
    };

    const clearWithAnimation = () => {
      const input = inputRef.current;
      const wrap = wrapRef.current;
      const mirror = mirrorRef.current;
      const fakePlaceholder = placeholderRef.current;
      const glow = glowRef.current;
      if (!input || !wrap || !mirror || !fakePlaceholder || !glow || !value) {
        return;
      }

      const keepFocus = document.activeElement === input;
      const oldText = value;
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      flushSync(() => {
        setClearingText(oldText.replace(/ /g, NBSP));
        setClearing(true);
      });
      mirror.textContent = oldText.replace(/ /g, NBSP);
      onValueChange("");

      const total = durationToken("--clear-dur", 1000);
      const outDuration = durationToken("--clear-out-dur", 400);
      const inDuration = durationToken("--clear-in-dur", 400);
      const outFly = numberToken("--clear-out-fly", 12);
      const inFly = numberToken("--clear-in-fly", 12);
      const blur = numberToken("--clear-blur", 2);
      const delay = durationToken("--glow-delay", 50);
      const peakAt = numberToken("--glow-peak-at", 0.15);
      const glowOpacity = numberToken("--glow-opacity", 0.85);
      const styles = getComputedStyle(document.documentElement);
      const easeOut = bezier(styles.getPropertyValue("--clear-out-ease"));
      const easeIn = bezier(styles.getPropertyValue("--clear-in-ease"));

      wrap.classList.add("is-clearing");
      glow.style.background = buildGlow(input, wrap, oldText);
      glow.style.opacity = "0";
      fakePlaceholder.style.transform = `translateY(-${inFly}px)`;
      fakePlaceholder.style.opacity = "0.9";
      fakePlaceholder.style.filter = `blur(${blur}px)`;

      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const outProgress = easeOut(Math.min(1, elapsed / outDuration));
        mirror.style.transform = `translateY(${(outProgress * outFly).toFixed(1)}px)`;
        mirror.style.opacity = (1 - outProgress).toFixed(3);
        mirror.style.filter = `blur(${(outProgress * blur).toFixed(1)}px)`;

        const inProgress = easeIn(Math.min(1, elapsed / inDuration));
        fakePlaceholder.style.transform = `translateY(${(-inFly + inProgress * inFly).toFixed(1)}px)`;
        fakePlaceholder.style.opacity = (0.9 + inProgress * 0.1).toFixed(3);
        fakePlaceholder.style.filter = `blur(${(blur - inProgress * blur).toFixed(1)}px)`;

        let glowProgress = 0;
        if (elapsed > delay) {
          const normalized = Math.min(
            1,
            (elapsed - delay) / Math.max(1, total - delay),
          );
          glowProgress =
            normalized < peakAt
              ? normalized / peakAt
              : 1 - (normalized - peakAt) / (1 - peakAt);
        }
        glow.style.opacity = (glowProgress * glowOpacity).toFixed(3);

        if (elapsed < total) {
          frameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        wrap.classList.remove("is-clearing");
        setClearing(false);
        setClearingText("");
        mirror.removeAttribute("style");
        mirror.textContent = "";
        fakePlaceholder.removeAttribute("style");
        glow.style.opacity = "0";
        glow.style.background = "";
        if (keepFocus) {
          window.requestAnimationFrame(() => input.focus({ preventScroll: true }));
        }
      };

      frameRef.current = window.requestAnimationFrame(tick);
    };

    const wrapperStyle = {
      "--clear-text-left": textLeft,
      "--clear-text-right": textRight,
    } as CSSProperties;

    return (
      <div
        ref={wrapRef}
        className={cn(
          "t-clear group flex items-center gap-2",
          variant === "field" &&
            "h-10 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] px-3 backdrop-blur-[12px] transition-colors duration-150 hover:border-[color:var(--border-default)] focus-within:border-[color:var(--border-strong)]",
          variant === "bare" && "h-12 bg-transparent px-4",
          value.length > 0 && "has-value",
          clearing && "is-clearing",
          className,
        )}
        style={wrapperStyle}
      >
        {prefixIcon && (
          <span className="relative z-[5] shrink-0 text-[color:var(--text-muted)] [&_svg]:h-4 [&_svg]:w-4">
            {prefixIcon}
          </span>
        )}
        <input
          ref={setInputRef}
          data-no-focus-ring
          {...rest}
          value={value}
          onChange={handleChange}
          placeholder=""
          aria-label={rest["aria-label"] ?? (typeof placeholder === "string" ? placeholder : undefined)}
          className={cn(
            "t-clear-input min-w-0 flex-1 bg-transparent outline-none",
            "text-sm text-[color:var(--text-primary)] disabled:opacity-40",
            inputClassName,
          )}
        />
        <div ref={mirrorRef} className="t-clear-mirror" aria-hidden="true">
          {clearing ? clearingText : value.replace(/ /g, NBSP)}
        </div>
        <div
          ref={placeholderRef}
          className="t-clear-placeholder"
          aria-hidden="true"
        >
          {placeholder}
        </div>
        <div ref={glowRef} className="t-clear-glow" aria-hidden="true" />
        {suffix && <span className="relative z-[5] shrink-0">{suffix}</span>}
        {showClear && (
          <button
            type="button"
            className="t-clear-btn inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]"
            aria-label={clearLabel}
            onPointerDown={(event) => {
              if (document.activeElement === inputRef.current) {
                event.preventDefault();
              }
            }}
            onMouseDown={(event) => {
              if (document.activeElement === inputRef.current) {
                event.preventDefault();
              }
            }}
            onClick={clearWithAnimation}
          >
            <X size={13} strokeWidth={2.4} />
          </button>
        )}
      </div>
    );
  },
);
