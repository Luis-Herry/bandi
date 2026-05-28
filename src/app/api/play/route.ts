import { NextResponse } from "next/server";
import path from "node:path";
import { spawn } from "node:child_process";
import { db } from "@/db";
import { anime, downloadQueue, episodes, userAnime } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { extractMagnetHash, getTorrentFiles } from "@/lib/qbit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VIDEO_EXTS = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".m4v",
  ".ts",
  ".m2ts",
]);

function isVideo(name: string): boolean {
  return VIDEO_EXTS.has(path.extname(name).toLowerCase());
}

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

  // 1) 校验追番归属
  const ua = db
    .select()
    .from(userAnime)
    .where(and(eq(userAnime.userId, user.id), eq(userAnime.animeId, animeId)))
    .get();
  if (!ua) {
    return NextResponse.json(
      { error: "not_in_library", message: "请先把这部番加入追番列表" },
      { status: 404 },
    );
  }

  // 2) 解析目标集号
  //    缺省时直接取 currentEpisode（用户的「看到第几集」就是要播这集）；
  //    当 currentEpisode = 0（一集都没开始）时降级到 1。
  let targetNumber = Number(body.episode);
  if (!Number.isFinite(targetNumber)) {
    targetNumber = ua.currentEpisode > 0 ? ua.currentEpisode : 1;
  }

  // 3) 取该集 episodes 行（拿到 episodeId 才能精确匹配下载队列）
  const ep = db
    .select()
    .from(episodes)
    .where(and(eq(episodes.animeId, animeId), eq(episodes.number, targetNumber)))
    .get();
  if (!ep) {
    return NextResponse.json(
      {
        error: "episode_not_found",
        message: `没有找到 EP.${targetNumber} 的剧集信息`,
      },
      { status: 404 },
    );
  }

  // 4) 找已完成的下载记录
  const dl = db
    .select()
    .from(downloadQueue)
    .where(
      and(
        eq(downloadQueue.animeId, animeId),
        eq(downloadQueue.episodeId, ep.id),
        eq(downloadQueue.status, "completed"),
      ),
    )
    .orderBy(desc(downloadQueue.updatedAt))
    .get();
  if (!dl) {
    const a = db.select().from(anime).where(eq(anime.id, animeId)).get();
    return NextResponse.json(
      {
        error: "no_download",
        message: `EP.${targetNumber} 还没下载完成${a?.title ? `（${a.title}）` : ""}`,
      },
      { status: 404 },
    );
  }

  // 5) magnet → hash → qBit 文件列表
  const hash = extractMagnetHash(dl.magnetUrl);
  if (!hash) {
    return NextResponse.json(
      { error: "bad_magnet", message: "下载记录的磁链格式异常" },
      { status: 500 },
    );
  }

  const tf = await getTorrentFiles(hash);
  if (!tf.ok) {
    return NextResponse.json(
      {
        error: "qbit_lookup_failed",
        message: `qBittorrent 查询失败（${tf.error}）`,
      },
      { status: 502 },
    );
  }

  const videos = tf.files.filter((f) => isVideo(f.name));
  if (videos.length === 0) {
    return NextResponse.json(
      { error: "no_video_file", message: "种子里找不到视频文件" },
      { status: 404 },
    );
  }
  videos.sort((a, b) => b.size - a.size);
  const picked = videos[0];

  // save_path 可能末尾带 / 或 \；name 是相对路径，正斜杠分隔。统一交给 path.join 处理。
  const absPath = path.join(tf.savePath, picked.name);

  const r = openWithDefaultApp(absPath);
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
    episode: targetNumber,
    file: picked.name,
  });
}
