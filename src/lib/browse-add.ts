import type { SeasonalBrowseItem } from "@/lib/db-helpers/browse";

export type BrowseAddIdentity =
  | { source: "bangumi"; bangumiId: number; yucKey?: string }
  | { source: "local"; animeId: number; yucKey?: string; bangumiId?: number }
  | { source: "yuc"; yucKey: string };

/** Prefer an existing local row, then the resolved Bangumi work, then YUC-only data. */
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
  if (item.bangumiId != null && item.bangumiId > 0) {
    return {
      source: "bangumi",
      bangumiId: item.bangumiId,
      ...(item.yucKey ? { yucKey: item.yucKey } : {}),
    };
  }
  return item.yucKey ? { source: "yuc", yucKey: item.yucKey } : null;
}
