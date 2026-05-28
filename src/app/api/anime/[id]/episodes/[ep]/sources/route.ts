/**
 * 单集即时找资源。
 *
 * 流程：
 *   1. 取番剧 + 该集元信息
 *   2. 取所有 active RSS 源
 *   3. 并行拉每个 feed，过滤出包含本集集数 + 番剧名/英文/日文任一别名的条目
 *   4. 抽出 字幕组 / 画质 / 大小 等元数据
 *   5. 按 pubDate 降序返回
 *
 * 注意：这是「按需扫」，不是「订阅」，每次请求都现拉 RSS。
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { anime, episodes, rssSources } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  buildSearchRssUrls,
  fetchRss,
  stripSeasonSuffix,
  type RssItem,
} from "@/lib/rss";
import {
  buildAnimeGardenMagnet,
  formatAnimeGardenSize,
  searchAnimeGardenResources,
  type AnimeGardenResource,
} from "@/lib/animegarden";
import { getAutoTitleAliases } from "@/lib/anime-title-aliases";
import {
  getRssTitleAliases,
} from "@/lib/rss-title-aliases";
import { dedupeEpisodesByNumber } from "@/lib/episode-normalize";
import {
  containsAnimeTitleAlias,
  containsEpisodeRelease,
  isSeasonPackRelease,
  stripTrailingArcAfterSeason,
} from "@/lib/source-match";
import { expandZhVariants } from "@/lib/zh-convert";

export const dynamic = "force-dynamic";

interface SourceCandidate {
  sourceId: number;
  sourceName: string;
  title: string;
  magnet: string | null;
  link: string;
  pubDate: string | null;
  size: string | null;
  group: string | null;
  quality: string | null;
}
type SourceScope = "episode" | "season";

/* ── helpers ────────────────────────────────────────────────── */

// 从 release 标题里识别字幕组（一般写在最前的方括号里）
function extractGroup(title: string): string | null {
  const m = title.match(/^\s*\[([^\]]+)\]/);
  if (!m) return null;
  const raw = m[1].trim();
  // 过滤掉一些不像字幕组的标记（纯数字、纯英文画质标记）
  if (/^\d+$/.test(raw)) return null;
  if (/^(1080p|720p|480p|4k|2160p|hevc|aac|webrip|bdrip)$/i.test(raw)) return null;
  return raw;
}

function extractQuality(title: string): string | null {
  const m = title.match(/\b(2160p|1080p|720p|480p|4k)\b/i);
  return m ? m[1].toLowerCase() : null;
}

function getLeadingTitleSegment(title: string): string | null {
  const [segment] = title.split(/[，,、\/／：:~〜]/);
  const trimmed = segment?.trim();
  if (!trimmed || trimmed === title.trim() || trimmed.length < 3) return null;
  return trimmed;
}

function buildAliases(
  animeTitle: string,
  titleJa: string | null,
  savedAliases: string[] = [],
): string[] {
  const out = new Set<string>();
  const push = (s: string | null | undefined) => {
    if (!s) return;
    const t = s.trim();
    if (!t) return;
    // 原文 + 去季号后缀，再各自展开简体 / 繁体三态，覆盖 ANi 等繁体源。
    const bases = new Set<string>([t]);
    const stripped = stripSeasonSuffix(t);
    if (stripped) bases.add(stripped);
    const seasonTitle = stripTrailingArcAfterSeason(t);
    if (seasonTitle) bases.add(seasonTitle);
    const leading = getLeadingTitleSegment(t);
    if (leading) bases.add(leading);
    for (const base of bases) {
      for (const variant of expandZhVariants(base)) {
        out.add(variant);
      }
    }
  };
  for (const alias of savedAliases) push(alias);
  push(animeTitle);
  push(titleJa);
  return [...out];
}

