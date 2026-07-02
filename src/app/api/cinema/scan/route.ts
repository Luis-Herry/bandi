/**
 * GET  /api/cinema/scan  → 返回当前扫描根目录配置（需登录）
 * POST /api/cinema/scan  → 扫描本地影视库并入库（需登录）
 *   body: { roots?: string[], preview?: boolean }
 *   preview=true 只返回扫描预览；确认导入时才保存配置并写库。
 *
 * 扫描只读文件系统；入库是幂等纯增量（只插缺失行，不删不覆写）。
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getCinemaLibraryRoots,
  importScannedTitles,
  previewScannedTitles,
  scanLibraryRoots,
  setCinemaLibraryRoots,
} from "@/lib/cinema-import";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ roots: getCinemaLibraryRoots() });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = (await req.json().catch(() => ({}))) as {
    roots?: unknown;
    preview?: unknown;
  };
  const preview = raw.preview === true;
  let roots = getCinemaLibraryRoots();

  if (raw && Array.isArray(raw.roots)) {
    const provided = raw.roots.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    roots = preview ? provided : setCinemaLibraryRoots(provided);
  }

  if (roots.length === 0) {
    return NextResponse.json(
      { error: "未配置扫描目录，请先提供 roots（本地影视文件夹绝对路径）" },
      { status: 400 },
    );
  }

  const { titles, skippedFansubFiles } = scanLibraryRoots(roots);
  if (preview) {
    return NextResponse.json({
      ok: true,
      preview: true,
      roots,
      summary: previewScannedTitles(titles, skippedFansubFiles),
    });
  }

  const summary = importScannedTitles(titles, skippedFansubFiles);

  return NextResponse.json({ ok: true, preview: false, roots, summary });
}
