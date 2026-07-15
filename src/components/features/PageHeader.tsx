import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      data-page-header
      className={cn(
        "flex flex-col gap-3 sm:min-h-[72px] sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="t-stagger is-shown min-w-0">
        {eyebrow && (
          <p className="t-stagger-line t-stagger-line--1 mb-2 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
            {eyebrow}
          </p>
        )}
        <h1 className="t-stagger-line t-stagger-line--1 text-[28px] font-bold tracking-[-0.02em] text-[color:var(--text-primary)]">
          {title}
        </h1>
        {description && (
          <p className="t-stagger-line t-stagger-line--2 mt-2 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}
