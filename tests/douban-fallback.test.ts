import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";

import {
  getDoubanCatalog,
  hasAnimeSeasonConflict,
  hasDoubanAnimationGenre,
  isReliableDoubanInfoMatch,
  isReliableDoubanTitleSetMatch,
  parseDoubanEpisodeAvailability,
} from "../src/lib/douban";
import { getCompletionEpisodeNumber } from "../src/lib/watch-progress";

const tempDir = mkdtempSync(join(tmpdir(), "bandi-douban-fallback-"));
const dbPath = join(tempDir, "douban-fallback.db");
process.env.DATABASE_URL = dbPath;
process.env.TMDB_API_TOKEN = "";

function resetDatabase(seedSql = ""): void {
  const sqlite = new Database(dbPath);
  sqlite.exec(`
    delete from download_queue;
    delete from playback_progress;
    delete from watch_events;
    delete from user_anime;
    delete from episodes;
    delete from anime;
    ${seedSql}
  `);
  sqlite.close();
}

function createAnimationCatalogFetch({
  hits,
  details,
  bangumiSubjects = {},
}: {
  hits: Array<{ id: string; title: string; rate?: string }>;
  details: Record<string, Record<string, unknown>>;
  bangumiSubjects?: Record<string, Record<string, unknown>>;
}): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/j/search_subjects")) {
      const type = url.searchParams.get("type");
      const tag = url.searchParams.get("tag");
      const subjects =
        type === "tv" && (tag === "热门" || tag === "日本动画")
          ? hits
          : [];
      return new Response(JSON.stringify({ subjects }), { status: 200 });
    }
    if (url.hostname === "api.bgm.tv") {
      const id = url.pathname.split("/").at(-1) ?? "";
      return new Response(JSON.stringify(bangumiSubjects[id] ?? {}), {
        status: 200,
      });
    }
    if (url.hostname === "m.douban.com") {
      const id = url.pathname.split("/").at(-1) ?? "";
      const detail = details[id];
      assert.ok(detail, `missing Douban detail mock for ${id}`);
      return new Response(JSON.stringify(detail), { status: 200 });
    }
    assert.fail(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

// Regression: QA-008 — Douban catalog entries must remain useful without TMDB.
// Found by /qa on 2026-07-11.
// Report: .gstack/qa-reports/qa-report-desktop-2026-07-11.md

test("Douban episode availability handles updating, completed, and count-only payloads", () => {
  assert.deepEqual(
    parseDoubanEpisodeAvailability({
      episodesCount: 32,
      episodesInfo: "更新至13集",
    }),
    { totalEpisodes: 32, availableEpisodes: 13 },
  );
  assert.deepEqual(
    parseDoubanEpisodeAvailability({
      episodesInfo: "12集全",
    }),
    { totalEpisodes: 12, availableEpisodes: 12 },
  );
  assert.deepEqual(
    parseDoubanEpisodeAvailability({
      episodesCount: 10,
      episodesInfo: "",
      lastEpisodeNumber: null,
    }),
    { totalEpisodes: 10, availableEpisodes: 10 },
  );
});

test("Douban catalog marks animation IDs without classifying every TV title as drama", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const type = url.searchParams.get("type");
    const tag = url.searchParams.get("tag");
    const subjects =
      type === "tv" && tag === "热门"
        ? [
            {
              id: "37315819",
              title: "穹庐下的魔女",
              rate: "7.8",
              cover: "https://img1.doubanio.com/view/photo/s_ratio_poster/public/p37315819.webp",
            },
            { id: "live-tv", title: "真人电视剧", rate: "8.1" },
          ]
        : type === "movie" && tag === "热门"
          ? [{ id: "live-movie", title: "真人电影", rate: "7.2" }]
          : type === "tv" && tag === "日本动画"
            ? [{ id: "37315819", title: "穹庐下的魔女", rate: "7.8" }]
            : [];
    return new Response(JSON.stringify({ subjects }), { status: 200 });
  };

  try {
    const hits = await getDoubanCatalog({ limit: 4 });
    assert.equal(
      hits.find((hit) => hit.doubanId === "37315819")?.isAnimation,
      true,
    );
    assert.equal(
      hits.find((hit) => hit.doubanId === "live-tv")?.isAnimation,
      false,
    );
    assert.equal(
      hits.find((hit) => hit.doubanId === "live-movie")?.isAnimation,
      false,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("movie animation outside the index is routed but skipped without a local identity", async () => {
  const { importDoubanCatalog } = await import("../src/lib/cinema-enrich");
  const sqlite = new Database(dbPath);
  sqlite.exec(`
    delete from download_queue;
    delete from playback_progress;
    delete from watch_events;
    delete from user_anime;
    delete from episodes;
    delete from anime;
  `);
  sqlite.close();

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/j/search_subjects")) {
      const type = url.searchParams.get("type");
      const tag = url.searchParams.get("tag");
      if (type === "movie" && tag === "动画") {
        return new Response("classification unavailable", { status: 503 });
      }
      const subjects =
        type === "movie" && tag === "热门"
          ? [
              {
                id: "movie-animation-outside-index",
                title: "动画电影",
                rate: "8.2",
              },
            ]
          : [];
      return new Response(JSON.stringify({ subjects }), { status: 200 });
    }
    assert.match(
      String(input),
      /m\.douban\.com\/rexxar\/api\/v2\/movie\/movie-animation-outside-index/,
    );
    return new Response(
      JSON.stringify({
        title: "动画电影",
        year: "2026",
        genres: ["动画"],
        vendors: [],
      }),
      { status: 200 },
    );
  };

  try {
    const summary = await importDoubanCatalog({ limit: 1 });
    assert.equal(summary.routedToAnime, 1);
    assert.equal(summary.skippedAnimeUnmatched, 1);
    assert.equal(summary.created, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }

  const verify = new Database(dbPath);
  assert.equal(
    (
      verify
        .prepare(
          "select count(*) as count from anime where douban_id='movie-animation-outside-index'",
        )
        .get() as { count: number }
    ).count,
    0,
  );
  verify.close();
});

test("Douban animation genre accepts simplified and traditional labels only", () => {
  assert.equal(hasDoubanAnimationGenre(["动画", "奇幻"]), true);
  assert.equal(hasDoubanAnimationGenre(["動畫", "奇幻"]), true);
  assert.equal(hasDoubanAnimationGenre(["真人秀", "剧情"]), false);
});

test("Douban title-search classification requires matching title and known year", () => {
  const info = {
    title: "穹庐下的魔女",
    originalTitle: "空の檻の魔女",
    year: 2026,
  };
  assert.equal(isReliableDoubanInfoMatch("穹庐下的魔女", 2026, info), true);
  assert.equal(isReliableDoubanInfoMatch("穹庐下的魔女", 2025, info), false);
  assert.equal(isReliableDoubanInfoMatch("同名真人剧", 2026, info), false);
});

test("animation identity requires an exact title alias, equal known years, and compatible seasons", () => {
  assert.equal(
    isReliableDoubanTitleSetMatch({
      doubanTitles: ["躲在超市后门抽烟的两人", "スーパーの裏でヤニ吸うふたり"],
      localTitles: ["在超市后门吸烟的二人", "スーパーの裏でヤニ吸うふたり"],
      doubanYear: 2026,
      localYear: 2026,
    }),
    true,
  );
  assert.equal(
    isReliableDoubanTitleSetMatch({
      doubanTitles: ["同名动画"],
      localTitles: ["同名动画"],
      doubanYear: 2026,
      localYear: 2025,
    }),
    false,
  );
  assert.equal(
    isReliableDoubanTitleSetMatch({
      doubanTitles: ["年份未知动画"],
      localTitles: ["年份未知动画"],
      doubanYear: 2026,
      localYear: null,
    }),
    false,
  );
  assert.equal(
    hasAnimeSeasonConflict(
      ["碧蓝之海 第三季", "共同别名"],
      ["碧蓝之海 第二季", "共同别名"],
    ),
    true,
  );
  assert.equal(
    isReliableDoubanTitleSetMatch({
      doubanTitles: ["碧蓝之海 第三季", "共同别名"],
      localTitles: ["碧蓝之海 第二季", "共同别名"],
      doubanYear: 2026,
      localYear: 2026,
    }),
    false,
  );
});

test("completion keeps the declared full season above currently available rows", () => {
  assert.equal(
    getCompletionEpisodeNumber({
      totalEpisodes: 32,
      episodeNumbers: Array.from({ length: 13 }, (_, index) => index + 1),
    }),
    32,
  );
  assert.equal(
    getCompletionEpisodeNumber({
      totalEpisodes: 11,
      episodeNumbers: [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77],
    }),
    77,
  );
});

test("provider refresh replaces matching regions and preserves untouched lanes", async () => {
  const { mergeWatchProviderRegions } = await import(
    "../src/lib/cinema-enrich"
  );
  const existing = [
    {
      region: "CN",
      providers: [
        { providerId: 1, providerName: "旧平台", type: "flatrate" as const },
      ],
      fetchedAt: 1,
    },
    {
      region: "US",
      providers: [
        { providerId: 2, providerName: "Netflix", type: "flatrate" as const },
      ],
      fetchedAt: 1,
    },
  ];
  const freshCn = {
    region: "CN",
    providers: [
      {
        providerId: 3,
        providerName: "爱奇艺",
        type: "flatrate" as const,
        url: "https://www.iqiyi.com/",
      },
    ],
    fetchedAt: 2,
  };

  const merged = mergeWatchProviderRegions(existing, [freshCn]);
  assert.deepEqual(merged.map((lane) => lane.region), ["CN", "US"]);
  assert.equal(merged[0]?.providers[0]?.providerName, "爱奇艺");
  assert.equal(merged[1]?.providers[0]?.providerName, "Netflix");
  assert.deepEqual(mergeWatchProviderRegions(existing, []), existing);
});

test("an existing Douban id enriches TV metadata and available episodes without TMDB", async () => {
  const { enrichCinemaItem } = await import("../src/lib/cinema-enrich");
  const sqlite = new Database(dbPath);
  sqlite
    .prepare(
      `insert into anime
        (id, title, type, status, total_episodes, media_type, douban_id, watch_providers)
       values (?, ?, 'TV', 'airing', null, 'drama', ?, json(?))`,
    )
    .run(
      2,
      "待补全剧集",
      "37817070",
      JSON.stringify([
        {
          region: "US",
          providers: [
            { providerId: 8, providerName: "Netflix", type: "flatrate" },
          ],
          fetchedAt: 1,
        },
      ]),
    );
  sqlite
    .prepare(
      `insert into episodes
        (id, anime_id, number, title, aired_at, is_downloaded)
       values (201, 2, 1, '已有标题', 1780000000, 1)`,
    )
    .run();
  sqlite.close();

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.match(String(input), /m\.douban\.com\/rexxar\/api\/v2\/tv\/37817070/);
    return new Response(
      JSON.stringify({
        title: "脱口秀和Ta的朋友们 第三季",
        original_title: "脱口秀和Ta的朋友们 第三季",
        intro: "一档正在更新的脱口秀节目。",
        year: "2026",
        rating: { value: 7.9, count: 1200 },
        genres: ["脱口秀", "真人秀"],
        episodes_count: 32,
        episodes_info: "更新至13集",
        vendors: [
          { title: "腾讯视频", url: "douban://tencent" },
          { title: "爱奇艺", url: "https://www.iqiyi.com/" },
        ],
      }),
      { status: 200 },
    );
  };

  try {
    const result = await enrichCinemaItem(2);
    assert.equal(result.matched, true);
    assert.equal(result.doubanId, "37817070");
  } finally {
    globalThis.fetch = previousFetch;
  }

  const verify = new Database(dbPath);
  const enriched = verify
    .prepare(
      `select title, title_ja as titleJa, synopsis, year,
              total_episodes as totalEpisodes, tmdb_id as tmdbId,
              watch_providers as watchProviders,
              douban_rating_fetched_at as fetchedAt
       from anime where id=2`,
    )
    .get() as {
    title: string;
    titleJa: string;
    synopsis: string;
    year: number;
    totalEpisodes: number;
    tmdbId: number | null;
    watchProviders: string;
    fetchedAt: number;
  };
  assert.equal(enriched.title, "脱口秀和Ta的朋友们 第三季");
  assert.equal(enriched.titleJa, "脱口秀和Ta的朋友们 第三季");
  assert.equal(enriched.synopsis, "一档正在更新的脱口秀节目。");
  assert.equal(enriched.year, 2026);
  assert.equal(enriched.totalEpisodes, 32);
  assert.equal(enriched.tmdbId, null);
  assert.ok(enriched.fetchedAt > 0);
  assert.deepEqual(
    (JSON.parse(enriched.watchProviders) as Array<{ region: string }>).map(
      (lane) => lane.region,
    ),
    ["US", "CN"],
  );
  assert.deepEqual(
    verify
      .prepare(
        "select count(*) as count, max(number) as highest from episodes where anime_id=2",
      )
      .get(),
    { count: 13, highest: 13 },
  );
  assert.deepEqual(
    verify
      .prepare(
        "select id, title, aired_at as airedAt, is_downloaded as isDownloaded from episodes where anime_id=2 and number=1",
      )
      .get(),
    { id: 201, title: "已有标题", airedAt: 1780000000, isDownloaded: 1 },
  );
  verify.close();
});

test("an existing Douban TV animation keeps its ID and moves to anime with episodes", async () => {
  const { enrichCinemaItem } = await import("../src/lib/cinema-enrich");
  const sqlite = new Database(dbPath);
  sqlite.exec(`
    delete from download_queue;
    delete from playback_progress;
    delete from watch_events;
    delete from user_anime;
    delete from episodes;
    delete from anime;
    insert into anime
      (id, title, type, status, media_type, douban_id)
    values
      (28, '穹庐下的魔女', 'TV', 'airing', 'drama', '37315819');
  `);
  sqlite.close();

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.match(
      String(input),
      /m\.douban\.com\/rexxar\/api\/v2\/tv\/37315819/,
    );
    return new Response(
      JSON.stringify({
        title: "穹庐下的魔女",
        original_title: "空の檻の魔女",
        intro: "十二话电视动画。",
        year: "2026",
        rating: { value: 7.8, count: 512 },
        genres: ["动画", "奇幻"],
        episodes_count: 12,
        episodes_info: "12集全",
        vendors: [],
      }),
      { status: 200 },
    );
  };

  let result;
  try {
    result = await enrichCinemaItem(28);
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(result.matched, true);
  assert.equal(result.reclassified, true);
  assert.equal(result.animeId, 28);

  const verify = new Database(dbPath);
  const row = verify
    .prepare(
      `select id, media_type as mediaType, douban_id as doubanId,
              total_episodes as totalEpisodes, tags
       from anime where id=28`,
    )
    .get() as {
    id: number;
    mediaType: string;
    doubanId: string;
    totalEpisodes: number;
    tags: string;
  };
  assert.equal(row.id, 28);
  assert.equal(row.mediaType, "anime");
  assert.equal(row.doubanId, "37315819");
  assert.equal(row.totalEpisodes, 12);
  assert.deepEqual(JSON.parse(row.tags), ["动画", "奇幻"]);
  assert.deepEqual(
    verify
      .prepare(
        "select count(*) as count, min(number) as first, max(number) as last from episodes where anime_id=28",
      )
      .get(),
    { count: 12, first: 1, last: 12 },
  );
  verify.close();
});

test("a drama without a saved Douban ID is not reclassified from animation genre alone", async () => {
  const { enrichCinemaItem } = await import("../src/lib/cinema-enrich");
  const sqlite = new Database(dbPath);
  sqlite.exec(`
    delete from download_queue;
    delete from playback_progress;
    delete from watch_events;
    delete from user_anime;
    delete from episodes;
    delete from anime;
    insert into anime
      (id, title, type, status, media_type, year)
    values
      (30, '无 ID 动画', 'TV', 'airing', 'drama', 2026);
  `);
  sqlite.close();

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/j/subject_suggest")) {
      return new Response(
        JSON.stringify([
          { id: "no-id-animation", title: "无 ID 动画", year: "2026" },
        ]),
        { status: 200 },
      );
    }
    assert.match(
      url,
      /m\.douban\.com\/rexxar\/api\/v2\/tv\/no-id-animation/,
    );
    return new Response(
      JSON.stringify({
        title: "无 ID 动画",
        year: "2026",
        genres: ["动画", "奇幻"],
        episodes_count: 12,
        episodes_info: "12集全",
        vendors: [],
      }),
      { status: 200 },
    );
  };

  let result;
  try {
    result = await enrichCinemaItem(30);
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(result.matched, false);
  assert.equal(result.reason, "skipped_anime_unmatched");

  const verify = new Database(dbPath);
  assert.deepEqual(
    verify
      .prepare(
        `select id, media_type as mediaType, douban_id as doubanId,
                total_episodes as totalEpisodes
         from anime where id=30`,
      )
      .get(),
    {
      id: 30,
      mediaType: "drama",
      doubanId: null,
      totalEpisodes: null,
    },
  );
  verify.close();
});

