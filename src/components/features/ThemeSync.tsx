"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  readStoredTheme,
  storeTheme,
} from "@/lib/theme-client";
import { normalizeUserTheme, type UserTheme } from "@/lib/theme-options";

interface ThemeSyncProps {
  initialTheme: UserTheme;
}

export function ThemeSync({ initialTheme }: ThemeSyncProps) {
  const pathname = usePathname();
  const desiredThemeRef = useRef<UserTheme>(initialTheme);

  useEffect(() => {
    const theme = readStoredTheme() ?? initialTheme;
    desiredThemeRef.current = theme;
    storeTheme(theme);
    applyRootTheme(theme);
  }, [initialTheme]);

  useEffect(() => {
    applyRootTheme(desiredThemeRef.current);
  }, [pathname]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: unknown }>).detail;
      const theme = normalizeUserTheme(detail?.theme);
      desiredThemeRef.current = theme;
      storeTheme(theme);
      applyRootTheme(theme);
    };

    const observer = new MutationObserver(() => {
      const theme = desiredThemeRef.current;
      if (document.documentElement.dataset.theme !== theme) {
        applyRootTheme(theme);
      }
    });

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      observer.disconnect();
    };
  }, []);

  void THEME_STORAGE_KEY;
  return null;
}

function applyRootTheme(theme: UserTheme): void {
  if (document.documentElement.dataset.theme !== theme) {
    document.documentElement.dataset.theme = theme;
  }
}
