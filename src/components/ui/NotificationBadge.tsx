"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface NotificationBadgeProps {
  open: boolean;
  children: ReactNode;
  className?: string;
  dotClassName?: string;
}

export function NotificationBadge({
  open,
  children,
  className,
  dotClassName,
}: NotificationBadgeProps) {
  return (
    <span
      aria-hidden={!open}
      className={cn("t-badge", className)}
      data-open={open ? "true" : "false"}
    >
      <span className={cn("t-badge-dot", dotClassName)}>{children}</span>
    </span>
  );
}
