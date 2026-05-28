import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  prefixIcon?: ReactNode;
  suffix?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ prefixIcon, suffix, className, ...rest }, ref) {
    return (
      <div
        className={cn(
          "group flex items-center gap-2 h-10 px-3 rounded-[8px]",
          "bg-[color:var(--bg-surface)] border border-[color:var(--border-subtle)]",
          "backdrop-blur-[12px]",
          "transition-colors duration-150",
          "hover:border-[color:var(--border-default)]",
          "focus-within:border-[color:var(--border-strong)]",
          className,
        )}
      >
        {prefixIcon && (
          <span className="text-[color:var(--text-muted)] [&_svg]:w-4 [&_svg]:h-4">
            {prefixIcon}
          </span>
        )}
        <input
          ref={ref}
          data-no-focus-ring
          {...rest}
          className={cn(
            "flex-1 bg-transparent outline-none text-sm",
            "text-[color:var(--text-primary)]",
            "placeholder:text-[color:var(--text-muted)]",
            "disabled:opacity-40",
          )}
        />
        {suffix && (
          <span className="text-[color:var(--text-muted)] text-xs">
            {suffix}
          </span>
        )}
      </div>
    );
  },
);
