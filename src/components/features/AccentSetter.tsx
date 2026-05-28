"use client";

import { useEffect } from "react";
import { useAccent } from "./AccentProvider";

interface AccentSetterProps {
  hex?: string | null;
}

/**
 * Mount-only side effect: pushes a hex into the global AccentProvider for
 * the lifetime of this subtree. Used on the detail page (per-anime accent)
 * and on the home hero (per-slide accent). Reverts to fallback on unmount.
 */
export function AccentSetter({ hex }: AccentSetterProps) {
  const { setAccent, reset } = useAccent();
  useEffect(() => {
    if (hex) setAccent(hex);
    return () => reset();
  }, [hex, setAccent, reset]);
  return null;
}
