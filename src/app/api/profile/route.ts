import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { parseProfileDisplayName } from "@/lib/profile-display-name";
import { setProfileDisplayName } from "@/lib/profile";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;

  const body = (await request.json().catch(() => null)) as {
    displayName?: unknown;
  } | null;
  const result = parseProfileDisplayName(body?.displayName);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  setProfileDisplayName(user.id, result.value);
  revalidatePath("/profile");
  return NextResponse.json({ ok: true, displayName: result.value });
}