test("animation import reuses anime titles, protects same-name drama, and stays idempotent", async () => {
  const { importDoubanCatalog } = await import("../src/lib/cinema-enrich");
  const sqlite = new Database(dbPath);
  sqlite.exec(`
    delete from download_queue;
    delete from playback_progress;
    delete from watch_events;
    delete from user_anime;
    delete from episodes;
    delete from anime;
    insert into anime
      (id, title, type, status, media_type, year)
    values
      (99, '同名作品', 'TV', 'completed', 'anime', 2025),
      (100, '同名作品', 'TV', 'airing', 'drama', 2026),
      (101, '同名作品', 'TV', 'airing', 'anime', 2026);
    insert into episodes
      (id, anime_id, number, title, is_downloaded)
    values
      (1001, 100, 1, '真人剧第一集', 0);
  `);
  const insertExistingAnimeEpisode = sqlite.prepare(
    `insert into episodes
      (id, anime_id, number, title, is_downloaded)
     values (?, 101, ?, ?, 0)`,
  );
  for (let number = 13; number <= 24; number += 1) {
    insertExistingAnimeEpisode.run(
      1100 + number,
      number,
      `动漫绝对集号 ${number}`,
    );
  }
  sqlite.close();

  const previousFetch = globalThis.fetch;
  let detailFetches = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/j/search_subjects")) {
      const type = url.searchParams.get("type");
      const tag = url.searchParams.get("tag");
      const subjects =
        type === "tv" && (tag === "热门" || tag === "日本动画")
          ? [{ id: "animation-same-title", title: "同名作品", rate: "8.0" }]
          : [];
      return new Response(JSON.stringify({ subjects }), { status: 200 });
    }
    assert.match(
      String(input),
      /m\.douban\.com\/rexxar\/api\/v2\/tv\/animation-same-title/,
    );
    detailFetches += 1;
    return new Response(
      JSON.stringify({
        title: "同名作品",
        year: "2026",
        genres: ["动画"],
        episodes_count: 12,
        episodes_info: "12集全",
        vendors: [],
      }),
      { status: 200 },
    );
  };

  try {
    const first = await importDoubanCatalog({ limit: 1 });
    const second = await importDoubanCatalog({ limit: 1 });
    assert.equal(first.routedToAnime, 1);
    assert.equal(second.routedToAnime, 1);
    assert.equal(detailFetches, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }

  const verify = new Database(dbPath);
  assert.deepEqual(
    verify
      .prepare(
        `select id, media_type as mediaType, douban_id as doubanId
         from anime where title='同名作品' order by id`,
      )
      .all(),
    [
      { id: 99, mediaType: "anime", doubanId: null },
      { id: 100, mediaType: "drama", doubanId: null },
      { id: 101, mediaType: "anime", doubanId: "animation-same-title" },
    ],
  );
  assert.deepEqual(
    verify
      .prepare("select anime_id as animeId, title from episodes where id=1001")
      .get(),
    { animeId: 100, title: "真人剧第一集" },
  );
  assert.deepEqual(
    verify
      .prepare(
        "select count(*) as count, min(number) as first, max(number) as last from episodes where anime_id=101",
      )
      .get(),
    { count: 12, first: 13, last: 24 },
  );
  assert.equal(
    (
      verify
        .prepare(
          "select count(*) as count from anime where douban_id='animation-same-title'",
        )
        .get() as { count: number }
    ).count,
    1,
  );
  verify.close();
});

