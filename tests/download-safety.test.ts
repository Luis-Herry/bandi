import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildSafeTorrentOptions,
  shouldPauseAfterCompletion,
} from "../src/lib/download-safety";
import { buildAddTorrentForm } from "../src/lib/qbit";

test("safe torrent defaults reduce seeding pressure without pausing new downloads", () => {
  const options = buildSafeTorrentOptions({ category: "anime" });
  const form = buildAddTorrentForm("magnet:?xt=urn:btih:abc", options);

  assert.equal(form.get("urls"), "magnet:?xt=urn:btih:abc");
  assert.equal(form.get("category"), "anime");
  assert.equal(form.get("upLimit"), String(128 * 1024));
  assert.equal(form.get("ratioLimit"), "0");
  assert.equal(form.get("seedingTimeLimit"), "0");
  assert.equal(form.has("paused"), false);
});

test("safe mode pauses torrents only when they newly cross into completed", () => {
  assert.equal(shouldPauseAfterCompletion("downloading", "completed"), true);
  assert.equal(shouldPauseAfterCompletion("pending", "completed"), true);
  assert.equal(shouldPauseAfterCompletion("completed", "completed"), false);
  assert.equal(shouldPauseAfterCompletion("downloading", "failed"), false);
});

test("settings keeps qBit connection advice collapsed without a safe-mode toggle", () => {
  const source = readFileSync(
    "src/components/features/AutomationSettingsClient.tsx",
    "utf8",
  );

  assert.match(source, /<details/);
  assert.match(source, /高级连接说明/);
  assert.match(source, /安全下载模式会限制上传/);
  assert.match(source, /qbittorrent\.exe/);
  assert.match(source, /qBittorrent 自身代理保持“无”/);
  assert.doesNotMatch(source, /关闭安全下载模式|安全下载模式.*关闭|setSafeMode/);
});
