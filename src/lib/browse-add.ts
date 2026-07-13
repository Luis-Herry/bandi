import type { SeasonalBrowseItem } from "@/lib/db-helpers/browse";

export type BrowseAddIdentity =
  | { source: "bangumi"; bangumiId: number; yucKey?: string }
  | { source: "local"; animeId: number; yucKey?: string }
  | { source: "yuc"; yucKey: string };

/** Prefer an authoritative catalog id, then an already known local row. */
export function getBrowseAddIdentity(
  item: Pick<SeasonalBrowseItem, "bangumiId" | "localAnimeId" | "yucKey">,
): BrowseAddIdentity | null {
  if (item.bangumiId != null && item.bangumiId > 0) {
    return {
      source: "bangumi",
      bangumiId: item.bangumiId,
      ...(item.yucKey ? { yucKey: item.yucKey } : {}),
    };
  }
  if (item.localAnimeId != null && item.localAnimeId > 0) {
    return {
      source: "local",
      animeId: item.localAnimeId,
      ...(item.yucKey ? { yucKey: item.yucKey } : {}),
    };
  }
  return item.yucKey ? { source: "yuc", yucKey: item.yucKey } : null;
}
