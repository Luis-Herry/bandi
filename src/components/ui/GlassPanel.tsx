import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type GlassVariant = "default" | "elevated" | "inset";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: GlassVariant;
}

const VARIANT_CLASS: Record<GlassVariant, string> = {
  default: "glass-panel",
  elevated: "glass-panel-elevated",
  inset: "glass-panel-inset",
};

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  function GlassPanel({ variant = "default", className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(VARIANT_CLASS[variant], className)}
        {...rest}
      />
    );
  },
);
