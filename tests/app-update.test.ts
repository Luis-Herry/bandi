import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  GITHUB_API_LATEST,
  GITHUB_RELEASE_URL,
  compareVersions,
  createAppUpdateController,
  detectUpdateMode,
  expectedPortableAssetName,
  isTrustedReleaseAssetUrl,
  parseGithubDigest,
  parseReleaseDigest,
  selectPortableAsset,
} = require("../runtime/app-update.cjs");

test("detectUpdateMode distinguishes installed, portable, macOS, and development", () => {
  assert.equal(detectUpdateMode({ platform: "win32", isPackaged: false }), "development");
  assert.equal(
    detectUpdateMode({ platform: "win32", isPackaged: true, hasUpdateDescriptor: true, env: {} }),
    "nsis",
  );
  assert.equal(
    detectUpdateMode({
      platform: "win32",
      isPackaged: true,
      hasUpdateDescriptor: true,
      env: { PORTABLE_EXECUTABLE_FILE: "D:\\Bandi.exe" },
    }),
    "portable",
  );
  assert.equal(
    detectUpdateMode({
      platform: "darwin",
      isPackaged: true,
      hasUpdateDescriptor: true,
      isMacSigned: true,
      isInApplicationsFolder: true,
    }),
    "mac-installed",
  );
  assert.equal(
    detectUpdateMode({
      platform: "darwin",
      isPackaged: true,
      hasUpdateDescriptor: true,
      isMacSigned: false,
      isInApplicationsFolder: true,
    }),
    "mac-manual",
  );
});

