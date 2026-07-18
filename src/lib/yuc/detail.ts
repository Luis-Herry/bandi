import type { Anime } from "@/db/schema";
import {
  getYucEntryBySourceKey,
  getYucFuturePage,
  getYucMoviePage,
  getYucSeasonPage,
  getYucSpecialPage,
  type YucCatalogResult,
} from "./client";
import { listYucIdentitiesForAnime } from "./identity";
import {
  dedupeYucEntries,
  findUniqueYucCatalogMatch,
  findUniqueYucMatch,
  inferYucSeasonMonth,
} from "./match";
import type { YucEntry } from "./types";

const SEASON_MONTHS = [1, 4, 7, 10] as const;
const MONTH_BY_SEASON: Record<NonNullable<Anime["season"]>, number> = {
  winter: 1,
  spring: 4,
  summer: 7,
  fall: 10,
};

export interface YucDetailMatch {
  entry: YucEntry;
  matchedBy: "binding" | "metadata";
}

export interface YucDetailLookupDependencies {
  /**
   * 身份绑定查询由 identity 层注入，避免详情读取反向依赖写入逻辑。
   * 已绑定条目会先于标题、年份、媒介类型匹配使用。
   */
  lookupBoundEntries?: (anime: Anime) => Promise<readonly YucEntry[]>;
  lookupBoundSourceKeys?: (animeId: number) => Promise<readonly string[]>;
  getEntryBySourceKey?: (sourceKey: string) => Promise<YucEntry | null>;
  getSeasonPage?: (year: number, month: number) => Promise<YucCatalogResult>;
  getFuturePage?: () => Promise<YucCatalogResult>;
  getSpecialPage?: () => Promise<YucCatalogResult>;
  getMoviePage?: () => Promise<YucCatalogResult>;
}

/**
 * 为详情页寻找唯一可信的长门番堂条目。
 *
 * 所有来源读取都封装在容错边界内；YUC 暂时不可用时返回 null，详情主体仍可渲染。
 */
export async function getYucDetailMatch(
  anime: Anime,
  dependencies: YucDetailLookupDependencies = {},
): Promise<YucDetailMatch | null> {
  const boundEntries = await readBoundEntries(anime, dependencies);
  if (boundEntries.length > 0) {
    const boundMatch = chooseBoundEntry(boundEntries, anime);
    return boundMatch ? { entry: boundMatch, matchedBy: "binding" } : null;
  }

  const candidates = await readMetadataCandidates(anime, dependencies);
  const match = findUniqueYucCatalogMatch(candidates, animeTarget(anime));
  return match ? { entry: match, matchedBy: "metadata" } : null;
}

/** 仅接受 YUC 自身的 HTTPS 页面，供详情 Hero 的来源按钮复用。 */
export function getYucSourceHref(
  matchOrEntry: YucDetailMatch | YucEntry | null | undefined,
): string | null {
  if (!matchOrEntry) return null;
  const entry = "entry" in matchOrEntry ? matchOrEntry.entry : matchOrEntry;
  return sanitizeYucExternalUrl(entry.sourceUrl, { yucSourceOnly: true });
}

/**
 * 清理从第三方页面解析出的外链。允许公开 HTTP(S) 地址，拒绝凭据、回环与私网主机。
 */
