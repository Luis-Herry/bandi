import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneModules = path.join(root, ".next", "standalone", "node_modules");
const sourceModules = path.join(root, "node_modules");
const outputFile = path.join(root, "THIRD_PARTY_LICENSES.txt");
const noticeFilePattern = /^(?:licen[sc]e|copying|notice)(?:[._-].*)?$/iu;

const mitFallback = `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

if (!existsSync(standaloneModules)) {
  throw new Error(
    "Missing .next/standalone/node_modules. Run npm run build and desktop:prepare first.",
  );
}

const packageManifests = listFiles(standaloneModules).filter(
  (file) => path.basename(file).toLowerCase() === "package.json",
);
const packages = new Map();

for (const manifestPath of packageManifests) {
  const manifest = readJson(manifestPath);
  if (!manifest?.name || !manifest?.version) continue;

  const packageDir = path.dirname(manifestPath);
  const relativeDir = path.relative(standaloneModules, packageDir);
  const sourceDir = path.join(sourceModules, relativeDir);
  const notices = collectNoticeFiles([sourceDir, packageDir]);
  const license = normalizeLicense(manifest.license ?? manifest.licenses);
  const key = `${manifest.name}@${manifest.version}`;
  const candidate = {
    key,
    name: manifest.name,
    version: manifest.version,
    license,
    author: normalizeAuthor(manifest.author),
    repository: normalizeRepository(manifest.repository),
    notices,
  };
  const current = packages.get(key);
  if (!current || candidate.notices.length > current.notices.length) {
    packages.set(key, candidate);
  }
}

const unsupported = [...packages.values()].filter(
  (pkg) => pkg.notices.length === 0 && pkg.license !== "MIT",
);
if (unsupported.length > 0) {
  throw new Error(
    `Packages without redistributable notice text: ${unsupported
      .map((pkg) => `${pkg.key} (${pkg.license || "license missing"})`)
      .join(", ")}`,
  );
}

const sections = [...packages.values()]
  .sort((left, right) => left.key.localeCompare(right.key, "en"))
  .map(renderPackageSection);
const generated = [
  "Bandi / 追番中心 - bundled npm dependency licenses",
  "",
  "Generated from the packages traced into .next/standalone/node_modules.",
  "Electron/Chromium, Node.js, qBittorrent, external data, and project assets",
  "are documented separately in THIRD_PARTY_NOTICES.md and ASSETS.md.",
  "",
  `Included npm packages: ${sections.length}`,
  "",
  ...sections,
  "",
].join("\n");

writeFileSync(outputFile, generated, "utf8");
console.log(
  `[desktop] wrote ${path.basename(outputFile)} for ${sections.length} bundled npm packages`,
);

function listFiles(directory) {
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink() || lstatSync(target).isSymbolicLink()) continue;
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  return files;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function collectNoticeFiles(directories) {
  for (const directory of directories) {
    if (!existsSync(directory) || !statSync(directory).isDirectory()) continue;
    const files = readdirSync(directory, { withFileTypes: true })
      .filter(
        (entry) => entry.isFile() && noticeFilePattern.test(entry.name),
      )
      .map((entry) => path.join(directory, entry.name))
      .sort((left, right) => left.localeCompare(right, "en"));
    if (files.length > 0) {
      return files.map((file) => ({
        name: path.basename(file),
        text: readFileSync(file, "utf8").replaceAll("\r\n", "\n").trim(),
      }));
    }
  }
  return [];
}

function normalizeLicense(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeLicense(item?.type ?? item))
      .filter(Boolean)
      .join(" OR ");
  }
  if (value && typeof value === "object") {
    return normalizeLicense(value.type);
  }
  return "";
}

function normalizeAuthor(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  return [value.name, value.email && `<${value.email}>`]
    .filter(Boolean)
    .join(" ");
}

function normalizeRepository(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  return typeof value.url === "string" ? value.url.trim() : "";
}

function renderPackageSection(pkg) {
  const notices =
    pkg.notices.length > 0
      ? pkg.notices
          .map((notice) => `--- ${notice.name} ---\n${notice.text}`)
          .join("\n\n")
      : [
          "Upstream package declares MIT in package.json and does not ship a",
          "separate notice file. Copyright remains with its upstream contributors.",
          "",
          mitFallback,
        ].join("\n");
  return [
    "=".repeat(80),
    pkg.key,
    `License: ${pkg.license || "not declared"}`,
    ...(pkg.author ? [`Author: ${pkg.author}`] : []),
    ...(pkg.repository ? [`Repository: ${pkg.repository}`] : []),
    "",
    notices,
  ].join("\n");
}