test("compareVersions follows semver precedence", () => {
  assert.equal(compareVersions("v0.1.5", "0.1.5"), 0);
  assert.equal(compareVersions("0.1.6", "0.1.5"), 1);
  assert.equal(compareVersions("1.0.0-beta.2", "1.0.0-beta.11"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0-rc.1"), 1);
  assert.throws(() => compareVersions("latest", "0.1.5"), /invalid_version/);
});

test("portable asset selection requires one exact trusted ASCII asset", () => {
  const expected = "Bandi-0.1.6-x64-portable.exe";
  const trustedUrl = `https://github.com/Luis-Herry/bandi/releases/download/v0.1.6/${expected}`;
  const release = {
    assets: [
      { name: `追番中心-0.1.6-x64-portable.exe`, browser_download_url: trustedUrl },
      { name: expected, browser_download_url: trustedUrl },
    ],
  };
  assert.equal(expectedPortableAssetName("v0.1.6", "x64"), expected);
  assert.equal(selectPortableAsset(release, "0.1.6", "x64")?.name, expected);
  assert.equal(selectPortableAsset(release, "0.1.6", "arm64"), null);
  assert.equal(
    selectPortableAsset(
      { assets: [{ name: expected, browser_download_url: "https://evil.example/Bandi.exe" }] },
      "0.1.6",
      "x64",
    ),
    null,
  );
  assert.equal(isTrustedReleaseAssetUrl(trustedUrl), true);
  assert.equal(isTrustedReleaseAssetUrl("http://github.com/Luis-Herry/bandi/releases/download/x/y"), false);
});

test("GitHub and release-note digest parsing is strict", () => {
  const digest = "a".repeat(64);
  const asset = "Bandi-0.1.6-x64-portable.exe";
  assert.equal(parseGithubDigest(`sha256:${digest}`), digest);
  assert.equal(parseGithubDigest(digest.toUpperCase()), digest);
  assert.equal(parseGithubDigest(`sha512:${digest}`), null);
  assert.equal(parseReleaseDigest(`${digest}  ${asset}\n`, asset), digest);
  assert.equal(parseReleaseDigest(`${asset}: ${digest}\n`, asset), digest);
  assert.equal(parseReleaseDigest(`${digest}  another.exe\n`, asset), null);
});

test("portable controller downloads exact asset, verifies integrity, and returns a private launch plan", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bandi-app-update-"));
  try {
    const bytes = Buffer.from("verified portable update");
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    const assetName = "Bandi-0.1.6-x64-portable.exe";
    const assetUrl = `https://github.com/Luis-Herry/bandi/releases/download/v0.1.6/${assetName}`;
    const requested: string[] = [];
    const controller = createAppUpdateController({
      currentVersion: "0.1.5",
      platform: "win32",
      arch: "x64",
      isPackaged: true,
      hasUpdateDescriptor: true,
      env: { PORTABLE_EXECUTABLE_FILE: "D:\\Bandi.exe" },
      downloadsDir: root,
      now: () => 12345,
      fetchImpl: async (url: string) => {
        requested.push(url);
        if (url === GITHUB_API_LATEST) {
          return new Response(JSON.stringify({
            tag_name: "v0.1.6",
            draft: false,
            body: "",
            assets: [{
              name: assetName,
              browser_download_url: assetUrl,
              size: bytes.length,
              digest: `sha256:${digest}`,
            }],
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (url === assetUrl) return new Response(bytes, { status: 200 });
        throw new Error("unexpected_url");
      },
    });

    const checked = await controller.checkForUpdates();
    assert.equal(checked.ok, true);
    assert.deepEqual(requested, [GITHUB_API_LATEST, assetUrl]);
    assert.deepEqual(controller.getState(), {
      mode: "portable",
      status: "ready",
      action: "install-portable",
      currentVersion: "0.1.5",
      availableVersion: "0.1.6",
      progressPercent: 100,
      message: null,
      lastCheckedAt: 12345,
    });
    assert.equal("path" in controller.getState(), false);

    const prepared = await controller.preparePortableLaunch();
    assert.equal(prepared.ok, true);
    assert.equal(path.dirname(prepared.launch.executablePath), path.join(root, "Bandi Updates"));
    assert.equal(path.basename(prepared.launch.executablePath), assetName);
    assert.equal(prepared.launch.expectedSha256, digest);
    assert.equal(prepared.launch.expectedSize, bytes.length);
    assert.deepEqual(prepared.launch.args, []);
    assert.equal(fs.readFileSync(prepared.launch.executablePath, "utf8"), bytes.toString("utf8"));

    fs.writeFileSync(prepared.launch.executablePath, Buffer.alloc(bytes.length, 0));
    assert.deepEqual(await controller.preparePortableLaunch(), {
      ok: false,
      error: "portable_update_changed",
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("portable controller rejects a checksum mismatch and never exposes a launch path", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bandi-app-update-bad-"));
  try {
    const bytes = Buffer.from("tampered");
    const assetName = "Bandi-0.1.6-x64-portable.exe";
    const assetUrl = `https://github.com/Luis-Herry/bandi/releases/download/v0.1.6/${assetName}`;
    const controller = createAppUpdateController({
      currentVersion: "0.1.5",
      platform: "win32",
      arch: "x64",
      isPackaged: true,
      env: { PORTABLE_EXECUTABLE_FILE: "D:\\Bandi.exe" },
      downloadsDir: root,
      fetchImpl: async (url: string) => url === GITHUB_API_LATEST
        ? new Response(JSON.stringify({
            tag_name: "0.1.6",
            draft: false,
            assets: [{
              name: assetName,
              browser_download_url: assetUrl,
              size: bytes.length,
              digest: `sha256:${"0".repeat(64)}`,
            }],
          }), { status: 200 })
        : new Response(bytes, { status: 200 }),
    });

    const result = await controller.checkForUpdates();
    assert.equal(result.ok, false);
    assert.equal(controller.getState().status, "error");
    assert.deepEqual(await controller.preparePortableLaunch(), {
      ok: false,
      error: "portable_update_not_ready",
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("renderer-facing update page action always uses the fixed public release URL", async () => {
  const opened: string[] = [];
  const controller = createAppUpdateController({
    currentVersion: "0.1.5",
    platform: "darwin",
    isPackaged: true,
    hasUpdateDescriptor: false,
    openExternal: async (url: string) => opened.push(url),
  });
  const result = await controller.openUpdatePage("https://evil.example" as never);
  assert.equal(result.ok, true);
  assert.deepEqual(opened, [GITHUB_RELEASE_URL]);
});

test("controller logs only sanitized error codes", async () => {
  const logs: Array<{ event: string; code: string }> = [];
  const controller = createAppUpdateController({
    currentVersion: "0.1.5",
    platform: "darwin",
    isPackaged: true,
    hasUpdateDescriptor: false,
    fetchImpl: async () => {
      throw new Error("request failed at C:\\Users\\secret\\token.txt?token=private");
    },
    log: (entry: { event: string; code: string }) => logs.push(entry),
  });
  await controller.checkForUpdates();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, "check_failed");
  assert.equal(logs[0].code, "unexpected_error");
  assert.doesNotMatch(JSON.stringify(logs), /secret|private|token\.txt/);
});

test("controller stop aborts an active release request", async () => {
  const observed: { signal?: AbortSignal } = {};
  const controller = createAppUpdateController({
    currentVersion: "0.1.5",
    platform: "darwin",
    isPackaged: true,
    hasUpdateDescriptor: false,
    fetchImpl: async (_url: string, init: RequestInit) => {
      observed.signal = init.signal as AbortSignal;
      return await new Promise<Response>((_resolve, reject) => {
        observed.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { code: "ABORT_ERR" }));
        }, { once: true });
      });
    },
  });

  const pending = controller.checkForUpdates();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(observed.signal?.aborted, false);
  controller.stop();
  const result = await pending;

  assert.equal(observed.signal?.aborted, true);
  assert.equal(result.ok, false);
  assert.equal(controller.getState().status, "error");
});

test("installed updater waits for host shutdown before quitAndInstall", async () => {
  const events = new Map<string, (...args: unknown[]) => void>();
  const order: string[] = [];
  const updater = {
    on(name: string, callback: (...args: unknown[]) => void) {
      events.set(name, callback);
    },
    async checkForUpdates() {
      events.get("update-downloaded")?.({ version: "0.1.6" });
    },
    quitAndInstall() {
      order.push("quitAndInstall");
    },
  };
  const controller = createAppUpdateController({
    currentVersion: "0.1.5",
    platform: "win32",
    isPackaged: true,
    hasUpdateDescriptor: true,
    env: {},
    updater,
    beforeInstall: async () => {
      order.push("shutdown");
    },
  });
  await controller.checkForUpdates();
  assert.equal(controller.getState().status, "ready");
  assert.deepEqual(order, [], "download completion must not force a restart");
  const installed = await controller.installUpdate();
  assert.equal(installed.ok, true);
  assert.deepEqual(order, ["shutdown", "quitAndInstall"]);
});