export function sanitizeYucExternalUrl(
  value: string | null | undefined,
  options: { yucSourceOnly?: boolean } = {},
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (isLocalOrPrivateHostname(url.hostname)) return null;
    if (
      options.yucSourceOnly &&
      (url.protocol !== "https:" || url.hostname.toLocaleLowerCase("en-US") !== "yuc.wiki")
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

async function readBoundEntries(
  anime: Anime,
  dependencies: YucDetailLookupDependencies,
): Promise<YucEntry[]> {
  try {
    if (dependencies.lookupBoundEntries) {
      return dedupeYucEntries(await dependencies.lookupBoundEntries(anime));
    }
    const lookupBoundSourceKeys =
      dependencies.lookupBoundSourceKeys ??
      (async (animeId: number) =>
        listYucIdentitiesForAnime(animeId).map((record) => record.sourceKey));
    const getEntry = dependencies.getEntryBySourceKey ?? getYucEntryBySourceKey;
    const sourceKeys = [...new Set(await lookupBoundSourceKeys(anime.id))];
    const entries = await Promise.all(sourceKeys.map((key) => getEntry(key)));
    return dedupeYucEntries(entries.filter(isYucEntry));
  } catch (error) {
    console.warn("[yuc-detail] 读取身份绑定失败，继续尝试元数据匹配", error);
    return [];
  }
}

function chooseBoundEntry(entries: readonly YucEntry[], anime: Anime): YucEntry | null {
  if (entries.length === 1) return entries[0];
  return findUniqueYucMatch(entries, animeTarget(anime));
}

async function readMetadataCandidates(
  anime: Anime,
  dependencies: YucDetailLookupDependencies,
): Promise<YucEntry[]> {
  const getSeasonPage = dependencies.getSeasonPage ?? getYucSeasonPage;
  const requests: Promise<YucCatalogResult>[] = [];

  if (anime.year != null) {
    const months = anime.season
      ? [MONTH_BY_SEASON[anime.season]]
      : [...SEASON_MONTHS];
    requests.push(
      ...months.map((month) => safelyRead(() => getSeasonPage(anime.year!, month))),
    );
  }

  if (anime.status === "upcoming") {
    const getFuturePage = dependencies.getFuturePage ?? getYucFuturePage;
    requests.push(safelyRead(getFuturePage));
  }
  if (anime.type === "OVA") {
    const getSpecialPage = dependencies.getSpecialPage ?? getYucSpecialPage;
    requests.push(safelyRead(getSpecialPage));
  }
  if (anime.type === "Movie") {
    const getMoviePage = dependencies.getMoviePage ?? getYucMoviePage;
    requests.push(safelyRead(getMoviePage));
  }

  if (requests.length === 0) return [];
  const pages = await Promise.all(requests);
  return dedupeYucEntries(pages.flatMap((page) => page.entries));
}

async function safelyRead(
  read: () => Promise<YucCatalogResult>,
): Promise<YucCatalogResult> {
  try {
    return await read();
  } catch (error) {
    console.warn("[yuc-detail] 来源读取失败", error);
    return { entries: [], status: "unavailable", checkedAt: null };
  }
}

function animeTarget(anime: Anime) {
  return {
    title: anime.title,
    titleJa: anime.titleJa,
    year: anime.year,
    format: anime.type,
    seasonMonth: inferYucSeasonMonth({
      season: anime.season,
      tags: anime.tags,
      year: anime.year,
    }),
    totalEpisodes: anime.totalEpisodes,
  };
}

function isYucEntry(value: YucEntry | null): value is YucEntry {
  return value != null;
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase("en-US").replace(/^\[|\]$/gu, "");
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }
  if (isPrivateIpv4(normalized)) return true;
  const mapped = ipv4FromMappedIpv6(normalized);
  if (mapped && isPrivateIpv4(mapped)) return true;
  if (/^f[cd][0-9a-f]{2}:/u.test(normalized)) return true;
  if (/^fe[89a-f][0-9a-f]:/u.test(normalized)) return true;
  if (/^ff[0-9a-f]{2}:/u.test(normalized)) return true;
  if (/^2001:db8:/u.test(normalized)) return true;
  return normalized === "0.0.0.0" || normalized === "::";
}

function isPrivateIpv4(value: string): boolean {
  const octets = value.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && (octets[2] === 0 || octets[2] === 2)) {
    return true;
  }
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && octets[2] === 100) return true;
  if (a === 203 && b === 0 && octets[2] === 113) return true;
  if (a >= 224) return true;
  return a === 100 && b >= 64 && b <= 127;
}

function ipv4FromMappedIpv6(value: string): string | null {
  if (!value.startsWith("::ffff:")) return null;
  const suffix = value.slice("::ffff:".length);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(suffix)) return suffix;
  const match = suffix.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u);
  if (!match) return null;
  const high = Number.parseInt(match[1], 16);
  const low = Number.parseInt(match[2], 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}
