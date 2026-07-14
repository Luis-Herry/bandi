import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildYucSourceKey,
  decodeYucSourceKeyParam,
  findYucEntryBySourceKey,
  inferYucProviderService,
  normalizeYucCoverUrl,
  normalizeYucUrl,
  parseYucAtom,
  parseYucFuturePage,
  parseYucMoviePage,
  parseYucSeasonPage,
  parseYucSourceKey,
  parseYucSpecialPage,
} from "../src/lib/yuc/parser";
import { normalizeYucAtomForCache } from "../src/lib/yuc/client";

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/yuc/${name}`, import.meta.url), "utf8");
}

test("normalizeYucUrl keeps only HTTP(S) and canonicalizes Yuc links", () => {
  assert.equal(normalizeYucUrl("javascript:alert(1)"), null);
  assert.equal(normalizeYucUrl("data:text/plain,secret"), null);
  assert.equal(normalizeYucUrl("ftp://yuc.wiki/file"), null);
  assert.equal(normalizeYucUrl("http://www.yuc.wiki/new/"), "https://yuc.wiki/new/");
  assert.equal(normalizeYucUrl("../sp/", "https://yuc.wiki/new/"), "https://yuc.wiki/sp/");
});

test("parseYucSeasonPage merges schedule and detail records", () => {
  const entries = parseYucSeasonPage(fixture("season.html"), {
    year: 2026,
    month: 7,
    sourceUrl: "https://yuc.wiki/202607/",
  });

  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.equal(entry.title, "穹庐下的魔女");
  assert.equal(entry.titleJa, "天幕のジャードゥーガル");
  assert.equal(entry.premiereDate, "2026-07-04");
  assert.equal(entry.weeklyDay, 6);
  assert.equal(entry.weeklyTime, "24:00");
  assert.equal(entry.totalEpisodes, 12);
  assert.equal(entry.format, "TV");
  assert.equal(
    entry.coverUrl,
    "https://i0.hdslb.com/bfs/bangumi/jaadugar-schedule.jpg",
  );
  assert.equal(entry.original, "Tomato Soup");
  assert.equal(entry.studio, "Science SARU");
  assert.deepEqual(entry.cast, ["关根明良", "小清水亚美"]);
  assert.ok(entry.tags.includes("历史"));
  assert.equal(entry.officialUrl, "https://anime-jaadugar.com/");
  assert.equal(entry.pvUrl, "https://www.bilibili.com/video/BV1EXAMPLE/");
  assert.deepEqual(
    entry.providers.map(({ label, service }) => ({ label, service })),
    [
      { label: "环大陆", service: "Crunchyroll" },
      { label: "港台", service: "Netflix" },
    ],
  );
  assert.match(entry.sourceKey, /^yuc:season:202607:[a-f0-9]{16}$/u);
  assert.deepEqual(parseYucSourceKey(entry.sourceKey), {
    sourceKind: "season",
    pageId: "202607",
    stableHash: entry.sourceKey.split(":")[3],
  });
  assert.equal(parseYucSourceKey("yuc:season:new:0123456789abcdef"), null);
  assert.equal(parseYucSourceKey("yuc:future:sp:0123456789abcdef"), null);
  assert.equal(decodeYucSourceKeyParam(entry.sourceKey), entry.sourceKey);
  assert.equal(
    decodeYucSourceKeyParam(encodeURIComponent(entry.sourceKey)),
    entry.sourceKey,
  );
  assert.equal(decodeYucSourceKeyParam("yuc%2Fseason%2F202607"), null);
  assert.equal(decodeYucSourceKeyParam("%E0%A4%A"), null);
  assert.equal(findYucEntryBySourceKey(entries, entry.sourceKey), entry);
  assert.equal(findYucEntryBySourceKey([entry, entry], entry.sourceKey), null);
});

test("Yuc source keys normalize punctuation and never expose raw titles", () => {
  const first = buildYucSourceKey(
    "season",
    "https://yuc.wiki/202607/",
    "Re：从零！",
    "Ｒｅ：ゼロ",
  );
  const second = buildYucSourceKey(
    "season",
    "https://yuc.wiki/202607/",
    "re: 从零",
    "re:ゼロ",
  );
  assert.equal(first, second);
  assert.match(first, /^[a-z0-9:_-]+$/u);
  assert.doesNotMatch(first, /从零|ゼロ/u);
});

test("parseYucFuturePage keeps seasonal uncertainty as raw data", () => {
  const [entry] = parseYucFuturePage(fixture("future.html"));
  assert.equal(entry.title, "VERTEX FORCE");
  assert.equal(entry.premiereRaw, "2026秋");
  assert.equal(entry.premiereDate, null);
  assert.equal(entry.seasonYear, 2026);
  assert.equal(entry.seasonMonth, 10);
  assert.equal(entry.original, "原创");
  assert.equal(entry.format, null);
  assert.match(entry.sourceKey, /^yuc:future:new:[a-f0-9]{16}$/u);
});

test("parseYucSpecialPage extracts format and an exact release date", () => {
  const [entry] = parseYucSpecialPage(fixture("special.html"));
  assert.equal(entry.title, "只狼 NO DEFEAT");
  assert.equal(entry.format, "Movie");
  assert.equal(entry.premiereDate, "2026-09-04");
  assert.equal(entry.seasonYear, 2026);
  assert.equal(entry.seasonMonth, 9);
  assert.match(entry.sourceKey, /^yuc:special:sp:[a-f0-9]{16}$/u);
});

test("parseYucMoviePage does not turn a postponed original date into a premiere", () => {
  const entries = parseYucMoviePage(fixture("movie.html"));
  assert.equal(entries.length, 2);
  assert.equal(entries[0].premiereDate, "2026-07-03");
  assert.equal(entries[0].format, "Movie");
  assert.equal(entries[1].premiereRaw, "原定2025/12/6上映");
  assert.equal(entries[1].premiereDate, null);
  assert.equal(entries[1].seasonYear, null);
  assert.equal(entries[1].coverUrl, null);
});

test("YUC provider and cover hosts require an exact domain boundary", () => {
  assert.equal(
    inferYucProviderService("https://www.netflix.com/title/123"),
    "Netflix",
  );
  assert.equal(
    inferYucProviderService("https://netflix.com.evil.example/title/123"),
    null,
  );
  assert.equal(
    normalizeYucCoverUrl("https://i0.hdslb.com/bfs/bangumi/cover.jpg"),
    "https://i0.hdslb.com/bfs/bangumi/cover.jpg",
  );
  assert.equal(normalizeYucCoverUrl("https://cdn.example/cover.jpg"), null);
});

test("parseYucAtom reads page-level update metadata", () => {
  const feed = parseYucAtom(fixture("atom.xml"));
  assert.equal(feed.title, "長門番堂");
  assert.equal(feed.subtitle, "Yuc's Anime List");
  assert.equal(feed.sourceUrl, "https://yuc.wiki/atom.xml");
  assert.equal(feed.siteUrl, "https://yuc.wiki/");
  assert.equal(feed.updatedAt, "2026-07-11T09:21:10.901Z");
  assert.deepEqual(feed.entries[0], {
    title: "新番卫星观测站",
    url: "https://yuc.wiki/new/",
    id: "https://yuc.wiki/new/",
    publishedAt: "2015-07-09T16:00:00.000Z",
    updatedAt: "2026-07-11T09:21:10.901Z",
    summaryHtml: '<p class="future_intro">即将着陆</p>',
  });
  const cached = normalizeYucAtomForCache(feed);
  assert.equal(cached.entries[0].summaryHtml, null);
});
