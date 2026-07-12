import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import type { ScannedTitle } from "../src/lib/cinema-scan";

const tempDir = mkdtempSync(join(tmpdir(), "bandi-anime-local-import-"));
const dbPath = join(tempDir, "anime-local-import.db");
process.env.DATABASE_URL = dbPath;
let schemaReady = false;

function resetDb() {
  const sqlite = new Database(dbPath);
  if (schemaReady) {
    sqlite.exec(`
      delete from user_anime;
      delete from download_queue;
      delete from episodes;
      delete from app_settings;
      delete from anime;
      delete from sqlite_sequence;
    `);
    sqlite.close();
    return;
  }
  sqlite.exec(`
    drop table if exists user_anime;
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
    create table user_anime (
      id integer primary key autoincrement,
      user_id text not null,
      anime_id integer not null,
      watch_status text not null,
      current_episode integer not null default 0
    );
  `);
  schemaReady = true;
  sqlite.close();
}

function scannedSeries(pathPrefix = "D:/Anime/Frieren"): ScannedTitle {
  return {
    kind: "tv",
    title: "Sousou no Frieren",
    year: null,
    season: 1,
    files: [1, 2].map((episode) => ({
      absPath: `${pathPrefix}/${String(episode).padStart(2, "0")}.mkv`,
      fileName: `${String(episode).padStart(2, "0")}.mkv`,
      kind: "tv" as const,
      title: "Sousou no Frieren",
      year: null,
      season: 1,
      episode,
    })),
  };
}

// Regression: QA-007 — confirmed anime scans must be additive, idempotent, and isolated.
// Found by /qa on 2026-07-11.
// Report: .gstack/qa-reports/qa-report-desktop-2026-07-11.md

test("anime scan preview is read-only and confirmed import is idempotent", async () => {
  resetDb();
  const { importScannedAnimeTitles, previewScannedAnimeTitles } = await import(
    "../src/lib/anime-local-import"
  );
  const titles = [scannedSeries()];

  const preview = previewScannedAnimeTitles(titles);
  assert.equal(preview.newTitles, 1);
  let verify = new Database(dbPath);
  assert.equal(verify.prepare("select count(*) from anime").pluck().get(), 0);
  assert.equal(verify.prepare("select count(*) from app_settings").pluck().get(), 0);
  verify.close();

  const first = importScannedAnimeTitles(titles, ["D:/Anime"]);
  assert.deepEqual(
    {
      created: first.animeCreated,
      episodes: first.episodesCreated,
      imported: first.filesImported,
      conflicts: first.filesConflicted,
    },
    { created: 1, episodes: 2, imported: 2, conflicts: 0 },
  );

  const second = importScannedAnimeTitles(titles, ["D:/Anime"]);
  assert.equal(second.animeCreated, 0);
  assert.equal(second.animeMatched, 1);
  assert.equal(second.filesImported, 0);
  assert.equal(second.filesSkipped, 2);

  verify = new Database(dbPath);
  assert.deepEqual(
    verify
      .prepare("select title, media_type as mediaType, total_episodes as totalEpisodes from anime")
      .get(),
    { title: "Sousou no Frieren", mediaType: "anime", totalEpisodes: 2 },
  );
  assert.equal(verify.prepare("select count(*) from episodes").pluck().get(), 2);
  assert.equal(verify.prepare("select count(*) from download_queue").pluck().get(), 2);
  assert.equal(verify.prepare("select count(*) from user_anime").pluck().get(), 0);
  assert.equal(
    JSON.parse(
      verify.prepare("select value from app_settings where key='anime_library'").pluck().get() as string,
    ).roots[0],
    "D:/Anime",
  );
  verify.close();
});

