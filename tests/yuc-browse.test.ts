import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import type { BgmSubject } from "../src/lib/bangumi";
import { buildYucSourceKey } from "../src/lib/yuc/parser";
import type { YucEntry } from "../src/lib/yuc/types";

const tempDir = mkdtempSync(join(tmpdir(), "bandi-yuc-browse-"));
const dbPath = join(tempDir, "browse.db");
process.env.DATABASE_URL = dbPath;

type BrowseModule = typeof import("../src/lib/db-helpers/browse");
let modulePromise: Promise<BrowseModule> | null = null;

async function browse(): Promise<BrowseModule> {
  modulePromise ??= import("../src/lib/db-helpers/browse");
  return modulePromise;
}

beforeEach(async () => {
  await browse();
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    delete from user_anime;
    delete from app_settings;
    delete from anime;
    delete from users;
    insert into users (id, username, password_hash) values ('u1', 'tester', 'x');
  `);
  sqlite.close();
});

function subject(overrides: Partial<BgmSubject> = {}): BgmSubject {
  return {
    id: 100,
    type: 2,
    name: "魔女のエリー",
    name_cn: "魔女艾莉",
    date: "2026-07-04",
    platform: "TV",
    total_episodes: 12,
    rating: { score: 8.1 },
    tags: [{ name: "奇幻", count: 20 }],
    ...overrides,
  };
}

function yucEntry(overrides: Partial<YucEntry> = {}): YucEntry {
  const sourceKind = overrides.sourceKind ?? "season";
  const sourceUrl =
    overrides.sourceUrl ??
    (sourceKind === "movie"
      ? "https://yuc.wiki/movie/"
      : "https://yuc.wiki/202607/");
  const title = overrides.title ?? "魔女艾莉";
  const titleJa = overrides.titleJa === undefined ? "魔女のエリー" : overrides.titleJa;
  return {
    sourceKey:
      overrides.sourceKey ??
      buildYucSourceKey(sourceKind, sourceUrl, title, titleJa),
    sourceKind,
    sourceUrl,
    title,
    titleJa,
    coverUrl: "https://i0.hdslb.com/bfs/bangumi/yuc.jpg",
    premiereRaw: "7/4~",
    premiereDate: "2026-07-04",
    weeklyDay: 6,
    weeklyTime: "24:00",
    scheduleRaw: "周六 24:00",
    totalEpisodes: 13,
    format: sourceKind === "movie" ? "Movie" : "TV",
    tags: ["小说改"],
    staff: [],
    cast: ["声优A"],
    studio: "动画工房",
    original: "原作者",
    officialUrl: "https://example-anime.jp/",
    pvUrl: "https://www.youtube.com/watch?v=1",
    providers: [
      {
        label: "港台",
        service: "巴哈姆特动画疯",
        url: "https://ani.gamer.com.tw/animeVideo.php?sn=1",
      },
    ],
    seasonYear: 2026,
    seasonMonth: 7,
    ...overrides,
  };
}

test("seasonal browse merges one reliable YUC work into its Bangumi card", async () => {
  const { buildSeasonalBrowseItems } = await browse();
  const items = buildSeasonalBrowseItems(
    "u1",
    [subject({ total_episodes: undefined })],
    [yucEntry()],
    2026,
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].itemKey, "bgm:100");
  assert.equal(items[0].bangumiId, 100);
  assert.match(items[0].yucKey ?? "", /^yuc:season:202607:/u);
  assert.deepEqual(items[0].sources, ["bangumi", "yuc"]);
  assert.equal(items[0].episodes, 13);
  assert.equal(items[0].airingDay, 6);
  assert.equal(items[0].airingTime, "24:00");
  assert.deepEqual(items[0].tags, ["奇幻", "小说改"]);
});

test("YUC-only animation movies remain independent anime catalog cards", async () => {
  const { buildSeasonalBrowseItems } = await browse();
  const movie = yucEntry({
    sourceKind: "movie",
    sourceUrl: "https://yuc.wiki/movie/",
    title: "独立动画电影",
    titleJa: "独立アニメ映画",
    weeklyDay: null,
    weeklyTime: null,
    totalEpisodes: 1,
    format: "Movie",
  });
  const items = buildSeasonalBrowseItems("u1", [subject()], [movie], 2026);

  assert.equal(items.length, 2);
  const yucOnly = items.find((item) => item.yucKey === movie.sourceKey);
  assert.ok(yucOnly);
  assert.equal(yucOnly.bangumiId, null);
  assert.equal(yucOnly.itemKey, movie.sourceKey);
  assert.equal(yucOnly.platform, "剧场版");
  assert.deepEqual(yucOnly.sources, ["yuc"]);
  assert.ok(yucOnly.tags.includes("日本"));
});

test("format conflicts stay separate and weekly grouping never derives from premiere date", async () => {
  const { buildSeasonalBrowseItems, groupSeasonalBrowseByWeekday } = await browse();
  const movie = yucEntry({
    sourceKind: "movie",
    sourceUrl: "https://yuc.wiki/movie/",
    format: "Movie",
    weeklyDay: null,
    weeklyTime: null,
  });
  const items = buildSeasonalBrowseItems("u1", [subject()], [movie], 2026);

  assert.equal(items.length, 2);
  const groups = groupSeasonalBrowseByWeekday(items);
  assert.deepEqual(
    groups.flatMap((group) => group.items.map((item) => item.itemKey)),
    [],
  );
  const explicit = groupSeasonalBrowseByWeekday([
    { ...items[0], itemKey: "explicit-weekly", airingDay: 6 },
  ]);
  assert.equal(explicit.find((group) => group.day === 6)?.items.length, 1);
});

test("a YUC movie release card reuses one original-year local movie", async () => {
  const sqlite = new Database(dbPath);
  const localId = Number(
    sqlite
      .prepare(
        `insert into anime
          (title, title_ja, type, status, year, media_type, douban_id)
         values (?, ?, 'Movie', 'completed', 1997, 'anime', ?)`,
      )
      .run("幽灵公主", "もののけ姫", "1297359").lastInsertRowid,
  );
  sqlite.close();
  const movie = yucEntry({
    sourceKind: "movie",
    sourceUrl: "https://yuc.wiki/movie/",
    title: "幽灵公主",
    titleJa: "もののけ姫",
    format: "Movie",
    premiereDate: "2025-05-01",
    seasonYear: 2025,
    seasonMonth: 5,
  });
  const { buildSeasonalBrowseItems } = await browse();
  const items = buildSeasonalBrowseItems("u1", [], [movie], 2025);

  assert.equal(items.length, 1);
  assert.equal(items[0].localAnimeId, localId);
  assert.equal(items[0].bangumiId, null);
  assert.deepEqual(items[0].sources, ["yuc", "local"]);
});
