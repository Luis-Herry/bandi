import { NextResponse } from "next/server";
import { searchAnime, annotateInLibrary } from "@/lib/search";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ hits: [] });

  const hits = await searchAnime(q);
  const user = await getCurrentUser();
  const annotated = user ? await annotateInLibrary(hits, user.id) : hits;
  return NextResponse.json({ hits: annotated });
}
