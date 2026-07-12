import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const animeQueriesSource = readFileSync("src/db/queries/anime.ts", "utf8");

test("Bangumi detail and episode requests start together during a cold sync", () => {
  assert.match(animeQueriesSource, /Promise\.all\(\[/);
  assert.match(animeQueriesSource, /getSubject\(bangumiId\)/);
  assert.match(animeQueriesSource, /getEpisodes\(bangumiId, 200\)/);
  assert.match(animeQueriesSource, /selectMainBangumiEpisodes\(rawEpisodes\)/);
});
