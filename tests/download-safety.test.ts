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

  assert.match(source, /<AccordionDisclosure/);
  assert.doesNotMatch(source, /defaultOpen/);
  assert.match(source, /高级连接说明/);
  assert.match(source, /安全下载模式会限制上传/);
  assert.match(source, /qbittorrent\.exe/);
  assert.match(source, /qBittorrent 自身代理保持“无”/);
  assert.doesNotMatch(source, /关闭安全下载模式|安全下载模式.*关闭|setSafeMode/);
});

test("desktop qBit client keeps the embedded 8080 route and web fallback", () => {
  const source = readFileSync("src/lib/qbit.ts", "utf8");

  assert.match(source, /const DEFAULT_QBIT_URLS = \[\s*"http:\/\/localhost:8080"/);
  assert.match(source, /"http:\/\/127\.0\.0\.1:18080"/);
  assert.match(source, /const isDesktopApp = process\.env\.ANIME_DESKTOP_APP === "1"/);
  assert.match(source, /isDesktopApp\).*DEFAULT_QBIT_URLS\[0\]/s);
  assert.match(source, /isLocalDefaultWebUiUrl/);
});

test("desktop qBit client uses qBittorrent v5 stop/start controls with legacy fallback", () => {
  const source = readFileSync("src/lib/qbit.ts", "utf8");

  assert.match(
    source,
    /pauseTorrent[\s\S]*?controlTorrent\(hash,\s*\[[\s\S]*?"\/api\/v2\/torrents\/stop"[\s\S]*?"\/api\/v2\/torrents\/pause"/,
  );
  assert.match(
    source,
    /resumeTorrent[\s\S]*?controlTorrent\(hash,\s*\[[\s\S]*?"\/api\/v2\/torrents\/start"[\s\S]*?"\/api\/v2\/torrents\/resume"/,
  );
  assert.match(source, /async function controlTorrent\(/);
  assert.match(source, /if \(result\.error !== "http_404"\) break/);
});
