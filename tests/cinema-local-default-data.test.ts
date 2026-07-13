import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "anime-cinema-local-hidden-"));
process.env.DATABASE_URL = join(tempDir, "cinema-local-hidden.db");
delete process.env.CINEMA_LOCAL_DEFAULT_DATA_HIDDEN;

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function dayOffset(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function setupDb() {
  const sqlite = new Database(process.env.DATABASE_URL!);
  sqlite.exec(`
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

    create table user_anime (
      id integer primary key autoincrement,
      user_id text not null,
      anime_id integer not null,
      watch_status text not null default 'watching',
      current_episode integer not null default 0,
      rating integer,
      notes text,
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

    create table playback_progress (
      id integer primary key autoincrement,
      user_id text not null,
      anime_id integer not null,
      episode_id integer,
      episode_number integer not null,
      position_seconds integer not null default 0,
      duration_seconds integer not null default 0,
      completed integer not null default 0,
      last_played_at integer,
      updated_at integer
    );
  `);

  const now = toUnixSeconds(dayOffset(-1));
  const insertAnime = sqlite.prepare(`
    insert into anime
      (id, title, title_ja, cover_url, type, status, total_episodes, media_type, tmdb_id, tags, is_adult, created_at, updated_at)
    values
      (@id, @title, null, @coverUrl, @type, 'airing', 12, @mediaType, @tmdbId, @tags, @isAdult, @createdAt, @updatedAt)
  `);
  for (const row of [
    {
      id: 1,
      title: "虚拟样本剧",
      coverUrl: "https://image.tmdb.org/t/p/w500/sample.jpg",
      type: "TV",
      mediaType: "drama",
      tmdbId: 101,
      tags: JSON.stringify(["剧情"]),
      isAdult: 0,
    },
    {
      id: 2,
      title: "本地剧",
      coverUrl: "https://image.tmdb.org/t/p/w500/local-drama.jpg",
      type: "TV",
      mediaType: "drama",
      tmdbId: 102,
      tags: JSON.stringify(["剧情"]),
      isAdult: 0,
    },
    {
      id: 3,
      title: "本地电影",
      coverUrl: "https://image.tmdb.org/t/p/w500/local-movie.jpg",
      type: "Movie",
      mediaType: "movie",
      tmdbId: 103,
      tags: JSON.stringify(["传记"]),
      isAdult: 0,
    },
    {
      id: 4,
      title: "TEST-307",
      coverUrl: "https://example.com/synthetic-adult-cover.jpg",
      type: "Movie",
      mediaType: "movie",
      tmdbId: null,
      tags: JSON.stringify([]),
      isAdult: 1,
    },
    {
      id: 5,
      title: "豆瓣待评分电影",
      coverUrl:
        "https://img3.doubanio.com/view/photo/s_ratio_poster/public/demo.jpg",
      type: "Movie",
      mediaType: "movie",
      tmdbId: null,
      tags: JSON.stringify([]),
      isAdult: 0,
    },
  ]) {
    insertAnime.run({ ...row, createdAt: now, updatedAt: now });
  }

  sqlite
    .prepare(
      "insert into user_anime (user_id, anime_id, watch_status, current_episode, updated_at) values (?, ?, 'watching', 1, ?)",
    )
    .run("user", 1, now);

  const insertEpisode = sqlite.prepare(
    "insert into episodes (id, anime_id, number, title, aired_at, is_downloaded) values (?, ?, ?, ?, ?, 0)",
  );
  insertEpisode.run(101, 1, 2, "Sample Today", toUnixSeconds(dayOffset(0)));
  insertEpisode.run(201, 2, 1, "Local Drama", toUnixSeconds(dayOffset(-1)));
  insertEpisode.run(301, 3, 1, "Local Movie", null);
  insertEpisode.run(401, 4, 1, "Adult Local", null);

  const insertDownload = sqlite.prepare(`
    insert into download_queue
      (anime_id, episode_id, title, magnet_url, status, progress, created_at, updated_at)
    values
      (?, ?, ?, ?, 'completed', 100, ?, ?)
  `);
  insertDownload.run(2, 201, "Local Drama", "local-file:///D:/Drama/EP01.mkv", now, now);
  insertDownload.run(3, 301, "Local Movie", "local-file:///D:/Movie/Movie.mkv", now, now);
  insertDownload.run(4, 401, "Adult Local", "local-file:///D:/TestMedia/TEST-307.mp4", now, now);
  sqlite.close();
}

test("cinema local-library hides non-local samples but keeps local and R-rated data", async () => {
  setupDb();
  const cinema = await import("../src/lib/db-helpers/cinema");

  assert.equal(cinema.CINEMA_LOCAL_DEFAULT_DATA_HIDDEN, true);
  const library = cinema.getCinemaLibrary("user");
  assert.deepEqual(library.drama.map((item) => item.title), ["本地剧"]);
  assert.deepEqual(library.movie.map((item) => item.title), ["本地电影"]);
  assert.deepEqual(cinema.getAdultLibrary("user").jav.map((item) => item.title), [
    "TEST-307",
  ]);
  assert.equal(
    cinema
      .getCinemaWatchlist("user")
      .some((item) => item.title === "豆瓣待评分电影"),
    true,
  );
  assert.deepEqual(cinema.getCinemaTodayUpdates("user"), []);
  assert.deepEqual(cinema.getCinemaUpcomingEpisodes("user", 7), []);
  assert.deepEqual(cinema.getCinemaMissedUpdates("user", 4), []);
  assert.deepEqual(cinema.getCinemaContinueWatching("user", 4), []);
});
