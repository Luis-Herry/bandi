import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import { buildYucSourceKey } from "../src/lib/yuc/parser";
import type { YucEntry, YucSourceKind } from "../src/lib/yuc/types";

const tempDir = mkdtempSync(join(tmpdir(), "bandi-yuc-identity-"));
const dbPath = join(tempDir, "identity.db");
process.env.DATABASE_URL = dbPath;

type IdentityModule = typeof import("../src/lib/yuc/identity");
let identityModule: Promise<IdentityModule> | null = null;

async function identities(): Promise<IdentityModule> {
  identityModule ??= import("../src/lib/yuc/identity");
  return identityModule;
}

async function resetDb(): Promise<void> {
  await identities();
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    delete from app_settings;
    delete from anime;
    delete from sqlite_sequence where name = 'anime';
  `);
  sqlite.close();
}

beforeEach(resetDb);

const sourceUrlByKind: Record<YucSourceKind, string> = {
  season: "https://yuc.wiki/202607/",
  future: "https://yuc.wiki/new/",
  special: "https://yuc.wiki/sp/",
  movie: "https://yuc.wiki/movie/",
};

function entryOf(overrides: Partial<YucEntry> = {}): YucEntry {
  const sourceKind = overrides.sourceKind ?? "season";
  const sourceUrl = overrides.sourceUrl ?? sourceUrlByKind[sourceKind];
  const title = overrides.title ?? "测试动画";
  const titleJa = overrides.titleJa === undefined ? "テストアニメ" : overrides.titleJa;
  return {
    sourceKey:
      overrides.sourceKey ??
      buildYucSourceKey(sourceKind, sourceUrl, title, titleJa),
    sourceKind,
    sourceUrl,
    title,
    titleJa,
    coverUrl: null,
    premiereRaw: null,
    premiereDate: null,
    weeklyDay: null,
    weeklyTime: null,
    scheduleRaw: null,
    totalEpisodes: null,
    format: sourceKind === "movie" ? "Movie" : "TV",
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

function insertAnime(values: {
  title: string;
  titleJa?: string | null;
  type?: "TV" | "Movie" | "OVA" | "Web";
  year?: number | null;
  mediaType?: "anime" | "drama" | "movie";
}): number {
  const sqlite = new Database(dbPath);
  const result = sqlite
    .prepare(
      `insert into anime (title, title_ja, type, status, year, media_type)
       values (?, ?, ?, 'airing', ?, ?)`,
    )
    .run(
      values.title,
      values.titleJa ?? null,
      values.type ?? "TV",
      values.year ?? 2026,
      values.mediaType ?? "anime",
    );
  sqlite.close();
  return Number(result.lastInsertRowid);
}

test("YUC-only movie creation preserves anime format and schedule metadata", async () => {
  const identity = await identities();
  const movie = entryOf({
    sourceKind: "movie",
    sourceUrl: sourceUrlByKind.movie,
    title: "剧场版测试",
    titleJa: "劇場版テスト",
    coverUrl: "https://i0.hdslb.com/bfs/bangumi/test.jpg",
    premiereRaw: "2025/10/03上映",
    premiereDate: "2025-10-03",
    weeklyDay: 5,
    weeklyTime: "25:30",
    totalEpisodes: 1,
    format: "Movie",
    tags: ["原创", "动画", "原创"],
    seasonYear: 2025,
    seasonMonth: 10,
  });

  const first = identity.resolveYucAnime(movie);
  const second = identity.resolveYucAnime(movie);

  assert.equal(first.created, true);
  assert.equal(first.matchedBy, "created");
  assert.equal(second.created, false);
  assert.equal(second.matchedBy, "identity");
  assert.equal(second.anime.id, first.anime.id);

  const sqlite = new Database(dbPath);
  assert.deepEqual(
    sqlite
      .prepare(
        `select title_ja as titleJa, cover_url as coverUrl, type, status,
                total_episodes as totalEpisodes, airing_day as airingDay,
                airing_time as airingTime, season, year, tags, media_type as mediaType
         from anime where id = ?`,
      )
      .get(first.anime.id),
    {
      titleJa: "劇場版テスト",
      coverUrl: "https://i0.hdslb.com/bfs/bangumi/test.jpg",
      type: "Movie",
      status: "completed",
      totalEpisodes: 1,
      airingDay: 5,
      airingTime: "25:30",
      season: "fall",
      year: 2025,
      tags: JSON.stringify(["原创", "动画"]),
      mediaType: "anime",
    },
  );
  assert.equal(sqlite.prepare("select count(*) from anime").pluck().get(), 1);
  assert.equal(sqlite.prepare("select count(*) from app_settings").pluck().get(), 1);
  sqlite.close();

  assert.deepEqual(identity.getYucIdentity(movie.sourceKey), first.identity);
  assert.deepEqual(identity.listYucIdentitiesForAnime(first.anime.id), [first.identity]);
  assert.equal(
    identity.parseYucIdentityRecord(first.identity, movie.sourceKey)?.animeId,
    first.anime.id,
  );
  assert.equal(
    identity.parseYucIdentityRecord({ ...first.identity, sourceUrl: "https://example.com/" }),
    null,
  );
});

test("same-year same-format title variants reuse one local anime row", async () => {
  const localId = insertAnime({
    title: "葬送的芙莉蓮",
    titleJa: "葬送のフリーレン",
    type: "TV",
    year: 2026,
  });
  {
    const sqlite = new Database(dbPath);
    sqlite
      .prepare("update anime set bangumi_id = ?, douban_id = ? where id = ?")
      .run(123456, "37315819", localId);
    sqlite.close();
  }
  const identity = await identities();
  const seasonal = entryOf({
    sourceKind: "season",
    sourceUrl: "https://yuc.wiki/202604/",
    title: "葬送的芙莉莲",
    titleJa: "葬送のフリーレン",
    seasonYear: 2026,
    seasonMonth: 4,
    format: "TV",
  });
  const future = entryOf({
    sourceKind: "future",
    sourceUrl: sourceUrlByKind.future,
    title: "葬送的芙莉莲",
    titleJa: "葬送のフリーレン",
    seasonYear: 2026,
    seasonMonth: 4,
    format: "TV",
  });

  const first = identity.resolveYucAnime(seasonal);
  const second = identity.resolveYucAnime(future);

  assert.equal(first.anime.id, localId);
  assert.equal(first.matchedBy, "local");
  assert.equal(second.anime.id, localId);
  assert.equal(second.matchedBy, "identity");
  assert.equal(identity.listYucIdentitiesForAnime(localId).length, 2);
  assert.equal(
    identity.findUniqueYucIdentityAnimeId(identity.listYucIdentities(), {
      title: "葬送的芙莉蓮",
      titleJa: "葬送のフリーレン",
      year: 2026,
      format: "TV",
    }),
    localId,
  );
  assert.equal(
    identity.findUniqueBoundAnimeForYucTarget({
      title: "葬送的芙莉莲",
      titleJa: "葬送のフリーレン",
      year: 2026,
      format: "TV",
    })?.id,
    localId,
  );

  const sqlite = new Database(dbPath);
  assert.equal(sqlite.prepare("select count(*) from anime").pluck().get(), 1);
  assert.deepEqual(
    sqlite
      .prepare(
        "select bangumi_id as bangumiId, douban_id as doubanId from anime where id = ?",
      )
      .get(localId),
    { bangumiId: 123456, doubanId: "37315819" },
  );
  sqlite.close();
});

test("a formatless future entry reuses one same-year local Douban anime", async () => {
  const localId = insertAnime({
    title: "卫星动画",
    titleJa: "サテライトアニメ",
    type: "TV",
    year: 2026,
  });
  const sqlite = new Database(dbPath);
  sqlite
    .prepare("update anime set douban_id = ? where id = ?")
    .run("98765432", localId);
  sqlite.close();

  const identity = await identities();
  const future = entryOf({
    sourceKind: "future",
    sourceUrl: sourceUrlByKind.future,
    title: "卫星动画",
    titleJa: "サテライトアニメ",
    format: null,
    seasonYear: 2026,
    seasonMonth: 10,
  });
  const result = identity.resolveYucAnime(future);

  assert.equal(result.anime.id, localId);
  assert.equal(result.matchedBy, "local");
  assert.equal(result.identity.format, "TV");
  const verify = new Database(dbPath);
  assert.equal(verify.prepare("select count(*) from anime").pluck().get(), 1);
  assert.equal(
    verify.prepare("select douban_id from anime where id = ?").pluck().get(localId),
    "98765432",
  );
  verify.close();
});

test("movie release years reuse one exact original work across years", async () => {
  const mononokeId = insertAnime({
    title: "幽灵公主",
    titleJa: "もののけ姫",
    type: "Movie",
    year: 1997,
  });
  const yourNameId = insertAnime({
    title: "你的名字",
    titleJa: "君の名は。",
    type: "Movie",
    year: 2016,
  });
  const identity = await identities();
  const mononoke = entryOf({
    sourceKind: "movie",
    sourceUrl: sourceUrlByKind.movie,
    title: "幽灵公主",
    titleJa: "もののけ姫",
    format: "Movie",
    premiereDate: "2025-05-01",
    seasonYear: 2025,
    seasonMonth: 5,
  });
  const yourName = entryOf({
    sourceKind: "movie",
    sourceUrl: sourceUrlByKind.movie,
    title: "你的名字（重映）",
    titleJa: "君の名は。",
    format: "Movie",
    premiereRaw: "2025/7/19重映",
    premiereDate: "2025-07-19",
    seasonYear: 2025,
    seasonMonth: 7,
  });

  const first = identity.resolveYucAnime(mononoke);
  const second = identity.resolveYucAnime(yourName);
  assert.equal(first.anime.id, mononokeId);
  assert.equal(first.identity.year, 1997);
  assert.equal(second.anime.id, yourNameId);
  assert.equal(second.identity.year, 2016);

  const verify = new Database(dbPath);
  assert.equal(verify.prepare("select count(*) from anime").pluck().get(), 2);
  verify.close();
});

test("ambiguous cross-year movies and unmatched re-releases fail closed", async () => {
  insertAnime({ title: "同名电影", type: "Movie", year: 1990 });
  insertAnime({ title: "同名电影", type: "Movie", year: 2020 });
  const identity = await identities();
  const ambiguous = entryOf({
    sourceKind: "movie",
    sourceUrl: sourceUrlByKind.movie,
    title: "同名电影",
    titleJa: null,
    format: "Movie",
    seasonYear: 2025,
  });
  assert.throws(
    () => identity.resolveYucAnime(ambiguous),
    identity.YucIdentityConflictError,
  );

  const reRelease = entryOf({
    sourceKind: "movie",
    sourceUrl: sourceUrlByKind.movie,
    title: "没有本地条目的作品（重映）",
    titleJa: null,
    format: "Movie",
    premiereRaw: "2025/8/1重映",
    seasonYear: 2025,
  });
  assert.throws(
    () => identity.resolveYucAnime(reRelease),
    identity.YucIdentityConflictError,
  );
  const verify = new Database(dbPath);
  assert.equal(verify.prepare("select count(*) from anime").pluck().get(), 2);
  assert.equal(verify.prepare("select count(*) from app_settings").pluck().get(), 0);
  verify.close();
});

test("later Bangumi sync reuses the YUC-created anime id", async () => {
  const identity = await identities();
  const source = entryOf({
    title: "迟到的 Bangumi 条目",
    titleJa: "遅れてきた作品",
    format: "TV",
  });
  const created = identity.resolveYucAnime(source);
  const beforeSync = new Database(dbPath);
  const episodeId = Number(
    beforeSync
      .prepare(
        "insert into episodes (anime_id, number, title, is_downloaded) values (?, 1, 'Local episode', 1)",
      )
      .run(created.anime.id).lastInsertRowid,
  );
  beforeSync
    .prepare(
      `insert into download_queue (
        anime_id, episode_id, title, magnet_url, status, progress
      ) values (?, ?, 'Local episode', 'local-file:D%3A%2FAnime%2F01.mkv', 'completed', 100)`,
    )
    .run(created.anime.id, episodeId);
  beforeSync.close();
  const { syncFromBangumi } = await import("../src/db/queries/anime");

  const synced = await syncFromBangumi(778899, {
    getSubject: async () => ({
      id: 778899,
      type: 2,
      name: "遅れてきた作品",
      name_cn: "迟到的 Bangumi 条目",
      date: "2026-07-05",
      platform: "TV",
      eps: 12,
      tags: [{ name: "动画", count: 1 }],
    }),
    getEpisodes: async () => [
      {
        id: 1,
        type: 0,
        name: "Episode 1",
        name_cn: "第一集",
        sort: 1,
        airdate: "2026-07-05",
      },
      {
        id: 2,
        type: 0,
        name: "Episode 2",
        name_cn: "第二集",
        sort: 2,
        airdate: "2026-07-12",
      },
    ],
  });

  assert.deepEqual(synced, { animeId: created.anime.id, created: false });
  const sqlite = new Database(dbPath);
  assert.equal(sqlite.prepare("select count(*) from anime").pluck().get(), 1);
  assert.deepEqual(
    sqlite
      .prepare(
        "select id, bangumi_id as bangumiId, media_type as mediaType from anime",
      )
      .get(),
    { id: created.anime.id, bangumiId: 778899, mediaType: "anime" },
  );
  assert.deepEqual(
    sqlite
      .prepare(
        `select id, title, is_downloaded as isDownloaded
         from episodes where anime_id = ? order by number`,
      )
      .all(created.anime.id),
    [
      { id: episodeId, title: "第一集", isDownloaded: 1 },
      { id: episodeId + 1, title: "第二集", isDownloaded: 0 },
    ],
  );
  assert.equal(
    sqlite
      .prepare("select episode_id from download_queue where anime_id = ?")
      .pluck()
      .get(created.anime.id),
    episodeId,
  );
  sqlite.close();
});

test("wrong year, format, and media category are excluded from local reuse", async () => {
  insertAnime({ title: "测试动画", type: "TV", year: 2025, mediaType: "anime" });
  insertAnime({ title: "测试动画", type: "Movie", year: 2026, mediaType: "anime" });
  insertAnime({ title: "测试动画", type: "TV", year: 2026, mediaType: "drama" });
  const identity = await identities();

  const result = identity.resolveYucAnime(entryOf());
  assert.equal(result.created, true);
  assert.equal(result.anime.type, "TV");
  assert.equal(result.anime.mediaType, "anime");

  const sqlite = new Database(dbPath);
  assert.equal(sqlite.prepare("select count(*) from anime").pluck().get(), 4);
  sqlite.close();
});

test("ambiguous local matches fail closed without writing an identity", async () => {
  insertAnime({ title: "测试动画", titleJa: "テストアニメ" });
  insertAnime({ title: "测试动画", titleJa: "テストアニメ" });
  const identity = await identities();

  assert.throws(
    () => identity.resolveYucAnime(entryOf()),
    identity.YucIdentityConflictError,
  );

  const sqlite = new Database(dbPath);
  assert.equal(sqlite.prepare("select count(*) from anime").pluck().get(), 2);
  assert.equal(sqlite.prepare("select count(*) from app_settings").pluck().get(), 0);
  sqlite.close();
});

test("an exact source key cannot be rebound to another anime row", async () => {
  const firstId = insertAnime({ title: "测试动画", titleJa: "テストアニメ" });
  const identity = await identities();
  const entry = entryOf();

  const first = identity.bindYucIdentity(entry, firstId);
  assert.equal(first.animeId, firstId);
  const secondId = insertAnime({ title: "测试动画", titleJa: "テストアニメ" });
  assert.throws(
    () => identity.bindYucIdentity(entry, secondId),
    identity.YucIdentityConflictError,
  );
  assert.equal(identity.getYucIdentity(entry.sourceKey)?.animeId, firstId);
  assert.equal(identity.getYucIdentity("invalid-source-key"), null);
});

test("pure bound-candidate matching collapses duplicate pages and rejects competing ids", async () => {
  const identity = await identities();
  const source = entryOf();
  const record = {
    version: 1 as const,
    sourceKey: source.sourceKey,
    animeId: 1,
    sourceKind: source.sourceKind,
    sourceUrl: source.sourceUrl,
    title: source.title,
    titleJa: source.titleJa,
    year: 2026,
    format: "TV" as const,
  };
  const target = { title: source.title, titleJa: source.titleJa, year: 2026, format: "TV" };

  assert.equal(
    identity.findUniqueYucIdentityAnimeId([record, { ...record }], target),
    1,
  );
  assert.throws(
    () =>
      identity.findUniqueYucIdentityAnimeId(
        [record, { ...record, animeId: 2 }],
        target,
      ),
    identity.YucIdentityConflictError,
  );
  assert.equal(
    identity.findUniqueYucIdentityAnimeId([record], { ...target, year: 2025 }),
    null,
  );
  assert.equal(
    identity.findUniqueYucIdentityAnimeId([record], { ...target, format: "Movie" }),
    null,
  );
  assert.equal(
    identity.findUniqueYucIdentityAnimeId([record], {
      title: `${source.title} 完整副标题`,
      titleJa: `${source.titleJa} 完整副标题`,
      year: 2026,
      format: "TV",
    }),
    1,
  );
});

test("forged YUC evidence is rejected before database writes", async () => {
  const identity = await identities();
  const forged = entryOf({ sourceUrl: "https://example.com/202607/" });
  assert.throws(
    () => identity.resolveYucAnime(forged),
    identity.YucIdentityValidationError,
  );

  const sqlite = new Database(dbPath);
  assert.equal(sqlite.prepare("select count(*) from anime").pluck().get(), 0);
  assert.equal(sqlite.prepare("select count(*) from app_settings").pluck().get(), 0);
  sqlite.close();
});

test("one malformed identity record cannot block valid identity enumeration", async () => {
  const identity = await identities();
  const source = entryOf();
  const sqlite = new Database(dbPath);
  sqlite
    .prepare("insert into app_settings (key, value) values (?, ?)")
    .run(`${identity.YUC_IDENTITY_SETTING_PREFIX}${source.sourceKey}`, '{"bad":true}');
  sqlite.close();

  assert.deepEqual(identity.listYucIdentities(), []);
});