function selectSearchTerms(aliases: string[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const alias of aliases) {
    const term = alias.trim();
    if (term.length < 2) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms.sort((a, b) => a.length - b.length).slice(0, 8);
}

function dedupeItems(items: RssItem[]): RssItem[] {
  const seen = new Set<string>();
  const out: RssItem[] = [];
  for (const item of items) {
    const key = item.magnet ?? item.link ?? item.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function toAnimeGardenCandidate(resource: AnimeGardenResource): SourceCandidate {
  return {
    sourceId: 0,
    sourceName: resource.provider
      ? `AnimeGarden · ${resource.provider}`
      : "AnimeGarden",
    title: resource.title,
    magnet: buildAnimeGardenMagnet(resource),
    link: resource.href,
    pubDate: resource.createdAt ?? null,
    size: formatAnimeGardenSize(resource.size),
    group: resource.publisher?.name ?? extractGroup(resource.title),
    quality: extractQuality(resource.title),
  };
}

function dedupeCandidates(candidates: SourceCandidate[]): SourceCandidate[] {
  const seen = new Set<string>();
  const out: SourceCandidate[] = [];
  for (const candidate of candidates) {
    const key = getCandidateDedupeKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function getCandidateDedupeKey(candidate: SourceCandidate): string {
  const hash = candidate.magnet?.match(/xt=urn:btih:([A-Za-z0-9]+)/)?.[1];
  if (hash) return `magnet:${hash.toLowerCase()}`;
  return `release:${candidate.link || candidate.title}`;
}

function sortCandidates(candidates: SourceCandidate[]): SourceCandidate[] {
  return [...candidates].sort((a, b) => {
    if (!a.pubDate && !b.pubDate) return 0;
    if (!a.pubDate) return 1;
    if (!b.pubDate) return -1;
    return b.pubDate.localeCompare(a.pubDate);
  });
}

function matchesSourceScope(
  title: string,
  scope: SourceScope,
  epNumber: number,
  seasonEpisodeCount: number | null,
  seasonEpisodeNumbers: number[],
): boolean {
  if (scope === "season") return isSeasonPackRelease(title, seasonEpisodeCount);
  return containsEpisodeRelease(title, epNumber, seasonEpisodeNumbers);
}

/* ── handler ────────────────────────────────────────────────── */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; ep: string }> },
) {
  const { id, ep } = await params;
  const animeId = Number(id);
  const epNumber = Number(ep);
  if (!Number.isFinite(animeId) || !Number.isFinite(epNumber)) {
    return NextResponse.json({ error: "invalid id/ep" }, { status: 400 });
  }

  const animeRow = db.select().from(anime).where(eq(anime.id, animeId)).get();
  if (!animeRow) {
    return NextResponse.json({ error: "anime not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const scope: SourceScope =
    url.searchParams.get("scope") === "season" ? "season" : "episode";
  const episodeRows = dedupeEpisodesByNumber(db
    .select({ number: episodes.number })
    .from(episodes)
    .where(eq(episodes.animeId, animeId))
    .all());
  const seasonEpisodeNumbers = episodeRows.map((row) => row.number);
  const seasonEpisodeCount =
    animeRow.totalEpisodes ?? (episodeRows.length > 0 ? episodeRows.length : null);
  const epRow =
    scope === "episode"
      ? db
          .select()
          .from(episodes)
          .where(and(eq(episodes.animeId, animeId), eq(episodes.number, epNumber)))
          .get()
      : null;

  // 允许 episode 不在表里也可以查（番剧元信息表可能稀疏）
  const savedAliases = getRssTitleAliases(animeId);
  const autoAliases = await getAutoTitleAliases({
    bangumiId: animeRow.bangumiId,
    titles: [animeRow.titleJa, animeRow.title],
  });
  const aliases = buildAliases(animeRow.title, animeRow.titleJa, [
    ...savedAliases,
    ...autoAliases,
  ]);

  // 允许 URL 参数覆盖关键词
  const overrideQ = url.searchParams.get("q");
  const queryAliases = overrideQ
    ? buildAliases(overrideQ, null)
    : aliases;
  const matchAliases = [...aliases, ...queryAliases];

  const sources = db
    .select()
    .from(rssSources)
    .where(eq(rssSources.isActive, true))
    .all();

  const searchTerms = selectSearchTerms(queryAliases);
  const animeGardenResources = await searchAnimeGardenResources({
    searchTerms,
    pageSize: 50,
  });
  const animeGardenCandidates = animeGardenResources
    .filter((item) => buildAnimeGardenMagnet(item))
    .filter((item) =>
      matchesSourceScope(
        item.title,
        scope,
        epNumber,
        seasonEpisodeCount,
        seasonEpisodeNumbers,
      ),
    )
    .filter((item) => containsAnimeTitleAlias(item.title, matchAliases))
    .map(toAnimeGardenCandidate);

  // 并发拉所有 feed。支持源站搜索，避免旧番资源已经滚出 RSS 当前窗口后查不到。
  const feeds = await Promise.all(
    sources.map(async (src) => {
      const urls = buildSearchRssUrls(src.url, searchTerms);
      const batches = await Promise.all(urls.map((u) => fetchRss(u)));
      return {
        src,
        items: dedupeItems(batches.flat()),
      };
    }),
  );

  const rssCandidates: SourceCandidate[] = [];
  for (const { src, items } of feeds) {
    for (const item of items) {
      if (!item.magnet) continue; // 没磁链没法下
      if (
        !matchesSourceScope(
          item.title,
          scope,
          epNumber,
          seasonEpisodeCount,
          seasonEpisodeNumbers,
        )
      ) {
        continue;
      }
      if (!containsAnimeTitleAlias(item.title, matchAliases)) continue;
      rssCandidates.push({
        sourceId: src.id,
        sourceName: src.name,
        title: item.title,
        magnet: item.magnet,
        link: item.link,
        pubDate: item.pubDate?.toISOString() ?? null,
        size: item.size ?? null,
        group: extractGroup(item.title),
        quality: extractQuality(item.title),
      });
    }
  }

  const candidates = dedupeCandidates([
    ...sortCandidates(animeGardenCandidates),
    ...sortCandidates(rssCandidates),
  ]);

  return NextResponse.json({
    animeId,
    animeTitle: animeRow.title,
    titleJa: animeRow.titleJa,
    scope,
    episode: epNumber,
    episodeId: scope === "episode" ? epRow?.id ?? null : null,
    aliases,
    savedAliases,
    autoAliases,
    candidates,
    message:
      candidates.length === 0 && sources.length === 0
        ? "AnimeGarden 未找到匹配资源，且没有启用的 RSS 源。"
        : undefined,
  });
}

export type EpisodeSourceResponse = {
  animeId: number;
  animeTitle: string;
  titleJa: string | null;
  scope: SourceScope;
  episode: number;
  episodeId: number | null;
  aliases: string[];
  savedAliases: string[];
  autoAliases: string[];
  candidates: SourceCandidate[];
  message?: string;
};
