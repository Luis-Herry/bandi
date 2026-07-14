import { NextResponse } from "next/server";
import { searchAnime, annotateInLibrary } from "@/lib/search";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ hits: [] });

  const hits = await searchAnime(q);
  const annotated = await annotateInLibrary(hits, user.id);
  return NextResponse.json({ hits: annotated });
}
