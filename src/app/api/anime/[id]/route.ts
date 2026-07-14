import { NextResponse } from "next/server";
import {
  getAnimeById,
  listEpisodes,
  getUserAnime,
} from "@/db/queries/anime";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const animeId = Number(id);
  if (!Number.isFinite(animeId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const row = getAnimeById(animeId);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const eps = listEpisodes(animeId);
  const userAnimeRow = getUserAnime(user.id, animeId);

  return NextResponse.json({
    anime: row,
    episodes: eps,
    userAnime: userAnimeRow ?? null,
  });
}
