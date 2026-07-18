import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { buildYucSourceKey } from "../src/lib/yuc/parser";

const tempDir = mkdtempSync(join(tmpdir(), "bandi-anime-merge-"));
const dbPath = join(tempDir, "merge.db");
process.env.DATABASE_URL = dbPath;

test("duplicate merge keeps canonical progress and moves YUC-linked references", async () => {
  const { mergeAnimeRows } = await import("../src/lib/anime-metadata-refresh");
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    insert into users (id, username, password_hash) values ('u1', 'tester', 'x');
    insert into anime
      (id, bangumi_id, title, title_ja, type, status, total_episodes, season, year, media_type)
    values
      (11, 547888, 'Re：从零开始的异世界生活 第四季 丧失篇',
       'Re:ゼロから始める異世界生活 4th season 喪失編',
       'TV', 'airing', 11, 'spring', 2026, 'anime'),
      (839, null, 'Re:从零开始的异世界生活 第4期',
       'Re:ゼロから始める異世界生活 4th season',
       'TV', 'airing', 11, 'spring', 2026, 'anime'),
      (70, 515856, '杖与剑的魔剑谭 第二季',
       '杖と剣のウィストリア Season 2',
       'TV', 'airing', 12, 'spring', 2026, 'anime'),
      (840, null, '杖与剑的魔剑谭 第2期',
       '杖と剣のウィストリア 第2期',
       'TV', 'airing', 12, 'spring', 2026, 'anime');
    insert into episodes (id, anime_id, number, title, is_downloaded)
    values (101, 11, 67, 'Episode 67', 1), (201, 70, 13, 'Episode 13', 1);
    insert into user_anime (user_id, anime_id, watch_status, current_episode)
    values
      ('u1', 11, 'completed', 77),
      ('u1', 839, 'completed', 0),
      ('u1', 70, 'completed', 24),
      ('u1', 840, 'planning', 0);
    insert into watch_events
      (user_id, anime_id, episode, action, minutes, watched_at)
    values ('u1', 839, 1, 'watch', 24, unixepoch());
    insert into playback_progress
      (user_id, anime_id, episode_id, episode_number, position_seconds,
       duration_seconds, completed)
    values ('u1', 840, null, 1, 120, 1440, 0);
    insert into download_queue
      (anime_id, episode_id, title, magnet_url, status, progress)
    values (839, null, 'Re:Zero', 'magnet:?xt=urn:btih:0000000000000000000000000000000000000000',
            'completed', 100);
  `);
  const identities = [
    {
      sourceKey: buildYucSourceKey(
        "season",
        "https://yuc.wiki/202604/",
        "Re:从零开始的异世界生活 第4期",
        "Re:ゼロから始める異世界生活 4th season",
      ),
      animeId: 839,
      title: "Re:从零开始的异世界生活 第4期",
      titleJa: "Re:ゼロから始める異世界生活 4th season",
    },
    {
      sourceKey: buildYucSourceKey(
        "season",
        "https://yuc.wiki/202604/",
        "杖与剑的魔剑谭 第2期",
        "杖と剣のウィストリア 第2期",
      ),
      animeId: 840,
      title: "杖与剑的魔剑谭 第2期",
      titleJa: "杖と剣のウィストリア 第2期",
    },
  ];
  const insertSetting = sqlite.prepare(
    "insert into app_settings (key, value) values (?, ?)",
  );
  for (const identity of identities) {
    insertSetting.run(
      `yuc_anime_identity_v1:${identity.sourceKey}`,
      JSON.stringify({
        version: 1,
        sourceKey: identity.sourceKey,
        animeId: identity.animeId,
        sourceKind: "season",
        sourceUrl: "https://yuc.wiki/202604/",
        title: identity.title,
        titleJa: identity.titleJa,
        year: 2026,
        format: "TV",
      }),
    );
  }
  sqlite.close();

  mergeAnimeRows(11, 839);
  mergeAnimeRows(70, 840);

  const verify = new Database(dbPath, { readonly: true });
  assert.deepEqual(
    verify.prepare("select id from anime order by id").pluck().all(),
    [11, 70],
  );
  assert.deepEqual(
    verify
      .prepare(
        `select anime_id as animeId, watch_status as watchStatus,
                current_episode as currentEpisode
         from user_anime order by anime_id`,
      )
      .all(),
    [
      { animeId: 11, watchStatus: "completed", currentEpisode: 77 },
      { animeId: 70, watchStatus: "completed", currentEpisode: 24 },
    ],
  );
  for (const table of ["watch_events", "playback_progress", "download_queue"]) {
    assert.equal(
      verify
        .prepare(`select count(*) from ${table} where anime_id in (839, 840)`)
        .pluck()
        .get(),
      0,
    );
  }
  const yucAnimeIds = verify
    .prepare(
      "select value from app_settings where key like 'yuc_anime_identity_v1:%' order by key",
    )
    .pluck()
    .all()
    .map((value) => JSON.parse(String(value)).animeId)
    .sort((left, right) => left - right);
  assert.deepEqual(yucAnimeIds, [11, 70]);
  assert.deepEqual(verify.pragma("foreign_key_check"), []);
  assert.equal(verify.pragma("integrity_check", { simple: true }), "ok");
  verify.close();
});
