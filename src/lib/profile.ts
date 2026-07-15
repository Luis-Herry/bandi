import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { parseProfileDisplayName } from "@/lib/profile-display-name";

const PROFILE_DISPLAY_NAME_PREFIX = "profile_display_name:";

function displayNameKey(userId: string) {
  return `${PROFILE_DISPLAY_NAME_PREFIX}${userId}`;
}

export function getProfileDisplayName(userId: string, fallback: string): string {
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, displayNameKey(userId)))
    .get();
  const result = parseProfileDisplayName(row?.value);
  return result.ok ? result.value : fallback;
}

export function setProfileDisplayName(userId: string, displayName: string): void {
  db.insert(appSettings)
    .values({
      key: displayNameKey(userId),
      value: displayName,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: displayName,
        updatedAt: sql`(unixepoch())`,
      },
    })
    .run();
}
