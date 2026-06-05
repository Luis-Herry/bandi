import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type Database from "better-sqlite3";

type SqliteDatabase = Database.Database;

export function ensureDatabaseSchema(sqlite: SqliteDatabase) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      username text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at integer NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS anime (
      id integer PRIMARY KEY AUTOINCREMENT,
      bangumi_id integer UNIQUE,
      anilist_id integer,
      title text NOT NULL,
      title_ja text,
      cover_url text,
      synopsis text,
      type text NOT NULL,
      status text NOT NULL DEFAULT 'airing',
      total_episodes integer,
      airing_day integer,
      airing_time text,
      season text,
      year integer,
      tags text,
      accent_color text,
      created_at integer NOT NULL DEFAULT (unixepoch()),
      updated_at integer NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS anime_status_idx ON anime(status);

    CREATE TABLE IF NOT EXISTS user_anime (
      id integer PRIMARY KEY AUTOINCREMENT,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      anime_id integer NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      watch_status text NOT NULL DEFAULT 'watching',
      current_episode integer NOT NULL DEFAULT 0,
      rating integer,
      notes text,
      updated_at integer NOT NULL DEFAULT (unixepoch())
    );

    CREATE UNIQUE INDEX IF NOT EXISTS user_anime_user_anime_idx
      ON user_anime(user_id, anime_id);

    CREATE TABLE IF NOT EXISTS episodes (
      id integer PRIMARY KEY AUTOINCREMENT,
      anime_id integer NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      number integer NOT NULL,
      title text,
      aired_at integer,
      is_downloaded integer NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS episodes_anime_number_idx
      ON episodes(anime_id, number);

    CREATE TABLE IF NOT EXISTS watch_events (
      id integer PRIMARY KEY AUTOINCREMENT,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      anime_id integer NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      episode_id integer REFERENCES episodes(id) ON DELETE SET NULL,
      episode integer NOT NULL,
      action text NOT NULL,
      minutes integer NOT NULL,
      watched_at integer NOT NULL
    );

    CREATE INDEX IF NOT EXISTS watch_events_user_watched_at_idx
      ON watch_events(user_id, watched_at);

    CREATE INDEX IF NOT EXISTS watch_events_anime_episode_idx
      ON watch_events(anime_id, episode);

    CREATE TABLE IF NOT EXISTS playback_progress (
      id integer PRIMARY KEY AUTOINCREMENT,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      anime_id integer NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      episode_id integer REFERENCES episodes(id) ON DELETE SET NULL,
      episode_number integer NOT NULL,
      position_seconds integer NOT NULL DEFAULT 0,
      duration_seconds integer NOT NULL DEFAULT 0,
      completed integer NOT NULL DEFAULT 0,
      last_played_at integer NOT NULL DEFAULT (unixepoch()),
      updated_at integer NOT NULL DEFAULT (unixepoch())
    );

    CREATE UNIQUE INDEX IF NOT EXISTS playback_progress_user_episode_idx
      ON playback_progress(user_id, anime_id, episode_id);

    CREATE INDEX IF NOT EXISTS playback_progress_user_recent_idx
      ON playback_progress(user_id, last_played_at);

    CREATE TABLE IF NOT EXISTS rss_sources (
      id integer PRIMARY KEY AUTOINCREMENT,
      name text NOT NULL,
      url text NOT NULL,
      filters text,
      is_active integer NOT NULL DEFAULT 1,
      last_checked_at integer,
      created_at integer NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS download_queue (
      id integer PRIMARY KEY AUTOINCREMENT,
      anime_id integer REFERENCES anime(id) ON DELETE SET NULL,
      episode_id integer REFERENCES episodes(id) ON DELETE SET NULL,
      title text NOT NULL,
      magnet_url text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      progress integer NOT NULL DEFAULT 0,
      speed text,
      error_message text,
      created_at integer NOT NULL DEFAULT (unixepoch()),
      updated_at integer NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at integer NOT NULL DEFAULT (unixepoch())
    );
  `);
}

export function ensureDesktopDefaults(sqlite: SqliteDatabase) {
  const userCount = sqlite
    .prepare("SELECT COUNT(*) AS count FROM users")
    .get() as { count: number };

  if (userCount.count === 0) {
    const username = process.env.DESKTOP_BOOTSTRAP_USER ?? "admin";
    const password = process.env.DESKTOP_BOOTSTRAP_PASSWORD ?? "PUBLIC_HISTORY_REDACTED";
    sqlite
      .prepare(
        "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
      )
      .run(randomUUID(), username, bcrypt.hashSync(password, 10));
  }

  const rssCount = sqlite
    .prepare("SELECT COUNT(*) AS count FROM rss_sources")
    .get() as { count: number };

  if (rssCount.count === 0) {
    sqlite
      .prepare(
        `INSERT INTO rss_sources (name, url, filters, is_active)
         VALUES (?, ?, ?, 1)`,
      )
      .run(
        "Anime Garden",
        "https://api.animes.garden/feed.xml",
        JSON.stringify({ quality: "1080p", group: "ANi" }),
      );
  }
}
