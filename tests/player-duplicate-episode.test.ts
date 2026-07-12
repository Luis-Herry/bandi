import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { ensureDatabaseSchema } from "../src/db/bootstrap";

const tempDir = mkdtempSync(join(tmpdir(), "bandi-player-duplicate-episode-"));
const dbPath = join(tempDir, "player.db");
const videoPath = join(tempDir, "TEST-484.mp4");
const olderDuplicateVideoPath = join(tempDir, "older-episode-id.mp4");
const newerDuplicateVideoPath = join(tempDir, "newer-episode-id.mp4");
process.env.DATABASE_URL = dbPath;

function setupDuplicateEpisodeDb() {
  writeFileSync(videoPath, "video");
  writeFileSync(olderDuplicateVideoPath, "older episode id");
  writeFileSync(newerDuplicateVideoPath, "newer episode id");
  const sqlite = new Database(dbPath);
  ensureDatabaseSchema(sqlite);
  sqlite.exec(`
    delete from download_queue;
    delete from episodes;
    delete from anime;

    insert into anime (id, title, type, status, total_episodes, media_type, is_adult)
    values
      (361, 'TEST-484', 'Movie', 'completed', 1, 'movie', 1),
      (362, '双下载重复集', 'Movie', 'completed', 1, 'movie', 1);

    insert into episodes (id, anime_id, number, title, is_downloaded)
    values
      (36101, 361, 1, '旧空壳 EP.1', 0),
      (36102, 361, 1, '有本地文件的 EP.1', 1),
      (36201, 362, 1, '较小 episode ID', 1),
      (36202, 362, 1, '较大 episode ID', 1);
  `);
  sqlite
    .prepare(
      `insert into download_queue
        (anime_id, episode_id, title, magnet_url, status, progress, created_at, updated_at)
       values
        (361, 36102, 'TEST-484', ?, 'completed', 100, 200, 200)`,
    )
    .run(`local-file:${encodeURIComponent(videoPath)}`);
  const insertDownload = sqlite.prepare(
    `insert into download_queue
      (anime_id, episode_id, title, magnet_url, status, progress, created_at, updated_at)
     values
      (362, ?, ?, ?, 'completed', 100, ?, ?)`,
  );
  insertDownload.run(
    36201,
    "较小 episode ID 的较新下载",
    `local-file:${encodeURIComponent(olderDuplicateVideoPath)}`,
    400,
    400,
  );
  insertDownload.run(
    36202,
    "较大 episode ID 的较旧下载",
    `local-file:${encodeURIComponent(newerDuplicateVideoPath)}`,
    300,
    300,
  );
  sqlite.close();
}

setupDuplicateEpisodeDb();

test("player resolves the downloaded row when duplicate episode numbers exist", async () => {
  const { preferPlayableEpisodeRows, resolvePlayableEpisodeFile } = await import(
    "../src/lib/player"
  );

  const result = await resolvePlayableEpisodeFile({
    userId: "desktop-user",
    animeId: 361,
    episode: 1,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.file.episodeId, 36102);
  assert.equal(result.file.absPath, videoPath);

  assert.deepEqual(
    preferPlayableEpisodeRows(
      [
        { id: 36101, number: 1, title: "旧空壳 EP.1" },
        { id: 36102, number: 1, title: "有本地文件的 EP.1" },
      ],
      new Set([36102]),
    ),
    [{ id: 36102, number: 1, title: "有本地文件的 EP.1" }],
  );
});

test("player and episode list share the newest-download preference", async () => {
  const {
    getPreferredPlaybackEpisode,
    preferPlayableEpisodeRows,
    resolvePlayableEpisodeFile,
  } = await import("../src/lib/player");

  const preferred = getPreferredPlaybackEpisode(362, 1);
  const resolved = await resolvePlayableEpisodeFile({
    userId: "desktop-user",
    animeId: 362,
    episode: 1,
  });

  assert.equal(preferred?.id, 36201);
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.file.episodeId, 36201);
  assert.deepEqual(
    preferPlayableEpisodeRows(
      [
        { id: 36201, number: 1 },
        { id: 36202, number: 1 },
      ],
      new Set([preferred.id]),
    ),
    [{ id: 36201, number: 1 }],
  );

  const playerPageSource = readFileSync(
    "src/app/(main)/player/[animeId]/[episode]/page.tsx",
    "utf8",
  );
  assert.match(
    playerPageSource,
    /orderBy\(desc\(downloadQueue\.updatedAt\), desc\(downloadQueue\.id\)\)/,
  );
});

test("untracked local playback saves time without creating a tracking row", () => {
  const progressRouteSource = readFileSync(
    "src/app/api/player/progress/route.ts",
    "utf8",
  );
  const progressWrite = progressRouteSource.indexOf("db.insert(playbackProgress)");
  const untrackedReturn = progressRouteSource.indexOf("if (!existing)", progressWrite);

  assert.ok(progressWrite >= 0);
  assert.ok(untrackedReturn > progressWrite);
  assert.match(
    progressRouteSource.slice(untrackedReturn),
    /currentEpisode: null,[\s\S]*watchStatus: null/,
  );
  assert.doesNotMatch(
    progressRouteSource,
    /if \(!existing\) \{\s*return NextResponse\.json\(\{ error: "not_in_library"/,
  );
});
