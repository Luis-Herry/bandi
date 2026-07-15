import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const archArg = process.argv.find((value) => value.startsWith("--arch="));
const arch = archArg?.slice("--arch=".length);
const includeLocalFfmpeg = process.argv.includes("--local-ffmpeg");
const assets = JSON.parse(fs.readFileSync(path.join("local-server", "macos-assets.json"), "utf8"));
if (!arch || !["x64", "arm64"].includes(arch)) {
  throw new Error("Use --arch=x64 or --arch=arm64");
}
if (process.platform !== "darwin" || process.arch !== arch) {
  throw new Error(`Build ${arch} on a matching macOS ${arch} machine; current host is ${process.platform}/${process.arch}`);
}
if (process.versions.node !== assets.node.version) {
  throw new Error(
    `Build Bandi with Node.js ${assets.node.version}; current runtime is ${process.versions.node}`,
  );
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error?.message || result.status}`);
  }
}

const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this script through npm");
run(process.execPath, [npm, "run", "build"]);
run(process.execPath, [npm, "run", "desktop:prepare"]);
if (includeLocalFfmpeg) run(process.execPath, [npm, "run", "media:verify-ffmpeg"]);
run(process.execPath, [path.join("scripts", "prepare-macos-assets.mjs"), `--arch=${arch}`]);

const packagedSqlite = path.join(".next", "standalone", "node_modules", "better-sqlite3");
const nativeModule = path.join(packagedSqlite, "build", "Release", "better_sqlite3.node");
if (!fs.existsSync(nativeModule)) throw new Error("better-sqlite3 native module is missing");
const fileResult = spawnSync("/usr/bin/file", [nativeModule], { encoding: "utf8" });
const expected = arch === "x64" ? "x86_64" : "arm64";
if (fileResult.status !== 0 || !fileResult.stdout.includes(expected)) {
  throw new Error(`better-sqlite3 architecture mismatch: expected ${expected}, received ${fileResult.stdout || fileResult.stderr}`);
}

const bundledNode = path.join(
  "vendor",
  "macos",
  arch,
  `node-v${assets.node.version}`,
  "bin",
  "node",
);
const abiProbe = [
  "const fs = require('node:fs');",
  "const os = require('node:os');",
  "const path = require('node:path');",
  `const Database = require(${JSON.stringify(path.resolve(packagedSqlite))});`,
  "const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bandi-sqlite-abi-'));",
  "const file = path.join(directory, 'probe.db');",
  "try {",
  "  const db = new Database(file);",
  "  db.exec('CREATE TABLE probe (value TEXT NOT NULL); INSERT INTO probe VALUES (\\'ok\\');');",
  "  const row = db.prepare('SELECT value FROM probe').get();",
  "  db.close();",
  "  if (row?.value !== 'ok') throw new Error('SQLite ABI probe returned unexpected data');",
  "} finally {",
  "  fs.rmSync(directory, { recursive: true, force: true });",
  "}",
].join("\n");
run(bundledNode, ["-e", abiProbe]);

const builder = path.join("node_modules", "electron-builder", "out", "cli", "cli.js");
run(process.execPath, [
  builder,
  "--config",
  "local-server/electron-builder.cjs",
  "--mac",
  `--${arch}`,
  "--publish",
  "never",
], {
  BANDI_MAC_ARCH: arch,
  BANDI_LOCAL_ONLY_FFMPEG: includeLocalFfmpeg ? "1" : "0",
});
