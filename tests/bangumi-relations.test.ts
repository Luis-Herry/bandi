import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getRelatedResourcesHint,
  toRelatedResourceView,
} from "../src/lib/bangumi-relations";

test("toRelatedResourceView links anime relations to local Bangumi sync route", () => {
  const view = toRelatedResourceView({
    id: 512792,
    type: 2,
    relation: "总集篇",
    name: "劇場版総集編 ガールズバンドクライ 青春狂走曲",
    name_cn: "剧场版总集篇 少女乐队的呐喊 青春狂走曲",
    images: { grid: "grid.jpg", large: "large.jpg" },
  });

  assert.deepEqual(view, {
    id: 512792,
    href: "/anime/bgm/512792",
    external: false,
    title: "剧场版总集篇 少女乐队的呐喊 青春狂走曲",
    relation: "总集篇",
    kind: "剧场版",
    imageUrl: "large.jpg",
  });
});

test("toRelatedResourceView labels radio and live derivatives", () => {
  assert.equal(
    toRelatedResourceView({
      id: 497745,
      type: 6,
      relation: "衍生",
      name: "トゲナシトゲアリのトゲラジ",
    }).kind,
    "电台",
  );

  assert.equal(
    toRelatedResourceView({
      id: 542370,
      type: 6,
      relation: "三次元",
      name: "トゲナシトゲアリ LIVE in 日本武道館",
    }).kind,
    "现场 / 舞台",
  );
});

test("getRelatedResourcesHint prefers movie guidance when movies exist", () => {
  const hint = getRelatedResourcesHint([
    toRelatedResourceView({
      id: 512792,
      type: 2,
      relation: "总集篇",
      name: "劇場版総集編 ガールズバンドクライ 青春狂走曲",
      name_cn: "剧场版总集篇 少女乐队的呐喊 青春狂走曲",
    }),
    toRelatedResourceView({
      id: 497745,
      type: 6,
      relation: "衍生",
      name: "トゲナシトゲアリのトゲラジ",
    }),
  ]);

  assert.equal(hint, "还想看剧场版？看这里。");
});
