import { NextResponse } from "next/server";
import { db } from "@/db";
import { anime } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  addRssTitleAlias,
  getRssTitleAliases,
  normalizeRssTitleAlias,
  removeRssTitleAlias,
} from "@/lib/rss-title-aliases";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const animeId = await parseAnimeId(params);
  if (animeId == null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  return NextResponse.json({
    animeId,
    aliases: getRssTitleAliases(animeId),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const animeId = await parseAnimeId(params);
  if (animeId == null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { alias?: unknown };
  const alias = normalizeRssTitleAlias(body.alias);
  if (!alias) {
    return NextResponse.json({ error: "alias required" }, { status: 400 });
  }

  return NextResponse.json({
    animeId,
    aliases: addRssTitleAlias(animeId, alias),
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const animeId = await parseAnimeId(params);
  if (animeId == null) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { alias?: unknown };
  const alias = normalizeRssTitleAlias(body.alias);
  if (!alias) {
    return NextResponse.json({ error: "alias required" }, { status: 400 });
  }

  return NextResponse.json({
    animeId,
    aliases: removeRssTitleAlias(animeId, alias),
  });
}

async function parseAnimeId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const animeId = Number(id);
  if (!Number.isFinite(animeId)) return null;

  const exists = db
    .select({ id: anime.id })
    .from(anime)
    .where(eq(anime.id, animeId))
    .get();
  return exists ? animeId : null;
}
