import { createHash } from "node:crypto";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffmpegBinary = require("ffmpeg-static");
const outputDirectory = path.resolve("release", "ffmpeg-source-offer");
const sourceAssets = [
  {
    name: "ffmpeg-static-5.3.0-source.tar.gz",
    url: "https://github.com/eugeneware/ffmpeg-static/archive/refs/tags/5.3.0.tar.gz",
    sha256: "BFE1B72218D0B4C6C843F672BA400EC71C59A1099B03A39419C318576360A2C4",
    revision: "24504b7d549c0400e099720b3d5854577693a63a",
  },
  {
    name: "ffmpeg-6.1.1-source.tar.xz",
    url: "https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz",
    sha256: "8684F4B00F94B85461884C3719382F1261F0D9EB3D59640A1F4AC0873616F968",
    revision: "e38092ef9395d7049f871ef4d5411eb410e283e0",
  },
];

function sha256(filePath) {
  return createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex")
    .toUpperCase();
}

async function download(asset) {
  const destination = path.join(outputDirectory, asset.name);
  if (fs.existsSync(destination) && sha256(destination) === asset.sha256) {
    return destination;
  }
  const partial = `${destination}.part`;
  fs.rmSync(destination, { force: true });
  fs.rmSync(partial, { force: true });
  const response = await fetch(asset.url, {
    redirect: "follow",
    headers: { "user-agent": "Bandi-source-offer/0.1.5" },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${asset.url}: HTTP ${response.status}`);
  }
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(partial, { flags: "wx", mode: 0o600 }),
    );
    const actual = sha256(partial);
    if (actual !== asset.sha256) {
      throw new Error(`${asset.name} SHA-256 mismatch: ${actual}`);
    }
    fs.renameSync(partial, destination);
  } catch (error) {
    fs.rmSync(partial, { force: true });
    throw error;
  }
  return destination;
}

fs.mkdirSync(outputDirectory, { recursive: true });
for (const asset of sourceAssets) await download(asset);

const platformKey = `${process.platform}-${process.arch}`;
const binaryHash = sha256(ffmpegBinary);
for (const suffix of [".LICENSE", ".README"]) {
  const source = `${ffmpegBinary}${suffix}`;
  if (!fs.existsSync(source)) throw new Error(`Missing FFmpeg ${suffix.slice(1)}`);
  fs.copyFileSync(
    source,
    path.join(outputDirectory, `ffmpeg-${platformKey}${suffix.toLowerCase()}.txt`),
  );
}

const manifest = {
  generatedAt: new Date().toISOString(),
  product: "Bandi 0.1.5",
  binary: {
    platform: platformKey,
    sha256: binaryHash,
    package: "ffmpeg-static@5.3.0",
    release: "b6.1.1",
  },
  sources: sourceAssets,
  status: "candidate_only",
  releaseBlocked: true,
  missingForCorrespondingSource: [
    "Exact sources for every statically linked external library in the packaged binary",
    "All patches and scripts used to control compilation and installation of those libraries",
    "Independent verification that the source set reproduces the packaged platform binary",
  ],
};
fs.writeFileSync(
  path.join(outputDirectory, "SOURCE-MANIFEST.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
fs.writeFileSync(
  path.join(outputDirectory, "README.md"),
  `# Bandi FFmpeg source-offer candidate\n\n` +
    `The two archives preserve ffmpeg-static 5.3.0 download/package scripts and FFmpeg 6.1.1 source at the revision named by the packaged Windows build. ` +
    `Keep these files as local provenance evidence while the release is blocked. If a future completeness review passes, upload the independently verified complete source set beside the matching binary on the same GitHub Release.\n\n` +
    `This directory is deliberately marked **candidate_only**. The packaged FFmpeg is GPLv3 and statically links external libraries such as libx264. ` +
    `Public binary release remains blocked until the complete sources, patches, and build/install scripts for every linked component are added and independently verified. ` +
    `Do not upload this incomplete candidate with a public binary or rename it “Corresponding Source” before that review passes.\n\n` +
    `The generated files live under the ignored release/ directory and must not be committed to Git.\n`,
  "utf8",
);

console.log(`Prepared source-offer candidate at ${outputDirectory}`);
console.log("PUBLIC BINARY RELEASE BLOCKED: complete Corresponding Source is not yet available.");
