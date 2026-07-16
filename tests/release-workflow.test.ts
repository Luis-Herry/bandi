import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml") as { load: (source: string) => unknown };

test("draft release workflow stays manual, draft-only, and architecture-native", () => {
  const source = readFileSync(".github/workflows/draft-release.yml", "utf8");
  const workflow = yaml.load(source) as any;

  assert.ok(workflow.on?.workflow_dispatch);
  assert.equal(workflow.on?.push, undefined);
  assert.equal(workflow.permissions?.contents, "read");
  assert.equal(workflow.jobs?.["draft-release"]?.permissions?.contents, "write");
  assert.equal(workflow.jobs?.preflight?.["runs-on"], "windows-2025");
  assert.equal(workflow.jobs?.windows?.["runs-on"], "windows-2025");
  assert.deepEqual(workflow.jobs?.macos?.strategy?.matrix?.include, [
    { arch: "x64", runner: "macos-15-intel" },
    { arch: "arm64", runner: "macos-15" },
  ]);
  assert.match(source, /BANDI_MAC_RELEASE:\s*"0"/);
  assert.match(source, /BANDI_MAC_AUTO_UPDATE:\s*"0"/);
  assert.match(source, /raw\.githubusercontent\.com\/spdx\/license-list-data\/98f5c2939d624d338d9fbc159d97f0994c7cfaf3\/text\/LGPL-3\.0-only\.txt/);
  assert.match(source, /996af0513df21f7496288951c41428a03c174e9e4a9d63665c57d670f845ccb1/);
  assert.match(source, /@img\/sharp-libvips-darwin-\$\{BANDI_MAC_ARCH\}/);
  assert.match(source, /while IFS= read -r -d '' candidate/);
  assert.doesNotMatch(source, /Verify macOS package remains outside[\s\S]*?mapfile[\s\S]*?Stage macOS release assets/);
  assert.match(source, /--publish never/);
  assert.match(source, /A Release already exists[\s\S]*refusing to replace any existing assets/);
  assert.match(source, /The remote tag moved after the build started/);
  assert.match(source, /Release unexpectedly left draft state/);
  assert.doesNotMatch(source, /BANDI_MAC_RELEASE:\s*"1"/);
  assert.doesNotMatch(source, /WIN_CSC_LINK|WIN_CSC_KEY_PASSWORD/);
  assert.doesNotMatch(source, /MAC_CSC_LINK|MAC_CSC_KEY_PASSWORD/);
  assert.doesNotMatch(source, /APPLE_API_KEY|APPLE_API_ISSUER|APPLE_TEAM_ID/);
  assert.doesNotMatch(source, /--publish\s+(always|onTagOrDraft)/);
  assert.doesNotMatch(source, /uses:\s+[^\s]+@v\d/);

  const macBuild = readFileSync("scripts/build-macos-local.mjs", "utf8");
  assert.match(macBuild, /"--publish",\s*\n\s*"never"/);
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(packageJson.devDependencies?.["js-yaml"]);
});

test("release artifact verifier binds manifests to exact payload bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "bandi-release-workflow-"));
  const version = "9.8.7";
  const payloads = [
    `Bandi-Setup-${version}-x64.exe`,
    `Bandi-${version}-x64-portable.exe`,
    `Bandi-Local-Web-${version}-macOS-x64.dmg`,
    `Bandi-Local-Web-${version}-macOS-x64.zip`,
    `Bandi-Local-Web-${version}-macOS-arm64.dmg`,
    `Bandi-Local-Web-${version}-macOS-arm64.zip`,
  ];
  try {
    for (const fileName of payloads) {
      writeFileSync(join(root, fileName), `fixture:${fileName}`, "utf8");
    }
    writeFileSync(
      join(root, `Bandi-Setup-${version}-x64.exe.blockmap`),
      "blockmap",
      "utf8",
    );

    const manifests = [
      ["latest.yml", `Bandi-Setup-${version}-x64.exe`],
      ["latest-x64-mac.yml", `Bandi-Local-Web-${version}-macOS-x64.zip`],
      ["latest-arm64-mac.yml", `Bandi-Local-Web-${version}-macOS-arm64.zip`],
    ] as const;
    for (const [manifest, payload] of manifests) {
      const bytes = readFileSync(join(root, payload));
      const sha512 = createHash("sha512").update(bytes).digest("base64");
      writeFileSync(
        join(root, manifest),
        [
          `version: ${version}`,
          "files:",
          `  - url: ${payload}`,
          `    sha512: ${sha512}`,
          `    size: ${bytes.length}`,
          `path: ${payload}`,
          `sha512: ${sha512}`,
          "releaseDate: '2026-07-15T00:00:00.000Z'",
          "",
        ].join("\n"),
        "utf8",
      );
    }

    execFileSync(
      process.execPath,
      ["scripts/verify-release-artifacts.mjs", root, version],
      { stdio: "pipe" },
    );
    const checksums = readFileSync(join(root, "SHA256SUMS.txt"), "utf8");
    assert.match(checksums, new RegExp(`Bandi-Setup-${version}-x64\\.exe`));
    assert.match(checksums, /latest-arm64-mac\.yml/);

    const remoteAssets = [...payloads, `Bandi-Setup-${version}-x64.exe.blockmap`, ...manifests.map(([name]) => name), "SHA256SUMS.txt"].map(
      (fileName) => {
        const bytes = readFileSync(join(root, fileName));
        return {
          name: fileName,
          size: bytes.length,
          digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        };
      },
    );
    const remoteDirectory = join(root, "remote");
    mkdirSync(remoteDirectory);
    const releaseJson = join(remoteDirectory, "release.json");
    writeFileSync(
      releaseJson,
      JSON.stringify({ draft: true, assets: remoteAssets }),
      "utf8",
    );
    execFileSync(
      process.execPath,
      ["scripts/verify-release-artifacts.mjs", root, version, releaseJson],
      { stdio: "pipe" },
    );

    const windowsManifest = join(root, "latest.yml");
    const validWindowsManifest = readFileSync(windowsManifest, "utf8");
    writeFileSync(
      windowsManifest,
      validWindowsManifest.replace(
        "path:",
        [
          "  - url: unexpected.exe",
          "    sha512: unexpected",
          "    size: 1",
          "path:",
        ].join("\n"),
      ),
      "utf8",
    );
    assert.throws(() => {
      execFileSync(
        process.execPath,
        ["scripts/verify-release-artifacts.mjs", root, version],
        { stdio: "pipe" },
      );
    });
    writeFileSync(windowsManifest, validWindowsManifest, "utf8");

    const invalidRemoteAssets = remoteAssets.map((asset, index) => (
      index === 0 ? { ...asset, digest: `sha256:${"0".repeat(64)}` } : asset
    ));
    writeFileSync(
      releaseJson,
      JSON.stringify({ draft: true, assets: invalidRemoteAssets }),
      "utf8",
    );
    assert.throws(() => {
      execFileSync(
        process.execPath,
        ["scripts/verify-release-artifacts.mjs", root, version, releaseJson],
        { stdio: "pipe" },
      );
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
