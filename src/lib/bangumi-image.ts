export interface BangumiImageSet {
  large?: string;
  common?: string;
  medium?: string;
  small?: string;
  grid?: string;
}

export type BangumiImageRole = "thumb" | "card" | "hero" | "original";

const BANGUMI_IMAGE_WIDTH: Record<Exclude<BangumiImageRole, "original">, number> =
  {
    thumb: 100,
    card: 400,
    hero: 800,
  };

export function selectBangumiImageByRole(
  images: BangumiImageSet | null | undefined,
  role: BangumiImageRole,
): string | null {
  if (!images) return null;
  if (role === "thumb") {
    return (
      images.grid ??
      images.small ??
      images.common ??
      images.medium ??
      images.large ??
      null
    );
  }
  if (role === "card") {
    return (
      images.common ??
      images.medium ??
      images.grid ??
      images.small ??
      images.large ??
      null
    );
  }
  if (role === "hero") {
    return (
      images.medium ??
      images.large ??
      images.common ??
      images.grid ??
      images.small ??
      null
    );
  }
  return (
    images.large ??
    images.medium ??
    images.common ??
    images.grid ??
    images.small ??
    null
  );
}

export function resizeBangumiImageUrl(
  src: string,
  role: BangumiImageRole,
): string {
  if (role === "original") return src;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return src;
  if (url.hostname !== "lain.bgm.tv" && url.hostname !== "bangumi.tv") {
    return src;
  }

  const match = url.pathname.match(/^\/(?:r\/\d+\/)?pic\/(.+)$/);
  if (!match) return src;

  url.protocol = "https:";
  url.pathname = `/r/${BANGUMI_IMAGE_WIDTH[role]}/pic/${match[1]}`;
  return url.toString();
}
