import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import Database from "better-sqlite3";

const SCRIPT = resolve("scripts/migrate-web-to-desktop.mjs");
const WEB_USER_ID = "web-luis-user";
const DESKTOP_USER_ID = "desktop-admin-user";
const RSS_URL = "https://api.animes.garden/feed.xml";
const GRAND_BLUE =
  "[ANi] GRAND BLUE 碧藍之海 3 - 01 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4";
const GIRLFRIENDS =
  "[ANi] 超超超超超喜歡你的 100 個女朋友 - 25 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4";
const SLIME =
  "[ANi] 關於我轉生變成史萊姆這檔事 第四季 - 86 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4";

function encodeLocalFile(path: string) {
  return `local-file:${encodeURIComponent(path)}`;
}

function createSchema(db: Database.Database) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE anime (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bangumi_id INTEGER UNIQUE,
      anilist_id INTEGER,
      title TEXT NOT NULL,
      title_ja TEXT,
      cover_url TEXT,
      synopsis TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'airing',
      total_episodes INTEGER,
      airing_day INTEGER,
      airing_time TEXT,
      season TEXT,
      year INTEGER,
      tags TEXT,
      accent_color TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      media_type TEXT NOT NULL DEFAULT 'anime',
      tmdb_id INTEGER,
      douban_id TEXT,
      imdb_id TEXT,
      tmdb_rating REAL,
      douban_rating REAL,
      douban_rating_fetched_at INTEGER,
      watch_providers TEXT,
      is_adult INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE user_anime (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      anime_id INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      watch_status TEXT NOT NULL DEFAULT 'watching',
      current_episode INTEGER NOT NULL DEFAULT 0,
      rating INTEGER,
      notes TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, anime_id)
    );
    CREATE TABLE episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anime_id INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      title TEXT,
      aired_at INTEGER,
      is_downloaded INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE watch_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      anime_id INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
      episode INTEGER NOT NULL,
      action TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      watched_at INTEGER NOT NULL
    );
    CREATE TABLE playback_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      anime_id INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
      episode_number INTEGER NOT NULL,
      position_seconds INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      last_played_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, episode_id)
    );
    CREATE TABLE rss_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      filters TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_checked_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE download_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anime_id INTEGER REFERENCES anime(id) ON DELETE SET NULL,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      magnet_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      speed TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX anime_status_idx ON anime(status);
    CREATE INDEX episodes_anime_number_idx ON episodes(anime_id, number);
    CREATE INDEX watch_events_anime_episode_idx ON watch_events(anime_id, episode);
    CREATE INDEX watch_events_user_watched_at_idx ON watch_events(user_id, watched_at);
    CREATE INDEX playback_progress_user_recent_idx ON playback_progress(user_id, last_played_at);
  `);
}

interface Fixture {
  root: string;
  sourceDb: string;
  targetDb: string;
  sourceDownloads: string;
  targetDownloads: string;
  backupDir: string;
}

function createFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "bandi-web-desktop-migration-"));
  const sourceDb = join(root, "web.db");
  const targetDb = join(root, "desktop.db");
  const sourceDownloads = join(root, "web-download");
  const targetDownloads = join(root, "desktop-download");
  const libraryRoot = join(root, "library");
  const backupDir = join(root, "backups");
  mkdirSync(sourceDownloads, { recursive: true });
  mkdirSync(libraryRoot, { recursive: true });

  for (const [index, name] of [GRAND_BLUE, GIRLFRIENDS, SLIME].entries()) {
    writeFileSync(join(sourceDownloads, name), `resource-${index}`);
  }

  const target = new Database(targetDb);
  createSchema(target);
  target
    .prepare(
      "insert into users (id, username, password_hash, created_at) values (?, 'admin', 'desktop-only', 1)",
    )
    .run(DESKTOP_USER_ID);
  target
    .prepare(
      "insert into rss_sources (id, name, url, filters, is_active, created_at) values (1, 'Anime Garden', ?, ?, 1, 1)",
    )
    .run(RSS_URL, JSON.stringify({ quality: "1080p", group: "ANi" }));
  target
    .prepare(
      "insert into app_settings (key, value, updated_at) values ('user_theme', ?, 1)",
    )
    .run(JSON.stringify({ theme: "default" }));
  target
    .prepare("insert into sqlite_sequence (name, seq) values ('anime', 900)")
    .run();
  target.close();

  const source = new Database(sourceDb);
  createSchema(source);
  source
    .prepare(
      "insert into users (id, username, password_hash, created_at) values (?, 'demo', 'web-password', 1)",
    )
    .run(WEB_USER_ID);

  const requiredAnime = [691, 766, 787, 790, 792, 831];
  const animeIds = [...Array.from({ length: 311 }, (_, index) => index + 1), ...requiredAnime];
  const insertAnime = source.prepare(`
    insert into anime
      (id, bangumi_id, title, title_ja, cover_url, synopsis, type, status,
       total_episodes, year, tags, media_type, douban_id, created_at,
       updated_at, is_adult)
    values
      (@id, @bangumiId, @title, @titleJa, @coverUrl, @synopsis, 'TV',
       'airing', @totalEpisodes, 2026, @tags, @mediaType, @doubanId, 1, 1, 0)
  `);
  const animeTransaction = source.transaction(() => {
    for (const id of animeIds) {
      insertAnime.run({
        id,
        bangumiId: id === 787 ? 571784 : id === 792 ? 569116 : null,
        title:
          id === 766
            ? "躲在超市后门抽烟的两人"
            : id === 787
              ? "在超市后门吸烟的二人"
              : id === 792
                ? "碧蓝之海 第三季"
              : `Anime ${id}`,
        titleJa:
          id === 787
            ? "スーパーの裏でヤニ吸うふたり"
            : id === 792
              ? "ぐらんぶる Season 3"
              : null,
        coverUrl: id === 792 ? "https://bangumi.test/grand-blue.webp" : null,
        synopsis: id === 792 ? "Bangumi canonical synopsis" : null,
        totalEpisodes: id === 831 ? 12 : id === 792 ? 0 : null,
        tags: id === 792 ? JSON.stringify(["潜水"]) : null,
        mediaType: id === 766 || id === 691 ? "drama" : "anime",
        doubanId: id === 766 ? "37441858" : null,
      });
    }
  });
  animeTransaction();

  const insertEpisode = source.prepare(
    "insert into episodes (id, anime_id, number, is_downloaded) values (?, ?, ?, 0)",
  );
  const episodeTransaction = source.transaction(() => {
    for (let id = 1; id <= 1414; id += 1) {
      insertEpisode.run(id, 1, id);
    }
    insertEpisode.run(2052, 790, 1);
    insertEpisode.run(2076, 792, 1);
    insertEpisode.run(2595, 831, 25);
  });
  episodeTransaction();

  const insertUserAnime = source.prepare(`
    insert into user_anime
      (id, user_id, anime_id, watch_status, current_episode, updated_at)
    values (?, ?, ?, ?, ?, 1)
  `);
  insertUserAnime.run(1, WEB_USER_ID, 831, "watching", 26);
  insertUserAnime.run(2, WEB_USER_ID, 691, "watching", 20);
  for (let id = 3; id <= 58; id += 1) {
    insertUserAnime.run(id, WEB_USER_ID, id - 2, "planning", 0);
  }

  const insertEvent = source.prepare(`
    insert into watch_events
      (id, user_id, anime_id, episode_id, episode, action, minutes, watched_at)
    values (?, ?, ?, ?, ?, 'watch', 24, ?)
  `);
  insertEvent.run(1, WEB_USER_ID, 831, 2595, 25, 1);
  for (let id = 2; id <= 372; id += 1) {
    insertEvent.run(id, WEB_USER_ID, 1, 1, 1, id);
  }

  const insertPlayback = source.prepare(`
    insert into playback_progress
      (id, user_id, anime_id, episode_id, episode_number, position_seconds,
       duration_seconds, completed, last_played_at, updated_at)
    values (?, ?, ?, ?, ?, ?, 100, ?, ?, ?)
  `);
  insertPlayback.run(522, WEB_USER_ID, 831, 2595, 25, 100, 1, 1, 1);
  for (let id = 1; id <= 4; id += 1) {
    insertPlayback.run(id, WEB_USER_ID, 1, id, id, 0, 0, id, id);
  }
  source
    .prepare(
      "update sqlite_sequence set seq = 762 where name = 'playback_progress'",
    )
    .run();

  source
    .prepare(
      "insert into rss_sources (id, name, url, filters, is_active, created_at) values (16, 'Web RSS', ?, ?, 1, 1)",
    )
    .run(RSS_URL, JSON.stringify({ cron: "*/30 * * * *" }));
  const insertSetting = source.prepare(
    "insert into app_settings (key, value, updated_at) values (?, ?, 1)",
  );
  insertSetting.run("cinema_library", JSON.stringify({ roots: ["L:\\迅雷"] }));
  insertSetting.run("download_preferences", JSON.stringify({ preferredGroups: ["ANi"] }));
  insertSetting.run("rss_title_aliases", JSON.stringify({ aliasesByAnimeId: { 4: ["Alias"] } }));
  insertSetting.run("user_theme", JSON.stringify({ theme: "default" }));
  insertSetting.run(
    `nav_notifications_read:${WEB_USER_ID}`,
    JSON.stringify({ version: 1, ids: ["old"] }),
  );

  const insertDownload = source.prepare(`
    insert into download_queue
      (id, anime_id, episode_id, title, magnet_url, status, progress,
       error_message, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
  `);
  for (let id = 1; id <= 295; id += 1) {
    const path = join(libraryRoot, `file-${id}.mkv`);
    writeFileSync(path, `local-${id}`);
    insertDownload.run(
      id,
      1,
      null,
      `Local ${id}`,
      encodeLocalFile(path),
      "completed",
      100,
      null,
    );
  }
  insertDownload.run(
    753,
    792,
    2076,
    GRAND_BLUE,
    encodeLocalFile(join(sourceDownloads, GRAND_BLUE)),
    "completed",
    100,
    null,
  );
  insertDownload.run(
    752,
    792,
    2076,
    "Grand Blue magnet",
    `magnet:?xt=urn:btih:${"a".repeat(40)}`,
    "completed",
    100,
    null,
  );
  insertDownload.run(
    754,
    831,
    2595,
    "Girlfriends magnet",
    `magnet:?xt=urn:btih:${"b".repeat(40)}`,
    "completed",
    100,
    null,
  );
  insertDownload.run(
    755,
    790,
    2052,
    "Kamui magnet",
    `magnet:?xt=urn:btih:${"c".repeat(40)}`,
    "completed",
    100,
    null,
  );
  insertDownload.run(
    756,
    787,
    null,
    "Failed magnet",
    `magnet:?xt=urn:btih:${"d".repeat(40)}`,
    "failed",
    0,
    "webui_unreachable",
  );
  source.close();

  return {
    root,
    sourceDb,
    targetDb,
    sourceDownloads,
    targetDownloads,
    backupDir,
  };
}

function runMigration(fixture: Fixture, extraArgs: string[] = []) {
  return spawnSync(
    process.execPath,
    [
      SCRIPT,
      "--source",
      fixture.sourceDb,
      "--target",
      fixture.targetDb,
      "--source-download-root",
      fixture.sourceDownloads,
      "--target-download-root",
      fixture.targetDownloads,
      ...extraArgs,
    ],
    { encoding: "utf8" },
  );
}

function parseJson(output: string) {
  return JSON.parse(output) as Record<string, any>;
}

function queryOne<T>(db: Database.Database, sql: string): T {
  return db.prepare(sql).get() as T;
}

test("Web→Desktop migration defaults to a no-write in-memory dry-run", () => {
  const fixture = createFixture();
  const before = readFileSync(fixture.targetDb);
  const result = runMigration(fixture);

  assert.equal(result.status, 0, result.stderr);
  const report = parseJson(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.databaseWritten, false);
  assert.deepEqual(report.result.actualCounts, report.result.expectedCounts);
  assert.equal(report.result.actualCounts.anime, 316);
  assert.equal(report.result.actualCounts.download_queue, 297);
  assert.equal(report.result.checks.integrityCheck, "ok");
  assert.deepEqual(report.result.checks.foreignKeyCheck, []);
  assert.equal(report.sequenceBaselines.source.download_queue, 756);
  assert.equal(report.sequenceBaselines.source.playback_progress, 762);
  assert.equal(report.sequenceBaselines.source.rss_sources, 16);
  assert.equal(report.sequenceBaselines.target.anime, 900);
  assert.equal(report.result.sequences.download_queue.final, 756);
  assert.equal(report.result.sequences.playback_progress.final, 762);
  assert.equal(report.result.sequences.rss_sources.final, 16);
  assert.equal(report.result.sequences.anime.final, 900);
  assert.equal(report.transformations.downloads.archived.length, 3);
  assert.equal(
    report.transformations.qaVerifiedMappings[0].source,
    "qa_verified_mapping",
  );
  assert.equal(report.applyReadiness.resourcesNeedCopy.length, 3);
  assert.deepEqual(readFileSync(fixture.targetDb), before);
});

test("Web→Desktop migration rejects the same database path", () => {
  const fixture = createFixture();
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      "--source",
      fixture.sourceDb,
      "--target",
      fixture.sourceDb,
      "--source-download-root",
      fixture.sourceDownloads,
      "--target-download-root",
      fixture.targetDownloads,
    ],
    { encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.equal(parseJson(result.stderr).error.code, "same_database");
});

test("Web→Desktop migration rejects identical download roots and case aliases", () => {
  const fixture = createFixture();
  for (const targetDownloads of [
    fixture.sourceDownloads,
    fixture.sourceDownloads.toUpperCase(),
  ]) {
    const result = runMigration({ ...fixture, targetDownloads });
    assert.notEqual(result.status, 0);
    assert.equal(parseJson(result.stderr).error.code, "same_download_root");
  }
});

test("QA verified Douban mapping fails closed on identity or existing-ID conflicts", () => {
  const identityFixture = createFixture();
  const identitySource = new Database(identityFixture.sourceDb);
  identitySource
    .prepare("update anime set bangumi_id = 1 where id = 792")
    .run();
  identitySource.close();
  const identityResult = runMigration(identityFixture);
  assert.notEqual(identityResult.status, 0);
  assert.equal(
    parseJson(identityResult.stderr).error.code,
    "canonical_792_changed",
  );

  const conflictFixture = createFixture();
  const conflictSource = new Database(conflictFixture.sourceDb);
  conflictSource
    .prepare("update anime set douban_id = '37425956' where id = 1")
    .run();
  conflictSource.close();
  const conflictResult = runMigration(conflictFixture);
  assert.notEqual(conflictResult.status, 0);
  assert.equal(
    parseJson(conflictResult.stderr).error.code,
    "qa_mapping_792_conflict",
  );
});

test("Web→Desktop migration fails closed before backup when target has content", () => {
  const fixture = createFixture();
  const target = new Database(fixture.targetDb);
  target
    .prepare(
      "insert into anime (id, title, type, media_type) values (999, 'Existing', 'TV', 'anime')",
    )
    .run();
  target.close();

  const result = runMigration(fixture, [
    "--apply",
    "--backup-dir",
    fixture.backupDir,
  ]);
  assert.notEqual(result.status, 0);
  assert.equal(parseJson(result.stderr).error.code, "target_not_empty");
  assert.equal(existsSync(fixture.backupDir), false);

  const verify = new Database(fixture.targetDb, { readonly: true });
  assert.equal(queryOne<{ count: number }>(verify, "select count(*) as count from anime").count, 1);
  verify.close();
});

test("Web→Desktop migration rolls back a mid-transaction database failure", () => {
  const fixture = createFixture();
  mkdirSync(fixture.targetDownloads, { recursive: true });
  for (const name of [GRAND_BLUE, GIRLFRIENDS, SLIME]) {
    copyFileSync(join(fixture.sourceDownloads, name), join(fixture.targetDownloads, name));
  }
  const target = new Database(fixture.targetDb);
  target.exec(`
    CREATE TRIGGER reject_fixture_anime
    BEFORE INSERT ON anime
    WHEN NEW.id = 100
    BEGIN
      SELECT RAISE(ABORT, 'fixture transaction failure');
    END;
  `);
  target.close();

  const result = runMigration(fixture, [
    "--apply",
    "--backup-dir",
    fixture.backupDir,
  ]);
  assert.notEqual(result.status, 0);
  assert.match(parseJson(result.stderr).error.message, /fixture transaction failure/);

  const verify = new Database(fixture.targetDb, { readonly: true });
  assert.equal(queryOne<{ count: number }>(verify, "select count(*) as count from anime").count, 0);
  assert.equal(queryOne<{ count: number }>(verify, "select count(*) as count from user_anime").count, 0);
  assert.equal(queryOne<{ count: number }>(verify, "select count(*) as count from app_settings").count, 1);
  assert.deepEqual(verify.prepare("pragma foreign_key_check").all(), []);
  verify.close();
});

test("Web→Desktop migration applies transformations and preserves archived AUTOINCREMENT ranges", () => {
  const fixture = createFixture();
  mkdirSync(fixture.targetDownloads, { recursive: true });
  for (const name of [GRAND_BLUE, GIRLFRIENDS, SLIME]) {
    copyFileSync(join(fixture.sourceDownloads, name), join(fixture.targetDownloads, name));
  }

  const result = runMigration(fixture, [
    "--apply",
    "--backup-dir",
    fixture.backupDir,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const report = parseJson(result.stdout);
  assert.equal(report.mode, "apply");
  assert.equal(report.databaseWritten, true);
  assert.deepEqual(report.result.actualCounts, report.result.expectedCounts);
  assert.equal(report.result.checks.integrityCheck, "ok");
  assert.deepEqual(report.result.checks.foreignKeyCheck, []);
  assert.equal(report.result.sequences.download_queue.final, 756);
  assert.equal(report.result.sequences.playback_progress.final, 762);
  assert.equal(report.result.sequences.rss_sources.final, 16);
  assert.equal(report.result.sequences.anime.final, 900);
  assert.equal(existsSync(join(fixture.backupDir, "source-web", "anime.db")), true);
  assert.equal(
    existsSync(join(fixture.backupDir, "target-desktop", "anime-consistent.db")),
    true,
  );

  const target = new Database(fixture.targetDb, { readonly: true });
  assert.equal(queryOne<{ count: number }>(target, "select count(*) as count from users").count, 1);
  assert.equal(queryOne<{ username: string }>(target, "select username from users").username, "admin");
  assert.equal(queryOne<{ count: number }>(target, "select count(*) as count from anime").count, 316);
  assert.equal(queryOne<{ count: number }>(target, "select count(*) as count from anime where id=766").count, 0);
  assert.deepEqual(
    target
      .prepare("select bangumi_id, douban_id, media_type from anime where id=787")
      .get(),
    { bangumi_id: 571784, douban_id: "37441858", media_type: "anime" },
  );
  assert.deepEqual(
    target
      .prepare(
        `select bangumi_id, douban_id, douban_rating,
                douban_rating_fetched_at, title, title_ja, cover_url,
                synopsis, total_episodes, tags
         from anime where id=792`,
      )
      .get(),
    {
      bangumi_id: 569116,
      douban_id: "37425956",
      douban_rating: 8.6,
      douban_rating_fetched_at: 1783806280,
      title: "碧蓝之海 第三季",
      title_ja: "ぐらんぶる Season 3",
      cover_url: "https://bangumi.test/grand-blue.webp",
      synopsis: "Bangumi canonical synopsis",
      total_episodes: 12,
      tags: JSON.stringify(["潜水", "喜剧", "动画"]),
    },
  );
  assert.deepEqual(
    target
      .prepare("select id, anime_id, number from episodes where anime_id=792")
      .all(),
    [{ id: 2076, anime_id: 792, number: 1 }],
  );
  assert.deepEqual(
    target
      .prepare(
        "select user_id, current_episode from user_anime where anime_id=831",
      )
      .get(),
    { user_id: DESKTOP_USER_ID, current_episode: 25 },
  );
  assert.equal(
    queryOne<{ current_episode: number }>(
      target,
      "select current_episode from user_anime where anime_id=691",
    )
      .current_episode,
    20,
  );
  assert.equal(queryOne<{ count: number }>(target, "select count(*) as count from rss_sources").count, 1);
  assert.equal(queryOne<{ id: number }>(target, "select id from rss_sources").id, 1);
  assert.deepEqual(
    target.prepare("select key from app_settings order by key").all(),
    [
      { key: "cinema_library" },
      { key: "download_preferences" },
      { key: "rss_title_aliases" },
      { key: "user_theme" },
    ],
  );
  assert.equal(
    queryOne<{ count: number }>(
      target,
      "select count(*) as count from download_queue where id in (752,755,756)",
    ).count,
    0,
  );
  const converted = target
    .prepare("select title, magnet_url, status, progress from download_queue where id=754")
    .get() as { title: string; magnet_url: string; status: string; progress: number };
  assert.equal(converted.title, GIRLFRIENDS);
  assert.equal(converted.magnet_url, encodeLocalFile(join(fixture.targetDownloads, GIRLFRIENDS)));
  assert.equal(converted.status, "completed");
  assert.equal(converted.progress, 100);
  assert.equal(
    queryOne<{ integrity_check: string }>(target, "pragma integrity_check")
      .integrity_check,
    "ok",
  );
  assert.deepEqual(target.prepare("pragma foreign_key_check").all(), []);
  assert.deepEqual(
    target
      .prepare(
        `select name, seq from sqlite_sequence
         where name in ('anime', 'download_queue', 'playback_progress', 'rss_sources')
         order by name`,
      )
      .all(),
    [
      { name: "anime", seq: 900 },
      { name: "download_queue", seq: 756 },
      { name: "playback_progress", seq: 762 },
      { name: "rss_sources", seq: 16 },
    ],
  );
  target.close();
});
