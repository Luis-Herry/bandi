"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { normalizeUserTheme, setUserTheme } from "@/lib/theme";
import type { UserTheme } from "@/lib/theme";

export async function setThemeAction(theme: UserTheme) {
  await requireUser();
  const next = normalizeUserTheme(theme);
  await setUserTheme(next);
  revalidatePath("/", "layout");
  return { theme: next };
}
