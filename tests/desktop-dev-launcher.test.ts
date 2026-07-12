import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  getDesktopBuildInputHash,
  inspectDesktopBuild,
  writeDesktopBuildStamp,
} from "../scripts/desktop-dev-start.mjs";

function withLauncherFixture(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "bandi-desktop-launcher-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, ".next", "standalone"), { recursive: true });
    mkdirSync(join(root, ".next", "standalone", ".next", "server"), {
      recursive: true,
    });
    mkdirSync(join(root, ".next", "static"), { recursive: true });
    writeFileSync(join(root, "src", "page.tsx"), "export default 1;\n");
    writeFileSync(join(root, "package.json"), "{}\n");
    writeFileSync(join(root, ".next", "standalone", "server.js"), "// fixture\n");
    writeFileSync(join(root, ".next", "standalone", ".next", "BUILD_ID"), "fixture\n");
    writeFileSync(join(root, ".next", "standalone", ".next", "server", "chunk.js"), "// fixture\n");
    for (const directory of [join(root, ".next"), join(root, ".next", "standalone", ".next")]) {
      writeFileSync(join(directory, "required-server-files.json"), "{}\n");
      writeFileSync(join(directory, "routes-manifest.json"), "{}\n");
    }
    writeFileSync(join(root, ".next", "static", "asset.js"), "// fixture\n");
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("desktop development launcher rebuilds only when inputs change", () => {
  withLauncherFixture((root) => {
    assert.deepEqual(inspectDesktopBuild(root), {
      needsBuild: true,
      reason: "missing_build",
    });

    const buildId = join(root, ".next", "BUILD_ID");
    writeFileSync(buildId, "fixture\n");
    writeDesktopBuildStamp(root);
    assert.deepEqual(inspectDesktopBuild(root), {
      needsBuild: false,
      reason: "up_to_date",
    });

    const source = join(root, "src", "page.tsx");
    writeFileSync(source, "export default 2;\n");
    const inspection = inspectDesktopBuild(root);
    assert.equal(inspection.needsBuild, true);
    assert.equal(inspection.reason, "inputs_changed");
  });
});

test("desktop development launcher refuses to stamp a build when inputs change mid-build", () => {
  withLauncherFixture((root) => {
    writeFileSync(join(root, ".next", "BUILD_ID"), "fixture\n");
    const beforeBuild = getDesktopBuildInputHash(root);
    writeFileSync(join(root, "src", "page.tsx"), "export default 3;\n");
    assert.throws(
      () => writeDesktopBuildStamp(root, beforeBuild),
      /changed while Next was compiling/,
    );
  });
});

test("desktop development launcher ignores Next-generated next-env declarations", () => {
  withLauncherFixture((root) => {
    writeFileSync(join(root, ".next", "BUILD_ID"), "fixture\n");
    const beforeBuild = getDesktopBuildInputHash(root);
    writeFileSync(join(root, "next-env.d.ts"), "/// <reference types=\"next\" />\n");
    assert.doesNotThrow(() => writeDesktopBuildStamp(root, beforeBuild));
    assert.equal(inspectDesktopBuild(root).reason, "up_to_date");
  });
});

test("desktop development launcher detects deleted inputs and environment changes", () => {
  withLauncherFixture((root) => {
    writeFileSync(join(root, ".next", "BUILD_ID"), "fixture\n");
    writeFileSync(join(root, ".env.local"), "NEXT_PUBLIC_MODE=first\n");
    writeDesktopBuildStamp(root);
    assert.equal(inspectDesktopBuild(root).needsBuild, false);

    writeFileSync(join(root, ".env.local"), "NEXT_PUBLIC_MODE=second\n");
    assert.equal(inspectDesktopBuild(root).reason, "inputs_changed");
    writeDesktopBuildStamp(root);
    rmSync(join(root, "src", "page.tsx"));
    assert.equal(inspectDesktopBuild(root).reason, "inputs_changed");
  });
});

test("desktop development launcher detects incomplete build outputs", () => {
  withLauncherFixture((root) => {
    writeFileSync(join(root, ".next", "BUILD_ID"), "fixture\n");
    writeDesktopBuildStamp(root);
    rmSync(join(root, ".next", "standalone", "server.js"));
    assert.equal(inspectDesktopBuild(root).reason, "incomplete_build");
  });
  withLauncherFixture((root) => {
    writeFileSync(join(root, ".next", "BUILD_ID"), "fixture\n");
    writeDesktopBuildStamp(root);
    rmSync(join(root, ".next", "static"), { recursive: true, force: true });
    assert.equal(inspectDesktopBuild(root).reason, "incomplete_build");
  });
  withLauncherFixture((root) => {
    writeFileSync(join(root, ".next", "BUILD_ID"), "");
    assert.equal(inspectDesktopBuild(root).reason, "missing_build");
  });
  withLauncherFixture((root) => {
    writeFileSync(join(root, ".next", "BUILD_ID"), "   \n");
    assert.equal(inspectDesktopBuild(root).reason, "missing_build");
  });
  withLauncherFixture((root) => {
    writeFileSync(join(root, ".next", "BUILD_ID"), "fixture\n");
    writeFileSync(join(root, ".next", "standalone", "server.js"), "");
    assert.equal(inspectDesktopBuild(root).reason, "incomplete_build");
  });
  withLauncherFixture((root) => {
    writeFileSync(join(root, ".next", "BUILD_ID"), "fixture\n");
    writeFileSync(join(root, ".next", "standalone", ".next", "BUILD_ID"), "other\n");
    assert.equal(inspectDesktopBuild(root).reason, "incomplete_build");
  });
});

test("standalone preparation refuses link and junction mirror targets", () => {
  const root = mkdtempSync(join(tmpdir(), "bandi-standalone-junction-"));
  const outside = mkdtempSync(join(tmpdir(), "bandi-standalone-outside-"));
  const junction = join(root, ".next", "standalone", ".next");
  try {
    mkdirSync(join(root, ".next", "standalone"), { recursive: true });
    mkdirSync(join(root, ".next", "static"), { recursive: true });
    writeFileSync(join(root, ".next", "static", "current.js"), "current\n");
    writeFileSync(join(outside, "sentinel.txt"), "keep\n");
    symlinkSync(outside, junction, "junction");

    const result = spawnSync(
      process.execPath,
      [resolve("scripts/prepare-standalone.mjs")],
      { cwd: root, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /link or junction/);
    assert.equal(existsSync(join(outside, "sentinel.txt")), true);
    assert.equal(existsSync(join(outside, "static", "current.js")), false);
  } finally {
    rmSync(junction, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("standalone preparation refuses a junction at the standalone root", () => {
  const root = mkdtempSync(join(tmpdir(), "bandi-standalone-root-junction-"));
  const outside = mkdtempSync(join(tmpdir(), "bandi-standalone-root-outside-"));
  const junction = join(root, ".next", "standalone");
  try {
    mkdirSync(join(root, ".next"), { recursive: true });
    mkdirSync(join(root, ".next", "static"), { recursive: true });
    writeFileSync(join(root, ".next", "static", "current.js"), "current\n");
    writeFileSync(join(outside, "sentinel.txt"), "keep\n");
    symlinkSync(outside, junction, "junction");

    const result = spawnSync(
      process.execPath,
      [resolve("scripts/prepare-standalone.mjs")],
      { cwd: root, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /link or junction/);
    assert.equal(existsSync(join(outside, "sentinel.txt")), true);
    assert.equal(existsSync(join(outside, ".next", "static", "current.js")), false);
  } finally {
    rmSync(junction, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("standalone preparation mirrors public and static directories", () => {
  const root = mkdtempSync(join(tmpdir(), "bandi-standalone-prepare-"));
  try {
    mkdirSync(join(root, ".next", "standalone", ".next", "static"), { recursive: true });
    mkdirSync(join(root, ".next", "static"), { recursive: true });
    mkdirSync(join(root, ".next", "standalone", "public"), { recursive: true });
    mkdirSync(join(root, "public"), { recursive: true });
    writeFileSync(join(root, ".next", "standalone", ".next", "static", "stale.js"), "stale\n");
    writeFileSync(join(root, ".next", "static", "current.js"), "current\n");
    writeFileSync(join(root, ".next", "standalone", "public", "stale.txt"), "stale\n");
    writeFileSync(join(root, "public", "current.txt"), "current\n");

    const script = resolve("scripts/prepare-standalone.mjs");
    const first = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(existsSync(join(root, ".next", "standalone", ".next", "static", "stale.js")), false);
    assert.equal(existsSync(join(root, ".next", "standalone", ".next", "static", "current.js")), true);
    assert.equal(existsSync(join(root, ".next", "standalone", "public", "stale.txt")), false);
    assert.equal(existsSync(join(root, ".next", "standalone", "public", "current.txt")), true);

    rmSync(join(root, "public"), { recursive: true, force: true });
    const second = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(existsSync(join(root, ".next", "standalone", "public")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("desktop shortcut targets the on-demand Electron launcher", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const shortcut = readFileSync("scripts/create-shortcut.ps1", "utf8");
  assert.equal(pkg.scripts["desktop:start"], "node scripts/desktop-dev-start.mjs");
  assert.equal(
    pkg.scripts["desktop:check-build"],
    "node scripts/desktop-dev-start.mjs --check",
  );
  assert.match(shortcut, /start-bandi-desktop-dev\.bat/);
  assert.match(shortcut, /按需构建并启动 Electron/);
  assert.match(
    pkg.scripts["desktop:pack"],
    /^npm run build && npm run desktop:prepare && electron-builder --dir$/,
  );
  assert.match(
    pkg.scripts["desktop:dist"],
    /^npm run build && npm run desktop:prepare && electron-builder --win$/,
  );
});
