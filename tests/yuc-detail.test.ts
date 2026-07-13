import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Anime } from "../src/db/schema";
import {
  getYucDetailMatch,
  getYucSourceHref,
  sanitizeYucExternalUrl,
} from "../src/lib/yuc/detail";
import type { YucEntry } from "../src/lib/yuc/types";

function anime(overrides: Partial<Anime> = {}): Anime {
  return {
    id: 7,
    bangumiId: 123,
    anilistId: null,
    title: "测试动画",
    titleJa: "テストアニメ",
    coverUrl: null,
    synopsis: null,
    type: "TV",
    status: "airing",
    totalEpisodes: 12,
    airingDay: 3,
    airingTime: "23:00",
    season: "summer",
    year: 2026,
    tags: [],
    accentColor: null,
    mediaType: "anime",
    tmdbId: null,
    doubanId: null,
    imdbId: null,
    tmdbRating: null,
    doubanRating: null,
    doubanRatingFetchedAt: null,
    watchProviders: null,
    isAdult: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function entry(overrides: Partial<YucEntry> = {}): YucEntry {
  return {
    sourceKey: "yuc:season:202607:1111111111111111",
    sourceKind: "season",
    sourceUrl: "https://yuc.wiki/202607/",
    title: "测试动画",
    titleJa: "テストアニメ",
    coverUrl: null,
    premiereRaw: "7/8~",
    premiereDate: "2026-07-08",
    weeklyDay: 3,
    weeklyTime: "23:00",
    scheduleRaw: "周三 23:00",
    totalEpisodes: 12,
    format: "TV",
    tags: [],
    staff: [],
    cast: [],
    studio: null,
    original: null,
    officialUrl: null,
    pvUrl: null,
    providers: [],
    seasonYear: 2026,
    seasonMonth: 7,
    ...overrides,
  };
}

const unavailable = async () => ({
  entries: [],
  status: "unavailable" as const,
  checkedAt: null,
});

test("YUC detail prefers an identity binding and skips metadata lookup", async () => {
  let metadataReads = 0;
  const bound = entry({ sourceKey: "yuc:movie:movie:2222222222222222" });
  const match = await getYucDetailMatch(anime(), {
    lookupBoundEntries: async () => [bound],
    getSeasonPage: async () => {
      metadataReads += 1;
      return unavailable();
    },
  });
  assert.equal(match?.entry.sourceKey, bound.sourceKey);
  assert.equal(match?.matchedBy, "binding");
  assert.equal(metadataReads, 0);
});

test("YUC detail resolves persisted source keys to the current cached facts", async () => {
  const bound = entry();
  let exactReads = 0;
  const match = await getYucDetailMatch(anime(), {
    lookupBoundSourceKeys: async () => [bound.sourceKey, bound.sourceKey],
    getEntryBySourceKey: async (sourceKey) => {
      exactReads += 1;
      return sourceKey === bound.sourceKey ? bound : null;
    },
    getSeasonPage: async () => {
      throw new Error("metadata lookup must stay idle after a binding match");
    },
  });
  assert.equal(match?.entry.totalEpisodes, 12);
  assert.equal(match?.matchedBy, "binding");
  assert.equal(exactReads, 1);
});

test("YUC detail falls back to exact title, year and format metadata", async () => {
  const target = entry();
  const match = await getYucDetailMatch(anime(), {
    lookupBoundSourceKeys: async () => [],
    getSeasonPage: async (year, month) => ({
      entries: year === 2026 && month === 7 ? [target] : [],
      status: "fresh",
      checkedAt: 1,
    }),
  });
  assert.equal(match?.entry.sourceKey, target.sourceKey);
  assert.equal(match?.matchedBy, "metadata");
});

test("YUC detail source failures return no match without rejecting", async () => {
  const match = await getYucDetailMatch(anime(), {
    lookupBoundSourceKeys: async () => [],
    getSeasonPage: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(match, null);
});

test("YUC detail fails closed on equally credible metadata candidates", async () => {
  const match = await getYucDetailMatch(anime(), {
    lookupBoundSourceKeys: async () => [],
    getSeasonPage: async () => ({
      entries: [
        entry({ titleJa: null }),
        entry({
          sourceKey: "yuc:future:new:3333333333333333",
          sourceKind: "future",
          sourceUrl: "https://yuc.wiki/new/",
          title: "テストアニメ",
          titleJa: null,
        }),
      ],
      status: "fresh",
      checkedAt: 1,
    }),
  });
  assert.equal(match, null);
});

test("YUC external links reject executable, credentialed, local and forged source URLs", () => {
  assert.equal(sanitizeYucExternalUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeYucExternalUrl("https://name:secret@example.com/"), null);
  assert.equal(sanitizeYucExternalUrl("http://127.0.0.1:3000/"), null);
  assert.equal(sanitizeYucExternalUrl("http://[::ffff:127.0.0.1]/"), null);
  assert.equal(sanitizeYucExternalUrl("http://100.64.0.1/"), null);
  assert.equal(
    getYucSourceHref(entry({ sourceUrl: "https://yuc.wiki.evil.example/" })),
    null,
  );
  assert.equal(
    getYucSourceHref(entry()),
    "https://yuc.wiki/202607/",
  );
  assert.equal(
    sanitizeYucExternalUrl("https://www.netflix.com/title/123"),
    "https://www.netflix.com/title/123",
  );
});

test("YUC info panel keeps the required facts, attribution and hardened external links", () => {
  const source = readFileSync(
    new URL("../src/components/features/YucAnimeInfo.tsx", import.meta.url),
    "utf8",
  );
  for (const label of [
    "每周播出",
    "开播日期",
    "总话数",
    "正版播放",
    "声优",
    "制作公司",
    "原作",
    "动画官网",
    "观看 PV",
    "长门番堂 · CC BY-NC-SA 4.0",
  ]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /sanitizeYucExternalUrl\(provider\.url\)/u);
  assert.match(source, /rel="noopener noreferrer"/u);
});
