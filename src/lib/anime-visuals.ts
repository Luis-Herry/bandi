import { hexToRgbTuple } from "@/lib/colors";

export const FALLBACK_ANIME_ACCENT = "#d4a853";

export type AnimeVisualVars = {
  "--anime-accent": string;
  "--anime-accent-rgb": string;
  "--anime-bg-tint": string;
  "--anime-surface-noise-opacity": string;
  "--anime-halo-intensity": string;
};

export function deriveAnimeVisualVars(
  accentColor?: string | null,
): AnimeVisualVars {
  const accent = normalizeHex(accentColor) ?? FALLBACK_ANIME_ACCENT;
  const rgb = hexToRgbTuple(accent);
  const [r, g, b] = rgb.split(" ").map(Number);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const noise = clamp(0.022 + saturation * 0.014 - luminance * 0.006, 0.018, 0.038);
  const halo = clamp(0.12 + saturation * 0.16, 0.12, 0.26);

  return {
    "--anime-accent": accent,
    "--anime-accent-rgb": rgb,
    "--anime-bg-tint": `rgb(${rgb} / 0.10)`,
    "--anime-surface-noise-opacity": noise.toFixed(3),
    "--anime-halo-intensity": halo.toFixed(3),
  };
}

function normalizeHex(value?: string | null): string | null {
  if (!value) return null;
  const clean = value.trim().replace("#", "");
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean)) return null;
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : clean;
  return `#${full.toLowerCase()}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
