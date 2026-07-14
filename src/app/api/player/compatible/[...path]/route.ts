import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import {
  cancelCompatiblePlayback,
  mediaCompatibilityErrorResponse,
  readCompatiblePlaylist,
  resolveCompatibleAsset,
  startCompatiblePlayback,
} from "@/lib/media-compat";
import {
  getCurrentSessionIdentity,
  requireRouteUser,
} from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(req: Request, context: RouteContext) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;

  const { path } = await context.params;
  if (path.length !== 1 || path[0] !== "start") {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: privateHeaders },
    );
  }
  const body = (await req.json().catch(() => ({}))) as {
    animeId?: unknown;
    episode?: unknown;
  };
  const animeId = Number(body.animeId);
  const episode = Math.floor(Number(body.episode));
  if (
    !Number.isFinite(animeId) ||
    animeId <= 0 ||
    !Number.isFinite(episode) ||
    episode <= 0
  ) {
    return Response.json(
      { error: "invalid_body", message: "播放参数无效" },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    const identity = getCurrentSessionIdentity(user);
    const result = await startCompatiblePlayback({
      ...identity,
      animeId,
      episode,
    });
    return Response.json(result, { headers: privateHeaders });
  } catch (error) {
    return mediaCompatibilityErrorResponse(error, {
      isLocalHost: user.isLocalHost,
    });
  }
}

export async function GET(_req: Request, context: RouteContext) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;

  const { path } = await context.params;
  const identity = getCurrentSessionIdentity(user);
  try {
    if (path.length === 2 && path[1] === "playlist") {
      const playlist = readCompatiblePlaylist(path[0], identity);
      return new Response(playlist, {
        headers: {
          ...privateHeaders,
          "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
        },
      });
    }
    if (path.length === 3 && path[1] === "asset") {
      const asset = resolveCompatibleAsset(path[0], path[2], identity);
      const stream = createReadStream(asset.absPath);
      return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
        headers: {
          ...privateHeaders,
          "Content-Length": String(asset.size),
          "Content-Type": asset.contentType,
        },
      });
    }
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: privateHeaders },
    );
  } catch (error) {
    return mediaCompatibilityErrorResponse(error, {
      isLocalHost: user.isLocalHost,
    });
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;

  const { path } = await context.params;
  if (path.length !== 1) {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: privateHeaders },
    );
  }
  try {
    const result = await cancelCompatiblePlayback(
      path[0],
      getCurrentSessionIdentity(user),
    );
    if (result === "pending") {
      return Response.json(
        { ok: true, status: "cancelling" },
        { status: 202, headers: privateHeaders },
      );
    }
    return new Response(null, { status: 204, headers: privateHeaders });
  } catch (error) {
    return mediaCompatibilityErrorResponse(error, {
      isLocalHost: user.isLocalHost,
    });
  }
}
