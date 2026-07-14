import { NextResponse } from "next/server";
import { getStatus } from "@/lib/qbit";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const status = await getStatus();
  return NextResponse.json(status);
}
