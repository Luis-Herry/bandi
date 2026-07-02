import { NextResponse } from "next/server";
import { db } from "@/db";
import { anime, userAnime, type UserAnime } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { syncFromBangumi } from "@/db/queries/anime";

export const dynamic = "force-dynamic";

const WATCH_STATUSES = [
  "watching",
  "planning",
  "completed",
  "onhold",
  "dropped",
] as const;

type WatchStatus = (typeof WATCH_STATUSES)[number];
function isWatchStatus(v: unknown): v is WatchStatus {
  return typeof v === "string" && (WATCH_STATUSES as readonly string[]).includes(v);
}

export async function GET(req: Request) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  // 只返回动漫追踪记录；影视（drama/movie）的个人维度走 /cinema-library，互不污染
  const filters = [
    eq(userAnime.userId, user.id),
    eq(anime.mediaType, "anime"),
  ];
  if (isWatchStatus(status)) filters.push(eq(userAnime.watchStatus, status));

  const rows = await db
    .select({
      id: userAnime.id,
      watchStatus: userAnime.watchStatus,
      currentEpisode: userAnime.currentEpisode,
      rating: userAnime.rating,
      notes: userAnime.notes,
      updatedAt: userAnime.updatedAt,
      anime,
    })
    .from(userAnime)
    .innerJoin(anime, eq(userAnime.animeId, anime.id))
    .where(and(...filters))
    .all();

  return NextResponse.json({ items: rows });
}

/**
 * POST /api/library
 * body: { animeId?: number, bangumiId?: number, watchStatus?: WatchStatus }
 *
 * If bangumiId given, we sync from Bangumi first (creates anime row).
 * Returns the user_anime row id.
 */
export async function POST(req: Request) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  const body = (await req.json().catch(() => ({}))) as {
    animeId?: number;
    bangumiId?: number;
    watchStatus?: string;
  };

  let animeId = Number(body.animeId);
  if (!Number.isFinite(animeId) || animeId <= 0) {
    const bgmId = Number(body.bangumiId);
    if (!Number.isFinite(bgmId) || bgmId <= 0) {
      return NextResponse.json(
        { error: "animeId or bangumiId required" },
        { status: 400 },
      );
    }
    const sync = await syncFromBangumi(bgmId);
    if (!sync) {
      return NextResponse.json(
        { error: "could not sync from bangumi" },
        { status: 502 },
      );
    }
    animeId = sync.animeId;
  }

  const watchStatus: WatchStatus = isWatchStatus(body.watchStatus)
    ? body.watchStatus
    : "watching";

  const existing = db
    .select()
    .from(userAnime)
    .where(
      and(eq(userAnime.userId, user.id), eq(userAnime.animeId, animeId)),
    )
    .get() as UserAnime | undefined;

  if (existing) {
    db.update(userAnime)
      .set({ watchStatus, updatedAt: new Date() })
      .where(eq(userAnime.id, existing.id))
      .run();
    return NextResponse.json({ id: existing.id, animeId, updated: true });
  }

  const inserted = db
    .insert(userAnime)
    .values({
      userId: user.id,
      animeId,
      watchStatus,
    })
    .returning({ id: userAnime.id })
    .get();
  return NextResponse.json({ id: inserted.id, animeId, created: true });
}
