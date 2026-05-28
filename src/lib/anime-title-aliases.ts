import { getMediaByRomajiTitle, type AniMedia } from "@/lib/anilist";
import { getSubject, type BgmSubject } from "@/lib/bangumi";

const AUTO_ALIAS_REVALIDATE_SECONDS = 60 * 60 * 12;

type AniListAliasSource = Pick<AniMedia, "title"> | null | undefined;
type BangumiAliasSource =
  | Pick<BgmSubject, "name" | "name_cn" | "infobox">
  | null
  | undefined;
type BgmInfoboxValue = NonNullable<BgmSubject["infobox"]>[number]["value"];

const BANGUMI_TITLE_ALIAS_KEYS = new Set([
  "中文名",
  "日文名",
  "英文名",
  "别名",
  "別名",
  "原名",
  "罗马字",
  "羅馬字",
  "romaji",
]);

export function selectTitleAliasesFromAniList(media: AniListAliasSource): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = createAliasPusher(out, seen);

  push(media?.title.romaji);
  push(media?.title.english);
  push(media?.title.native);

  return out;
}

export function selectTitleAliasesFromBangumi(
  subject: BangumiAliasSource,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = createAliasPusher(out, seen);

  push(subject?.name_cn);
  push(subject?.name);

  for (const item of subject?.infobox ?? []) {
    if (!BANGUMI_TITLE_ALIAS_KEYS.has(item.key.trim())) continue;
    for (const value of extractBangumiInfoboxValues(item.value)) {
      push(value);
    }
  }

  return out;
}

export async function getAutoTitleAliases(
  input:
    | Array<string | null | undefined>
    | {
        bangumiId?: number | null;
        titles: Array<string | null | undefined>;
      },
): Promise<string[]> {
  const bangumiId = Array.isArray(input) ? null : input.bangumiId;
  const titles = Array.isArray(input) ? input : input.titles;

  if (typeof bangumiId === "number" && Number.isFinite(bangumiId)) {
    const subject = await getSubject(bangumiId);
    const aliases = selectTitleAliasesFromBangumi(subject);
    if (aliases.length > 0) return aliases;
  }

  for (const title of dedupeTitleQueries(titles)) {
    const media = await getMediaByRomajiTitle(title, {
      revalidate: AUTO_ALIAS_REVALIDATE_SECONDS,
    });
    const aliases = selectTitleAliasesFromAniList(media);
    if (aliases.length > 0) return aliases;
  }
  return [];
}

function createAliasPusher(out: string[], seen: Set<string>) {
  return (value: string | null | undefined) => {
    const alias = value?.replace(/\s+/g, " ").trim();
    if (!alias) return;
    for (const variant of getTitlePunctuationVariants(alias)) {
      const key = normalizeAliasKey(variant);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(variant);
    }
  };
}

function getTitlePunctuationVariants(value: string): string[] {
  const ascii = value
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[‐‑‒–—―]/g, "-");
  return ascii === value ? [value] : [value, ascii];
}

function extractBangumiInfoboxValues(
  value: BgmInfoboxValue,
): string[] {
  if (typeof value === "string") return [value];
  return value.map((item) => item.v ?? item.k ?? "").filter(Boolean);
}

function dedupeTitleQueries(titles: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const title of titles) {
    const value = title?.replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = normalizeAliasKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizeAliasKey(value: string): string {
  return value.toLowerCase().replace(/[：]/g, ":").replace(/\s+/g, "");
}
