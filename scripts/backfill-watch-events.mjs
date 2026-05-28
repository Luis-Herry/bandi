import Database from "better-sqlite3";
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const EPISODE_MINUTES = 24;
const dbUrl = process.env.DATABASE_URL ?? "./data/anime.db";
const dbPath = resolve(process.cwd(), dbUrl);
const dir = dirname(dbPath);

if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("foreign_keys = ON");

const result = sqlite
  .prepare(
    `
    insert into watch_events
      (user_id, anime_id, episode_id, episode, action, minutes, watched_at)
    select
      ua.user_id,
      ua.anime_id,
      ep.id,
      ep.number,
      'watch',
      @minutes,
      ua.updated_at
    from user_anime ua
    join episodes ep
      on ep.anime_id = ua.anime_id
      and ep.number <= ua.current_episode
      and ep.number = cast(ep.number as integer)
    where ua.current_episode > 0
      and not exists (
        select 1
        from watch_events existing
        where existing.user_id = ua.user_id
          and existing.anime_id = ua.anime_id
      )
    `,
  )
  .run({ minutes: EPISODE_MINUTES });

sqlite.close();

console.log(
  `Backfilled ${result.changes} watch event${result.changes === 1 ? "" : "s"} at ${EPISODE_MINUTES} minutes each.`,
);
