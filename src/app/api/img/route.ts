/**
 * GET /api/img?url=<encoded>  → 服务器侧抓远程图片（走 --use-env-proxy 代理）+ 磁盘缓存后流回。
 *
 * 用途：DMM 封面浏览器直连不上；豆瓣封面要求站内 Referer。
 * 这里经代理抓回并落盘缓存，之后命中缓存秒回。只白名单图片域，避免 SSRF / 开放代理。
 */

import { NextResponse } from "next/server";
import {
  cacheCover,
  detectImageMimeType,
  readCachedCover,
} from "@/lib/cover-cache";

const ALLOWED =
  /^https:\/\/(?:pics\.dmm\.co\.jp|img\d+\.doubanio\.com)\//;

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("url");
  if (!target || !ALLOWED.test(target)) {
    return new NextResponse("bad url", { status: 400 });
  }

  const buf = readCachedCover(target) ?? (await cacheCover(target));
  const contentType = buf ? detectImageMimeType(buf) : null;
  if (!buf || !contentType) {
    return new NextResponse("unavailable", { status: 502 });
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
}
