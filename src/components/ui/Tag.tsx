import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline" | "accent";
}

export function Tag({
  variant = "default",
  className,
  ...rest
}: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11px] font-medium",
        "leading-[1.4] tracking-[0.01em]",
        variant === "default" &&
          "bg-[color:var(--bg-surface)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]",
        variant === "outline" &&
          "border border-[color:var(--border-default)] text-[color:var(--text-secondary)]",
        variant === "accent" &&
          "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-muted)]",
        className,
      )}
      {...rest}
    />
  );
}
