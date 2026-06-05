import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCREENSHOT_DIR = path.join(process.cwd(), "output", "player-screenshots");
const MAX_SCREENSHOT_BYTES = 24 * 1024 * 1024;

interface ScreenshotBody {
  imageData?: unknown;
  animeTitle?: unknown;
  episode?: unknown;
  positionSeconds?: unknown;
}

export async function POST(req: Request) {
  const user = await requireUser().catch((r) => r as Response);
  if (user instanceof Response) return user;

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

  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const absPath = path.join(SCREENSHOT_DIR, fileName);
  writeFileSync(absPath, buffer);
  const opened = openScreenshotInExplorer(absPath);

  return NextResponse.json({
    ok: true,
    fileName,
    directory: SCREENSHOT_DIR,
    path: absPath,
    opened,
  });
}

function openScreenshotInExplorer(absPath: string) {
  if (process.platform !== "win32") return false;
  try {
    const child = spawn("explorer.exe", ["/select,", absPath], {
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
