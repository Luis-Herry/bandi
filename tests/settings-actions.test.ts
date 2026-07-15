import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const automation = readFileSync(
  "src/components/features/AutomationSettingsClient.tsx",
  "utf8",
);
const desktopDownloads = readFileSync(
  "src/components/features/DesktopDownloadSettings.tsx",
  "utf8",
);

test("RSS icon actions expose visible hover labels and keyboard focus", () => {
  assert.match(automation, /title=\{label\}/);
  assert.match(automation, /title="编辑"/);
  assert.match(automation, /title="删除"/);
  assert.match(automation, /focus-visible:outline-2/);
});

test("Windows tray toggle and save action share one control row", () => {
  assert.match(
    desktopDownloads,
    /关闭窗口后继续下载[\s\S]*flex shrink-0 items-center gap-3[\s\S]*保存设置/,
  );
});