test("real catalog samples match canonical anime, protect Bangumi episodes, and skip unmatched animation", async () => {
  const { importDoubanCatalog } = await import("../src/lib/cinema-enrich");
  resetDatabase(`
    insert into anime
      (id, title, title_ja, cover_url, synopsis, type, status,
       total_episodes, year, tags, media_type, bangumi_id)
    values
      (201, '在超市后门吸烟的二人', 'スーパーの裏でヤニ吸うふたり',
       'https://local.test/supermarket.webp', '本地简介', 'TV', 'airing',
       12, 2026, json('["日常"]'), 'anime', 571784),
      (202, '碧蓝之海 第三季', 'ぐらんぶる Season 3',
       'https://local.test/grand-blue.webp', '本地第三季简介', 'TV', 'airing',
       12, 2026, json('["喜剧"]'), 'anime', 569116);
  `);
  const seeded = new Database(dbPath);
  const insertEpisode = seeded.prepare(
    `insert into episodes (anime_id, number, title, is_downloaded)
     values (?, ?, ?, 0)`,
  );
  for (let number = 13; number <= 24; number += 1) {
    insertEpisode.run(201, number, `Bangumi EP.${number}`);
  }
  insertEpisode.run(202, 25, "Bangumi 第三季 EP.25");
  seeded.close();

  const hits = [
    { id: "supermarket-smoking", title: "躲在超市后门抽烟的两人", rate: "8.1" },
    { id: "grand-blue-3", title: "碧蓝之海3", rate: "8.3" },
    { id: "niconyanyan", title: "尼古喵喵", rate: "7.4" },
    { id: "new-ghost-in-shell", title: "新攻壳机动队", rate: "8.0" },
  ];
  const details = {
    "supermarket-smoking": {
      title: "躲在超市后门抽烟的两人",
      original_title: "スーパーの裏でヤニ吸うふたり",
      intro: "豆瓣简介不应覆盖本地简介。",
      year: "2026",
      rating: { value: 8.1, count: 1200 },
      genres: ["动画", "日常"],
      episodes_count: 24,
      episodes_info: "24集全",
      pic: { normal: "https://douban.test/supermarket.webp" },
      vendors: [{ title: "哔哩哔哩", url: "https://www.bilibili.com/" }],
    },
    "grand-blue-3": {
      title: "碧蓝之海 第三季",
      original_title: "ぐらんぶる Season 3",
      year: "2026",
      rating: { value: 8.3, count: 800 },
      genres: ["動畫", "喜剧"],
      episodes_count: 24,
      episodes_info: "更新至12集",
      vendors: [],
    },
    niconyanyan: {
      title: "尼古喵喵",
      original_title: "Nico Nyan Nyan",
      year: "2026",
      genres: ["动画"],
      episodes_count: 12,
      episodes_info: "12集全",
      vendors: [],
    },
    "new-ghost-in-shell": {
      title: "新攻壳机动队",
      original_title: "THE GHOST IN THE SHELL",
      year: "2026",
      genres: ["动画", "科幻"],
      episodes_count: 12,
      episodes_info: "更新至3集",
      vendors: [],
    },
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createAnimationCatalogFetch({ hits, details });

  try {
    const first = await importDoubanCatalog({ limit: 4 });
    const second = await importDoubanCatalog({ limit: 4 });
    for (const summary of [first, second]) {
      assert.equal(summary.total, 4);
      assert.equal(summary.routedToAnime, 4);
      assert.equal(summary.matchedAnimation, 2);
      assert.equal(summary.reclassifiedAnimation, 0);
      assert.equal(summary.skippedAnimeUnmatched, 2);
      assert.equal(summary.conflicts, 0);
      assert.equal(summary.created, 0);
    }
  } finally {
    globalThis.fetch = previousFetch;
  }

  const verify = new Database(dbPath);
  assert.equal(
    (verify.prepare("select count(*) as count from anime").get() as {
      count: number;
    }).count,
    2,
  );
  assert.deepEqual(
    verify
      .prepare(
        `select title, title_ja as titleJa, cover_url as coverUrl, synopsis,
                total_episodes as totalEpisodes, douban_id as doubanId
         from anime where id=201`,
      )
      .get(),
    {
      title: "在超市后门吸烟的二人",
      titleJa: "スーパーの裏でヤニ吸うふたり",
      coverUrl: "https://local.test/supermarket.webp",
      synopsis: "本地简介",
      totalEpisodes: 12,
      doubanId: "supermarket-smoking",
    },
  );
  assert.deepEqual(
    verify
      .prepare(
        `select count(*) as count, min(number) as first, max(number) as last
         from episodes where anime_id=201`,
      )
      .get(),
    { count: 12, first: 13, last: 24 },
  );
  assert.deepEqual(
    verify
      .prepare(
        `select count(*) as count, min(number) as first, max(number) as last
         from episodes where anime_id=202`,
      )
      .get(),
    { count: 1, first: 25, last: 25 },
  );
  assert.equal(
    (
      verify
        .prepare(
          "select count(*) as count from anime where douban_id in ('niconyanyan', 'new-ghost-in-shell')",
        )
        .get() as { count: number }
    ).count,
    0,
  );
  verify.close();
});

test("Bangumi title aliases can uniquely connect a Douban animation to local anime", async () => {
  const { importDoubanCatalog } = await import("../src/lib/cinema-enrich");
  resetDatabase(`
    insert into anime
      (id, title, type, status, media_type, year, bangumi_id)
    values
      (210, '本地正式名', 'TV', 'airing', 'anime', 2026, 500210);
  `);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createAnimationCatalogFetch({
    hits: [{ id: "alias-only", title: "豆瓣独有译名", rate: "7.9" }],
    details: {
      "alias-only": {
        title: "豆瓣独有译名",
        original_title: "Alias Only Animation",
        year: "2026",
        genres: ["动画"],
        vendors: [],
      },
    },
    bangumiSubjects: {
      "500210": {
        name: "Local Canonical Name",
        name_cn: "本地正式名",
        infobox: [{ key: "别名", value: [{ v: "豆瓣独有译名" }] }],
      },
    },
  });

  try {
    const summary = await importDoubanCatalog({ limit: 1 });
    assert.equal(summary.matchedAnimation, 1);
    assert.equal(summary.conflicts, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }

  const verify = new Database(dbPath);
  assert.equal(
    (
      verify
        .prepare("select douban_id as doubanId from anime where id=210")
        .get() as { doubanId: string }
    ).doubanId,
    "alias-only",
  );
  verify.close();
});

test("duplicate exact Douban IDs are reported as conflicts without an arbitrary write", async () => {
  const { importDoubanCatalog } = await import("../src/lib/cinema-enrich");
  resetDatabase(`
    insert into anime
      (id, title, type, status, media_type, year, douban_id)
    values
      (220, '重复 ID 动画 A', 'TV', 'airing', 'anime', 2026, 'duplicate-id'),
      (221, '重复 ID 动画 B', 'TV', 'airing', 'drama', 2026, 'duplicate-id');
  `);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createAnimationCatalogFetch({
    hits: [{ id: "duplicate-id", title: "重复 ID 动画 A", rate: "8.0" }],
    details: {
      "duplicate-id": {
        title: "重复 ID 动画 A",
        year: "2026",
        genres: ["动画"],
        vendors: [],
      },
    },
  });

  try {
    const summary = await importDoubanCatalog({ limit: 1 });
    assert.equal(summary.routedToAnime, 1);
    assert.equal(summary.conflicts, 1);
    assert.equal(summary.matchedAnimation, 0);
    assert.equal(summary.reclassifiedAnimation, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }

  const verify = new Database(dbPath);
  assert.deepEqual(
    verify
      .prepare(
        `select id, media_type as mediaType, douban_rating_fetched_at as fetchedAt
         from anime order by id`,
      )
      .all(),
    [
      { id: 220, mediaType: "anime", fetchedAt: null },
      { id: 221, mediaType: "drama", fetchedAt: null },
    ],
  );
  verify.close();
});

test("multiple title-year anime candidates cause a merge conflict", async () => {
  const { importDoubanCatalog } = await import("../src/lib/cinema-enrich");
  resetDatabase(`
    insert into anime
      (id, title, type, status, media_type, year)
    values
      (230, '多候选动画', 'TV', 'airing', 'anime', 2026),
      (231, '多候选动画', 'TV', 'airing', 'anime', 2026);
  `);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createAnimationCatalogFetch({
    hits: [{ id: "multiple-candidates", title: "多候选动画", rate: "8.0" }],
    details: {
      "multiple-candidates": {
        title: "多候选动画",
        year: "2026",
        genres: ["动画"],
        vendors: [],
      },
    },
  });

  try {
    const summary = await importDoubanCatalog({ limit: 1 });
    assert.equal(summary.conflicts, 1);
    assert.equal(summary.matchedAnimation, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }

  const verify = new Database(dbPath);
  assert.deepEqual(
    verify
      .prepare("select id, douban_id as doubanId from anime order by id")
      .all(),
    [
      { id: 230, doubanId: null },
      { id: 231, doubanId: null },
    ],
  );
  verify.close();
});

test("a unique title candidate with another Douban ID conflicts without metadata writes", async () => {
  const { importDoubanCatalog } = await import("../src/lib/cinema-enrich");
  const originalProviders = JSON.stringify([
    {
      region: "CN",
      providers: [{ providerId: 1, providerName: "旧平台", type: "flatrate" }],
      fetchedAt: 1,
    },
  ]);
  resetDatabase(`
    insert into anime
      (id, title, type, status, media_type, year, douban_id, douban_rating,
       douban_rating_fetched_at, total_episodes, tags, watch_providers)
    values
      (235, '旧豆瓣 ID 动画', 'TV', 'airing', 'anime', 2026,
       'old-douban-id', 7.1, 1, 12, json('["旧题材"]'),
       '${originalProviders.replaceAll("'", "''")}');
    insert into episodes
      (id, anime_id, number, title, is_downloaded)
    values
      (2351, 235, 13, '保留的 Bangumi 剧集', 0);
  `);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createAnimationCatalogFetch({
    hits: [{ id: "new-douban-id", title: "旧豆瓣 ID 动画", rate: "9.2" }],
    details: {
      "new-douban-id": {
        title: "旧豆瓣 ID 动画",
        year: "2026",
        rating: { value: 9.2, count: 9999 },
        genres: ["动画", "新题材"],
        episodes_count: 24,
        episodes_info: "24集全",
        vendors: [{ title: "新平台", url: "https://new.example/" }],
      },
    },
  });

  try {
    const summary = await importDoubanCatalog({ limit: 1 });
    assert.equal(summary.conflicts, 1);
    assert.equal(summary.matchedAnimation, 0);
    assert.equal(summary.reclassifiedAnimation, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }

  const verify = new Database(dbPath);
  assert.deepEqual(
    verify
      .prepare(
        `select douban_id as doubanId, douban_rating as doubanRating,
                douban_rating_fetched_at as fetchedAt,
                total_episodes as totalEpisodes, tags,
                watch_providers as watchProviders
         from anime where id=235`,
      )
      .get(),
    {
      doubanId: "old-douban-id",
      doubanRating: 7.1,
      fetchedAt: 1,
      totalEpisodes: 12,
      tags: JSON.stringify(["旧题材"]),
      watchProviders: originalProviders,
    },
  );
  assert.deepEqual(
    verify
      .prepare(
        "select id, number, title from episodes where anime_id=235 order by id",
      )
      .all(),
    [{ id: 2351, number: 13, title: "保留的 Bangumi 剧集" }],
  );
  verify.close();
});

test("an exact Douban drama plus a separate canonical anime is left as a merge conflict", async () => {
  const { importDoubanCatalog } = await import("../src/lib/cinema-enrich");
  resetDatabase(`
    insert into anime
      (id, title, type, status, media_type, year, douban_id)
    values
      (240, '双行动画', 'TV', 'airing', 'drama', 2026, 'drama-anime-double'),
      (241, '双行动画', 'TV', 'airing', 'anime', 2026, null);
  `);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createAnimationCatalogFetch({
    hits: [{ id: "drama-anime-double", title: "双行动画", rate: "8.0" }],
    details: {
      "drama-anime-double": {
        title: "双行动画",
        year: "2026",
        genres: ["动画"],
        vendors: [],
      },
    },
  });

  try {
    const summary = await importDoubanCatalog({ limit: 1 });
    assert.equal(summary.conflicts, 1);
    assert.equal(summary.reclassifiedAnimation, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }

  const verify = new Database(dbPath);
  assert.deepEqual(
    verify
      .prepare(
        `select id, media_type as mediaType, douban_id as doubanId
         from anime order by id`,
      )
      .all(),
    [
      { id: 240, mediaType: "drama", doubanId: "drama-anime-double" },
      { id: 241, mediaType: "anime", doubanId: null },
    ],
  );
  verify.close();
});

test("unclassified Douban TV is skipped when detail genres are unavailable", async () => {
  const { importDoubanCatalog } = await import("../src/lib/cinema-enrich");
  const sqlite = new Database(dbPath);
  sqlite.exec(`
    delete from download_queue;
    delete from playback_progress;
    delete from watch_events;
    delete from user_anime;
    delete from episodes;
    delete from anime;
  `);
  sqlite.close();

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/j/search_subjects")) {
      const type = url.searchParams.get("type");
      const tag = url.searchParams.get("tag");
      const subjects =
        type === "tv" && tag === "热门"
          ? [{ id: "unknown-tv", title: "分类待确认", rate: "7.0" }]
          : [];
      return new Response(JSON.stringify({ subjects }), { status: 200 });
    }
    return new Response("upstream unavailable", { status: 503 });
  };

  let summary;
  try {
    summary = await importDoubanCatalog({ limit: 1 });
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(summary.created, 0);
  assert.equal(summary.routedToAnime, 0);
  assert.equal(summary.skippedUnclassified, 1);
  const verify = new Database(dbPath);
  assert.equal(
    (verify.prepare("select count(*) as count from anime").get() as {
      count: number;
    }).count,
    0,
  );
  verify.close();
});

test("TV catalog rechecks exact IDs even when fetchedAt and non-Douban tags exist", async () => {
  const { importDoubanCatalog } = await import("../src/lib/cinema-enrich");
  const sqlite = new Database(dbPath);
  sqlite.exec(`
    delete from download_queue;
    delete from playback_progress;
    delete from watch_events;
    delete from user_anime;
    delete from episodes;
    delete from anime;
    insert into anime
      (id, title, type, status, media_type, douban_id,
       douban_rating_fetched_at, tags)
    values
      (35, '集合外动画', 'TV', 'airing', 'drama', 'outside-animation-set',
       1783796000, json('["动作冒险"]'));
  `);
  sqlite.close();

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/j/search_subjects")) {
      const type = url.searchParams.get("type");
      const tag = url.searchParams.get("tag");
      const subjects =
        type === "tv" && tag === "热门"
          ? [
              {
                id: "outside-animation-set",
                title: "集合外动画",
                rate: "7.6",
              },
            ]
          : [];
      return new Response(JSON.stringify({ subjects }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        title: "集合外动画",
        year: "2026",
        genres: ["动画"],
        episodes_count: 12,
        episodes_info: "12集全",
        vendors: [],
      }),
      { status: 200 },
    );
  };

  try {
    const summary = await importDoubanCatalog({ limit: 1 });
    assert.equal(summary.reclassifiedAnimation, 1);
    assert.equal(summary.routedToAnime, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }

  const verify = new Database(dbPath);
  assert.equal(
    (
      verify
        .prepare("select media_type as mediaType from anime where id=35")
        .get() as { mediaType: string }
    ).mediaType,
    "anime",
  );
  verify.close();
});

test("Douban placeholders are additive and cinema detail keeps declared totals", async () => {
  const { syncDoubanEpisodePlaceholders } = await import(
    "../src/lib/cinema-enrich"
  );
  const sqlite = new Database(dbPath);
  sqlite.exec(`
    delete from download_queue;
    delete from episodes;
    delete from anime;
    insert into anime
      (id, title, type, status, total_episodes, media_type, douban_id)
    values
      (1, '更新中的剧', 'TV', 'airing', 32, 'drama', '123456');
    insert into episodes
      (id, anime_id, number, title, aired_at, is_downloaded)
    values
      (101, 1, 1, '保留的第一集标题', 1780000000, 1);
  `);
  sqlite.close();

  assert.equal(syncDoubanEpisodePlaceholders(1, 13), 12);
  assert.equal(syncDoubanEpisodePlaceholders(1, 13), 0);

  const verify = new Database(dbPath);
  assert.deepEqual(
    verify
      .prepare(
        "select id, title, aired_at as airedAt, is_downloaded as isDownloaded from episodes where anime_id=1 and number=1",
      )
      .get(),
    {
      id: 101,
      title: "保留的第一集标题",
      airedAt: 1780000000,
      isDownloaded: 1,
    },
  );
  assert.deepEqual(
    verify
      .prepare(
        "select count(*) as count, max(number) as highest from episodes where anime_id=1",
      )
      .get(),
    { count: 13, highest: 13 },
  );
  verify.close();

  const { getAnimeDetail } = await import("../src/lib/db-helpers/library");
  const detail = getAnimeDetail(1, "missing-user");
  assert.ok(detail);
  assert.equal(detail.episodes.length, 13);
  assert.equal(detail.anime.totalEpisodes, 32);
});

test("cinema detail copy reports source availability without a permanent TMDB gate", () => {
  const source = readFileSync(
    "src/app/(main)/anime/[id]/CinemaDetail.tsx",
    "utf8",
  );

  assert.match(source, /const metadataAttempted = anime\.doubanRatingFetchedAt != null/);
  assert.match(source, /!isMovie && episodes\.length === 0/);
  assert.doesNotMatch(source, /anime\.tmdbId == null/);
  assert.match(source, /豆瓣当前未提供正版平台数据/);
  assert.match(source, /补全资料后会尝试同步可用剧集/);
  assert.doesNotMatch(source, /从 TMDB 同步播出日期/);
});
