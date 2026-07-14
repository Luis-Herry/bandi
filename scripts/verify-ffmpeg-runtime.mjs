import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const binary = require("ffmpeg-static");
const packageMetadata = require("ffmpeg-static/package.json");
const expectedHashes = {
  "win32-x64": "04E1307997530F9CF2FE35CBA2CA7E8875CA91DA02F89D6C7243DF819C94AD00",
  "darwin-x64": "EBDDDC936F61E14049A2D4B549A412B8A40DEEFF6540E58A9F2A2DA9E6B18894",
  "darwin-arm64": "A90E3DB6A3FD35F6074B013F948B1AA45B31C6375489D39E572BEA3F18336584",
};

if (packageMetadata.version !== "5.3.0") {
  throw new Error(`Expected ffmpeg-static 5.3.0, received ${packageMetadata.version}`);
}
if (!binary || !fs.existsSync(binary)) {
  throw new Error("ffmpeg-static binary is missing");
}
const platformKey = `${process.platform}-${process.arch}`;
const expectedHash = expectedHashes[platformKey];
if (!expectedHash) {
  throw new Error(`Unsupported FFmpeg packaging target: ${platformKey}`);
}
const actualHash = createHash("sha256")
  .update(fs.readFileSync(binary))
  .digest("hex")
  .toUpperCase();
if (actualHash !== expectedHash) {
  throw new Error(`ffmpeg-static integrity check failed for ${platformKey}`);
}

function run(args) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `FFmpeg ${args.join(" ")} failed: ${result.error?.message || result.stderr || result.status}`,
    );
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

const versionOutput = run(["-hide_banner", "-version"]);
const versionMatch = versionOutput.match(
  /ffmpeg version\s+(?:n)?(\d+)\.(\d+)(?:\.(\d+))?/i,
);
const majorVersion = Number(versionMatch?.[1]);
if (!Number.isFinite(majorVersion) || majorVersion < 6 || majorVersion > 8) {
  throw new Error(
    "The FFmpeg version is outside Bandi's verified 6–8 compatibility range",
  );
}
const encodersOutput = run(["-hide_banner", "-encoders"]);
if (!/\blibx264\b/i.test(encodersOutput) || !/^\s*A\S*\s+.*\baac\b/im.test(encodersOutput)) {
  throw new Error("The bundled FFmpeg is missing libx264 or AAC encoding support");
}
for (const suffix of [".LICENSE", ".README"]) {
  if (!fs.existsSync(`${binary}${suffix}`)) {
    throw new Error(`The bundled FFmpeg is missing ${suffix.slice(1)} provenance`);
  }
}

console.log(
  `ffmpeg-static 5.3.0 / FFmpeg ${versionMatch?.slice(1).filter(Boolean).join(".")} verified for ${platformKey} (${actualHash})`,
);
