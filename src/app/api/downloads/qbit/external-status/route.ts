import { NextResponse } from "next/server";
import { diagnoseExternalQbit } from "@/lib/qbit-external-diagnostic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (process.env.ANIME_DESKTOP_APP !== "1") {
    return NextResponse.json(
      {
        connected: false,
        available: false,
        error: "desktop_only",
      },
      { status: 404 },
    );
  }
  return NextResponse.json(await diagnoseExternalQbit());
}
