/**
 * 封面磁盘缓存。DMM 封面经代理现抓单张要 1-3 秒，一屏并发会超时显示失败；
 * 这里抓回一次就落盘到 data/cover-cache/，之后读本地秒开、不再走代理。
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve(process.cwd(), "data/cover-cache");

export function coverCachePath(url: string): string {
  const h = createHash("sha1").update(url).digest("hex");
  return path.join(CACHE_DIR, `${h}.img`);
}

export function readCachedCover(url: string): Buffer | null {
  try {
    const p = coverCachePath(url);
    return existsSync(p) ? readFileSync(p) : null;
  } catch {
    return null;
  }
}

/** 缓存命中直接返回；否则经代理抓回、落盘、返回。best-effort，失败返回 null。 */
export async function cacheCover(url: string): Promise<Buffer | null> {
  const cached = readCachedCover(url);
  if (cached) return cached;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(coverCachePath(url), buf);
    } catch {
      // 落盘失败不影响本次返回
    }
    return buf;
  } catch {
    return null;
  }
}
