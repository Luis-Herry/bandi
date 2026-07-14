const fs = require("node:fs");
const path = require("node:path");

const MIN_MANAGED_QBIT_PORT = 18180;

function isSafeAbsoluteMacPath(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const candidate = value.trim();
  if (candidate.includes("\0") || !path.posix.isAbsolute(candidate)) return false;
  const normalized = path.posix.normalize(candidate);
  return normalized !== path.posix.parse(normalized).root;
}

function defaultMacDownloadDir({ moviesDir, userDataDir }) {
  const baseDir = isSafeAbsoluteMacPath(moviesDir)
    ? path.posix.normalize(moviesDir)
    : isSafeAbsoluteMacPath(userDataDir)
      ? path.posix.normalize(userDataDir)
      : null;
  if (!baseDir) {
    throw new Error("无法解析 macOS 影片目录或应用数据目录");
  }
  return path.posix.join(baseDir, "Bandi", "Downloads");
}

function resolveConfiguredDownloadDir({ existingDownloadDir, moviesDir, userDataDir }) {
  const fallback = defaultMacDownloadDir({ moviesDir, userDataDir });
  if (!isSafeAbsoluteMacPath(existingDownloadDir)) return fallback;
  return path.posix.normalize(existingDownloadDir.trim());
}

function normalizeManagedQbitPort(value) {
  const port = Number(value || 0);
  return Number.isInteger(port) && port >= MIN_MANAGED_QBIT_PORT && port <= 65535
    ? port
    : 0;
}

function inspectWritableDirectory(value, { create = false } = {}) {
  if (!isSafeAbsoluteMacPath(value)) {
    return {
      ok: false,
      error: `必须使用完整的 macOS 子目录：${String(value || "").trim()}`,
    };
  }
  const directory = path.posix.normalize(value.trim());
  try {
    if (create) fs.mkdirSync(directory, { recursive: true });
    const stat = fs.statSync(directory);
    if (!stat.isDirectory()) return { ok: false, error: "所选位置不是文件夹" };
    const probe = path.join(
      directory,
      `.bandi-write-test-${process.pid}-${Date.now()}`,
    );
    fs.writeFileSync(probe, "ok", { encoding: "utf8", flag: "wx" });
    fs.unlinkSync(probe);
    const disk = fs.statfsSync(directory);
    return {
      ok: true,
      directory,
      freeSpaceBytes: Number(disk.bavail) * Number(disk.bsize),
    };
  } catch (error) {
    return {
      ok: false,
      error: `无法写入该目录：${error?.code || error?.message || "unknown"}`,
    };
  }
}

module.exports = {
  MIN_MANAGED_QBIT_PORT,
  defaultMacDownloadDir,
  inspectWritableDirectory,
  isSafeAbsoluteMacPath,
  normalizeManagedQbitPort,
  resolveConfiguredDownloadDir,
};
