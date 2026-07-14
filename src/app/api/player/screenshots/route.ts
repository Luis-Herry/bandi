import { spawn } from "node:child_process";
import {
  accessSync,
  constants,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { normalizeRuntimeDirectory } from "@/lib/download-root";
import { requireRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SCREENSHOT_BYTES = 24 * 1024 * 1024;

interface ScreenshotBody {
  imageData?: unknown;
  animeTitle?: unknown;
  episode?: unknown;
  positionSeconds?: unknown;
}

export async function POST(req: Request) {
  const user = await requireRouteUser();
  if (user instanceof Response) return user;
  const pairedLocalClient =
    process.env.ANIME_LOCAL_SERVER_APP === "1" && !user.isLocalHost;

  let screenshotDirectory: string;
  try {
    screenshotDirectory = prepareScreenshotDirectory();
  } catch (error) {
    console.error("[player-screenshots] 截图目录不可用:", error);
    return NextResponse.json(
      {
        error: "screenshot_directory_unavailable",
        message: pairedLocalClient
          ? "Mac 上的截图目录暂时不可用。"
          : `截图目录不可用：${errorMessage(error)}。`,
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as ScreenshotBody;
  const imageData = typeof body.imageData === "string" ? body.imageData : "";
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
  if (!match) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }

  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length <= 0 || buffer.length > MAX_SCREENSHOT_BYTES) {
    return NextResponse.json({ error: "invalid_image_size" }, { status: 400 });
  }

  const episode = Math.max(1, Math.floor(Number(body.episode)));
  const positionSeconds = Math.max(0, Math.floor(Number(body.positionSeconds)));
  const animeTitle =
    typeof body.animeTitle === "string" && body.animeTitle.trim()
      ? body.animeTitle
      : "anime";
  const fileName = `${sanitizeFileName(animeTitle)}-EP${String(episode).padStart(
    2,
    "0",
  )}-${formatFileTime(positionSeconds)}.png`;

  const absPath = path.join(screenshotDirectory, fileName);
  try {
    writeFileSync(absPath, buffer);
  } catch (error) {
    console.error("[player-screenshots] 截图写入失败:", error);
    return NextResponse.json(
      {
        error: "screenshot_write_failed",
        message: pairedLocalClient
          ? "截图未能保存到 Mac。"
          : `截图保存失败：${absPath}（${errorMessage(error)}）。`,
      },
      { status: 503 },
    );
  }
  const opened = pairedLocalClient
    ? false
    : openScreenshotInFileManager(absPath);

  const result: Record<string, unknown> = {
    ok: true,
    fileName,
    opened,
  };
  if (!pairedLocalClient) {
    result.directory = screenshotDirectory;
    result.path = absPath;
  }
  return NextResponse.json(result);
}

function prepareScreenshotDirectory(): string {
  const configured = process.env.SCREENSHOT_DIR?.trim();
  if (!configured) throw new Error("SCREENSHOT_DIR 未配置");
  const directory = normalizeRuntimeDirectory(configured);
  if (!directory) {
    throw new Error(
      process.env.ANIME_LOCAL_SERVER_APP === "1"
        ? `SCREENSHOT_DIR 必须是完整的 macOS 子目录：${configured}`
        : `SCREENSHOT_DIR 必须是完整的 Windows 盘符或 UNC 子目录：${configured}`,
    );
  }
  mkdirSync(directory, { recursive: true });
  if (!statSync(directory).isDirectory()) {
    throw new Error(`SCREENSHOT_DIR 不是文件夹：${directory}`);
  }
  accessSync(directory, constants.R_OK | constants.W_OK);
  return directory;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const detail = error instanceof Error ? error.message : "unknown";
    return `${String(error.code)}: ${detail}`;
  }
  return error instanceof Error ? error.message : "unknown";
}

function openScreenshotInFileManager(absPath: string) {
  try {
    const command = process.platform === "darwin" ? "/usr/bin/open" : "explorer.exe";
    const args = process.platform === "darwin" ? ["-R", absPath] : ["/select,", absPath];
    if (process.platform !== "win32" && process.platform !== "darwin") return false;
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function formatFileTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join("-");
}
