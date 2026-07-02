import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import type { ScannedTitle } from "../src/lib/cinema-scan";

const tempDir = mkdtempSync(join(tmpdir(), "anime-cinema-import-"));
const dbPath = join(tempDir, "cinema-import.db");
process.env.DATABASE_URL = dbPath;
let importTestSchemaReady = false;

function toUnixSeconds(date = new Date()) {
  return Math.floor(date.getTime() / 1000);
}

function resetImportTestDb() {
  const sqlite = new Database(dbPath);
  if (importTestSchemaReady) {
    sqlite.exec(`
      delete from download_queue;
      delete from episodes;
      delete from app_settings;
      delete from anime;
      delete from sqlite_sequence where name in ('download_queue', 'episodes', 'anime');
    `);
    sqlite.close();
    return dbPath;
  }

  sqlite.exec(`
    drop table if exists download_queue;
    drop table if exists episodes;
    drop table if exists app_settings;
    drop table if exists anime;

    create table anime (
      id integer primary key autoincrement,
      bangumi_id integer,
      anilist_id integer,
      title text not null,
      title_ja text,
      cover_url text,
      synopsis text,
      type text not null,
      status text not null default 'airing',
      total_episodes integer,
      airing_day integer,
      airing_time text,
      season text,
      year integer,
      tags text,
      accent_color text,
      media_type text not null default 'anime',
      tmdb_id integer,
      douban_id text,
      imdb_id text,
      tmdb_rating real,
      douban_rating real,
      douban_rating_fetched_at integer,
      watch_providers text,
      is_adult integer not null default 0,
      created_at integer,
      updated_at integer
    );

    create table episodes (
      id integer primary key autoincrement,
      anime_id integer not null,
      number integer not null,
      title text,
      aired_at integer,
      is_downloaded integer not null default 0
    );

    create table download_queue (
      id integer primary key autoincrement,
      anime_id integer,
      episode_id integer,
      title text not null,
      magnet_url text not null,
      status text not null default 'pending',
      progress integer not null default 0,
      speed text,
      error_message text,
      created_at integer,
      updated_at integer
    );

    create table app_settings (
      key text primary key,
      value text not null,
      updated_at integer
    );
  `);
  importTestSchemaReady = true;
  sqlite.close();
  return dbPath;
}

test("importScannedTitles reuses a metadata-enriched drama row by original title", async () => {
  resetImportTestDb();
  const sqlite = new Database(dbPath);
  sqlite
    .prepare(
      `
        insert into anime
          (id, title, title_ja, type, status, total_episodes, media_type, tmdb_id, created_at, updated_at)
        values
          (1, '绝命毒师', 'Breaking Bad', 'TV', 'completed', 62, 'drama', 1396, @now, @now)
      `,
    )
    .run({ now: toUnixSeconds() });
  sqlite.close();

  const { importScannedTitles } = await import("../src/lib/cinema-import");
  const scanned: ScannedTitle = {
    kind: "tv",
    title: "Breaking Bad",
    year: null,
    season: 1,
    files: [
      {
        absPath: "D:/TV/Breaking Bad/S01E01.mkv",
        fileName: "S01E01.mkv",
        kind: "tv",
        title: "Breaking Bad",
        year: null,
        season: 1,
        episode: 1,
      },
    ],
  };

  const summary = importScannedTitles([scanned]);
  assert.equal(summary.animeMatched, 1);
  assert.equal(summary.animeCreated, 0);
  assert.equal(summary.episodesCreated, 1);
  assert.equal(summary.filesImported, 1);

  const verify = new Database(dbPath);
  assert.equal(verify.prepare("select count(*) from anime").pluck().get(), 1);
  assert.equal(
    verify.prepare("select anime_id from download_queue").pluck().get(),
    1,
  );
  verify.close();
});

test("getLocalLibraryAnimeIds prefers anime rows over duplicate cinema local-file rows", async () => {
  resetImportTestDb();
  const sqlite = new Database(dbPath);
  const now = toUnixSeconds();
  sqlite.exec(`
    insert into anime
      (id, title, type, status, total_episodes, media_type, created_at, updated_at)
    values
      (1, '强风吹拂', 'TV', 'completed', 23, 'anime', ${now}, ${now}),
      (2, 'Kaze ga Tsuyoku Fuiteiru - 01 BD', 'Movie', 'completed', 1, 'movie', ${now}, ${now}),
      (3, '本地电影', 'Movie', 'completed', 1, 'movie', ${now}, ${now});

    insert into episodes (id, anime_id, number, title, is_downloaded)
    values
      (101, 1, 1, 'EP01', 1),
      (201, 2, 1, 'EP01', 1),
      (301, 3, 1, 'Movie', 1);

    insert into download_queue
      (id, anime_id, episode_id, title, magnet_url, status, progress, created_at, updated_at)
    values
      (1, 1, 101, 'EP01', 'local-file:D%3A%2FAnime%2FKaze%2F01.mkv', 'completed', 100, ${now}, ${now}),
      (2, 2, 201, 'EP01 duplicate', 'local-file:D%3A%2FAnime%2FKaze%2F01.mkv', 'completed', 100, ${now}, ${now}),
      (3, 3, 301, 'Movie', 'local-file:D%3A%2FMovies%2FMovie.mkv', 'completed', 100, ${now}, ${now});
  `);
  sqlite.close();

  const { getLocalLibraryAnimeIds } = await import("../src/lib/cinema-import");
  const ids = getLocalLibraryAnimeIds();

  assert.deepEqual([...ids].sort((a, b) => a - b), [1, 3]);
});
