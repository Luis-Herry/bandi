import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const manifestPath = path.join(root, "local-server", "macos-assets.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const archArg = process.argv.find((value) => value.startsWith("--arch="));
const arch = archArg?.slice("--arch=".length);
const downloadOnly = process.argv.includes("--download-only");
if (!arch || !["x64", "arm64"].includes(arch)) {
  throw new Error("Use --arch=x64 or --arch=arm64");
}

const output = path.join(root, "vendor", "macos", arch);
const downloads = path.join(output, "downloads");
fs.mkdirSync(downloads, { recursive: true });

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function verify(file, expected, label) {
  const actual = digest(file);
  if (actual !== expected.toLowerCase()) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expected}, received ${actual}`);
  }
}

async function download(url, destination, expected, label, override) {
  if (override) {
    const source = path.resolve(override);
    verify(source, expected, label);
    fs.copyFileSync(source, destination);
    return;
  }
  if (fs.existsSync(destination)) {
    try {
      verify(destination, expected, label);
      return;
    } catch {
      fs.rmSync(destination, { force: true });
    }
  }
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Bandi macOS release builder" },
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`${label} download failed: HTTP ${response.status}`);
  const temporary = `${destination}.part-${process.pid}`;
  fs.writeFileSync(temporary, Buffer.from(await response.arrayBuffer()));
  try {
    verify(temporary, expected, label);
    fs.renameSync(temporary, destination);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw new Error(
      `${error.message}. SourceForge may have returned an HTML page; set BANDI_QBIT_DMG_PATH to the official DMG downloaded in a browser.`,
    );
  }
}

const nodeAsset = manifest.node[arch];
const qbitAsset = manifest.qbittorrent[arch];
const nodeArchive = path.join(downloads, `node-v${manifest.node.version}-darwin-${arch}.tar.gz`);
const qbitDmg = path.join(output, `qbittorrent-${qbitAsset.version}.dmg`);
const qbitSource = path.join(output, `qbittorrent-${qbitAsset.version}-source.tar.gz`);

await download(nodeAsset.url, nodeArchive, nodeAsset.sha256, "Node.js runtime", process.env.BANDI_NODE_ARCHIVE_PATH);
await download(qbitAsset.url, qbitDmg, qbitAsset.sha256, "qBittorrent DMG", process.env.BANDI_QBIT_DMG_PATH);
await download(qbitAsset.sourceUrl, qbitSource, qbitAsset.sourceSha256, "qBittorrent source", process.env.BANDI_QBIT_SOURCE_PATH);

const nodeRoot = path.join(output, `node-v${manifest.node.version}`);
const nodeBinary = path.join(nodeRoot, "bin", "node");
if (!downloadOnly && !fs.existsSync(nodeBinary)) {
  fs.mkdirSync(nodeRoot, { recursive: true });
  const result = spawnSync("tar", ["-xzf", nodeArchive, "-C", nodeRoot, "--strip-components=1"], {
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Node.js archive extraction failed: ${result.error?.message || result.status}`);
  }
}
if (!downloadOnly && process.platform !== "win32") fs.chmodSync(nodeBinary, 0o755);

const notice = [
  `qBittorrent ${qbitAsset.version} macOS ${arch}`,
  `Binary: ${qbitAsset.url}`,
  `Binary SHA-256: ${qbitAsset.sha256}`,
  `Corresponding source: ${qbitAsset.sourceUrl}`,
  `Source SHA-256: ${qbitAsset.sourceSha256}`,
  "License: GPLv3+ for the distributed binary. See THIRD_PARTY_NOTICES.md.",
  "",
].join("\n");
fs.writeFileSync(path.join(output, "NOTICE.txt"), notice, "utf8");
console.log(`[macos-assets] ${arch} assets verified in ${path.relative(root, output)}`);
