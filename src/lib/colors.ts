/**
 * Accent color extraction utilities.
 *
 * - Server side: uses colorthief on a fetched buffer.
 * - Client side: provide a Canvas-based fallback.
 * - Always exposes hex + space-separated RGB triple so we can plug into
 *   `rgb(var(--accent-rgb) / <alpha>)` style declarations.
 */

const FALLBACK_ACCENT = "#d4a853";
const FALLBACK_MUTED = "#7d6432";

export interface AccentPalette {
  dominant: string;
  muted: string;
  rgb: string; // "212 168 83" — feeds --accent-rgb
}

export function hexToRgbTuple(hex: string): string {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return "212 168 83";
  return `${r} ${g} ${b}`;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface ColorLike {
  hex?: () => string;
  r?: number;
  g?: number;
  b?: number;
}

/**
 * Pull dominant + muted colors out of a remote image URL.
 * Runs on the server; falls back to amber gold if anything goes wrong so
 * the UI never breaks.
 */
export async function extractAccent(imageUrl: string): Promise<AccentPalette> {
  try {
    // colorthief v3 has a named-export, Promise-returning API.
    const ct = await import("colorthief");
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const dominantColor = (await ct.getColor(buffer)) as ColorLike | null;
    const palette = ((await ct.getPalette(buffer, { colorCount: 5 })) ??
      []) as ColorLike[];

    if (!dominantColor) throw new Error("no dominant color");

    const dominantHex = colorToHex(dominantColor);
    const mutedHex = palette.length > 0 ? pickMuted(palette) : dominantHex;
    const tuple = hexToRgbTuple(dominantHex);

    return {
      dominant: dominantHex,
      muted: mutedHex,
      rgb: tuple,
    };
  } catch {
    return {
      dominant: FALLBACK_ACCENT,
      muted: FALLBACK_MUTED,
      rgb: hexToRgbTuple(FALLBACK_ACCENT),
    };
  }
}

function colorToHex(c: ColorLike): string {
  if (typeof c.hex === "function") return c.hex();
  if (
    typeof c.r === "number" &&
    typeof c.g === "number" &&
    typeof c.b === "number"
  ) {
    return rgbToHex(c.r, c.g, c.b);
  }
  return FALLBACK_ACCENT;
}

function pickMuted(palette: ColorLike[]): string {
  const scored = palette
    .map((c) => {
      const hex = colorToHex(c);
      const tuple = hexToRgbTuple(hex).split(" ").map(Number) as [
        number,
        number,
        number,
      ];
      return { hex, sat: saturation(tuple) };
    })
    .sort((a, b) => a.sat - b.sat);
  return scored[0]?.hex ?? FALLBACK_MUTED;
}

function saturation([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/**
 * Client-side palette extraction via Canvas.
 *
 * 像素平均会把彩色画面拉成中灰色（红+绿+蓝相消），所以这里改用粗粒度
 * 色彩桶 + 饱和度过滤：每个像素降到 6×6×6 立方体的一个桶里，选「桶内
 * 像素最多 + 饱和度足够」的桶作为主色。完全去饱和的图（雪景、黑白照）
 * 直接抛错，让调用方保留之前的 accent，绝不输出灰色。
 */
export function extractAccentFromImageElement(
  img: HTMLImageElement,
): AccentPalette {
  try {
    const canvas = document.createElement("canvas");
    const w = (canvas.width = 64);
    const h = (canvas.height = 64);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    // 6×6×6 = 216 桶；每桶记录像素数 + R/G/B 累加
    const BUCKETS = 6;
    const STEP = 256 / BUCKETS;
    const buckets = new Map<
      number,
      { count: number; r: number; g: number; b: number }
    >();

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 128) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // 跳过近黑（暗部）和近白（高光）——它们会主导平均但没颜色信息
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 32 || min > 240) continue;
      const sat = max === 0 ? 0 : (max - min) / max;
      if (sat < 0.18) continue; // 跳过近灰
      const br = Math.min(BUCKETS - 1, Math.floor(r / STEP));
      const bg = Math.min(BUCKETS - 1, Math.floor(g / STEP));
      const bb = Math.min(BUCKETS - 1, Math.floor(b / STEP));
      const key = br * BUCKETS * BUCKETS + bg * BUCKETS + bb;
      const cur = buckets.get(key);
      if (cur) {
        cur.count += 1;
        cur.r += r;
        cur.g += g;
        cur.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }

    if (buckets.size === 0) throw new Error("no chromatic pixels");

    // 选样本最多的桶作为主色
    let best: { count: number; r: number; g: number; b: number } | null = null;
    for (const v of buckets.values()) {
      if (!best || v.count > best.count) best = v;
    }
    if (!best) throw new Error("no dominant bucket");

    const r = best.r / best.count;
    const g = best.g / best.count;
    const b = best.b / best.count;

    // 最后一道保险：万一桶内平均后还是灰（理论上不会），拒绝
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const finalSat = max === 0 ? 0 : (max - min) / max;
    if (finalSat < 0.15) throw new Error("desaturated result");

    const dominant = rgbToHex(r, g, b);
    return {
      dominant,
      muted: dominant,
      rgb: `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`,
    };
  } catch {
    return {
      dominant: FALLBACK_ACCENT,
      muted: FALLBACK_MUTED,
      rgb: hexToRgbTuple(FALLBACK_ACCENT),
    };
  }
}
