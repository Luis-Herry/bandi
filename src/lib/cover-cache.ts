/**
 * 封面磁盘缓存。DMM 封面经代理现抓单张要 1-3 秒，一屏并发会超时显示失败；
 * 这里抓回一次就落盘到 data/cover-cache/，之后读本地秒开、不再走代理。
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isSafeAbsoluteWindowsPath } from "@/lib/download-root";

export const MAX_COVER_BYTES = 12 * 1024 * 1024;

export type CoverImageMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/avif";

const SUPPORTED_IMAGE_TYPES = new Set<CoverImageMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

function normalizeImageContentType(value: string | null): CoverImageMimeType | null {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  const canonical = normalized === "image/jpg" ? "image/jpeg" : normalized;
  return SUPPORTED_IMAGE_TYPES.has(canonical as CoverImageMimeType)
    ? (canonical as CoverImageMimeType)
    : null;
}

export function detectImageMimeType(buf: Uint8Array): CoverImageMimeType | null {
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }

  const ascii = Buffer.from(buf);
  if (
    buf.length >= 12 &&
    ascii.toString("ascii", 0, 4) === "RIFF" &&
    ascii.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.length >= 6 && /^GIF8[79]a$/.test(ascii.toString("ascii", 0, 6))) {
    return "image/gif";
  }
  if (
    buf.length >= 12 &&
    ascii.toString("ascii", 4, 8) === "ftyp" &&
    ["avif", "avis"].includes(ascii.toString("ascii", 8, 12))
  ) {
    return "image/avif";
  }
  return null;
}

export function validateCoverPayload(
  declaredContentType: string | null,
  buf: Uint8Array,
): CoverImageMimeType | null {
  if (buf.byteLength <= 0 || buf.byteLength > MAX_COVER_BYTES) return null;
  const declared = normalizeImageContentType(declaredContentType);
  const detected = detectImageMimeType(buf);
  return declared && detected === declared ? detected : null;
}

async function readResponseBodyWithinLimit(res: Response): Promise<Buffer | null> {
  const declaredLength = Number(res.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_COVER_BYTES) {
    return null;
  }
  if (!res.body) return null;

  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.byteLength === 0) continue;
    total += value.byteLength;
    if (total > MAX_COVER_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return total > 0 ? Buffer.concat(chunks, total) : null;
}

function getCoverCacheDirectory(): string {
  const configured = process.env.COVER_CACHE_DIR?.trim();
  if (!configured) {
    throw new Error("COVER_CACHE_DIR 未配置，封面缓存已停止写入");
  }
  if (!isSafeAbsoluteWindowsPath(configured)) {
    throw new Error(
      `COVER_CACHE_DIR 必须是完整的 Windows 盘符或 UNC 子目录：${configured}`,
    );
  }
  return path.win32.normalize(configured);
}

function ensureCoverCacheDirectory(): string {
  const directory = getCoverCacheDirectory();
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  return directory;
}

export function coverCachePath(url: string): string {
  const h = createHash("sha1").update(url).digest("hex");
  return path.join(getCoverCacheDirectory(), `${h}.img`);
}

export function readCachedCover(url: string): Buffer | null {
  try {
    const p = coverCachePath(url);
    if (!existsSync(p)) return null;
    const buf = readFileSync(p);
    return buf.byteLength <= MAX_COVER_BYTES && detectImageMimeType(buf) ? buf : null;
  } catch {
    return null;
  }
}

/** 缓存命中直接返回；否则经代理抓回、落盘、返回。best-effort，失败返回 null。 */
export async function cacheCover(url: string): Promise<Buffer | null> {
  const cached = readCachedCover(url);
  if (cached) return cached;
  try {
    const isDoubanCover = /^https:\/\/img\d+\.doubanio\.com\//.test(url);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "image/*",
        ...(isDoubanCover
          ? { Referer: "https://movie.douban.com/" }
          : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const declaredType = res.headers.get("content-type");
    if (!normalizeImageContentType(declaredType)) return null;
    const buf = await readResponseBodyWithinLimit(res);
    if (!buf || !validateCoverPayload(declaredType, buf)) return null;
    try {
      ensureCoverCacheDirectory();
      writeFileSync(coverCachePath(url), buf);
    } catch (error) {
      console.warn(
        "[cover-cache] 已校验封面，但缓存写入失败；本次响应继续使用已校验图片:",
        error,
      );
    }
    return buf;
  } catch {
    return null;
  }
}
