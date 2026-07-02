"use client";

import { cn } from "@/lib/cn";

interface ShimmerTextProps {
  text: string;
  className?: string;
}

export function ShimmerText({ text, className }: ShimmerTextProps) {
  return (
    <span className={cn("t-shimmer", className)} data-text={text}>
      {text}
    </span>
  );
}
