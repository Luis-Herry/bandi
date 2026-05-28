/**
 * 下载偏好（DownloadPreferences）读写。
 *
 * 字段含义：
 *  - preferredGroups: 字幕组白名单，命中之一即放行；空数组表示不限制（非常宽松，不推荐）。
 *  - requiredKeywords: 必含关键字白名单，命中之一即放行；空数组表示不限制。
 *  - preferredQualities: 可接受画质，命中之一即放行；空数组表示不限制。
 *
 * 持久化：app_settings 表，key="download_preferences"，value 是 JSON。
 * 没有记录时返回 DEFAULT_PREFERENCES，setPreferences 用 INSERT OR REPLACE（drizzle 的 onConflictDoUpdate）。
 *
 * 注意：better-sqlite3 同步 API，这里函数签名虽返回 Promise（保持调用方人体工学），但内部都是同步执行。
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";

export interface DownloadPreferences {
  /** 字幕组白名单（命中之一）。空数组 = 不限制（不推荐） */
  preferredGroups: string[];
  /** 必含关键字（命中之一即可，OR 关系）。空数组 = 不限制 */
  requiredKeywords: string[];
  /** 可接受画质（命中之一）。空数组 = 不限制 */
  preferredQualities: string[];
}

const PREF_KEY = "download_preferences";

export const DEFAULT_PREFERENCES: DownloadPreferences = {
  preferredGroups: [
    "ANi",
    "桜都字幕组",
    "喵萌奶茶屋",
    "Lilith-Raws",
    "LoliHouse",
    "北宇治字幕组",
    "Nekomoe kissaten",
    "动漫国字幕组",
    "千夏字幕组",
    "诸神字幕组",
  ],
  requiredKeywords: ["简体", "简日", "简中", "CHS", "GB"],
  preferredQualities: ["2160p", "4K", "1080p"],
};

export async function getPreferences(): Promise<DownloadPreferences> {
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, PREF_KEY))
    .get();
  if (!row) return { ...DEFAULT_PREFERENCES };

  // value 是 JSON，但旧数据 / 手改库可能不规范，做最小校验
  const v = row.value as Partial<DownloadPreferences> | null;
  if (!v || typeof v !== "object") return { ...DEFAULT_PREFERENCES };

  return {
    preferredGroups: Array.isArray(v.preferredGroups)
      ? v.preferredGroups.filter((x): x is string => typeof x === "string")
      : DEFAULT_PREFERENCES.preferredGroups,
    requiredKeywords: Array.isArray(v.requiredKeywords)
      ? v.requiredKeywords.filter((x): x is string => typeof x === "string")
      : DEFAULT_PREFERENCES.requiredKeywords,
    preferredQualities: Array.isArray(v.preferredQualities)
      ? v.preferredQualities.filter((x): x is string => typeof x === "string")
      : DEFAULT_PREFERENCES.preferredQualities,
  };
}

export async function setPreferences(p: DownloadPreferences): Promise<void> {
  db.insert(appSettings)
    .values({
      key: PREF_KEY,
      value: p,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: p,
        updatedAt: sql`(unixepoch())`,
      },
    })
    .run();
}
