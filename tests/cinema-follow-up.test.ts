import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test } from "node:test";
import Database from "better-sqlite3";

const tempDir = mkdtempSync(join(tmpdir(), "anime-cinema-feed-"));
const dbPath = join(tempDir, "cinema-feed.db");
process.env.DATABASE_URL = dbPath;
process.env.CINEMA_LOCAL_DEFAULT_DATA_HIDDEN = "0";

const USER_ID = "cinema-user";

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function dayOffset(offset: number, hour = 12) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
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
  `);

  const insertAnime = sqlite.prepare(`
    insert into anime
      (id, title, title_ja, cover_url, type, status, total_episodes, media_type, tmdb_id, watch_providers, created_at, updated_at)
    values
      (@id, @title, @titleJa, @coverUrl, @type, @status, @totalEpisodes, @mediaType, @tmdbId, json(@watchProviders), @createdAt, @updatedAt)
  `);
  const watchProviders = JSON.stringify([
    {
      region: "CN",
      providers: [{ providerId: 1, providerName: "腾讯视频", type: "flatrate", url: "https://v.qq.com/" }],
      fetchedAt: 1780000000,
    },
  ]);
  for (const row of [
    { id: 1, title: "动漫今日更新", mediaType: "anime", type: "TV", tmdbId: null },
    { id: 2, title: "在播剧", mediaType: "drama", type: "TV", tmdbId: 200 },
    { id: 3, title: "想看剧", mediaType: "drama", type: "TV", tmdbId: 300 },
    { id: 4, title: "电影预告", mediaType: "movie", type: "Movie", tmdbId: 400 },
    { id: 5, title: "别人追的剧", mediaType: "drama", type: "TV", tmdbId: 500 },
    { id: 6, title: "漏看剧", mediaType: "drama", type: "TV", tmdbId: 600 },
    { id: 7, title: "电视剧预告", mediaType: "drama", type: "TV", tmdbId: 700 },
  ]) {
    insertAnime.run({
      id: row.id,
      title: row.title,
      titleJa: null,
      coverUrl: `https://image.tmdb.org/t/p/w500/${row.id}.jpg`,
      type: row.type,
      status: "airing",
      totalEpisodes: 12,
      mediaType: row.mediaType,
      tmdbId: row.tmdbId,
      watchProviders,
      createdAt: toUnixSeconds(dayOffset(-30)),
      updatedAt: toUnixSeconds(dayOffset(-1)),
    });
  }

  const insertUserAnime = sqlite.prepare(`
    insert into user_anime
      (user_id, anime_id, watch_status, current_episode, updated_at)
    values
      (@userId, @animeId, @watchStatus, @currentEpisode, @updatedAt)
  `);
  for (const row of [
    [USER_ID, 1, "watching", 1],
    [USER_ID, 2, "watching", 1],
    [USER_ID, 3, "planning", 0],
    [USER_ID, 4, "watching", 0],
    ["other-user", 5, "watching", 0],
    [USER_ID, 6, "watching", 1],
    [USER_ID, 7, "watching", 0],
  ] as const) {
    insertUserAnime.run({
      userId: row[0],
      animeId: row[1],
      watchStatus: row[2],
      currentEpisode: row[3],
      updatedAt: toUnixSeconds(dayOffset(-1)),
    });
  }

  const insertEpisode = sqlite.prepare(`
    insert into episodes
      (id, anime_id, number, title, aired_at, is_downloaded)
    values
      (@id, @animeId, @number, @title, @airedAt, 0)
  `);
  for (const row of [
    { id: 101, animeId: 1, number: 2, title: "Anime Today", date: dayOffset(0) },
    { id: 201, animeId: 2, number: 2, title: "Drama Today", date: dayOffset(0) },
    { id: 301, animeId: 3, number: 1, title: "Planning Tomorrow", date: dayOffset(1) },
    { id: 401, animeId: 4, number: 1, title: "Movie Tomorrow", date: dayOffset(1) },
    { id: 501, animeId: 5, number: 1, title: "Other Today", date: dayOffset(0) },
    { id: 601, animeId: 6, number: 1, title: "Watched", date: dayOffset(-3) },
    { id: 602, animeId: 6, number: 2, title: "Missed Local", date: dayOffset(-2) },
    { id: 603, animeId: 6, number: 3, title: "Missed Streaming", date: dayOffset(-1) },
    { id: 701, animeId: 7, number: 1, title: "Drama Tomorrow", date: dayOffset(1) },
  ]) {
    insertEpisode.run({
      id: row.id,
      animeId: row.animeId,
      number: row.number,
      title: row.title,
      airedAt: toUnixSeconds(row.date),
    });
  }

  const insertDownload = sqlite.prepare(`
    insert into download_queue
      (anime_id, episode_id, title, magnet_url, status, progress, created_at, updated_at)
    values
      (@animeId, @episodeId, @title, @magnetUrl, @status, 100, @createdAt, @updatedAt)
  `);
  for (const row of [
    { animeId: 2, episodeId: 201, title: "Drama Today", magnetUrl: "local-file:///D:/Drama/EP02.mkv" },
    { animeId: 4, episodeId: 401, title: "Movie Tomorrow", magnetUrl: "magnet:?xt=urn:btih:movie" },
    { animeId: 6, episodeId: 602, title: "Missed Local", magnetUrl: "local-file:///D:/Drama/EP02.mkv" },
  ]) {
    insertDownload.run({
      ...row,
      status: "completed",
      createdAt: toUnixSeconds(dayOffset(-1)),
      updatedAt: toUnixSeconds(dayOffset(-1)),
    });
  }

  sqlite.close();
});

