const { execFileSync } = require("node:child_process");
const path = require("node:path");
const pkg = require("../package.json");

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("The local FFmpeg Windows package must be built on Windows x64");
}
execFileSync(process.execPath, [path.join(__dirname, "..", "scripts", "verify-ffmpeg-runtime.mjs")], {
  stdio: "inherit",
});
const ffmpegPath = require("ffmpeg-static");

module.exports = {
  ...pkg.build,
  directories: {
    ...pkg.build.directories,
    output: "release/local-only-do-not-release",
  },
  extraResources: [
    ...pkg.build.extraResources,
    { from: ffmpegPath, to: "vendor/ffmpeg/ffmpeg.exe" },
    { from: `${ffmpegPath}.LICENSE`, to: "vendor/ffmpeg/LICENSE.binary.txt" },
    { from: `${ffmpegPath}.README`, to: "vendor/ffmpeg/README.binary.txt" },
    { from: "node_modules/ffmpeg-static/LICENSE", to: "vendor/ffmpeg/LICENSE.ffmpeg-static.txt" },
    { from: "node_modules/ffmpeg-static/README.md", to: "vendor/ffmpeg/README.ffmpeg-static.md" },
    { from: "desktop/LOCAL_ONLY_DO_NOT_RELEASE.txt", to: "LOCAL_ONLY_DO_NOT_RELEASE.txt" },
  ],
  nsis: {
    ...pkg.build.nsis,
    artifactName: "${productName}-LOCAL-ONLY-DO-NOT-RELEASE-Setup-${version}-${arch}.${ext}",
  },
  portable: {
    ...pkg.build.portable,
    artifactName: "${productName}-LOCAL-ONLY-DO-NOT-RELEASE-${version}-${arch}-portable.${ext}",
  },
};
