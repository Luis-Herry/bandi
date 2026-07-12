/**
 * GET  /api/library/local/scan  → 已保存的动漫扫描目录。
 * POST /api/library/local/scan  → preview 只读预览；确认后事务化增量导入。
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getAnimeLibraryRoots,
  importScannedAnimeTitles,
  previewScannedAnimeTitles,
  scanAnimeLibraryRoots,
} from "@/lib/anime-local-import";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ roots: getAnimeLibraryRoots() });
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
  const providedRoots = Array.isArray(raw.roots)
    ? raw.roots.filter(
        (root): root is string =>
          typeof root === "string" && root.trim().length > 0,
      )
    : [];
  const roots = providedRoots.length > 0 ? providedRoots : getAnimeLibraryRoots();

  if (roots.length === 0) {
    return NextResponse.json(
      { error: "请选择本地动漫文件夹" },
      { status: 400 },
    );
  }

  const titles = scanAnimeLibraryRoots(roots);
  if (preview) {
    return NextResponse.json({
      ok: true,
      preview: true,
      roots,
      summary: previewScannedAnimeTitles(titles),
    });
  }

  const summary = importScannedAnimeTitles(titles, roots);
  return NextResponse.json({ ok: true, preview: false, roots, summary });
}
