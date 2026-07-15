import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const [artifactRootArg, versionArg, releaseJsonArg] = process.argv.slice(2);
if (!artifactRootArg || !versionArg) {
  throw new Error("Usage: node scripts/verify-release-artifacts.mjs <artifact-root> <version>");
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(versionArg)) {
  throw new Error("Release version is not a supported semver value");
}

const artifactRoot = path.resolve(artifactRootArg);
const version = versionArg;
const expectedMetadata = [
  {
    manifest: "latest.yml",
    payload: `Bandi-Setup-${version}-x64.exe`,
  },
  {
    manifest: "latest-x64-mac.yml",
    payload: `Bandi-Local-Web-${version}-macOS-x64.zip`,
  },
  {
    manifest: "latest-arm64-mac.yml",
    payload: `Bandi-Local-Web-${version}-macOS-arm64.zip`,
  },
];
const requiredFiles = new Set([
  `Bandi-Setup-${version}-x64.exe`,
  `Bandi-Setup-${version}-x64.exe.blockmap`,
  `Bandi-${version}-x64-portable.exe`,
  `Bandi-Local-Web-${version}-macOS-x64.dmg`,
  `Bandi-Local-Web-${version}-macOS-x64.zip`,
  `Bandi-Local-Web-${version}-macOS-arm64.dmg`,
  `Bandi-Local-Web-${version}-macOS-arm64.zip`,
  ...expectedMetadata.map(({ manifest }) => manifest),
]);
const optionalFiles = new Set([
  `Bandi-Local-Web-${version}-macOS-x64.zip.blockmap`,
  `Bandi-Local-Web-${version}-macOS-arm64.zip.blockmap`,
]);

function requireRegularFile(fileName) {
  const filePath = path.join(artifactRoot, fileName);
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size <= 0) {
    throw new Error(`Missing or empty release artifact: ${fileName}`);
  }
  return { filePath, stat };
}

function sha512Base64(filePath) {
  return crypto.createHash("sha512").update(fs.readFileSync(filePath)).digest("base64");
}

for (const fileName of requiredFiles) requireRegularFile(fileName);

const actualFiles = fs
  .readdirSync(artifactRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((fileName) => fileName !== "SHA256SUMS.txt")
  .sort();
for (const fileName of actualFiles) {
  if (!requiredFiles.has(fileName) && !optionalFiles.has(fileName)) {
    throw new Error(`Unexpected release artifact: ${fileName}`);
  }
}

for (const { manifest, payload } of expectedMetadata) {
  const { filePath: manifestPath } = requireRegularFile(manifest);
  const source = fs.readFileSync(manifestPath, "utf8");
  const parsed = yaml.load(source);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${manifest} is not a YAML object`);
  }
  const updateInfo = parsed;
  if (!Array.isArray(updateInfo.files) || updateInfo.files.length !== 1) {
    throw new Error(`${manifest} must contain exactly one files entry`);
  }
  const fileInfo = updateInfo.files[0];
  if (!fileInfo || typeof fileInfo !== "object" || Array.isArray(fileInfo)) {
    throw new Error(`${manifest} files[0] is invalid`);
  }
  const manifestVersion = updateInfo.version;
  const url = fileInfo.url;
  const listedSha512 = fileInfo.sha512;
  const listedSize = fileInfo.size;
  const primaryPath = updateInfo.path;
  const primarySha512 = updateInfo.sha512;
  if (manifestVersion !== version) throw new Error(`${manifest} version does not match package version`);
  if (url !== payload || primaryPath !== payload) {
    throw new Error(`${manifest} points to an unexpected payload`);
  }
  if (manifest === "latest.yml" && /portable/i.test(source)) {
    throw new Error("latest.yml must not route the NSIS updater to the portable executable");
  }
  const { filePath: payloadPath, stat } = requireRegularFile(payload);
  const actualSha512 = sha512Base64(payloadPath);
  if (listedSize !== stat.size) throw new Error(`${manifest} payload size is incorrect`);
  if (listedSha512 !== actualSha512 || primarySha512 !== actualSha512) {
    throw new Error(`${manifest} payload sha512 is incorrect`);
  }
}

if (releaseJsonArg) {
  const release = JSON.parse(fs.readFileSync(path.resolve(releaseJsonArg), "utf8"));
  if (release?.draft !== true) throw new Error("Remote Release is not a draft");
  if (!Array.isArray(release.assets)) throw new Error("Remote Release assets are missing");
  const remoteByName = new Map();
  for (const asset of release.assets) {
    if (!asset || typeof asset.name !== "string" || remoteByName.has(asset.name)) {
      throw new Error("Remote Release contains an invalid or duplicate asset name");
    }
    remoteByName.set(asset.name, asset);
  }
  const expectedRemoteNames = [...actualFiles, "SHA256SUMS.txt"].sort();
  if (
    JSON.stringify([...remoteByName.keys()].sort()) !==
    JSON.stringify(expectedRemoteNames)
  ) {
    throw new Error("Remote Release asset names do not match local verified assets");
  }
  for (const fileName of expectedRemoteNames) {
    const filePath = path.join(artifactRoot, fileName);
    const stat = fs.statSync(filePath);
    const remote = remoteByName.get(fileName);
    if (remote.size !== stat.size) {
      throw new Error(`Remote Release asset size is incorrect: ${fileName}`);
    }
    if (typeof remote.digest !== "string" || !remote.digest) {
      throw new Error(`Remote Release asset digest is unavailable: ${fileName}`);
    }
    const digest = `sha256:${crypto
      .createHash("sha256")
      .update(fs.readFileSync(filePath))
      .digest("hex")}`;
    if (remote.digest.toLowerCase() !== digest) {
      throw new Error(`Remote Release asset digest is incorrect: ${fileName}`);
    }
  }
}

const checksums = actualFiles
  .map((fileName) => {
    const hash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(artifactRoot, fileName)))
      .digest("hex");
    return `${hash}  ${fileName}`;
  })
  .join("\n");
fs.writeFileSync(path.join(artifactRoot, "SHA256SUMS.txt"), `${checksums}\n`, "utf8");
console.log(`Verified ${actualFiles.length} release artifacts for ${version}`);
