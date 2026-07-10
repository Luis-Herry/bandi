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
const pauseRouteSource = readFileSync(
  "src/app/api/downloads/[id]/pause/route.ts",
  "utf8",
);
const resumeRouteSource = readFileSync(
  "src/app/api/downloads/[id]/resume/route.ts",
  "utf8",
);
const retryRouteSource = readFileSync(
  "src/app/api/downloads/[id]/retry/route.ts",
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
  assert.match(clientSource, /不会删除下载引擎中的任务或本地文件/);
});

test("download row selection keeps only one visible checkbox frame", () => {
  assert.match(
    clientSource,
    /<label className="mt-1 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center">/,
  );
  assert.doesNotMatch(
    clientSource,
    /<label className="mt-1 inline-flex h-7 w-7[\s\S]*?border border-\[color:var\(--border-default\)\]/,
  );
});

test("downloads admin exposes qBit connection advice only as an abnormal hint", () => {
  assert.match(clientSource, /QbitConnectionAdvice/);
  assert.match(clientSource, /qbitConnectionAdviceReason/);
  assert.match(clientSource, /QbitSetupGuideDialog/);
  assert.match(clientSource, /不会设置看这里/);
  assert.match(clientSource, /qbit && !qbit\.managed/);
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

test("qBit status card keeps status and metrics in one responsive top row", () => {
  assert.match(clientSource, /min-\[900px\]:flex-row/);
  assert.match(clientSource, /min-\[900px\]:min-w-\[210px\]/);
  assert.match(clientSource, /桌面版会自动选择连接端口/);
  assert.match(clientSource, /下载服务/);
  assert.match(clientSource, /mt-\[5px\] h-2 w-2 shrink-0 rounded-full/);
  assert.match(clientSource, /break-words text-\[11px\] leading-5/);
  assert.match(clientSource, /className="w-full border-t/);
  assert.match(clientSource, /min-\[900px\]:text-right/);
  assert.doesNotMatch(clientSource, /min-\[1440px\]:flex-row/);
  assert.doesNotMatch(clientSource, /className="mt-2 w-full max-w-none/);
  assert.doesNotMatch(clientSource, /max-w-\[520px\]/);
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

test("failed downloads can be resubmitted from the existing queue row", () => {
  assert.match(clientSource, /\/api\/downloads\/\$\{id\}\/retry/);
  assert.match(clientSource, /row\.status === "failed"/);
  assert.match(clientSource, /重新下载/);
  assert.match(clientSource, /RotateCcw/);
  assert.match(retryRouteSource, /row\.status !== "failed"/);
  assert.match(retryRouteSource, /addTorrent\(/);
  assert.match(retryRouteSource, /buildSafeTorrentOptions\(\{ category: "anime" \}\)/);
  assert.match(retryRouteSource, /status: "downloading"/);
  assert.match(retryRouteSource, /errorMessage: null/);
  assert.doesNotMatch(retryRouteSource, /db\s*\.\s*delete\(downloadQueue\)/s);
  assert.doesNotMatch(retryRouteSource, /db\s*\.\s*insert\(downloadQueue\)/s);
});

test("download pause controls are limited to active qBit-backed rows", () => {
  assert.match(
    clientSource,
    /const isControllableStatus =\s*row\.status === "downloading" \|\|\s*row\.status === "pending"/,
  );
  assert.match(clientSource, /row\.liveState === "stoppedDL"/);
  assert.match(clientSource, /const canControl =\s*isControllableStatus &&/);
  assert.match(
    clientSource,
    /row\.status === "completed" && row\.anime && row\.episodeNumber != null/,
  );
  assert.match(
    pauseRouteSource,
    /row\.status !== "downloading" && row\.status !== "pending"/,
  );
  assert.match(
    resumeRouteSource,
    /row\.status !== "downloading" && row\.status !== "pending"/,
  );
});

test("downloads admin collapses repeated anime-season rows into an episode group", () => {
  assert.match(clientSource, /buildDownloadListEntries\(filteredDownloads\)/);
  assert.match(clientSource, /const key = `anime:\$\{row\.anime\.id\}`/);
  assert.match(clientSource, /group\.rows\.length > 1/);
  assert.match(clientSource, /合集 \{group\.episodeCount\} 集/);
  assert.match(clientSource, /group\.rows\.length\} 条下载记录/);
  assert.match(clientSource, /toggleGroupExpanded/);
  assert.match(clientSource, /toggleGroupSelection\(entry\.rows\.map\(\(row\) => row\.id\)\)/);
  assert.match(clientSource, /renderRows=\{\(\) =>/);
  assert.match(clientSource, /ChevronRight/);
  assert.match(clientSource, /Layers/);
});
