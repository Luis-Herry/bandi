import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_FILES = new Set([
  "instrumentation.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
]);
const ENV_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
]);
const BUILD_STAMP = ".bandi-desktop-build.json";

function listFiles(paths) {
  const files = [];
  const pending = [...paths];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || !existsSync(current)) continue;
    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        pending.push(join(current, entry.name));
      }
      continue;
    }
    if (stat.isFile()) files.push(current);
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

function buildInputs(root) {
  const inputs = [join(root, "src")];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (
      ROOT_FILES.has(entry.name) ||
      ENV_FILES.has(entry.name) ||
      /\.config\.(?:js|cjs|mjs|ts)$/.test(entry.name)
    ) {
      inputs.push(join(root, entry.name));
    }
  }
  return inputs;
}

function buildInputHash(root) {
  const hash = createHash("sha256");
  for (const file of listFiles(buildInputs(root))) {
    const relativePath = relative(root, file).replaceAll("\\", "/");
    hash.update(relativePath);
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function getDesktopBuildInputHash(root) {
  return buildInputHash(root);
}

function hasNonEmptyDirectory(directory) {
  return (
    existsSync(directory) &&
    listFiles([directory]).some((file) => statSync(file).size > 0)
  );
}

function isNonEmptyFile(file) {
  return existsSync(file) && statSync(file).isFile() && statSync(file).size > 0;
}

function isJsonFile(file) {
  if (!isNonEmptyFile(file)) return false;
  try {
    JSON.parse(readFileSync(file, "utf8"));
    return true;
  } catch {
    return false;
  }
}

function readBuildId(file) {
  if (!isNonEmptyFile(file)) return null;
  const value = readFileSync(file, "utf8").trim();
  return value || null;
}

function inspectBuildOutputs(root) {
  const nextDir = join(root, ".next");
  const standaloneNext = join(nextDir, "standalone", ".next");
  const buildId = join(nextDir, "BUILD_ID");
  const standaloneBuildId = join(standaloneNext, "BUILD_ID");
  const buildIdValue = readBuildId(buildId);
  if (!buildIdValue) return "missing_build";
  const standaloneBuildIdValue = readBuildId(standaloneBuildId);
  if (
    !isNonEmptyFile(join(nextDir, "standalone", "server.js")) ||
    !standaloneBuildIdValue ||
    buildIdValue !== standaloneBuildIdValue ||
    !hasNonEmptyDirectory(join(standaloneNext, "server")) ||
    !hasNonEmptyDirectory(join(nextDir, "static")) ||
    !isJsonFile(join(nextDir, "required-server-files.json")) ||
    !isJsonFile(join(nextDir, "routes-manifest.json")) ||
    !isJsonFile(join(standaloneNext, "required-server-files.json")) ||
    !isJsonFile(join(standaloneNext, "routes-manifest.json"))
  ) {
    return "incomplete_build";
  }
  return null;
}

export function writeDesktopBuildStamp(root, expectedInputHash = buildInputHash(root)) {
  const outputError = inspectBuildOutputs(root);
  if (outputError) throw new Error(`Cannot stamp incomplete Next build: ${outputError}`);
  const currentInputHash = buildInputHash(root);
  if (currentInputHash !== expectedInputHash) {
    throw new Error("Build inputs changed while Next was compiling; run the launcher again.");
  }
  const stampPath = join(root, ".next", BUILD_STAMP);
  mkdirSync(dirname(stampPath), { recursive: true });
  writeFileSync(
    stampPath,
    `${JSON.stringify({ version: 1, inputHash: currentInputHash })}\n`,
    "utf8",
  );
}

export function inspectDesktopBuild(root) {
  const outputError = inspectBuildOutputs(root);
  if (outputError) return { needsBuild: true, reason: outputError };
  const stampPath = join(root, ".next", BUILD_STAMP);
  if (!existsSync(stampPath)) {
    return { needsBuild: true, reason: "missing_manifest" };
  }
  try {
    const stamp = JSON.parse(readFileSync(stampPath, "utf8"));
    if (stamp.version !== 1 || stamp.inputHash !== buildInputHash(root)) {
      return { needsBuild: true, reason: "inputs_changed" };
    }
  } catch {
    return { needsBuild: true, reason: "invalid_manifest" };
  }
  return { needsBuild: false, reason: "up_to_date" };
}

function runNode(root, entry, args = []) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const inspection = inspectDesktopBuild(root);
  const checkOnly = process.argv.includes("--check");
  console.log(
    inspection.needsBuild
      ? `[desktop] Next build required: ${inspection.reason}`
      : "[desktop] Next build is current; skipping rebuild.",
  );
  if (checkOnly) return;

  if (inspection.needsBuild) {
    const expectedInputHash = getDesktopBuildInputHash(root);
    runNode(root, join(root, "node_modules", "next", "dist", "bin", "next"), [
      "build",
    ]);
    writeDesktopBuildStamp(root, expectedInputHash);
  }
  // Fast and idempotent: keeps public/static assets beside the standalone server.
  runNode(root, join(root, "scripts", "prepare-standalone.mjs"));
  runNode(root, join(root, "node_modules", "electron", "cli.js"), ["."]);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : "";
if (invokedPath === fileURLToPath(import.meta.url).toLowerCase()) main();
