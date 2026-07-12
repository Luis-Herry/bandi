import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";

const tempDir = mkdtempSync(join(tmpdir(), "anime-progress-semantics-"));
const dbPath = join(tempDir, "progress.db");
process.env.DATABASE_URL = dbPath;

test("currentEpisode=1 counts EP.01 watched and points missed reminder to EP.02", async () => {
  const { getLibrary, getMissedUpdates } = await import(
    "../src/lib/db-helpers/library"
  );
  const sqlite = new Database(dbPath);
  const now = Math.floor(Date.now() / 1000);

  sqlite.pragma("foreign_keys = ON");
  sqlite
    .prepare(
      "insert into users (id, username, password_hash, created_at) values (?, ?, ?, ?)",
    )
    .run("progress-user", "progress-user", "test-only", now);
  sqlite
    .prepare(
      `insert into anime
        (id, title, type, status, total_episodes, media_type, is_adult, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(1, "进度测试番", "TV", "airing", 2, "anime", 0, now, now);
  sqlite
    .prepare(
      `insert into user_anime
        (user_id, anime_id, watch_status, current_episode, updated_at)
       values (?, ?, ?, ?, ?)`,
    )
    .run("progress-user", 1, "watching", 1, now);
  const insertEpisode = sqlite.prepare(
    `insert into episodes
      (anime_id, number, title, aired_at, is_downloaded)
     values (?, ?, ?, ?, ?)`,
  );
  insertEpisode.run(1, 1, "EP.01", now - 7200, 0);
  insertEpisode.run(1, 2, "EP.02", now - 3600, 0);
  sqlite.close();

  const [libraryItem] = getLibrary("progress-user");
  assert.equal(libraryItem?.airedCount, 2);
  assert.equal(libraryItem?.watchedAiredCount, 1);

  const [missedItem] = getMissedUpdates("progress-user", 4);
  assert.equal(missedItem?.missedCount, 1);
  assert.equal(missedItem?.nextMissedEpisode, 2);
});
