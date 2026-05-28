import { NextResponse } from "next/server";
import { syncFromBangumi } from "@/db/queries/anime";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    bangumiId?: number;
  };
  const bgmId = Number(body.bangumiId);
  if (!Number.isFinite(bgmId) || bgmId <= 0) {
    return NextResponse.json(
      { error: "bangumiId is required" },
      { status: 400 },
    );
  }
  const result = await syncFromBangumi(bgmId);
  if (!result) {
    return NextResponse.json(
      { error: "subject not found on Bangumi" },
      { status: 404 },
    );
  }
  return NextResponse.json(result);
}
