const path = require("node:path");

const MIN_MANAGED_QBIT_PORT = 18180;

function normalizeWindowsPath(value) {
  return path.win32.normalize(value.trim());
}

function isFullyQualifiedWindowsPath(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const candidate = value.trim();
  if (/^[\\/]{2}[?.][\\/]/.test(candidate)) return false;
  const hasDriveRoot = /^[A-Za-z]:[\\/]/.test(candidate);
  const hasCompleteUncRoot =
    /^[\\/]{2}[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(candidate);
  return (
    (hasDriveRoot || hasCompleteUncRoot) &&
    path.win32.isAbsolute(candidate)
  );
}

function isSafeAbsoluteWindowsPath(value) {
  if (!isFullyQualifiedWindowsPath(value)) return false;
  const normalized = normalizeWindowsPath(value);
  return normalized !== path.win32.parse(normalized).root;
}

function isSafeAbsoluteDirectory(value) {
  return isSafeAbsoluteWindowsPath(value);
}

function defaultDownloadDir({ userDataDir, videosDir }) {
  const baseDir = isSafeAbsoluteDirectory(videosDir)
    ? normalizeWindowsPath(videosDir)
    : isSafeAbsoluteDirectory(userDataDir)
      ? normalizeWindowsPath(userDataDir)
      : null;
  if (!baseDir) {
    throw new Error("无法解析 Windows 用户视频目录或应用数据目录");
  }
  return path.win32.join(baseDir, "Bandi", "Downloads");
}

function resolveConfiguredDownloadDir({
  existingDownloadDir,
  userDataDir,
  videosDir,
}) {
  const fallback = defaultDownloadDir({ userDataDir, videosDir });
  if (!isSafeAbsoluteDirectory(existingDownloadDir)) {
    return fallback;
  }
  return normalizeWindowsPath(existingDownloadDir);
}

function normalizeManagedQbitPort(value) {
  const port = Number(value || 0);
  return Number.isInteger(port) && port >= MIN_MANAGED_QBIT_PORT && port <= 65535
    ? port
    : 0;
}

module.exports = {
  MIN_MANAGED_QBIT_PORT,
  defaultDownloadDir,
  isFullyQualifiedWindowsPath,
  isSafeAbsoluteDirectory,
  isSafeAbsoluteWindowsPath,
  normalizeManagedQbitPort,
  resolveConfiguredDownloadDir,
};
