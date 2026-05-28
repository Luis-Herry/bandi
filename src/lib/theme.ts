import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
export {
  DEFAULT_THEME,
  THEME_OPTIONS,
  normalizeUserTheme,
} from "@/lib/theme-options";
export type { UserTheme } from "@/lib/theme-options";
import { normalizeUserTheme } from "@/lib/theme-options";
import type { UserTheme } from "@/lib/theme-options";

const THEME_KEY = "user_theme";

export async function getUserTheme(): Promise<UserTheme> {
  try {
    const row = db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, THEME_KEY))
      .get();
    const value = row?.value;
    if (!value || typeof value !== "object") return normalizeUserTheme(null);
    return normalizeUserTheme((value as { theme?: unknown }).theme);
  } catch {
    return normalizeUserTheme(null);
  }
}

export async function setUserTheme(theme: UserTheme): Promise<void> {
  const next = normalizeUserTheme(theme);
  const value = { theme: next };

  db.insert(appSettings)
    .values({
      key: THEME_KEY,
      value,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value,
        updatedAt: sql`(unixepoch())`,
      },
    })
    .run();
}
