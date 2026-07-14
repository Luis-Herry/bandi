import { NextResponse } from "next/server";
import { db } from "@/db";
import { rssSources } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const rowId = Number(id);
  if (!Number.isFinite(rowId))
    return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.url === "string") updates.url = body.url;
  if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
  if (body.filters && typeof body.filters === "object") {
    updates.filters = body.filters;
  }
  if (Object.keys(updates).length === 0)
    return NextResponse.json({ ok: true });

  db.update(rssSources)
    .set(updates)
    .where(eq(rssSources.id, rowId))
    .run();
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const rowId = Number(id);
  if (!Number.isFinite(rowId))
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  db.delete(rssSources).where(eq(rssSources.id, rowId)).run();
  return NextResponse.json({ ok: true });
}
