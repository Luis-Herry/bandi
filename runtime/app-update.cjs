const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { name: PACKAGE_NAME } = require("../package.json");

const GITHUB_OWNER = "Luis-Herry";
const GITHUB_REPO = "bandi";
const GITHUB_API_LATEST =
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const GITHUB_RELEASE_URL =
  `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const RELEASE_DOWNLOAD_PREFIX =
  `/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/`;
const STARTUP_CHECK_DELAY_MS = 15_000;
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const MAX_CHECKSUM_BYTES = 1024 * 1024;
const MAX_PORTABLE_BYTES = 2 * 1024 * 1024 * 1024;
const METADATA_REQUEST_TIMEOUT_MS = 15_000;
const PORTABLE_DOWNLOAD_IDLE_TIMEOUT_MS = 30_000;

function hasTrustedPortableEnvironment(input, env) {
  const file = env.PORTABLE_EXECUTABLE_FILE;
  const directory = env.PORTABLE_EXECUTABLE_DIR;
  const appFilename = env.PORTABLE_EXECUTABLE_APP_FILENAME;
  const execPath = input.execPath || process.execPath;
  const expectedAppFilename = input.portableAppFilename || PACKAGE_NAME;
  if (
    typeof file !== "string" ||
    typeof directory !== "string" ||
    typeof appFilename !== "string" ||
    typeof execPath !== "string" ||
    typeof expectedAppFilename !== "string" ||
    !file ||
    !directory ||
    !appFilename ||
    !execPath ||
    !expectedAppFilename
  ) {
    return false;
  }
  const winPath = input.path?.win32 || path.win32;
  if (
    !winPath.isAbsolute(file) ||
    !winPath.isAbsolute(execPath) ||
    winPath.extname(file).toLowerCase() !== ".exe" ||
    winPath.resolve(directory).toLowerCase() !==
      winPath.dirname(winPath.resolve(file)).toLowerCase() ||
    appFilename.toLowerCase() !== expectedAppFilename.toLowerCase()
  ) {
    return false;
  }
  try {
    const fileExists = input.portableFileExists || ((candidate) => (input.fs || fs).existsSync(candidate));
    return Boolean(fileExists(file));
  } catch {
    return false;
  }
}

function detectUpdateMode(input = {}) {
  const platform = input.platform || process.platform;
  const env = input.env || {};
  if (platform === "win32" && hasTrustedPortableEnvironment(input, env)) {
    return "portable";
  }
  if (!input.isPackaged) return "development";
  if (platform === "win32") {
    return input.hasUpdateDescriptor ? "nsis" : "development";
  }
  if (platform === "darwin") {
    return input.hasUpdateDescriptor && input.isMacSigned && input.isInApplicationsFolder
      ? "mac-installed"
      : "mac-manual";
  }
  return "development";
}

function parseVersion(value) {
  if (typeof value !== "string") return null;
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    value.trim(),
  );
  if (!match) return null;
  const core = match.slice(1, 4).map(Number);
  if (core.some((part) => !Number.isSafeInteger(part))) return null;
  return {
    core,
    prerelease: match[4] ? match[4].split(".") : [],
    normalized: `${core.join(".")}${match[4] ? `-${match[4]}` : ""}`,
  };
}

function compareVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue);
  const right = parseVersion(rightValue);
  if (!left || !right) throw new Error("invalid_version");
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return left.core[index] < right.core[index] ? -1 : 1;
    }
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart == null) return -1;
    if (rightPart == null) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) < Number(rightPart) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function normalizeArch(value) {
  if (value === "x64" || value === "arm64") return value;
  return null;
}

function expectedPortableAssetName(version, arch) {
  const parsed = parseVersion(version);
  const normalizedArch = normalizeArch(arch);
  if (!parsed || !normalizedArch) return null;
  return `Bandi-${parsed.normalized}-${normalizedArch}-portable.exe`;
}

function selectPortableAsset(release, version, arch) {
  const expectedName = expectedPortableAssetName(version, arch);
  if (!expectedName || !release || !Array.isArray(release.assets)) return null;
  const matches = release.assets.filter(
    (asset) => asset && asset.name === expectedName && isTrustedReleaseAssetUrl(asset.browser_download_url),
  );
  return matches.length === 1 ? matches[0] : null;
}

function parseGithubDigest(value) {
  if (typeof value !== "string") return null;
  const match = /^(?:sha256:)?([a-fA-F0-9]{64})$/.exec(value.trim());
  return match ? match[1].toLowerCase() : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseReleaseDigest(body, assetName) {
  if (typeof body !== "string" || !body || typeof assetName !== "string" || !assetName) {
    return null;
  }
  const escaped = escapeRegExp(assetName);
  const patterns = [
    new RegExp(`(?:^|\\n)\\s*([a-fA-F0-9]{64})\\s+[* ]?${escaped}\\s*(?:$|\\n)`),
    new RegExp(`(?:^|\\n)\\s*${escaped}\\s*[:=]\\s*([a-fA-F0-9]{64})\\s*(?:$|\\n)`),
    new RegExp(`(?:^|\\n)\\s*SHA-?256\\s*(?:\\(${escaped}\\))?\\s*[:=]\\s*([a-fA-F0-9]{64})\\s*(?:$|\\n)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(body);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

function isTrustedReleaseAssetUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname.startsWith(RELEASE_DOWNLOAD_PREFIX)
    );
  } catch {
    return false;
  }
}

function publicState(state) {
  return Object.freeze({
    mode: state.mode,
    status: state.status,
    action: state.action,
    currentVersion: state.currentVersion,
    availableVersion: state.availableVersion,
    progressPercent: state.progressPercent,
    message: state.message,
    lastCheckedAt: state.lastCheckedAt,
  });
}

function genericErrorMessage(scope) {
  if (scope === "download") return "更新下载或完整性校验失败，请稍后重试。";
  if (scope === "install") return "更新安装准备失败，请稍后重试。";
  return "检查更新失败，请稍后重试。";
}

function safeErrorCode(error) {
  const candidate =
    error && typeof error.code === "string"
      ? error.code
      : error && typeof error.message === "string"
        ? error.message
        : "unexpected_error";
  return /^[A-Za-z0-9_]{1,64}$/.test(candidate) ? candidate : "unexpected_error";
}

function createAppUpdateController(options = {}) {
  const app = options.app || null;
  const currentVersion = options.currentVersion || app?.getVersion?.() || "0.0.0";
  if (!parseVersion(currentVersion)) throw new Error("invalid_current_version");
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const env = options.env || process.env;
  const resourcesPath = options.resourcesPath || process.resourcesPath || "";
  const fsImpl = options.fs || fs;
  const pathImpl = options.path || path;
  const hasUpdateDescriptor = options.hasUpdateDescriptor != null
    ? Boolean(options.hasUpdateDescriptor)
    : Boolean(resourcesPath && fsImpl.existsSync(pathImpl.join(resourcesPath, "app-update.yml")));
  const isInApplicationsFolder = options.isInApplicationsFolder != null
    ? Boolean(options.isInApplicationsFolder)
    : Boolean(app?.isInApplicationsFolder?.());
  const mode = detectUpdateMode({
    platform,
    env,
    execPath: options.execPath || process.execPath,
    fs: fsImpl,
    path: pathImpl,
    portableFileExists: options.portableFileExists,
    isPackaged: options.isPackaged != null ? Boolean(options.isPackaged) : Boolean(app?.isPackaged),
    hasUpdateDescriptor,
    isMacSigned: Boolean(options.isMacSigned),
    isInApplicationsFolder,
  });
  const updater = options.updater || null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const downloadsDir = options.downloadsDir || app?.getPath?.("downloads") || null;
  const openExternal = options.openExternal || (async () => undefined);
  const beforeInstall = options.beforeInstall || (async () => undefined);
  const now = options.now || Date.now;
  const setTimeoutImpl = options.setTimeout || setTimeout;
  const clearTimeoutImpl = options.clearTimeout || clearTimeout;
  const setIntervalImpl = options.setInterval || setInterval;
  const clearIntervalImpl = options.clearInterval || clearInterval;
  const log = typeof options.log === "function" ? options.log : () => undefined;
  const subscribers = new Set();
  const activeRequestControllers = new Set();
  let startupTimer = null;
  let periodicTimer = null;
  let checkingPromise = null;
  let portableExecutablePath = null;
  let lastPortableAssetName = null;
  let lastPortableDigest = null;
  let lastPortableSize = null;
  let state = {
    mode,
    status: mode === "development" ? "unsupported" : "idle",
    action: mode === "development" ? "none" : "check",
    currentVersion: parseVersion(currentVersion).normalized,
    availableVersion: null,
    progressPercent: null,
    message: null,
    lastCheckedAt: null,
  };

  function safeLog(event, code = null) {
    try {
      log({ event, code, mode: state.mode, status: state.status });
    } catch {}
  }

  function createTrackedAbort(timeoutMs) {
    const controller = new AbortController();
    activeRequestControllers.add(controller);
    let timeout = null;
    const refresh = () => {
      if (timeout) clearTimeoutImpl(timeout);
      timeout = setTimeoutImpl(() => controller.abort(), timeoutMs);
      timeout?.unref?.();
    };
    const cleanup = () => {
      if (timeout) clearTimeoutImpl(timeout);
      timeout = null;
      activeRequestControllers.delete(controller);
    };
    refresh();
    return { controller, refresh, cleanup };
  }

  async function withRequestDeadline(operation) {
    const request = createTrackedAbort(
      options.metadataTimeoutMs ?? METADATA_REQUEST_TIMEOUT_MS,
    );
    try {
      return await operation(request.controller.signal);
    } finally {
      request.cleanup();
    }
  }

  function updateState(patch) {
    state = { ...state, ...patch };
    const snapshot = publicState(state);
    for (const subscriber of subscribers) {
      try {
        subscriber(snapshot);
      } catch {}
    }
    return snapshot;
  }

  function bindUpdaterEvents() {
    if (!updater || (mode !== "nsis" && mode !== "mac-installed")) return;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on?.("checking-for-update", () => {
      updateState({ status: "checking", action: "none", message: null, progressPercent: null });
    });
    updater.on?.("update-available", (info = {}) => {
      const available = parseVersion(info.version)?.normalized || null;
      updateState({
        status: "available",
        action: "none",
        availableVersion: available,
        progressPercent: 0,
        message: null,
      });
    });
    updater.on?.("download-progress", (progress = {}) => {
      const percent = Number.isFinite(progress.percent)
        ? Math.max(0, Math.min(100, Math.round(progress.percent)))
        : null;
      updateState({ status: "downloading", action: "none", progressPercent: percent });
    });
    updater.on?.("update-not-available", () => {
      updateState({
        status: "up-to-date",
        action: "check",
        availableVersion: null,
        progressPercent: null,
        message: null,
        lastCheckedAt: now(),
      });
    });
    updater.on?.("update-downloaded", (info = {}) => {
      const available = parseVersion(info.version)?.normalized || state.availableVersion;
      updateState({
        status: "ready",
        action: "restart-to-install",
        availableVersion: available,
        progressPercent: 100,
        message: null,
        lastCheckedAt: now(),
      });
    });
    updater.on?.("error", () => {
      safeLog("updater_error", "updater_failed");
      updateState({
        status: "error",
        action: "check",
        progressPercent: null,
        message: genericErrorMessage("check"),
        lastCheckedAt: now(),
      });
    });
  }

  bindUpdaterEvents();

  async function resolvePortableDigest(release, asset) {
    const direct = parseGithubDigest(asset.digest);
    if (direct) return direct;
    const fromBody = parseReleaseDigest(release.body, asset.name);
    if (fromBody) return fromBody;
    const checksumNames = [`${asset.name}.sha256`, "SHA256SUMS.txt", "checksums.txt"];
    for (const name of checksumNames) {
      const matches = Array.isArray(release.assets)
        ? release.assets.filter(
            (candidate) =>
              candidate?.name === name &&
              isTrustedReleaseAssetUrl(candidate.browser_download_url) &&
              Number(candidate.size) > 0 &&
              Number(candidate.size) <= MAX_CHECKSUM_BYTES,
          )
        : [];
      if (matches.length !== 1) continue;
      const text = await withRequestDeadline(async (signal) => {
        const response = await fetchImpl(matches[0].browser_download_url, {
          redirect: "follow",
          headers: { "User-Agent": "Bandi-Updater" },
          signal,
        });
        if (!response.ok) return null;
        return await response.text();
      });
      if (text == null) continue;
      if (Buffer.byteLength(text) > MAX_CHECKSUM_BYTES) continue;
      const digest = parseReleaseDigest(text, asset.name) || parseGithubDigest(text);
      if (digest) return digest;
    }
    return null;
  }

  async function hashExistingFile(filePath) {
    const hash = crypto.createHash("sha256");
    await pipeline(fsImpl.createReadStream(filePath), new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    }), new Transform({
      transform(_chunk, _encoding, callback) {
        callback();
      },
    }));
    return hash.digest("hex");
  }

  async function downloadPortableAsset(asset, expectedDigest) {
    if (!downloadsDir || typeof downloadsDir !== "string" || !pathImpl.isAbsolute(downloadsDir)) {
      throw new Error("download_directory_unavailable");
    }
    const expectedSize = Number(asset.size);
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > MAX_PORTABLE_BYTES) {
      throw new Error("invalid_asset_size");
    }
    if (!parseGithubDigest(expectedDigest)) throw new Error("missing_asset_digest");
    const directory = pathImpl.join(downloadsDir, "Bandi Updates");
    fsImpl.mkdirSync(directory, { recursive: true });
    const canonicalTarget = pathImpl.join(directory, asset.name);
    if (fsImpl.existsSync(canonicalTarget)) {
      const stat = fsImpl.statSync(canonicalTarget);
      if (stat.isFile() && stat.size === expectedSize) {
        const digest = await hashExistingFile(canonicalTarget);
        if (digest === expectedDigest) return canonicalTarget;
      }
    }

    const parsedName = pathImpl.parse(asset.name);
    const suffix = `${now()}-${crypto.randomBytes(4).toString("hex")}`;
    const target = fsImpl.existsSync(canonicalTarget)
      ? pathImpl.join(directory, `${parsedName.name}-${suffix}${parsedName.ext}`)
      : canonicalTarget;
    const temporary = pathImpl.join(directory, `.${asset.name}.${suffix}.part`);
    const request = createTrackedAbort(
      options.portableIdleTimeoutMs ?? PORTABLE_DOWNLOAD_IDLE_TIMEOUT_MS,
    );
    try {
      const response = await fetchImpl(asset.browser_download_url, {
        redirect: "follow",
        headers: { "User-Agent": "Bandi-Updater" },
        signal: request.controller.signal,
      });
      request.refresh();
      if (!response.ok || !response.body) throw new Error("asset_download_failed");
      const hash = crypto.createHash("sha256");
      let bytes = 0;
      let lastPercent = -1;
      const meter = new Transform({
        transform(chunk, _encoding, callback) {
          request.refresh();
          bytes += chunk.length;
          if (bytes > expectedSize || bytes > MAX_PORTABLE_BYTES) {
            callback(new Error("asset_size_mismatch"));
            return;
          }
          hash.update(chunk);
          const percent = Math.min(100, Math.floor((bytes / expectedSize) * 100));
          if (percent !== lastPercent) {
            lastPercent = percent;
            updateState({ status: "downloading", action: "none", progressPercent: percent });
          }
          callback(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body),
        meter,
        fsImpl.createWriteStream(temporary, { flags: "wx" }),
      );
      if (bytes !== expectedSize || hash.digest("hex") !== expectedDigest) {
        throw new Error("asset_integrity_mismatch");
      }
      fsImpl.renameSync(temporary, target);
      return target;
    } catch (error) {
      try {
        if (fsImpl.existsSync(temporary)) fsImpl.unlinkSync(temporary);
      } catch {}
      throw error;
    } finally {
      request.cleanup();
    }
  }

  async function fetchLatestRelease() {
    if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable");
    const release = await withRequestDeadline(async (signal) => {
      const response = await fetchImpl(GITHUB_API_LATEST, {
        redirect: "error",
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Bandi-Updater",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal,
      });
      if (!response.ok) throw new Error("release_check_failed");
      return await response.json();
    });
    if (!release || release.draft || typeof release.tag_name !== "string") {
      throw new Error("invalid_release_response");
    }
    const parsed = parseVersion(release.tag_name);
    if (!parsed) throw new Error("invalid_release_version");
    return { release, version: parsed.normalized };
  }

  async function checkManualMode() {
    const { release, version } = await fetchLatestRelease();
    if (compareVersions(version, state.currentVersion) <= 0) {
      updateState({
        status: "up-to-date",
        action: "check",
        availableVersion: null,
        progressPercent: null,
        message: null,
        lastCheckedAt: now(),
      });
      return;
    }
    if (mode === "mac-manual") {
      updateState({
        status: "available",
        action: "open-release",
        availableVersion: version,
        progressPercent: null,
        message: null,
        lastCheckedAt: now(),
      });
      return;
    }
    const asset = selectPortableAsset(release, version, arch);
    if (!asset) throw new Error("portable_asset_not_found");
    const digest = await resolvePortableDigest(release, asset);
    if (!digest) throw new Error("portable_digest_not_found");
    updateState({
      status: "available",
      action: "none",
      availableVersion: version,
      progressPercent: 0,
      message: null,
    });
    const executablePath = await downloadPortableAsset(asset, digest);
    portableExecutablePath = executablePath;
    lastPortableAssetName = asset.name;
    lastPortableDigest = digest;
    lastPortableSize = Number(asset.size);
    updateState({
      status: "ready",
      action: "install-portable",
      progressPercent: 100,
      message: null,
      lastCheckedAt: now(),
    });
  }

  async function checkForUpdates() {
    if (mode === "development") {
      return { ok: false, error: "unsupported", state: publicState(state) };
    }
    if (checkingPromise) return checkingPromise;
    updateState({ status: "checking", action: "none", message: null, progressPercent: null });
    checkingPromise = (async () => {
      try {
        if (mode === "nsis" || mode === "mac-installed") {
          if (!updater?.checkForUpdates) throw new Error("updater_unavailable");
          await updater.checkForUpdates();
        } else {
          await checkManualMode();
        }
        return { ok: true, state: publicState(state) };
      } catch (error) {
        safeLog("check_failed", safeErrorCode(error));
        const scope = mode === "portable" && state.status === "downloading" ? "download" : "check";
        updateState({
          status: "error",
          action: "check",
          progressPercent: null,
          message: genericErrorMessage(scope),
          lastCheckedAt: now(),
        });
        return { ok: false, error: "update_failed", state: publicState(state) };
      } finally {
        checkingPromise = null;
      }
    })();
    return checkingPromise;
  }

  async function preparePortableLaunch() {
    if (
      mode !== "portable" ||
      state.status !== "ready" ||
      state.action !== "install-portable" ||
      !portableExecutablePath ||
      !lastPortableAssetName ||
      !parseGithubDigest(lastPortableDigest) ||
      !Number.isSafeInteger(lastPortableSize) ||
      lastPortableSize <= 0 ||
      pathImpl.basename(portableExecutablePath) !== lastPortableAssetName &&
        !pathImpl.basename(portableExecutablePath).startsWith(
          `${pathImpl.parse(lastPortableAssetName).name}-`,
        )
    ) {
      return { ok: false, error: "portable_update_not_ready" };
    }
    const directory = pathImpl.resolve(downloadsDir, "Bandi Updates");
    const candidate = pathImpl.resolve(portableExecutablePath);
    const relative = pathImpl.relative(directory, candidate);
    if (relative.startsWith("..") || pathImpl.isAbsolute(relative) || pathImpl.extname(candidate) !== ".exe") {
      return { ok: false, error: "unsafe_portable_update_path" };
    }
    let stat;
    try {
      stat = fsImpl.statSync(candidate);
    } catch {
      return { ok: false, error: "portable_update_missing" };
    }
    if (!stat.isFile() || stat.size !== lastPortableSize) {
      return { ok: false, error: "portable_update_changed" };
    }
    if (await hashExistingFile(candidate) !== lastPortableDigest) {
      return { ok: false, error: "portable_update_changed" };
    }
    return {
      ok: true,
      launch: Object.freeze({
        executablePath: candidate,
        expectedSha256: lastPortableDigest,
        expectedSize: lastPortableSize,
        args: [],
        detached: true,
      }),
    };
  }

  async function installUpdate() {
    if (mode === "portable") return await preparePortableLaunch();
    if (
      (mode !== "nsis" && mode !== "mac-installed") ||
      state.status !== "ready" ||
      !updater?.quitAndInstall
    ) {
      return { ok: false, error: "update_not_ready", state: publicState(state) };
    }
    try {
      updateState({ status: "installing", action: "none", message: null });
      await beforeInstall();
      updater.quitAndInstall(true, true);
      return { ok: true, state: publicState(state) };
    } catch {
      safeLog("install_failed", "install_failed");
      updateState({
        status: "error",
        action: "check",
        message: genericErrorMessage("install"),
      });
      return { ok: false, error: "install_failed", state: publicState(state) };
    }
  }

  async function openUpdatePage() {
    try {
      await openExternal(GITHUB_RELEASE_URL);
      return { ok: true, state: publicState(state) };
    } catch {
      return { ok: false, error: "open_release_failed", state: publicState(state) };
    }
  }

  function start() {
    if (mode === "development" || startupTimer || periodicTimer) return;
    startupTimer = setTimeoutImpl(() => {
      startupTimer = null;
      void checkForUpdates();
    }, options.startupDelayMs ?? STARTUP_CHECK_DELAY_MS);
    startupTimer?.unref?.();
    periodicTimer = setIntervalImpl(() => {
      if (!checkingPromise && state.status !== "ready" && state.status !== "installing") {
        void checkForUpdates();
      }
    }, options.periodicIntervalMs ?? PERIODIC_CHECK_INTERVAL_MS);
    periodicTimer?.unref?.();
  }

  function stop() {
    if (startupTimer) clearTimeoutImpl(startupTimer);
    if (periodicTimer) clearIntervalImpl(periodicTimer);
    startupTimer = null;
    periodicTimer = null;
    for (const controller of activeRequestControllers) controller.abort();
    activeRequestControllers.clear();
  }

  return Object.freeze({
    getState: () => publicState(state),
    checkForUpdates,
    installUpdate,
    openUpdatePage,
    preparePortableLaunch,
    start,
    stop,
    subscribe(callback) {
      if (typeof callback !== "function") return () => undefined;
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  });
}

module.exports = {
  GITHUB_API_LATEST,
  GITHUB_RELEASE_URL,
  STARTUP_CHECK_DELAY_MS,
  PERIODIC_CHECK_INTERVAL_MS,
  METADATA_REQUEST_TIMEOUT_MS,
  PORTABLE_DOWNLOAD_IDLE_TIMEOUT_MS,
  compareVersions,
  createAppUpdateController,
  detectUpdateMode,
  expectedPortableAssetName,
  isTrustedReleaseAssetUrl,
  parseGithubDigest,
  parseReleaseDigest,
  selectPortableAsset,
};
