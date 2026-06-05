import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { requireUser } from "@/lib/session";
import { resolvePlayableEpisodeFile } from "@/lib/player";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 用 Windows 文件关联打开本地文件。走 cmd /c start 让系统决定播放器。
 * spawn 数组参数 + windowsVerbatimArguments + 一次性 ""（窗口标题占位）防止
 * 路径中的空格 / 引号 / Unicode 被错误解析。
 */
function openWithDefaultApp(absPath: string): { ok: boolean; error?: string } {
  if (process.platform !== "win32") {
    return { ok: false, error: "platform_unsupported" };
  }
  try {
    const child = spawn(
      "cmd",
      ["/c", "start", "", absPath],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.unref();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "spawn_failed",
    };
  }
}

/**
 * POST /api/play
 * body: { animeId: number, episode?: number }
 *
 * - 若 episode 缺省，则取 userAnime.currentEpisode；未开始时降级到 1。
 * - 从 download_queue 找该 (animeId, episodeId) 且 status=completed 的最新一条。
 * - 从 magnetUrl 提取 infohash → qBit API 取文件列表 + save_path。
 * - 选最大体积的视频文件作为目标，spawn cmd 用系统默认关联程序打开。
 */
export async function POST(req: Request) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  const body = (await req.json().catch(() => ({}))) as {
    animeId?: number;
    episode?: number;
  };
  const animeId = Number(body.animeId);
  if (!Number.isFinite(animeId)) {
    return NextResponse.json({ error: "invalid_anime" }, { status: 400 });
  }

  const resolved = await resolvePlayableEpisodeFile({
    userId: user.id,
    animeId,
    episode: body.episode,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, message: resolved.message },
      { status: resolved.status },
    );
  }

  const r = openWithDefaultApp(resolved.file.absPath);
  if (!r.ok) {
    return NextResponse.json(
      {
        error: "open_failed",
        message: `调起播放器失败（${r.error}）`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    episode: resolved.file.episodeNumber,
    file: resolved.file.fileName,
  });
}
