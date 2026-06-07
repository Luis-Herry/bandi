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

const brandLogoSrc = "/brand/app-logo.png";

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
          "border border-white/10 bg-black",
          "transition-[box-shadow,filter] duration-300 ease-out",
          markSizeClass[markSize],
        )}
        style={{
          boxShadow:
            "0 12px 28px rgb(var(--accent-rgb) / 0.22), inset 0 0 0 1px rgb(var(--accent-rgb) / 0.14)",
        }}
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-[inherit] bg-white/25 opacity-0 blur transition-opacity duration-300 group-hover:opacity-100"
        />
        <img
          aria-hidden
          alt=""
          src={brandLogoSrc}
          className="brand-logo-float relative z-10 h-full w-full object-cover"
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