test("anime import skips a file already owned by cinema", async () => {
  resetDb();
  const sqlite = new Database(dbPath);
  sqlite.exec(`
    insert into anime (id, title, type, status, total_episodes, media_type)
    values (1, 'Cinema Owner', 'Movie', 'completed', 1, 'movie');
    insert into episodes (id, anime_id, number, title, is_downloaded)
    values (1, 1, 1, 'Owned', 1);
    insert into download_queue (anime_id, episode_id, title, magnet_url, status, progress)
    values (1, 1, 'Owned', 'local-file:D%3A%2FAnime%2FFrieren%2F01.mkv', 'completed', 100);
  `);
  sqlite.close();

  const { importScannedAnimeTitles } = await import("../src/lib/anime-local-import");
  const oneFile = scannedSeries();
  oneFile.files = oneFile.files.slice(0, 1);
  const summary = importScannedAnimeTitles([oneFile], ["D:/Anime"]);

  assert.equal(summary.filesConflicted, 1);
  assert.equal(summary.animeCreated, 0);
  const verify = new Database(dbPath);
  assert.equal(
    verify.prepare("select count(*) from anime where media_type='anime'").pluck().get(),
    0,
  );
  assert.equal(verify.prepare("select count(*) from download_queue").pluck().get(), 1);
  verify.close();
});

test("anime root scan reads real files and confirmation rolls back on failure", async () => {
  resetDb();
  const root = join(tempDir, "real-anime-root");
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "[Moozzi2] Sousou no Frieren - 01 [1080p SRTx2].mkv"),
    "",
  );
  writeFileSync(join(root, "readme.txt"), "ignored");

  const { importScannedAnimeTitles, scanAnimeLibraryRoots } = await import(
    "../src/lib/anime-local-import"
  );
  const scanned = scanAnimeLibraryRoots([root]);
  assert.equal(scanned.length, 1);
  assert.equal(scanned[0]?.files.length, 1);
  assert.equal(scanned[0]?.files[0]?.episode, 1);

  const invalid = scannedSeries("D:/Anime/Invalid");
  invalid.files = [
    { ...invalid.files[0], fileName: null as unknown as string },
  ];
  assert.throws(() => importScannedAnimeTitles([invalid], ["D:/Anime"]));

  const verify = new Database(dbPath);
  assert.equal(verify.prepare("select count(*) from app_settings").pluck().get(), 0);
  assert.equal(verify.prepare("select count(*) from anime").pluck().get(), 0);
  assert.equal(verify.prepare("select count(*) from episodes").pluck().get(), 0);
  assert.equal(verify.prepare("select count(*) from download_queue").pluck().get(), 0);
  verify.close();
});

test("anime import maps season-local files onto existing absolute episode rows", async () => {
  resetDb();
  const sqlite = new Database(dbPath);
  sqlite.exec(`
    insert into anime (
      id, title, title_ja, cover_url, type, status, total_episodes, year, media_type
    ) values (
      1, 'Sousou no Frieren 第2季', '葬送のフリーレン 第2期',
      'https://example.com/cover.jpg', 'TV', 'airing', 12, 2026, 'anime'
    );
    insert into episodes (anime_id, number, title, is_downloaded)
    values (1, 13, 'Existing 13', 0), (1, 14, 'Existing 14', 0);
  `);
  sqlite.close();

  const { importScannedAnimeTitles } = await import("../src/lib/anime-local-import");
  const secondSeason = scannedSeries("D:/Anime/Frieren S2");
  secondSeason.season = 2;
  secondSeason.files = secondSeason.files.map((file) => ({ ...file, season: 2 }));
  const summary = importScannedAnimeTitles([secondSeason], ["D:/Anime"]);

  assert.equal(summary.animeMatched, 1);
  assert.equal(summary.animeCreated, 0);
  assert.equal(summary.episodesCreated, 0);
  assert.equal(summary.filesImported, 2);

  const verify = new Database(dbPath);
  assert.deepEqual(
    verify
      .prepare(
        "select title_ja as titleJa, cover_url as coverUrl, total_episodes as totalEpisodes, year from anime where id=1",
      )
      .get(),
    {
      titleJa: "葬送のフリーレン 第2期",
      coverUrl: "https://example.com/cover.jpg",
      totalEpisodes: 12,
      year: 2026,
    },
  );
  assert.deepEqual(
    verify
      .prepare(
        "select e.number from download_queue d join episodes e on e.id=d.episode_id order by e.number",
      )
      .all(),
    [{ number: 13 }, { number: 14 }],
  );
  assert.equal(
    verify.prepare("select count(*) from episodes where number in (1,2)").pluck().get(),
    0,
  );
  verify.close();
});
