import type { SeasonalBrowseItem } from "@/lib/db-helpers/browse";

export type BrowseAddIdentity =
  | { source: "bangumi"; bangumiId: number; yucKey?: string }
  | { source: "local"; animeId: number; yucKey?: string; bangumiId?: number }
  | { source: "yuc"; yucKey: string };

/** Keep browse adds local-first, then use the domestic-accessible YUC source. */
export function getBrowseAddIdentity(
  item: Pick<SeasonalBrowseItem, "bangumiId" | "localAnimeId" | "yucKey">,
): BrowseAddIdentity | null {
  if (item.localAnimeId != null && item.localAnimeId > 0) {
    return {
      source: "local",
      animeId: item.localAnimeId,
      ...(item.yucKey ? { yucKey: item.yucKey } : {}),
      ...(item.yucKey && item.bangumiId != null
        ? { bangumiId: item.bangumiId }
        : {}),
    };
  }
  if (item.yucKey) return { source: "yuc", yucKey: item.yucKey };
  return item.bangumiId != null && item.bangumiId > 0
    ? { source: "bangumi", bangumiId: item.bangumiId }
    : null;
}
