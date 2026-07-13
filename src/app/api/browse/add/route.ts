/**
 * POST /api/browse/add
 *
 * Adds one trusted catalog identity to the current user's planning list. The
 * client only submits source ids; all mutable metadata is reread server-side.
 */

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { anime, userAnime, type UserAnime } from "@/db/schema";
import {
  getAnimeById,
  syncFromBangumi,
} from "@/db/queries/anime";
import { requireUser } from "@/lib/session";
import { lookupYucEntryBySourceKey } from "@/lib/yuc/client";
import {
  bindYucIdentity,
  resolveYucAnime,
  YucIdentityConflictError,
  YucIdentityValidationError,
} from "@/lib/yuc/identity";
import { parseYucSourceKey } from "@/lib/yuc/parser";

export const dynamic = "force-dynamic";

type AddBody =
  | { source?: "bangumi"; bangumiId?: number; yucKey?: string }
  | { source: "yuc"; yucKey?: string }
  | { source: "local"; animeId?: number; yucKey?: string };

export async function POST(req: Request) {
  const user = await requireUser().catch((response) => response as Response);
  if (user instanceof Response) return user;

  const body = (await req.json().catch(() => ({}))) as AddBody;
  try {
    const animeId = await resolveAnimeId(body);
    return ensurePlanning(user.id, animeId);
  } catch (error) {
    if (error instanceof BrowseAddHttpError) {
      return NextResponse.json(
        { error: error.code },
        { status: error.status },
      );
    }
    if (error instanceof YucIdentityValidationError) {
      return NextResponse.json({ error: "invalid_identity" }, { status: 400 });
    }
    if (error instanceof YucIdentityConflictError) {
      return NextResponse.json(
        { error: "yuc_identity_conflict" },
        { status: 409 },
      );
    }
    throw error;
  }
}

async function resolveAnimeId(body: AddBody): Promise<number> {
  // Keep accepting the historic { bangumiId } body during local upgrades.
  const source = body.source ?? ("bangumiId" in body ? "bangumi" : undefined);
  if (source === "bangumi") {
    const bangumiId = Number("bangumiId" in body ? body.bangumiId : NaN);
    if (!Number.isInteger(bangumiId) || bangumiId <= 0) {
      throw new YucIdentityValidationError("Invalid Bangumi id");
    }
    if ("yucKey" in body && body.yucKey && !parseYucSourceKey(body.yucKey)) {
      throw new YucIdentityValidationError("Invalid YUC source key");
    }

    const synced = await syncFromBangumi(bangumiId);
    if (!synced) {
      throw new BrowseAddHttpError("bangumi_sync_failed", 502);
    }
    if ("yucKey" in body && body.yucKey) {
      await bindOptionalYucHint(body.yucKey, synced.animeId);
    }
    return synced.animeId;
  }

  if (source === "yuc") {
    const yucKey = "yucKey" in body ? body.yucKey?.trim() : undefined;
    if (!yucKey || !parseYucSourceKey(yucKey)) {
      throw new YucIdentityValidationError("Invalid YUC source key");
    }
    const lookup = await lookupYucEntryBySourceKey(yucKey);
    if (lookup.status === "unavailable") {
      throw new BrowseAddHttpError("yuc_unavailable", 503);
    }
    if (lookup.status !== "found") {
      throw new BrowseAddHttpError("yuc_item_not_found", 404);
    }
    return resolveYucAnime(lookup.entry).anime.id;
  }

  if (source === "local") {
    const animeId = Number("animeId" in body ? body.animeId : NaN);
    if (!Number.isInteger(animeId) || animeId <= 0) {
      throw new YucIdentityValidationError("Invalid local anime id");
    }
    const local = getAnimeById(animeId);
    if (!local || local.mediaType !== "anime") {
      throw new BrowseAddHttpError("anime_not_found", 404);
    }
    if ("yucKey" in body && body.yucKey) {
      if (!parseYucSourceKey(body.yucKey)) {
        throw new YucIdentityValidationError("Invalid YUC source key");
      }
      await bindOptionalYucHint(body.yucKey, local.id);
    }
    return local.id;
  }

  throw new YucIdentityValidationError("Missing catalog identity");
}

async function bindOptionalYucHint(
  sourceKey: string,
  animeId: number,
): Promise<void> {
  const lookup = await lookupYucEntryBySourceKey(sourceKey);
  if (lookup.status !== "found") {
    // Bangumi is already authoritative enough to complete the add. A stale or
    // unavailable optional YUC hint can be retried on a later detail visit.
    return;
  }
  try {
    bindYucIdentity(lookup.entry, animeId);
  } catch (error) {
    if (error instanceof YucIdentityConflictError) {
      console.warn(
        `[browse-add] skipped conflicting optional YUC binding for anime ${animeId}`,
      );
      return;
    }
    throw error;
  }
}

function ensurePlanning(userId: string, animeId: number) {
  const existing = db
    .select()
    .from(userAnime)
    .where(
      and(eq(userAnime.userId, userId), eq(userAnime.animeId, animeId)),
    )
    .get() as UserAnime | undefined;

  if (existing) {
    db.update(userAnime)
      .set({ updatedAt: new Date() })
      .where(eq(userAnime.id, existing.id))
      .run();
    return NextResponse.json({
      id: existing.id,
      animeId,
      created: false,
      already: true,
    });
  }

  const local = db
    .select({ id: anime.id })
    .from(anime)
    .where(and(eq(anime.id, animeId), eq(anime.mediaType, "anime")))
    .get();
  if (!local) return NextResponse.json({ error: "anime_not_found" }, { status: 404 });

  const inserted = db
    .insert(userAnime)
    .values({ userId, animeId, watchStatus: "planning" })
    .returning({ id: userAnime.id })
    .get();
  return NextResponse.json({ id: inserted.id, animeId, created: true });
}

class BrowseAddHttpError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "BrowseAddHttpError";
  }
}
