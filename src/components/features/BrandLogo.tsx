import { Tv } from "lucide-react";
import { cn } from "@/lib/cn";

interface BrandLogoProps {
  subtitle?: string;
  showText?: boolean;
  markSize?: "sm" | "md" | "lg";
  className?: string;
  textClassName?: string;
}

const markSizeClass = {
  sm: "h-10 w-10 rounded-[10px]",
  md: "h-11 w-11 rounded-[11px]",
  lg: "h-12 w-12 rounded-[12px]",
};

const iconSizeClass = {
  sm: "h-5 w-5",
  md: "h-[22px] w-[22px]",
  lg: "h-6 w-6",
};

export function BrandLogo({
  subtitle = "你的私人放映厅",
  showText = true,
  markSize = "sm",
  className,
  textClassName,
}: BrandLogoProps) {
  return (
    <span className={cn("group flex items-center gap-3", className)}>
      <span
        className={cn(
          "brand-logo-mark relative inline-flex shrink-0 items-center justify-center overflow-hidden",
          "border border-white/15",
          "transition-[box-shadow,filter] duration-300 ease-out",
          markSizeClass[markSize],
        )}
        style={{
          background:
            "linear-gradient(135deg, var(--accent) 0%, rgb(var(--accent-rgb) / 0.74) 100%)",
          boxShadow: "0 12px 28px rgb(var(--accent-rgb) / 0.26)",
        }}
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-[inherit] bg-white/25 opacity-0 blur transition-opacity duration-300 group-hover:opacity-100"
        />
        <Tv
          aria-hidden
          strokeWidth={2}
          className={cn(
            "brand-logo-float relative z-10",
            iconSizeClass[markSize],
          )}
          style={{
            color: "white",
          }}
        />
      </span>
      {showText && (
        <span className={cn("min-w-0 leading-tight", textClassName)}>
          <span className="block truncate text-[16px] font-bold tracking-tight text-[color:var(--text-primary)]">
            Bandi
          </span>
          {subtitle && (
            <span className="mt-0.5 block truncate text-[10px] font-medium tracking-[0.12em] text-[color:var(--accent)]">
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
