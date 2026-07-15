import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const localLibrarySource = readFileSync(
  "src/app/(main)/library/local/LocalLibraryClient.tsx",
  "utf8",
);
const statsChartSource = readFileSync(
  "src/components/features/StatsBarChart.tsx",
  "utf8",
);

test("anime local library empty state offers a real next action", () => {
  assert.match(localLibrarySource, /AnimeLocalScanButton/);
  assert.match(localLibrarySource, /扫描本地库|选择已有动漫目录/);
  assert.match(localLibrarySource, /前往下载管理/);
  assert.match(localLibrarySource, /href="\/admin\/downloads"/);
  assert.doesNotMatch(localLibrarySource, /扫描导入仍在准备中/);
});

test("monthly stats replaces an all-zero chart with an explanatory empty state", () => {
  assert.match(statsChartSource, /safeData\.some\(\(item\) => item\.value > 0\)/);
  assert.match(statsChartSource, /暂无观看记录/);
  assert.match(statsChartSource, /调整追番进度或完成播放后/);
});
