import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const iconButtonVariants = cva(
  [
    "inline-flex items-center justify-center",
    "rounded-[6px] border border-[color:var(--border-subtle)]",
    "bg-[color:var(--bg-surface)] backdrop-blur-[12px]",
    "text-[color:var(--text-secondary)]",
    "transition-[background,color,border-color,opacity] duration-150",
    "hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]",
    "hover:border-[color:var(--border-default)]",
    "disabled:opacity-40 disabled:pointer-events-none",
    "[&_svg]:pointer-events-none",
  ],
  {
    variants: {
      size: {
        sm: "w-8 h-8 [&_svg]:w-4 [&_svg]:h-4",
        md: "w-10 h-10 [&_svg]:w-[18px] [&_svg]:h-[18px]",
        lg: "w-12 h-12 [&_svg]:w-5 [&_svg]:h-5",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  /** Accessible label since icon buttons have no visible text. */
  label: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, size, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cn(iconButtonVariants({ size }), className)}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
