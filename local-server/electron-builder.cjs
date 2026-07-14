const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const pkg = require("../package.json");
const assets = require("./macos-assets.json");

const arch = process.env.BANDI_MAC_ARCH;
if (!arch || !["x64", "arm64"].includes(arch)) {
  throw new Error("BANDI_MAC_ARCH must be x64 or arm64");
}
if (process.platform !== "darwin" || process.arch !== arch) {
  throw new Error(
    `macOS ${arch} artifacts must be built on a matching native ${arch} Mac`,
  );
}
const includeLocalFfmpeg = process.env.BANDI_LOCAL_ONLY_FFMPEG === "1";
const localFfmpegResources = [];
if (includeLocalFfmpeg) {
  const ffmpegPath = require("ffmpeg-static");
  const ffmpegSha256 = {
    x64: "EBDDDC936F61E14049A2D4B549A412B8A40DEEFF6540E58A9F2A2DA9E6B18894",
    arm64: "A90E3DB6A3FD35F6074B013F948B1AA45B31C6375489D39E572BEA3F18336584",
  }[arch];
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw new Error("ffmpeg-static 5.3.0 binary is missing");
  }
  const actualFfmpegSha256 = crypto
    .createHash("sha256")
    .update(fs.readFileSync(ffmpegPath))
    .digest("hex")
    .toUpperCase();
  if (actualFfmpegSha256 !== ffmpegSha256) {
    throw new Error(`ffmpeg-static 5.3.0 ${arch} integrity check failed`);
  }
  localFfmpegResources.push(
    { from: ffmpegPath, to: "vendor/ffmpeg/ffmpeg" },
    { from: `${ffmpegPath}.LICENSE`, to: "vendor/ffmpeg/LICENSE.binary.txt" },
    { from: `${ffmpegPath}.README`, to: "vendor/ffmpeg/README.binary.txt" },
    { from: "node_modules/ffmpeg-static/LICENSE", to: "vendor/ffmpeg/LICENSE.ffmpeg-static.txt" },
    { from: "node_modules/ffmpeg-static/README.md", to: "vendor/ffmpeg/README.ffmpeg-static.md" },
    { from: "desktop/LOCAL_ONLY_DO_NOT_RELEASE.txt", to: "LOCAL_ONLY_DO_NOT_RELEASE.txt" },
  );
}
const nodeVersion = assets.node.version;
const qbitVersion = assets.qbittorrent[arch].version;
const vendorRoot = path.join("vendor", "macos", arch);

module.exports = {
  appId: "cn.luis.bandi.localweb",
  productName: "Bandi Local Web",
  copyright: `Copyright © ${new Date().getFullYear()} ${pkg.author}`,
  asar: false,
  npmRebuild: false,
  extraMetadata: {
    main: "local-server/main.cjs",
  },
  directories: {
    output: includeLocalFfmpeg
      ? `release/local-only-do-not-release/macos-${arch}`
      : `release/macos-${arch}`,
  },
  files: [
    "local-server/**/*",
    ".next/standalone/**/*",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "THIRD_PARTY_LICENSES.txt",
    "ASSETS.md",
    "package.json",
  ],
  extraResources: [
    {
      from: `${vendorRoot}/node-v${nodeVersion}`,
      to: "vendor/node",
      filter: ["**/*"],
    },
    {
      from: `${vendorRoot}/qbittorrent-${qbitVersion}.dmg`,
      to: "vendor/qbittorrent/qbittorrent.dmg",
    },
    {
      from: `${vendorRoot}/qbittorrent-${qbitVersion}-source.tar.gz`,
      to: `vendor/qbittorrent/qbittorrent-${qbitVersion}-source.tar.gz`,
    },
    {
      from: `${vendorRoot}/NOTICE.txt`,
      to: "vendor/qbittorrent/NOTICE.txt",
    },
    ...localFfmpegResources,
  ],
  mac: {
    category: "public.app-category.entertainment",
    minimumSystemVersion: "13.0.0",
    icon: "public/brand/app-logo.png",
    target: [
      { target: "dmg", arch: [arch] },
      { target: "zip", arch: [arch] },
    ],
    artifactName: includeLocalFfmpeg
      ? `Bandi-Local-Web-LOCAL-ONLY-DO-NOT-RELEASE-${pkg.version}-macOS-${arch}.\${ext}`
      : `Bandi-Local-Web-${pkg.version}-macOS-${arch}.\${ext}`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
  },
  dmg: {
    title: `Bandi Local Web ${pkg.version}`,
    artifactName: includeLocalFfmpeg
      ? `Bandi-Local-Web-LOCAL-ONLY-DO-NOT-RELEASE-${pkg.version}-macOS-${arch}.dmg`
      : `Bandi-Local-Web-${pkg.version}-macOS-${arch}.dmg`,
  },
};
