import { NextResponse } from "next/server";
import { runCheckRss } from "@/lib/cron";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/cron/check-rss
 * 手动触发 RSS 抓取 → qBit 推送。需要登录或带 `x-cron-secret` header。
 */
export async function POST(req: Request) {
  const ok = await authorize(req);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await runCheckRss();
  return NextResponse.json({ ok: true, result });
}

async function authorize(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("x-cron-secret");
    if (header === secret) return true;
  }
  const user = await getCurrentUser();
  return !!user;
}
