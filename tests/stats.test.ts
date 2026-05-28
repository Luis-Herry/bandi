import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test } from "node:test";
import Database from "better-sqlite3";

const tempDir = mkdtempSync(join(tmpdir(), "anime-stats-"));
const dbPath = join(tempDir, "stats.db");
process.env.DATABASE_URL = dbPath;

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

before(() => {
  const sqlite = new Database(dbPath);
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
      status text not null,
      total_episodes integer,
      airing_day integer,
      airing_time text,
      season text,
      year integer,
      tags text,
      accent_color text,
      created_at integer,
      updated_at integer
    );

    create table user_anime (
      id integer primary key autoincrement,
      user_id text not null,
      anime_id integer not null,
      watch_status text not null,
      current_episode integer not null,
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

    create table watch_events (
      id integer primary key autoincrement,
      user_id text not null,
      anime_id integer not null,
      episode_id integer,
      episode integer not null,
      action text not null,
      minutes integer not null,
      watched_at integer not null
    );
  `);

  const insertAnime = sqlite.prepare(`
    insert into anime
      (id, title, title_ja, cover_url, type, status, total_episodes, tags, created_at, updated_at)
    values
      (@id, @title, @titleJa, @coverUrl, @type, @status, @totalEpisodes, @tags, @createdAt, @updatedAt)
  `);
  insertAnime.run({
    id: 1,
    title: "测试番",
    titleJa: null,
    coverUrl: null,
    type: "TV",
    status: "completed",
    totalEpisodes: 4,
    tags: JSON.stringify(["奇幻"]),
    createdAt: toUnixSeconds(new Date(2026, 0, 1)),
    updatedAt: toUnixSeconds(new Date(2026, 0, 1)),
  });
  insertAnime.run({
    id: 10,
    title: "完结番",
    titleJa: "完結アニメ",
    coverUrl: "https://example.test/cover.jpg",
    type: "TV",
    status: "completed",
    totalEpisodes: 3,
    tags: JSON.stringify(["奇幻", "战斗"]),
    createdAt: toUnixSeconds(new Date(2026, 0, 1)),
    updatedAt: toUnixSeconds(new Date(2026, 0, 1)),
  });
  insertAnime.run({
    id: 11,
    title: "绝对集号番",
    titleJa: null,
    coverUrl: null,
    type: "TV",
    status: "airing",
    totalEpisodes: 2,
    tags: JSON.stringify(["奇幻"]),
    createdAt: toUnixSeconds(new Date(2026, 0, 1)),
    updatedAt: toUnixSeconds(new Date(2026, 0, 1)),
  });
  insertAnime.run({
    id: 12,
    title: "短篇完结番",
    titleJa: null,
    coverUrl: null,
    type: "TV",
    status: "completed",
    totalEpisodes: 1,
    tags: JSON.stringify(["日常"]),
    createdAt: toUnixSeconds(new Date(2026, 0, 1)),
    updatedAt: toUnixSeconds(new Date(2026, 0, 1)),
  });

  const insertUserAnime = sqlite.prepare(`
    insert into user_anime
      (user_id, anime_id, watch_status, current_episode, rating, updated_at)
    values
      (@userId, @animeId, @watchStatus, @currentEpisode, @rating, @updatedAt)
  `);
  insertUserAnime.run({
    userId: "report-user",
    animeId: 10,
    watchStatus: "completed",
    currentEpisode: 3,
    rating: 5,
    updatedAt: toUnixSeconds(new Date(2026, 1, 1)),
  });
  insertUserAnime.run({
    userId: "report-user",
    animeId: 11,
    watchStatus: "watching",
    currentEpisode: 14,
    rating: 3,
    updatedAt: toUnixSeconds(new Date(2026, 2, 4)),
  });
  insertUserAnime.run({
    userId: "report-user",
    animeId: 12,
    watchStatus: "completed",
    currentEpisode: 1,
    rating: 4,
    updatedAt: toUnixSeconds(new Date(2026, 3, 4)),
  });

  const insertEpisode = sqlite.prepare(`
    insert into episodes (anime_id, number, title, aired_at, is_downloaded)
    values (@animeId, @number, null, null, 0)
  `);
  for (const row of [
    [10, 1],
    [10, 2],
    [10, 3],
    [11, 13],
    [11, 14],
    [12, 1],
  ] as const) {
    insertEpisode.run({ animeId: row[0], number: row[1] });
  }

  const insert = sqlite.prepare(`
    insert into watch_events
      (user_id, anime_id, episode_id, episode, action, minutes, watched_at)
    values
      (@userId, @animeId, @episodeId, @episode, @action, @minutes, @watchedAt)
  `);

  for (const row of [
    ["user-1", 1, 1, 1, "watch", 24, new Date(2026, 4, 1, 10)],
    ["user-1", 1, 2, 2, "watch", 48, new Date(2026, 4, 26, 11)],
    ["user-1", 1, 2, 2, "unwatch", 24, new Date(2026, 4, 26, 12)],
    ["user-1", 1, null, 12.5, "watch", 24, new Date(2026, 4, 26, 13)],
    ["user-1", 2, null, 3, "watch", 30, new Date(2026, 4, 31, 20)],
    ["user-1", 1, 4, 4, "watch", 99, new Date(2026, 3, 30, 20)],
    ["user-2", 1, 1, 1, "watch", 60, new Date(2026, 4, 26, 20)],
    ["user-3", 1, 1, 1, "unwatch", 48, new Date(2026, 4, 26, 20)],
    ["report-user", 10, null, 1, "watch", 24, new Date(2025, 11, 31, 23)],
    ["report-user", 10, null, 2, "watch", 24, new Date(2026, 0, 15, 21)],
    ["report-user", 10, null, 3, "watch", 24, new Date(2026, 1, 1, 22)],
    ["report-user", 11, null, 13, "watch", 24, new Date(2026, 2, 2, 20)],
    ["report-user", 11, null, 13, "unwatch", 24, new Date(2026, 2, 3, 20)],
    ["report-user", 11, null, 14, "watch", 24, new Date(2026, 2, 4, 20)],
    ["report-user", 11, null, 12.5, "watch", 24, new Date(2026, 2, 5, 20)],
    ["report-user", 12, null, 1, "watch", 24, new Date(2026, 3, 5, 20)],
  ] as const) {
    insert.run({
      userId: row[0],
      animeId: row[1],
      episodeId: row[2],
      episode: row[3],
      action: row[4],
      minutes: row[5],
      watchedAt: toUnixSeconds(row[6]),
    });
  }

  sqlite.close();
});

test("getMonthHours sums watch minutes and subtracts unwatch minutes in the month", async () => {
  const { getMonthHours } = await import("../src/lib/db-helpers/stats");

  assert.equal(getMonthHours("user-1", new Date(2026, 4, 26, 12)), 1.3);
});

test("getWeekDailyHours returns Monday to Sunday hours from watch events", async () => {
  const { getWeekDailyHours } = await import("../src/lib/db-helpers/stats");

  assert.deepEqual(getWeekDailyHours("user-1", new Date(2026, 4, 26, 12)), [
    0, 0.4, 0, 0, 0, 0, 0.5,
  ]);
});

test("watch corrections do not render negative hours", async () => {
  const { getMonthHours, getWeekDailyHours } = await import(
    "../src/lib/db-helpers/stats"
  );

  assert.equal(getMonthHours("user-3", new Date(2026, 4, 26, 12)), 0);
  assert.deepEqual(getWeekDailyHours("user-3", new Date(2026, 4, 26, 12)), [
    0, 0, 0, 0, 0, 0, 0,
  ]);
});

test("getStatsReport returns fixed annual report sections from watch events", async () => {
  const { getStatsReport } = await import("../src/lib/db-helpers/stats");

  const report = getStatsReport("report-user", { year: 2026, topLimit: 5 });

  assert.equal(report.year, 2026);
  assert.deepEqual(
    report.monthlyHours.map((item) => item.hours),
    [0.4, 0.4, 0.4, 0.4, 0, 0, 0, 0, 0, 0, 0, 0],
  );
  assert.deepEqual(report.overview, {
    totalHours: 1.6,
    watchedEpisodes: 4,
    completedAnime: 2,
    activeDays: 5,
    averageMinutesPerActiveDay: 19,
  });
  assert.deepEqual(report.ratingDistribution, [
    { rating: 1, count: 0 },
    { rating: 2, count: 0 },
    { rating: 3, count: 1 },
    { rating: 4, count: 1 },
    { rating: 5, count: 1 },
  ]);
  assert.equal(report.tagDistribution[0]?.tag, "奇幻");
  assert.equal(report.tagDistribution[0]?.animeCount, 2);
  assert.equal(report.tagDistribution[0]?.hours, 1.2);
  assert.equal(report.completedTop.length, 2);
  assert.equal(report.completedTop[0]?.title, "完结番");
  assert.equal(report.completedTop[0]?.watchedEpisodes, 3);
});

test("getStatsReport overview completed count is not limited by top N", async () => {
  const { getStatsReport } = await import("../src/lib/db-helpers/stats");

  const report = getStatsReport("report-user", { year: 2026, topLimit: 1 });

  assert.equal(report.overview.completedAnime, 2);
  assert.equal(report.completedTop.length, 1);
});

test("getStatsReport returns stable empty shapes", async () => {
  const { getStatsReport } = await import("../src/lib/db-helpers/stats");

  const report = getStatsReport("empty-user", { year: 2026 });

  assert.equal(report.overview.totalHours, 0);
  assert.equal(report.monthlyHours.length, 12);
  assert.deepEqual(
    report.ratingDistribution.map((item) => item.count),
    [0, 0, 0, 0, 0],
  );
  assert.deepEqual(report.tagDistribution, []);
  assert.deepEqual(report.completedTop, []);
});
