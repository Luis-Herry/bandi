"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { hexToRgbTuple } from "@/lib/colors";
import { DEFAULT_THEME_OPTION } from "@/lib/theme-options";

interface AccentValue {
  accent: string;
  accentRgb: string;
  setAccent: (hex: string) => void;
  reset: () => void;
}

const FALLBACK = DEFAULT_THEME_OPTION.accent;

const AccentContext = createContext<AccentValue | null>(null);

export function AccentProvider({
  children,
  initial = FALLBACK,
}: {
  children: ReactNode;
  initial?: string;
}) {
  const [accent, setAccentState] = useState<string>(initial);
  const setAccent = useCallback((hex: string) => setAccentState(hex), []);
  const reset = useCallback(() => setAccentState(initial), [initial]);

  const value = useMemo<AccentValue>(
    () => ({
      accent,
      accentRgb: hexToRgbTuple(accent),
      setAccent,
      reset,
    }),
    [accent, reset, setAccent],
  );

  return (
    <AccentContext.Provider value={value}>{children}</AccentContext.Provider>
  );
}

export function useAccent(): AccentValue {
  const ctx = useContext(AccentContext);
  if (!ctx) {
    throw new Error("useAccent must be used inside <AccentProvider>");
  }
  return ctx;
}
