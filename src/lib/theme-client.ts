import {
  normalizeUserTheme,
  type UserTheme,
} from "@/lib/theme-options";

export const THEME_STORAGE_KEY = "anime-tracker:user-theme";
export const THEME_CHANGE_EVENT = "anime-theme-change";

export function readStoredTheme(): UserTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!value) return null;
    return normalizeUserTheme(value);
  } catch {
    return null;
  }
}

export function storeTheme(theme: UserTheme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable in private or locked-down contexts.
  }
}

export function applyClientTheme(theme: UserTheme): void {
  if (typeof window === "undefined") return;
  storeTheme(theme);
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(
    new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme } }),
  );
}
