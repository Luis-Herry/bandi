import { NextResponse } from "next/server";
import { runCheckUpdates } from "@/lib/cron";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min, 同步集数表可能跑得久

/**
 * POST /api/cron/check-updates
 * 手动触发番剧元数据同步。需要登录，或带 `x-cron-secret` header（用于外部调度器）。
 */
export async function POST(req: Request) {
  const ok = await authorize(req);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await runCheckUpdates();
  return NextResponse.json({ ok: true, result });
}

async function authorize(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (process.env.ANIME_LOCAL_SERVER_APP !== "1" && secret) {
    const header = req.headers.get("x-cron-secret");
    if (header === secret) return true;
  }
  const user = await requireRouteUser();
  return !(user instanceof Response);
}
