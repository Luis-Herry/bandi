import assert from "node:assert/strict";
import { test } from "node:test";
import {
  selectMainBangumiEpisodes,
  subjectToAnimeRow,
  type BgmEpisode,
} from "../src/lib/bangumi";
import { dedupeEpisodesByNumber } from "../src/lib/episode-normalize";

test("subjectToAnimeRow uses main episode count instead of OP/ED-inclusive total", () => {
  const row = subjectToAnimeRow({
    id: 543360,
    type: 2,
    name: "上伊那ぼたん、酔へる姿は百合の花",
    name_cn: "上伊那牡丹，酒醉身姿似百合花般",
    total_episodes: 16,
    eps: 12,
  });

  assert.equal(row.totalEpisodes, 12);
});

test("selectMainBangumiEpisodes drops OP and ED rows", () => {
  const rows: BgmEpisode[] = [
    { id: 1, type: 0, sort: 1, ep: 1, name: "第1話" },
    { id: 2, type: 2, sort: 1, ep: 0, name: "芽吹くとき" },
    { id: 3, type: 3, sort: 1, ep: 0, name: "感情グラス" },
    { id: 4, type: 0, sort: 2, ep: 2, name: "第2話" },
  ];

  assert.deepEqual(
    selectMainBangumiEpisodes(rows).map((row) => row.id),
    [1, 4],
  );
});

test("dedupeEpisodesByNumber keeps the first stored main episode", () => {
  const rows = [
    { id: 10, number: 1, title: "第1話" },
    { id: 11, number: 1, title: "OP01" },
    { id: 12, number: 1, title: "ED01" },
    { id: 13, number: 2, title: "第2話" },
  ];

  assert.deepEqual(
    dedupeEpisodesByNumber(rows).map((row) => row.id),
    [10, 13],
  );
});
