import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { requireUser } from "@/lib/session";
import { resolvePlayableEpisodeFile } from "@/lib/player";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 用宿主系统的文件关联打开本地文件。Windows 走 cmd /c start，macOS 走
 * /usr/bin/open；参数均通过 spawn 数组传递，避免路径中的空格或 Unicode
 * 被重新解释。
 */
function openWithDefaultApp(absPath: string): { ok: boolean; error?: string } {
  const command = process.platform === "win32" ? "cmd" : "/usr/bin/open";
  const args = process.platform === "win32"
    ? ["/c", "start", "", absPath]
    : [absPath];
  if (process.platform !== "win32" && process.platform !== "darwin") {
    return { ok: false, error: "platform_unsupported" };
  }
  try {
    const child = spawn(
      command,
      args,
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
 * - 选最大体积的视频文件作为目标，用宿主系统默认关联程序打开。
 */
export async function POST(req: Request) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

  if (
    process.platform === "darwin" &&
    process.env.ANIME_LOCAL_SERVER_APP === "1" &&
    user.isLocalHost !== true
  ) {
    return NextResponse.json(
      {
        error: "host_action_required",
        message: "系统播放器只能由运行 Bandi 的 Mac 打开。请在 Mac 上执行此操作。",
      },
      { status: 403 },
    );
  }

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
