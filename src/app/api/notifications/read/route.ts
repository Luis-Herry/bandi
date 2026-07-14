import { NextResponse } from "next/server";
import {
  getCurrentNavNotificationIds,
  getReadNotificationIds,
  markNavNotificationsRead,
} from "@/lib/nav-notifications";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;

  const raw = (await req.json().catch(() => null)) as unknown;
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const body = raw as { ids?: unknown; all?: unknown };
  if (body.all !== true && !Array.isArray(body.ids)) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const ids = body.all === true ? getCurrentNavNotificationIds(user.id) : body.ids;
  markNavNotificationsRead(user.id, ids);

  return NextResponse.json({
    ok: true,
    readIds: getReadNotificationIds(user.id),
  });
}
