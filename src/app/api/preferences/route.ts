/**
 * GET  /api/preferences  → 返回当前下载偏好（需登录）
 * PUT  /api/preferences  → 保存下载偏好；body 必须是 DownloadPreferences 形状（需登录）
 *
 * 校验规则：三个字段都必须是 string[]，可为空数组。
 * 多余字段会被忽略，非字符串元素会被静默过滤。
 */

import { NextResponse } from "next/server";
import {
  getPreferences,
  setPreferences,
  DEFAULT_PREFERENCES,
  type DownloadPreferences,
} from "@/lib/preferences";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const prefs = await getPreferences();
  return NextResponse.json({
    preferences: prefs,
    defaults: DEFAULT_PREFERENCES,
  });
}

export async function PUT(req: Request) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;

  const raw = (await req.json().catch(() => null)) as unknown;
  if (!raw || typeof raw !== "object") {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400 },
    );
  }

  const candidate = raw as Partial<DownloadPreferences>;
  if (
    !isStringArray(candidate.preferredGroups) ||
    !isStringArray(candidate.requiredKeywords) ||
    !isStringArray(candidate.preferredQualities)
  ) {
    return NextResponse.json(
      {
        error:
          "preferredGroups / requiredKeywords / preferredQualities 必须都是 string[]",
      },
      { status: 400 },
    );
  }

  const next: DownloadPreferences = {
    preferredGroups: dedup(candidate.preferredGroups.map((s) => s.trim()).filter(Boolean)),
    requiredKeywords: dedup(candidate.requiredKeywords.map((s) => s.trim()).filter(Boolean)),
    preferredQualities: dedup(candidate.preferredQualities.map((s) => s.trim()).filter(Boolean)),
  };

  await setPreferences(next);
  return NextResponse.json({ ok: true, preferences: next });
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function dedup(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
