import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientSource = readFileSync(
  "src/app/(main)/admin/downloads/Client.tsx",
  "utf8",
);
const bulkDeleteRouteSource = readFileSync(
  "src/app/api/downloads/bulk-delete/route.ts",
  "utf8",
);
const singleDeleteRouteSource = readFileSync(
  "src/app/api/downloads/[id]/route.ts",
  "utf8",
);
const cleanupSource = readFileSync("src/lib/download-cleanup.ts", "utf8");
const dedupeSource = readFileSync("src/lib/download-dedupe.ts", "utf8");

test("downloads admin exposes bulk local-list removal controls", () => {
  assert.match(clientSource, /selectedDownloadIds/);
  assert.match(clientSource, /\/api\/downloads\/bulk-delete/);
  assert.match(clientSource, /全选当前分类/);
  assert.match(clientSource, /删除所选/);
  assert.match(clientSource, /清空列表/);
  assert.match(clientSource, /不会删除 qBittorrent 中的任务或本地文件/);
});

test("downloads admin exposes qBit connection advice only as an abnormal hint", () => {
  assert.match(clientSource, /QbitConnectionAdvice/);
  assert.match(clientSource, /qbitConnectionAdviceReason/);
  assert.match(clientSource, /查看连接建议/);
  assert.match(clientSource, /hasActiveDownload/);
  assert.match(clientSource, /if \(!qbit\) return null/);
  assert.match(clientSource, /HIGH_QBIT_UPLOAD_BYTES/);
  assert.match(clientSource, /SLOW_QBIT_DOWNLOAD_BYTES/);
  assert.match(clientSource, /qbittorrent\.exe/);
  assert.doesNotMatch(
    clientSource,
    /关闭安全下载模式|安全下载模式.*关闭|setSafeMode/,
  );
});

test("bulk delete route removes only local download queue rows", () => {
  assert.match(bulkDeleteRouteSource, /db\s*\.\s*delete\(downloadQueue\)/s);
  assert.match(bulkDeleteRouteSource, /inArray\(downloadQueue\.id, ids\)/);
  assert.match(singleDeleteRouteSource, /db\s*\.\s*delete\(downloadQueue\)/s);
  assert.doesNotMatch(
    bulkDeleteRouteSource,
    /from ["']@\/lib\/qbit|addTorrent|pauseTorrent|deleteTorrent|removeTorrent|deleteFiles/,
  );
});

test("download row deletion clears stale downloaded episode flags", () => {
  assert.match(
    singleDeleteRouteSource,
    /resetDownloadedFlagsWithoutCompletedRows/,
  );
  assert.match(bulkDeleteRouteSource, /resetDownloadedFlagsWithoutCompletedRows/);
  assert.match(cleanupSource, /update\(episodes\)/);
  assert.match(cleanupSource, /set\(\{ isDownloaded: false \}\)/);
  assert.match(cleanupSource, /getCompletedDownloadEpisodeIds/);
  assert.match(cleanupSource, /eq\(downloadQueue\.status, "completed"\)/);
  assert.match(cleanupSource, /inArray\(episodes\.id, staleEpisodeIds\)/);
});

test("download duplicate checks ignore stale downloaded episode flags", () => {
  assert.doesNotMatch(dedupeSource, /episodes\.isDownloaded/);
  assert.match(dedupeSource, /eq\(downloadQueue\.status, "completed"\)/);
  assert.match(dedupeSource, /reason: "episode-downloaded"/);
  assert.match(dedupeSource, /ACTIVE_DOWNLOAD_STATUSES = \["pending", "downloading"\]/);
});
