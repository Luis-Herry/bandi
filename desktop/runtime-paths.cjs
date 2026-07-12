const path = require("node:path");

const DEFAULT_DOWNLOAD_DIR = "K:\\BandiData\\downloads";
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

function sameWindowsPath(left, right) {
  return (
    normalizeWindowsPath(left).toLocaleLowerCase("en-US") ===
    normalizeWindowsPath(right).toLocaleLowerCase("en-US")
  );
}

function resolveConfiguredDownloadDir({
  existingDownloadDir,
  userDataDir,
  videosDir,
}) {
  if (!isSafeAbsoluteDirectory(existingDownloadDir)) {
    return DEFAULT_DOWNLOAD_DIR;
  }

  const normalized = normalizeWindowsPath(existingDownloadDir);
  const legacyDefaults = [
    path.win32.join(userDataDir, "download"),
    path.win32.join(videosDir, "Bandi", "Downloads"),
  ];
  if (legacyDefaults.some((candidate) => sameWindowsPath(normalized, candidate))) {
    return DEFAULT_DOWNLOAD_DIR;
  }
  return normalized;
}

function normalizeManagedQbitPort(value) {
  const port = Number(value || 0);
  return Number.isInteger(port) && port >= MIN_MANAGED_QBIT_PORT && port <= 65535
    ? port
    : 0;
}

module.exports = {
  DEFAULT_DOWNLOAD_DIR,
  MIN_MANAGED_QBIT_PORT,
  isFullyQualifiedWindowsPath,
  isSafeAbsoluteDirectory,
  isSafeAbsoluteWindowsPath,
  normalizeManagedQbitPort,
  resolveConfiguredDownloadDir,
};
