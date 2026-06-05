import { NextResponse } from "next/server";
import {
  listSidecarSubtitleFiles,
  readSidecarSubtitleAsWebVtt,
  resolvePlayableEpisodeFile,
} from "@/lib/player";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// readSidecarSubtitleAsWebVtt delegates .srt conversion to srtToWebVtt.
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

  const subtitleName = url.searchParams.get("file");
  if (!subtitleName) {
    const subtitles = listSidecarSubtitleFiles(resolved.file.absPath).map(
      (file) => ({
        name: file.name,
        label: file.label,
        url: `/api/player/subtitles?animeId=${animeId}&episode=${episode}&file=${file.urlSafeName}`,
      }),
    );
    return NextResponse.json({ subtitles });
  }

  const body = readSidecarSubtitleAsWebVtt({
    videoPath: resolved.file.absPath,
    subtitleName,
  });
  if (!body) {
    return NextResponse.json(
      { error: "subtitle_not_found", message: "没有找到可用的外挂字幕" },
      { status: 404 },
    );
  }

  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/vtt; charset=utf-8",
    },
  });
}
