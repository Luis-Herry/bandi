"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface IconSwapProps {
  state: "a" | "b";
  iconA: ReactNode;
  iconB: ReactNode;
  className?: string;
  iconClassName?: string;
}

export function IconSwap({
  state,
  iconA,
  iconB,
  className,
  iconClassName,
}: IconSwapProps) {
  return (
    <span className={cn("t-icon-swap", className)} data-state={state}>
      <span className={cn("t-icon", iconClassName)} data-icon="a">
        {iconA}
      </span>
      <span className={cn("t-icon", iconClassName)} data-icon="b">
        {iconB}
      </span>
    </span>
  );
}