test("cinema today feed includes only the current user's watching drama/movie rows", async () => {
  const { getCinemaTodayUpdates } = await import("../src/lib/db-helpers/cinema");

  const updates = getCinemaTodayUpdates(USER_ID);

  assert.deepEqual(updates.map((item) => item.anime.title), ["在播剧"]);
  assert.equal(updates[0]?.episode.number, 2);
  assert.equal(updates[0]?.episode.isDownloaded, true);
  assert.equal(updates[0]?.watched, false);
  assert.equal(updates[0]?.providerLabel, "腾讯视频 可看");
});

test("cinema upcoming feed is drama-only and ignores non-local completed torrents for playback", async () => {
  const { getCinemaUpcomingEpisodes } = await import("../src/lib/db-helpers/cinema");

  const upcoming = getCinemaUpcomingEpisodes(USER_ID, 7);

  assert.deepEqual(upcoming.map((item) => item.anime.title), ["电视剧预告"]);
  assert.equal(upcoming[0]?.episode.number, 1);
  assert.equal(upcoming[0]?.episode.isDownloaded, false);
});

test("cinema missed feed points to the first unwatched aired episode and local-file playback state", async () => {
  const { getCinemaMissedUpdates } = await import("../src/lib/db-helpers/cinema");

  const missed = getCinemaMissedUpdates(USER_ID, 10);
  const item = missed.find((entry) => entry.anime.title === "漏看剧");

  assert.ok(item);
  assert.equal(item.missedCount, 2);
  assert.equal(item.nextMissedEpisode, 2);
  assert.equal(item.nextMissedEpisodeIsDownloaded, true);
  assert.equal(item.latestAiredEpisode, 3);
  assert.equal(item.latestEpisodeIsDownloaded, false);
});

test("cinema follow-up UI never exposes anime RSS/source-search actions", () => {
  const source = readFileSync(
    "src/components/features/CinemaFollowUpSection.tsx",
    "utf8",
  );
  const animeCardSource = readFileSync(
    "src/components/features/AnimeCard.tsx",
    "utf8",
  );
  const animeRowItemSource = readFileSync(
    "src/components/features/AnimeRowItem.tsx",
    "utf8",
  );
  const detailSource = readFileSync(
    "src/app/(main)/anime/[id]/CinemaDetail.tsx",
    "utf8",
  );

  assert.match(source, /import \{ PlayButton \}/);
  assert.match(source, /`\/cinema\/\$\{item\.animeId\}\?from=local`/);
  assert.match(source, /href=\{detailHref\}/);
  assert.doesNotMatch(source, /#where-to-watch/);
  assert.doesNotMatch(source, /href=\{`\/anime\/\$\{item\.animeId\}/);
  assert.match(animeCardSource, /href\?: string/);
  assert.match(animeCardSource, /const cardHref = href \?\? `\/anime\/\$\{id\}`/);
  assert.match(animeCardSource, /href=\{cardHref\}/);
  assert.match(animeRowItemSource, /href\?: string/);
  assert.match(animeRowItemSource, /href=\{href \?\? `\/anime\/\$\{id\}`\}/);
  assert.match(source, /size="sm"/);
  assert.match(source, /今日更新/);
  assert.match(source, /未来 7 天预告/);
  assert.match(source, /漏看提醒/);
  assert.match(source, /继续观看/);
  // 今日/未来合成一个可切换模块（对齐动漫首页）后允许 setView；真正要防的是 RSS/找资源，见下行。
  assert.doesNotMatch(source, /EpisodeSourceDialog|找资源|RSS|qBit|torrent/i);
  assert.match(detailSource, /id="where-to-watch"/);
});

test("cinema follow-up columns stretch panels to the same row height", () => {
  const source = readFileSync(
    "src/components/features/CinemaFollowUpSection.tsx",
    "utf8",
  );

  assert.equal(
    source.match(/className="flex h-full min-w-0 flex-col"/g)?.length,
    2,
  );
  assert.equal(
    source.match(/className="flex-1 p-2 space-y-1"/g)?.length,
    2,
  );
  assert.equal(
    source.match(
      /className="flex flex-1 items-center justify-center p-6 text-center"/g,
    )?.length,
    2,
  );
});
