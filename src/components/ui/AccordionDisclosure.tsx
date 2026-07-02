"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface AccordionDisclosureProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  icon?: ReactNode;
  className?: string;
  buttonClassName?: string;
  titleClassName?: string;
  panelClassName?: string;
  bodyClassName?: string;
}

export function AccordionDisclosure({
  title,
  children,
  defaultOpen = false,
  icon,
  className,
  buttonClassName,
  titleClassName,
  panelClassName,
  bodyClassName,
}: AccordionDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div
      className={cn("t-acc", className)}
      data-open={open ? "true" : "false"}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center gap-2 text-left",
          "focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]",
          buttonClassName,
        )}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className={cn("min-w-0 flex-1", titleClassName)}>{title}</span>
        <ChevronDown
          aria-hidden
          size={14}
          className="t-acc-chevron shrink-0 text-[color:var(--text-muted)]"
        />
      </button>
      <div
        id={panelId}
        className={cn("t-acc-panel", panelClassName)}
        data-open={open ? "true" : "false"}
      >
        <div className={cn("t-acc-panel-inner", bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}
