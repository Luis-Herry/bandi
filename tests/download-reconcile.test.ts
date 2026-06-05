import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findMatchingQbitTorrent,
  parseLocalFileDownloadUrl,
  planExternalDownloadImports,
} from "../src/lib/download-reconcile";

const downloadRoot = "H:\\追番网站\\download";

test("plans missing qBit torrents from the project download folder", () => {
  const imports = planExternalDownloadImports({
    downloadRoot,
    existingDownloads: [
      {
        title:
          "[ANi] Re：從零開始的異世界生活 第四季 - 07 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
        magnetUrl:
          "magnet:?xt=urn:btih:2222222222222222222222222222222222222222",
      },
    ],
    liveTorrents: [
      {
        hash: "74ed85b1650f7095dff8ca823e7b02a6137a1148",
        name:
          "[ANi] Re：從零開始的異世界生活 第四季 - 09 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4",
        progress: 1,
        dlspeed: 0,
        upspeed: 0,
        eta: 0,
        state: "stoppedUP",
        category: "",
        save_path: downloadRoot,
        size: 295_228_702,
      },
    ],
    localFiles: [],
    animeRefs: [
      {
        id: 11,
        title: "Re：从零开始的异世界生活 第四季 丧失篇",
        titleJa: "Re:ゼロから始める異世界生活 4th season 喪失編",
      },
    ],
    aliasesByAnimeId: {
      11: ["Re：从零开始的异世界生活 第四季"],
    },
    episodeRefs: Array.from({ length: 11 }, (_, index) => ({
      id: 134 + index,
      animeId: 11,
      number: 67 + index,
    })),
  });

  assert.equal(imports.length, 1);
  assert.equal(imports[0]?.source, "qbit");
  assert.equal(imports[0]?.status, "completed");
  assert.equal(imports[0]?.progress, 100);
  assert.equal(imports[0]?.animeId, 11);
  assert.equal(imports[0]?.episodeId, 142);
  assert.match(
    imports[0]?.magnetUrl ?? "",
    /^magnet:\?xt=urn:btih:74ed85b1650f7095dff8ca823e7b02a6137a1148&dn=/,
  );
});

test("plans local video files and maps season episode numbers to absolute rows", () => {
  const localPath =
    "H:\\追番网站\\download\\[ANi] 出租女友 第五季 - 08 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4";
  const imports = planExternalDownloadImports({
    downloadRoot,
    existingDownloads: [],
    liveTorrents: [],
    localFiles: [
      {
        path: localPath,
        name:
          "[ANi] 出租女友 第五季 - 08 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4",
      },
    ],
    animeRefs: [
      {
        id: 2,
        title: "租借女友 第五季",
        titleJa: "彼女、お借りします 第5期",
      },
    ],
    aliasesByAnimeId: {},
    episodeRefs: Array.from({ length: 12 }, (_, index) => ({
      id: 14 + index,
      animeId: 2,
      number: 49 + index,
    })),
  });

  assert.equal(imports.length, 1);
  assert.equal(imports[0]?.source, "local-file");
  assert.equal(imports[0]?.animeId, 2);
  assert.equal(imports[0]?.episodeId, 21);
  assert.equal(imports[0]?.status, "completed");
  assert.equal(parseLocalFileDownloadUrl(imports[0]?.magnetUrl ?? ""), localPath);
});

test("qBit live matching trusts an existing magnet hash over similar titles", () => {
  const match = findMatchingQbitTorrent(
    {
      title:
        "[ANi] Re：從零開始的異世界生活 第四季 - 07 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
      magnetUrl:
        "magnet:?xt=urn:btih:2222222222222222222222222222222222222222",
    },
    [
      {
        hash: "74ed85b1650f7095dff8ca823e7b02a6137a1148",
        name:
          "[ANi] Re：從零開始的異世界生活 第四季 - 09 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4",
        progress: 1,
        dlspeed: 0,
        upspeed: 0,
        eta: 0,
        state: "stoppedUP",
        category: "",
        save_path: downloadRoot,
        size: 295_228_702,
      },
    ],
  );

  assert.equal(match, null);
});
