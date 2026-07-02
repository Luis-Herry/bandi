"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

interface ResizePanelProps {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}

export function ResizePanel({
  children,
  className,
  innerClassName,
}: ResizePanelProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const measure = () => {
      setHeight(Math.ceil(inner.getBoundingClientRect().height));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  const style: CSSProperties | undefined =
    height == null ? undefined : { height };

  return (
    <div className={cn("t-resize", className)} style={style}>
      <div ref={innerRef} className={innerClassName}>
        {children}
      </div>
    </div>
  );
}
