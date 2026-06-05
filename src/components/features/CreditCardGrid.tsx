"use client";

import type { ReactNode } from "react";
import { useCardGlow } from "@/hooks/useCardGlow";
import { cn } from "@/lib/cn";

interface CreditCardGridProps {
  children: ReactNode;
  className?: string;
  depsKey?: string;
}

export function CreditCardGrid({
  children,
  className,
  depsKey,
}: CreditCardGridProps) {
  const ref = useCardGlow<HTMLDivElement>([depsKey]);

  return (
    <div
      ref={ref}
      className={cn("grid grid-cols-1 gap-3 min-[720px]:grid-cols-2", className)}
    >
      {children}
    </div>
  );
}
