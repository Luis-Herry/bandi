import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { parseHttpRange, resolvePlayableEpisodeFile } from "@/lib/player";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  const url = new URL(req.url);
  const animeId = Number(url.searchParams.get("animeId"));
  const episode = Number(url.searchParams.get("episode"));
  if (!Number.isFinite(animeId) || !Number.isFinite(episode)) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const resolved = await resolvePlayableEpisodeFile({
    userId: user.id,
    animeId,
    episode,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, message: resolved.message },
      { status: resolved.status },
    );
  }

  let fileSize = resolved.file.size;
  try {
    fileSize = statSync(resolved.file.absPath).size;
  } catch {
    return NextResponse.json(
      {
        error: "file_missing",
        message: "视频文件已不在原位置",
      },
      { status: 404 },
    );
  }

  const range = parseHttpRange(req.headers.get("range"), fileSize);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${fileSize}`,
      },
    });
  }

  const stream = createReadStream(resolved.file.absPath, {
    start: range.start,
    end: range.end,
  });
  const length = range.end - range.start + 1;
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Length": String(length),
    "Content-Type": resolved.file.mimeType,
  });
  if (range.status === 206) {
    headers.set(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${fileSize}`,
    );
  }

  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: range.status,
    headers,
  });
}
