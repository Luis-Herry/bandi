import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASS = {
  sm: "w-7 h-7 text-[11px]",
  md: "w-9 h-9 text-xs",
  lg: "w-12 h-12 text-sm",
} as const;

export function Avatar({
  src,
  name,
  size = "md",
  className,
  ...rest
}: AvatarProps) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "·";
  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-full",
        "border border-[color:var(--border-default)]",
        "bg-[color:var(--bg-surface-hover)] text-[color:var(--text-primary)]",
        "font-semibold uppercase select-none",
        SIZE_CLASS[size],
        className,
      )}
      {...rest}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        initial
      )}
    </div>
  );
}
