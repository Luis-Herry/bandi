"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";

interface NumberPopProps {
  value: number | string;
  className?: string;
  digitClassName?: string;
  dirX?: number;
  dirY?: number;
}

type DigitStyle = CSSProperties & {
  "--digit-dir-x"?: number;
  "--digit-dir-y"?: number;
};

export function NumberPop({
  value,
  className,
  digitClassName,
  dirX = 0,
  dirY = 1,
}: NumberPopProps) {
  const valueText = String(value);
  const [displayValue, setDisplayValue] = useState(valueText);
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    setDisplayValue(valueText);
    setAnimating(false);

    const raf = requestAnimationFrame(() => setAnimating(true));
    return () => cancelAnimationFrame(raf);
  }, [valueText]);

  const chars = useMemo(() => Array.from(displayValue), [displayValue]);
  const style: DigitStyle = {
    "--digit-dir-x": dirX,
    "--digit-dir-y": dirY,
  };

  return (
    <span
      data-tabular
      aria-live="polite"
      className={cn("t-digit-group", animating && "is-animating", className)}
      style={style}
    >
      {chars.map((char, index) => {
        const reverseIndex = chars.length - index;
        const stagger = reverseIndex <= 2 ? String(reverseIndex) : undefined;
        return (
          <span
            key={`${char}-${index}-${displayValue}`}
            className={cn("t-digit", digitClassName)}
            data-stagger={stagger}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}
