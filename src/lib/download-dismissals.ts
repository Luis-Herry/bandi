import { eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { buildDownloadSourceKey } from "@/lib/download-reconcile";

export const DOWNLOAD_DISMISSAL_SETTING_PREFIX = "download_dismissal_v1:";

interface DownloadDismissalRecord {
  version: 1;
  sourceKey: string;
}

function settingKey(sourceKey: string): string {
  return `${DOWNLOAD_DISMISSAL_SETTING_PREFIX}${sourceKey}`;
}

function parseRecord(
  value: unknown,
  sourceKey: string,
): DownloadDismissalRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DownloadDismissalRecord>;
  return record.version === 1 && record.sourceKey === sourceKey
    ? { version: 1, sourceKey }
    : null;
}

export function listDismissedDownloadSourceKeys(): Set<string> {
  const rows = db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(like(appSettings.key, `${DOWNLOAD_DISMISSAL_SETTING_PREFIX}%`))
    .all();

  const sourceKeys = new Set<string>();
  for (const row of rows) {
    const sourceKey = row.key.slice(DOWNLOAD_DISMISSAL_SETTING_PREFIX.length);
    if (parseRecord(row.value, sourceKey)) sourceKeys.add(sourceKey);
  }
  return sourceKeys;
}

export function dismissDownloadSources(magnetUrls: readonly string[]): number {
  const sourceKeys = [
    ...new Set(
      magnetUrls
        .map(buildDownloadSourceKey)
        .filter((key): key is string => key != null),
    ),
  ];
  const now = new Date();

  for (const sourceKey of sourceKeys) {
    const record: DownloadDismissalRecord = { version: 1, sourceKey };
    db.insert(appSettings)
      .values({ key: settingKey(sourceKey), value: record, updatedAt: now })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: record, updatedAt: sql`(unixepoch())` },
      })
      .run();
  }
  return sourceKeys.length;
}

export function clearDownloadSourceDismissal(magnetUrl: string): boolean {
  const sourceKey = buildDownloadSourceKey(magnetUrl);
  if (!sourceKey) return false;
  const result = db
    .delete(appSettings)
    .where(eq(appSettings.key, settingKey(sourceKey)))
    .run();
  return (result.changes ?? 0) > 0;
}
