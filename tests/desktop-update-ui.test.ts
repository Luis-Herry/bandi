import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("desktop update actions stay available outside settings", () => {
  const rootLayoutSource = readFileSync("src/app/layout.tsx", "utf8");
  const mainLayoutSource = readFileSync("src/app/(main)/layout.tsx", "utf8");
  const noticeSource = readFileSync(
    "src/components/features/DesktopUpdateNotice.tsx",
    "utf8",
  );
  const settingsSource = readFileSync(
    "src/components/features/DesktopUpdateSettings.tsx",
    "utf8",
  );

  assert.match(
    rootLayoutSource,
    /\{isDesktop && <DesktopUpdateNotice \/>\}/,
  );
  assert.match(
    mainLayoutSource,
    /\{canManageLocalServerUpdates && <DesktopUpdateNotice \/>\}/,
  );
  assert.match(
    noticeSource,
    /fixed bottom-5 right-\[var\(--app-page-gutter\)\] z-\[75\]/,
  );
  assert.match(noticeSource, /update\.status === "ready"/);
  assert.match(noticeSource, /return "重启并更新"/);
  assert.match(noticeSource, /return "退出并运行新版"/);
  assert.match(noticeSource, /return "下载新版"/);
  assert.doesNotMatch(noticeSource, /应用更新遇到问题|重新检查/);
  assert.doesNotMatch(noticeSource, /update\.status === "error" \|\|/);

  assert.match(settingsSource, /应用更新/);
  assert.match(settingsSource, /检查 Bandi 新版本/);
});
