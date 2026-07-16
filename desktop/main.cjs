const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  net: electronNet,
  shell,
} = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { buildNextProxyEnv } = require("./proxy-env.cjs");
const {
  createCredentialRepairCycle,
} = require("./qbit-credential-repair.cjs");
const {
  isSafeAbsoluteWindowsPath,
  normalizeManagedQbitPort,
  resolveConfiguredDownloadDir,
} = require("./runtime-paths.cjs");
const {
  getDesktopSessionOrigins,
  withDesktopSessionHeader,
} = require("./session-header.cjs");
const { autoUpdater } = require("electron-updater");
const {
  createAppUpdateController,
} = require("../runtime/app-update.cjs");

const APP_PORT_START = 31245;
const QBIT_PORT_START = 18180;
const LOCAL_PROXY_PORT = 10808;
const QBIT_START_TIMEOUT_MS = 25000;
const CONFIG_NAME = "config.json";
const ONBOARDING_VERSION = 1;
const DESKTOP_AUTH_HEADER = "X-Bandi-Desktop-Token";
const DEFAULT_APP_USER = "admin";
const DEFAULT_QBIT_USER = "admin";
const PARENT_LEASE_INTERVAL_MS = 2000;
const PARENT_LEASE_MAX_AGE_MS = 10000;

let mainWindow = null;
let tray = null;
let nextProcess = null;
let qbitProcess = null;
let desktopConfig = null;
let qbitReady = false;
let qbitAutoRestartEnabled = false;
let qbitRestartAttempt = 0;
let qbitRestartTimer = null;
let qbitRestarting = false;
let qbitStartPromise = null;
const qbitCredentialRepairCycle = createCredentialRepairCycle();
const expectedQbitExits = new WeakSet();
let qbitServiceStatus = "starting";
let qbitServiceMessage = null;
let pendingQbitDownloadDir = null;
let isQuitting = false;
let shutdownComplete = false;
let shutdownPromise = null;
let desktopSessionToken = null;
let bootStage = "storage";
let parentLeasePath = null;
let parentLeaseToken = null;
let parentLeaseTimer = null;
let updateController = null;
let portableUpdateHelperPromise = null;
let trustedAppOrigins = new Set();

function getDownloadServiceState() {
  return {
    status: qbitReady ? "ready" : qbitServiceStatus,
    message: qbitReady ? null : qbitServiceMessage,
    retrying: qbitRestarting,
  };
}

function publishDownloadServiceState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(
    "bandi:download-service-state-changed",
    getDownloadServiceState(),
  );
}

function setDownloadServiceState(status, message = null) {
  qbitServiceStatus = status;
  qbitServiceMessage = message;
  publishDownloadServiceState();
}

function describeQbitFailure(error) {
  const reason = error?.message || String(error || "unknown");
  if (reason.includes("qBittorrent not found")) {
    return {
      status: "failed",
      message: "内置下载组件缺失，请重新安装 Bandi 后再试。",
    };
  }
  if (reason.includes("save path update failed")) {
    return {
      status: "failed",
      message: "下载目录暂时无法连接，请在设置中心检查目录后重试。",
    };
  }
  if (reason.includes("qbit_process_exited")) {
    return {
      status: "recovering",
      message: "下载服务意外退出，Bandi 正在后台恢复；浏览和本地播放仍可使用。",
    };
  }
  if (reason.includes("health check failed")) {
    return {
      status: "recovering",
      message: "下载服务启动超时，Bandi 正在后台恢复；浏览和本地播放仍可使用。",
    };
  }
  return {
    status: "recovering",
    message: "下载服务未能启动，Bandi 正在后台恢复；浏览和本地播放仍可使用。",
  };
}

function markQbitUnavailable(error) {
  qbitReady = false;
  const feedback = describeQbitFailure(error);
  setDownloadServiceState(feedback.status, feedback.message);
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function inspectDownloadDirectory(value, { create = false } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "请选择下载目录" };
  }
  if (!isSafeAbsoluteWindowsPath(value)) {
    return {
      ok: false,
      error: `必须使用完整的 Windows 盘符或 UNC 子目录：${value.trim()}`,
    };
  }
  const downloadDir = path.resolve(value.trim());

  try {
    if (create) ensureDir(downloadDir);
    const stat = fs.statSync(downloadDir);
    if (!stat.isDirectory()) {
      return { ok: false, error: "所选位置不是文件夹" };
    }
    const probe = path.join(
      downloadDir,
      `.bandi-write-test-${process.pid}-${Date.now()}`,
    );
    fs.writeFileSync(probe, "ok", { encoding: "utf8", flag: "wx" });
    fs.unlinkSync(probe);
    const disk = fs.statfsSync(downloadDir);
    const freeSpaceBytes = Number(disk.bavail) * Number(disk.bsize);
    return { ok: true, downloadDir, freeSpaceBytes };
  } catch (err) {
    return {
      ok: false,
      error: `无法写入该目录：${err.code || err.message || "unknown"}`,
    };
  }
}

function nextRuntimeDirectories({
  userDataDir = app.getPath("userData"),
  picturesDir = app.getPath("pictures"),
} = {}) {
  return {
    COVER_CACHE_DIR: path.join(userDataDir, "cache", "covers"),
    MEDIA_COMPAT_CACHE_DIR: path.join(userDataDir, "cache", "media-compat"),
    YUC_CACHE_DIR: path.join(userDataDir, "cache", "yuc"),
    SCREENSHOT_DIR: path.join(picturesDir, "Bandi"),
  };
}

function prepareNextRuntimeDirectories(downloadDir) {
  const runtimeEnv = {};
  for (const [envName, configuredPath] of Object.entries(
    { ...nextRuntimeDirectories(), DOWNLOAD_ROOT: downloadDir },
  )) {
    const inspection = inspectDownloadDirectory(configuredPath, {
      create: true,
    });
    if (!inspection.ok) {
      throw new Error(
        `${envName} 路径不可用：${configuredPath}。${inspection.error}`,
      );
    }
    runtimeEnv[envName] = inspection.downloadDir;
  }
  return runtimeEnv;
}

function configureElectronSessionData(
  userDataDir = app.getPath("userData"),
) {
  const sessionDataDir = path.join(userDataDir, "cache", "electron");
  const inspection = inspectDownloadDirectory(sessionDataDir, {
    create: true,
  });
  if (!inspection.ok) {
    throw new Error(
      `Electron 缓存路径不可用：${sessionDataDir}。${inspection.error}`,
    );
  }
  app.setPath("sessionData", inspection.downloadDir);
}

function readJson(file) {
  if (!fs.existsSync(file)) return { ok: false, missing: true };
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("JSON root must be an object");
    }
    return { ok: true, value };
  } catch (error) {
    return { ok: false, missing: false, error };
  }
}

function writeFileDurably(file, content, mode = 0o600) {
  const handle = fs.openSync(file, "w", mode);
  try {
    fs.writeFileSync(handle, content, "utf8");
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

function writeJsonAtomic(file, value, { backupCurrent = true } = {}) {
  ensureDir(path.dirname(file));
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileDurably(temporary, serialized);
  try {
    if (backupCurrent) {
      const current = readJson(file);
      if (current.ok) {
        const backup = `${file}.bak`;
        const backupTemporary = `${backup}.tmp-${process.pid}-${Date.now()}`;
        fs.copyFileSync(file, backupTemporary);
        const backupHandle = fs.openSync(backupTemporary, "r+");
        try {
          fs.fsyncSync(backupHandle);
        } finally {
          fs.closeSync(backupHandle);
        }
        fs.renameSync(backupTemporary, backup);
      }
    }
    fs.renameSync(temporary, file);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {}
    throw error;
  }
}

function configFile(userDataDir = app.getPath("userData")) {
  return path.join(userDataDir, CONFIG_NAME);
}

function renewParentLease() {
  writeJsonAtomic(
    parentLeasePath,
    {
      pid: process.pid,
      token: parentLeaseToken,
      updatedAt: Date.now(),
    },
    { backupCurrent: false },
  );
}

function startParentLease() {
  parentLeasePath = path.join(app.getPath("userData"), "runtime", "parent-lease.json");
  parentLeaseToken = randomSecret(24);
  renewParentLease();
  parentLeaseTimer = setInterval(() => {
    try {
      renewParentLease();
    } catch (error) {
      appendLog("desktop.err.log", `[desktop] Parent lease renewal failed: ${error}\n`);
    }
  }, PARENT_LEASE_INTERVAL_MS);
  parentLeaseTimer.unref?.();
}

function stopParentLease() {
  if (parentLeaseTimer) clearInterval(parentLeaseTimer);
  parentLeaseTimer = null;
  if (!parentLeasePath || !parentLeaseToken) return;
  try {
    writeJsonAtomic(
      parentLeasePath,
      { pid: process.pid, token: parentLeaseToken, updatedAt: 0 },
      { backupCurrent: false },
    );
  } catch {}
}

function saveDesktopConfig() {
  writeJsonAtomic(configFile(), desktopConfig);
}

function loadDesktopConfig(userDataDir) {
  const file = configFile(userDataDir);
  const primary = readJson(file);
  let existing = {};
  if (primary.ok) {
    existing = primary.value;
  } else if (!primary.missing) {
    const backup = readJson(`${file}.bak`);
    if (!backup.ok) {
      throw new Error(
        `Bandi 配置已损坏，且没有可恢复的备份：${file}。请保留该文件并联系社区协助恢复。`,
      );
    }
    existing = backup.value;
    writeJsonAtomic(file, existing, { backupCurrent: false });
  }
  const hasExistingConfig = Object.keys(existing).length > 0;
  const qbitPort = normalizeManagedQbitPort(existing.qbitPort);
  const qbitUser =
    existing.qbitUser && existing.qbitUser !== "anime"
      ? existing.qbitUser
      : DEFAULT_QBIT_USER;
  const videosDir = app.getPath("videos");
  const existingOnboardingVersion = Number(existing.onboardingVersion || 0);
  const config = {
    authSecret: existing.authSecret || randomSecret(48),
    appUser: existing.appUser || DEFAULT_APP_USER,
    qbitUser,
    qbitPassword: existing.qbitPassword || randomSecret(18),
    qbitPort,
    downloadDir: resolveConfiguredDownloadDir({
      existingDownloadDir: existing.downloadDir,
      userDataDir,
      videosDir,
    }),
    closeToTray: existing.closeToTray !== false,
    onboardingVersion: Number.isInteger(existingOnboardingVersion)
      ? Math.max(0, existingOnboardingVersion)
      : 0,
    onboardingMode:
      existing.onboardingMode === "new" || existing.onboardingMode === "upgrade"
        ? existing.onboardingMode
        : hasExistingConfig
          ? "upgrade"
          : "new",
  };
  writeJsonAtomic(file, config);
  return config;
}

function logFile(name) {
  const dir = path.join(app.getPath("userData"), "logs");
  ensureDir(dir);
  return path.join(dir, name);
}

function appendLog(name, chunk) {
  fs.appendFile(logFile(name), chunk, () => {});
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canListen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function canConnect(port, host = "127.0.0.1", timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    let settled = false;
    const finish = (available) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function getNextProxyEnv() {
  const hasConfiguredProxy = Boolean(
    process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      process.env.https_proxy ||
      process.env.http_proxy,
  );
  if (hasConfiguredProxy) return buildNextProxyEnv(process.env);
  if (!(await canConnect(LOCAL_PROXY_PORT))) {
    return buildNextProxyEnv(process.env);
  }
  const proxyUrl = `http://127.0.0.1:${LOCAL_PROXY_PORT}`;
  return buildNextProxyEnv(process.env, proxyUrl);
}

async function findOpenPort(start) {
  for (let port = start; port < start + 200; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`No open local port found from ${start}`);
}

function waitForHttp(url, timeoutMs = 25000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(tick, 350);
    };
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if ((res.statusCode || 500) < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1200, () => req.destroy());
    };
    tick();
  });
}

function getAppRoot() {
  return app.getAppPath();
}

function getStandaloneDir() {
  return path.join(getAppRoot(), ".next", "standalone");
}

function getStandaloneBuildId() {
  try {
    const value = fs
      .readFileSync(path.join(getStandaloneDir(), ".next", "BUILD_ID"), "utf8")
      .trim();
    return /^[A-Za-z0-9._-]{1,128}$/.test(value) ? value : "";
  } catch {
    return "";
  }
}

function publishUpdateState(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("bandi:update-state-changed", state);
}

function isTrustedMainWindowSender(event) {
  if (!event?.sender) return false;
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow || senderWindow !== mainWindow) return false;
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  try {
    return trustedAppOrigins.has(new URL(senderUrl).origin);
  } catch {
    return false;
  }
}

function initializeUpdateController() {
  updateController = createAppUpdateController({
    app,
    updater: autoUpdater,
    fetchImpl: (input, init) => electronNet.fetch(input, init),
    openExternal: () => shell.openExternal(
      "https://github.com/Luis-Herry/bandi/releases/latest",
    ),
    beforeInstall: async () => {
      isQuitting = true;
      if (!shutdownPromise) shutdownPromise = shutdownServices();
      await shutdownPromise;
      shutdownComplete = true;
    },
    log: (entry) => appendLog("update.log", `${JSON.stringify(entry)}\n`),
  });
  updateController.subscribe(publishUpdateState);
}

function startPortableUpdateHelper(launch) {
  if (portableUpdateHelperPromise) return portableUpdateHelperPromise;
  const helperSource = path.join(getAppRoot(), "runtime", "launch-portable-update.ps1");
  if (!fs.existsSync(helperSource)) return Promise.reject(new Error("portable_helper_missing"));
  const helperDir = path.join(app.getPath("userData"), "runtime", "updates");
  ensureDir(helperDir);
  const helper = path.join(helperDir, "launch-portable-update.ps1");
  const resultFile = path.join(helperDir, "portable-update-result.json");
  fs.copyFileSync(helperSource, helper);
  try {
    fs.unlinkSync(resultFile);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (!systemRoot || !path.isAbsolute(systemRoot)) {
    return Promise.reject(new Error("windows_system_root_missing"));
  }
  const powershell = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  if (!fs.existsSync(powershell)) {
    return Promise.reject(new Error("windows_powershell_missing"));
  }
  if (!Number.isSafeInteger(process.ppid) || process.ppid <= 0) {
    return Promise.reject(new Error("portable_parent_pid_missing"));
  }
  const attempt = new Promise((resolve, reject) => {
    const child = spawn(
      powershell,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helper,
        "-WaitForPid",
        String(process.pid),
        "-WaitForParentPid",
        String(process.ppid),
        "-ExecutablePath",
        launch.executablePath,
        "-ExpectedSha256",
        launch.expectedSha256,
        "-ExpectedSize",
        String(launch.expectedSize),
        "-ResultFile",
        resultFile,
      ],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
  portableUpdateHelperPromise = attempt.catch((error) => {
    portableUpdateHelperPromise = null;
    throw error;
  });
  return portableUpdateHelperPromise;
}

async function installAvailableUpdate() {
  if (!updateController) return { ok: false, error: "update_unavailable" };
  const result = await updateController.installUpdate();
  if (!result.ok) {
    return { ok: false, error: result.error, state: updateController.getState() };
  }
  if (result.launch) {
    try {
      await startPortableUpdateHelper(result.launch);
    } catch {
      appendLog(
        "update.log",
        `${JSON.stringify({ event: "portable_helper_failed", code: "launch_failed" })}\n`,
      );
      return {
        ok: false,
        error: "portable_launch_failed",
        state: updateController.getState(),
      };
    }
    setTimeout(() => app.quit(), 100);
  }
  return { ok: true, state: updateController.getState() };
}

async function preparePortableUpdateOnExit() {
  if (!updateController || portableUpdateHelperPromise) return;
  const result = await updateController.preparePortableLaunch();
  if (!result.ok) return;
  try {
    await startPortableUpdateHelper(result.launch);
  } catch {
    appendLog(
      "update.log",
      `${JSON.stringify({ event: "portable_helper_failed", code: "launch_failed" })}\n`,
    );
  }
}

function getAppIconPath() {
  return path.join(getAppRoot(), "desktop", "assets", "app-icon.ico");
}

function getQbitExePath() {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      "vendor",
      "qbittorrent",
      "qbittorrent.exe",
    );
  }
  return path.join(getAppRoot(), "vendor", "qbittorrent", "qbittorrent.exe");
}

function getNodeExePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "vendor", "node", "node.exe");
  }
  const bundled = path.join(getAppRoot(), "vendor", "node", "node.exe");
  return fs.existsSync(bundled) ? bundled : "node";
}

function bundledFfmpegEnvironment() {
  const executable = path.join(
    process.resourcesPath,
    "vendor",
    "ffmpeg",
    "ffmpeg.exe",
  );
  return app.isPackaged && fs.existsSync(executable)
    ? { FFMPEG_PATH: executable, BANDI_BUNDLED_FFMPEG: "1" }
    : {};
}

function escapeIniPath(value) {
  return value.replace(/\\/g, "\\\\");
}

function makeQbitPasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(
    Buffer.from(password, "utf8"),
    salt,
    100000,
    64,
    "sha512",
  );
  return `@ByteArray(${salt.toString("base64")}:${hash.toString("base64")})`;
}

function setIniValue(lines, section, key, value) {
  const sectionHeader = `[${section}]`;
  let sectionStart = lines.findIndex((line) => line.trim() === sectionHeader);
  if (sectionStart === -1) {
    if (lines.length && lines[lines.length - 1].trim() !== "") lines.push("");
    lines.push(sectionHeader);
    sectionStart = lines.length - 1;
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    if (/^\[[^\]]+\]\s*$/.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  const prefix = `${key}=`;
  for (let i = sectionStart + 1; i < sectionEnd; i += 1) {
    if (lines[i].startsWith(prefix)) {
      lines[i] = `${key}=${value}`;
      return;
    }
  }

  lines.splice(sectionEnd, 0, `${key}=${value}`);
}

function writeQbitConfig({ profileDir, config, downloadDir }) {
  const configDir = path.join(profileDir, "qBittorrent_anime", "config");
  ensureDir(configDir);

  const iniPath = path.join(configDir, "qBittorrent.ini");
  const lines = fs.existsSync(iniPath)
    ? fs.readFileSync(iniPath, "utf8").split(/\r?\n/)
    : [];

  setIniValue(lines, "LegalNotice", "Accepted", "true");
  setIniValue(lines, "Preferences", "WebUI\\Enabled", "true");
  setIniValue(lines, "Preferences", "WebUI\\Address", "127.0.0.1");
  setIniValue(lines, "Preferences", "WebUI\\Port", String(config.qbitPort));
  setIniValue(lines, "Preferences", "WebUI\\Username", config.qbitUser);
  setIniValue(lines, "Preferences", "WebUI\\LocalHostAuth", "true");
  setIniValue(lines, "Preferences", "WebUI\\UseUPnP", "false");
  setIniValue(
    lines,
    "Preferences",
    "WebUI\\Password_PBKDF2",
    `"${makeQbitPasswordHash(config.qbitPassword)}"`,
  );
  setIniValue(lines, "Preferences", "General\\ExitConfirm", "false");
  setIniValue(
    lines,
    "BitTorrent",
    "Session\\DefaultSavePath",
    escapeIniPath(downloadDir),
  );
  setIniValue(lines, "BitTorrent", "Session\\QueueingSystemEnabled", "true");
  setIniValue(lines, "BitTorrent", "Session\\MaxActiveDownloads", "3");
  setIniValue(lines, "BitTorrent", "Session\\MaxActiveTorrents", "4");
  setIniValue(lines, "BitTorrent", "Session\\MaxActiveUploads", "1");
  setIniValue(lines, "BitTorrent", "Session\\StartPaused", "false");

  const temporary = `${iniPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileDurably(temporary, `${lines.join("\n").replace(/\n+$/, "")}\n`);
  try {
    fs.renameSync(temporary, iniPath);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {}
    throw error;
  }
}

async function qbitLogin() {
  if (!desktopConfig?.qbitPort) {
    return { ok: false, error: "missing_port" };
  }
  const baseUrl = `http://127.0.0.1:${desktopConfig.qbitPort}`;
  try {
    const body = new URLSearchParams({
      username: desktopConfig.qbitUser,
      password: desktopConfig.qbitPassword,
    });
    const response = await fetch(`${baseUrl}/api/v2/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: baseUrl,
      },
      body,
      signal: AbortSignal.timeout(1500),
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, error: `auth_http_${response.status}` };
    }
    if (text.trim().toLowerCase() === "fails.") {
      return { ok: false, error: "auth_failed" };
    }
    const setCookie = response.headers.get("set-cookie");
    const cookie = setCookie?.split(";")[0];
    if (!cookie) return { ok: false, error: "auth_cookie_missing" };
    return { ok: true, baseUrl, cookie };
  } catch {
    return { ok: false, error: "webui_unreachable" };
  }
}

async function qbitApi(pathname, init = {}) {
  const auth = await qbitLogin();
  if (!auth.ok) return auth;
  try {
    const headers = new Headers(init.headers);
    headers.set("Cookie", auth.cookie);
    headers.set("Referer", auth.baseUrl);
    const response = await fetch(`${auth.baseUrl}${pathname}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(2000),
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, error: `http_${response.status}` };
    }
    return { ok: true, data: text };
  } catch {
    return { ok: false, error: "webui_unreachable" };
  }
}

async function probeQbit() {
  return qbitApi("/api/v2/app/version");
}

async function setQbitDownloadDirectory(downloadDir) {
  const body = new URLSearchParams({
    json: JSON.stringify({ save_path: downloadDir }),
  });
  return qbitApi("/api/v2/app/setPreferences", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function applyPendingQbitDownloadDirectory() {
  if (!pendingQbitDownloadDir) return { ok: true };
  const target = pendingQbitDownloadDir;
  const result = await setQbitDownloadDirectory(target);
  if (result.ok && pendingQbitDownloadDir === target) {
    pendingQbitDownloadDir = null;
  }
  return result;
}

async function waitForQbit(timeoutMs = QBIT_START_TIMEOUT_MS) {
  const started = Date.now();
  let lastError = "webui_unreachable";
  while (Date.now() - started < timeoutMs) {
    const result = await probeQbit();
    if (result.ok) return result;
    lastError = result.error;
    if (
      result.error === "auth_failed" ||
      result.error === "auth_cookie_missing" ||
      result.error.startsWith("auth_http_")
    ) {
      break;
    }
    await delay(400);
  }
  const error = new Error(`qBittorrent health check failed: ${lastError}`);
  error.code = lastError;
  throw error;
}

function isQbitAuthError(value) {
  const code = typeof value === "string" ? value : value?.code;
  return (
    code === "auth_failed" ||
    code === "auth_cookie_missing" ||
    String(code || "").startsWith("auth_http_")
  );
}

async function selectQbitPort() {
  if (desktopConfig.qbitPort) {
    const existing = await probeQbit();
    if (existing.ok) return { port: desktopConfig.qbitPort, adopt: true };
    if (await canListen(desktopConfig.qbitPort)) {
      return { port: desktopConfig.qbitPort, adopt: false };
    }
  }
  return { port: await findOpenPort(QBIT_PORT_START), adopt: false };
}

function attachQbitProcess(child) {
  child.on("error", (err) => {
    appendLog("qbit.log", `[desktop] qBit start error: ${err.stack || err}\n`);
    if (!isQuitting) markQbitUnavailable(err);
  });
  child.on("exit", (code, signal) => {
    const wasCurrent = qbitProcess === child;
    if (wasCurrent) qbitProcess = null;
    const expected = expectedQbitExits.has(child);
    expectedQbitExits.delete(child);
    appendLog("qbit.log", `[desktop] qBit exited: ${code ?? signal}\n`);
    if (wasCurrent && !expected && !isQuitting) {
      markQbitUnavailable(new Error("qbit_process_exited"));
      if (qbitAutoRestartEnabled) scheduleQbitRestart();
    }
  });
}

function waitForChildExit(child, timeoutMs = 5000) {
  if (!child || child.exitCode != null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(child.exitCode != null), timeoutMs);
    timer.unref?.();
    child.once("exit", onExit);
  });
}

async function terminateOwnedQbit(child, reason) {
  if (!child || child.exitCode != null) return;
  expectedQbitExits.add(child);
  if (qbitProcess === child) qbitProcess = null;
  appendLog("qbit.log", `[desktop] Stopping managed qBit: ${reason}\n`);
  try {
    child.kill();
  } catch {}
  if (await waitForChildExit(child, 3500)) return;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      child.kill("SIGKILL");
    } catch {}
  }
  await waitForChildExit(child, 1500);
}

function qbitCredentialRepairExhausted(errorCode = "auth_failed") {
  const error = new Error(
    `qBittorrent credential repair exhausted: ${errorCode}`,
  );
  error.code = "credential_repair_exhausted";
  return error;
}

async function repairOwnedQbitCredentials({ child, profileDir, downloadDir, port }) {
  return qbitCredentialRepairCycle.repairCredentialsOnce({
    stop: () => terminateOwnedQbit(child, "authentication repair"),
    rewriteCredentials: () => {
      appendLog(
        "qbit.log",
        "[desktop] Rewriting managed qBit credentials and restarting once\n",
      );
      writeQbitConfig({ profileDir, config: desktopConfig, downloadDir });
    },
    restart: async () => {
      await startQbitOnce(
        { port, adopt: false },
        { allowCredentialRepair: false, ensureConfig: false },
      );
      return { authenticated: true };
    },
  });
}

async function startQbitOnce(
  preselected = null,
  { allowCredentialRepair = true, ensureConfig = true } = {},
) {
  if (qbitCredentialRepairCycle.isExhausted() && allowCredentialRepair) {
    const authenticated = await probeQbit();
    if (!authenticated.ok) {
      throw qbitCredentialRepairExhausted(authenticated.error);
    }
    preselected = { port: desktopConfig.qbitPort, adopt: true };
  }
  const exe = getQbitExePath();
  if (!fs.existsSync(exe)) {
    throw new Error(`qBittorrent not found: ${exe}`);
  }

  let selection = preselected;
  if (!selection && qbitProcess && qbitProcess.exitCode == null) {
    const ownedProbe = await probeQbit();
    if (ownedProbe.ok) {
      selection = { port: desktopConfig.qbitPort, adopt: true };
    } else {
      const repairCredentials = isQbitAuthError(ownedProbe.error);
      const owned = qbitProcess;
      if (repairCredentials && allowCredentialRepair) {
        const userData = app.getPath("userData");
        const profileDir = path.join(userData, "qbit-profile");
        const downloadDir = desktopConfig.downloadDir;
        ensureDir(profileDir);
        ensureDir(downloadDir);
        const repaired = await repairOwnedQbitCredentials({
          child: owned,
          profileDir,
          downloadDir,
          port: desktopConfig.qbitPort,
        });
        if (repaired.authenticated) return;
        throw qbitCredentialRepairExhausted(ownedProbe.error);
      }
      await terminateOwnedQbit(owned, "health recovery");
      if (repairCredentials) throw qbitCredentialRepairExhausted(ownedProbe.error);
      selection = { port: desktopConfig.qbitPort, adopt: false };
    }
  }
  selection = selection ?? (await selectQbitPort());
  desktopConfig.qbitPort = selection.port;
  saveDesktopConfig();

  if (selection.adopt) {
    qbitReady = true;
    const pending = await applyPendingQbitDownloadDirectory();
    if (!pending.ok) {
      qbitReady = false;
      throw new Error(`qBittorrent save path update failed: ${pending.error}`);
    }
    qbitCredentialRepairCycle.markAuthenticatedReady();
    qbitRestartAttempt = 0;
    setDownloadServiceState("ready");
    appendLog(
      "qbit.log",
      `[desktop] Reused managed qBittorrent on 127.0.0.1:${selection.port}\n`,
    );
    return;
  }

  const userData = app.getPath("userData");
  const profileDir = path.join(userData, "qbit-profile");
  const downloadDir = desktopConfig.downloadDir;
  ensureDir(profileDir);
  ensureDir(downloadDir);
  if (ensureConfig) {
    writeQbitConfig({ profileDir, config: desktopConfig, downloadDir });
  }

  const child = spawn(
    exe,
    [
      `--profile=${profileDir}`,
      "--configuration=anime",
      `--webui-port=${desktopConfig.qbitPort}`,
      "--no-splash",
    ],
    {
      detached: false,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  qbitProcess = child;
  attachQbitProcess(child);

  let status;
  try {
    status = await waitForQbit();
  } catch (error) {
    if (allowCredentialRepair && isQbitAuthError(error)) {
      const repaired = await repairOwnedQbitCredentials({
        child,
        profileDir,
        downloadDir,
        port: desktopConfig.qbitPort,
      });
      if (repaired.authenticated) return;
      throw qbitCredentialRepairExhausted(error.code);
    }
    await terminateOwnedQbit(child, "failed post-spawn health check");
    if (isQbitAuthError(error)) throw qbitCredentialRepairExhausted(error.code);
    throw error;
  }
  qbitReady = true;
  const pending = await applyPendingQbitDownloadDirectory();
  if (!pending.ok) {
    qbitReady = false;
    await terminateOwnedQbit(child, "failed post-spawn save path update");
    throw new Error(`qBittorrent save path update failed: ${pending.error}`);
  }
  qbitCredentialRepairCycle.markAuthenticatedReady();
  qbitRestartAttempt = 0;
  setDownloadServiceState("ready");
  appendLog(
    "qbit.log",
    `[desktop] Managed qBittorrent ready on 127.0.0.1:${desktopConfig.qbitPort} (${status.data.trim()})\n`,
  );
}

async function startQbit(preselected = null) {
  if (qbitStartPromise) return qbitStartPromise;
  qbitStartPromise = startQbitOnce(preselected).finally(() => {
    qbitStartPromise = null;
  });
  return qbitStartPromise;
}

function scheduleQbitRestart() {
  if (qbitRestartTimer || qbitRestarting || isQuitting) return;
  const waitMs = Math.min(1000 * 2 ** qbitRestartAttempt, 30000);
  qbitRestartAttempt += 1;
  appendLog(
    "qbit.log",
    `[desktop] Scheduling qBit recovery in ${waitMs}ms\n`,
  );
  qbitRestartTimer = setTimeout(async () => {
    qbitRestartTimer = null;
    qbitRestarting = true;
    publishDownloadServiceState();
    try {
      await startQbit();
    } catch (err) {
      markQbitUnavailable(err);
      appendLog(
        "qbit.log",
        `[desktop] qBit recovery failed: ${err.stack || err}\n`,
      );
    } finally {
      qbitRestarting = false;
      publishDownloadServiceState();
      if (!qbitReady && !isQuitting) scheduleQbitRestart();
    }
  }, waitMs);
}

async function retryDownloadService() {
  if (qbitReady) {
    const authenticated = await probeQbit();
    if (authenticated.ok) {
      return { ok: true, state: getDownloadServiceState() };
    }
    markQbitUnavailable(
      Object.assign(new Error(`qBittorrent health check failed: ${authenticated.error}`), {
        code: authenticated.error,
      }),
    );
  }
  if (qbitRestarting || qbitStartPromise) {
    return { ok: false, state: getDownloadServiceState() };
  }
  if (qbitRestartTimer) {
    clearTimeout(qbitRestartTimer);
    qbitRestartTimer = null;
  }

  qbitRestarting = true;
  setDownloadServiceState(
    "recovering",
    "正在重新连接下载服务；浏览和本地播放仍可使用。",
  );
  let ok = false;
  try {
    await startQbit();
    ok = true;
  } catch (err) {
    markQbitUnavailable(err);
    appendLog(
      "qbit.log",
      `[desktop] Manual qBit retry failed: ${err.stack || err}\n`,
    );
  } finally {
    qbitRestarting = false;
    publishDownloadServiceState();
    if (!qbitReady && !isQuitting) scheduleQbitRestart();
  }
  return { ok, state: getDownloadServiceState() };
}

async function startNextServer(runtimePathEnv) {
  const standaloneDir = getStandaloneDir();
  const serverEntry = path.join(standaloneDir, "server.js");
  if (!fs.existsSync(serverEntry)) {
    throw new Error("Missing Next standalone server. Run npm run desktop:dist.");
  }

  const userData = app.getPath("userData");
  const dataDir = path.join(userData, "data");
  ensureDir(dataDir);
  const dbPath = path.join(dataDir, "anime.db");
  const port = await findOpenPort(APP_PORT_START);
  const appUrl = `http://127.0.0.1:${port}`;
  const proxyEnv = await getNextProxyEnv();

  const spawnedNext = spawn(getNodeExePath(), ["--use-env-proxy", serverEntry], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ...proxyEnv,
      ...runtimePathEnv,
      NODE_ENV: "production",
      BANDI_BUILD_ID: getStandaloneBuildId(),
      BANDI_APP_VERSION: app.getVersion(),
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      DATABASE_URL: dbPath,
      AUTH_SECRET: desktopConfig.authSecret,
      AUTH_URL: appUrl,
      NEXTAUTH_URL: appUrl,
      AUTH_TRUST_HOST: "true",
      QBIT_URL: `http://127.0.0.1:${desktopConfig.qbitPort}`,
      QBIT_USER: desktopConfig.qbitUser,
      QBIT_PASS: desktopConfig.qbitPassword,
      QBIT_CONFIG_PATH: configFile(userData),
      DESKTOP_CONFIG_PATH: configFile(userData),
      ...bundledFfmpegEnvironment(),
      ANIME_DESKTOP_APP: "1",
      DESKTOP_BOOTSTRAP_USER: desktopConfig.appUser,
      DESKTOP_SESSION_TOKEN: desktopSessionToken,
      BANDI_PARENT_LEASE_PATH: parentLeasePath,
      BANDI_PARENT_LEASE_TOKEN: parentLeaseToken,
      BANDI_PARENT_LEASE_PID: String(process.pid),
      BANDI_PARENT_LEASE_MAX_AGE_MS: String(PARENT_LEASE_MAX_AGE_MS),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  nextProcess = spawnedNext;

  spawnedNext.stdout.on("data", (chunk) => appendLog("next.log", chunk));
  spawnedNext.stderr.on("data", (chunk) => appendLog("next.err.log", chunk));
  spawnedNext.on("exit", (code, signal) => {
    if (nextProcess === spawnedNext) nextProcess = null;
    appendLog("next.log", `[desktop] Next exited: ${code ?? signal}\n`);
  });

  try {
    await waitForHttp(appUrl);
  } catch (error) {
    if (nextProcess === spawnedNext) nextProcess = null;
    try {
      spawnedNext.kill();
    } catch {}
    if (!(await waitForChildExit(spawnedNext, 2500)) && spawnedNext.pid) {
      spawnSync("taskkill", ["/PID", String(spawnedNext.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    }
    throw error;
  }
  return appUrl;
}

function getDesktopSettingsState() {
  const inspection = inspectDownloadDirectory(desktopConfig.downloadDir);
  return {
    available: true,
    downloadDir: desktopConfig.downloadDir,
    freeSpaceBytes: inspection.ok ? inspection.freeSpaceBytes : null,
    directoryWritable: inspection.ok,
    directoryError: inspection.ok ? null : inspection.error,
    closeToTray: desktopConfig.closeToTray,
    onboardingComplete:
      desktopConfig.onboardingVersion >= ONBOARDING_VERSION,
    onboardingMode: desktopConfig.onboardingMode,
  };
}

function writeManagedQbitConfig() {
  const profileDir = path.join(app.getPath("userData"), "qbit-profile");
  ensureDir(profileDir);
  writeQbitConfig({
    profileDir,
    config: desktopConfig,
    downloadDir: desktopConfig.downloadDir,
  });
}

async function saveDesktopSettings(input) {
  const inspection = inspectDownloadDirectory(input?.downloadDir, {
    create: true,
  });
  if (!inspection.ok) return inspection;

  const downloadDirChanged = inspection.downloadDir !== desktopConfig.downloadDir;
  if (downloadDirChanged && qbitReady) {
    const qbitResult = await setQbitDownloadDirectory(inspection.downloadDir);
    if (!qbitResult.ok) {
      return {
        ok: false,
        error: `下载服务暂时无法切换目录：${qbitResult.error}`,
      };
    }
    pendingQbitDownloadDir = null;
  } else if (downloadDirChanged) {
    pendingQbitDownloadDir = inspection.downloadDir;
  }

  desktopConfig.downloadDir = inspection.downloadDir;
  desktopConfig.closeToTray = input?.closeToTray !== false;
  if (input?.completeOnboarding === true) {
    desktopConfig.onboardingVersion = ONBOARDING_VERSION;
  }
  writeManagedQbitConfig();
  saveDesktopConfig();
  return { ok: true, settings: getDesktopSettingsState() };
}

function registerDesktopIpc() {
  ipcMain.handle("bandi:get-desktop-settings", () =>
    getDesktopSettingsState(),
  );
  ipcMain.handle("bandi:choose-download-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择 Bandi 下载目录",
      defaultPath: desktopConfig.downloadDir,
      buttonLabel: "使用此文件夹",
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const inspection = inspectDownloadDirectory(result.filePaths[0]);
    return inspection.ok
      ? {
          canceled: false,
          downloadDir: inspection.downloadDir,
          freeSpaceBytes: inspection.freeSpaceBytes,
        }
      : { canceled: false, error: inspection.error };
  });
  ipcMain.handle("bandi:choose-media-directory", async (_event, input) => {
    const mediaKind = input?.kind === "anime" ? "anime" : "cinema";
    const requestedDefault =
      typeof input?.defaultPath === "string" ? input.defaultPath.trim() : "";
    const defaultPath =
      requestedDefault && fs.existsSync(requestedDefault)
        ? requestedDefault
        : desktopConfig.downloadDir;
    const result = await dialog.showOpenDialog(mainWindow, {
      title:
        mediaKind === "anime"
          ? "选择本地动漫文件夹"
          : "选择本地影视文件夹",
      defaultPath,
      buttonLabel: mediaKind === "anime" ? "扫描本地库" : "扫描此文件夹",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return {
      canceled: false,
      directoryPath: path.resolve(result.filePaths[0]),
    };
  });
  ipcMain.handle("bandi:save-desktop-settings", (_event, input) =>
    saveDesktopSettings(input),
  );
  ipcMain.handle("bandi:get-download-service-state", () =>
    getDownloadServiceState(),
  );
  ipcMain.handle("bandi:retry-download-service", () =>
    retryDownloadService(),
  );
  ipcMain.handle("bandi:get-update-state", (event) => {
    if (!isTrustedMainWindowSender(event)) {
      return {
        mode: "development",
        status: "unsupported",
        action: "none",
        currentVersion: app.getVersion(),
        availableVersion: null,
        progressPercent: null,
        message: null,
        lastCheckedAt: null,
      };
    }
    return updateController?.getState() || {
      mode: "development",
      status: "unsupported",
      action: "none",
      currentVersion: app.getVersion(),
      availableVersion: null,
      progressPercent: null,
      message: null,
      lastCheckedAt: null,
    };
  });
  ipcMain.handle("bandi:check-for-updates", (event) => {
    if (!isTrustedMainWindowSender(event)) {
      return { ok: false, error: "forbidden" };
    }
    return updateController?.checkForUpdates() || {
      ok: false,
      error: "update_unavailable",
    };
  });
  ipcMain.handle("bandi:install-update", (event) =>
    isTrustedMainWindowSender(event)
      ? installAvailableUpdate()
      : { ok: false, error: "forbidden" },
  );
  ipcMain.handle("bandi:open-update-page", (event) => {
    if (!isTrustedMainWindowSender(event)) {
      return { ok: false, error: "forbidden" };
    }
    return updateController?.openUpdatePage() || {
      ok: false,
      error: "update_unavailable",
    };
  });
  ipcMain.handle("bandi:get-window-state", (event) =>
    getDesktopWindowState(BrowserWindow.fromWebContents(event.sender)),
  );
  ipcMain.handle("bandi:minimize-window", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window !== mainWindow) return { ok: false };
    window.minimize();
    return { ok: true };
  });
  ipcMain.handle("bandi:toggle-maximize-window", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window !== mainWindow) return getDesktopWindowState(null);
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
    return getDesktopWindowState(window);
  });
  ipcMain.handle("bandi:close-window", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window !== mainWindow) return { ok: false };
    window.close();
    return { ok: true };
  });
}

function getDesktopWindowState(window = mainWindow) {
  return {
    isMaximized: Boolean(window && !window.isDestroyed() && window.isMaximized()),
  };
}

function publishDesktopWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(
    "bandi:window-state-changed",
    getDesktopWindowState(mainWindow),
  );
}

function attachDesktopSessionHeader(appUrl) {
  const allowedOrigins = getDesktopSessionOrigins(appUrl);
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [...allowedOrigins].map((origin) => `${origin}/*`) },
    (details, callback) => {
      callback({
        requestHeaders: withDesktopSessionHeader({
          allowedOrigins,
          requestUrl: details.url,
          requestHeaders: details.requestHeaders,
          headerName: DESKTOP_AUTH_HEADER,
          headerValue: desktopSessionToken,
        }),
      });
    },
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function bootPage(
  message = "正在打开 Bandi",
  detail = "正在载入本地资料。",
  section = "启动中",
) {
  const safeMessage = escapeHtml(message);
  const safeDetail = escapeHtml(detail);
  const safeSection = escapeHtml(section);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      :root{--titlebar-space:44px}
      *{box-sizing:border-box}
      html,body{height:100%;margin:0;background:#0f0d0a;color:#f6f1e8;font-family:Inter,"Microsoft YaHei",sans-serif}
      body{padding-top:var(--titlebar-space)}
      .titlebar{position:fixed;z-index:10;top:0;right:0;left:0;height:44px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 8px 0 12px;-webkit-app-region:drag}
      .brand{display:flex;min-width:0;align-items:center;gap:8px;color:#f6f1e8;font-size:12px;font-weight:650;letter-spacing:-.01em}
      .mark{display:grid;width:22px;height:22px;place-items:center;color:#d69a4c;font-size:11px;font-weight:750}
      .section{color:#a9a198;font-size:11px;font-weight:500;letter-spacing:.02em}
      .controls{justify-self:end;display:flex;gap:2px;-webkit-app-region:no-drag}
      .window-button{position:relative;width:36px;height:30px;padding:0;border:0;border-radius:6px;corner-shape:squircle;background:transparent;color:#a9a198;cursor:default;transition:background-color 150ms cubic-bezier(.25,.1,.25,1),color 150ms cubic-bezier(.25,.1,.25,1),transform 80ms cubic-bezier(.25,.1,.25,1)}
      .window-button:hover{background:rgba(255,255,255,.075);color:#f6f1e8}
      .window-button:active{transform:scale(.94)}
      .window-button.close:hover{background:rgba(205,62,62,.82);color:#fff}
      .window-button:focus-visible{outline:2px solid rgba(214,154,76,.82);outline-offset:1px}
      .minus,.close-glyph,.maximize-glyph{position:absolute;inset:0;display:grid;place-items:center}
      .minus:before{content:"";width:10px;height:1px;border-radius:1px;background:currentColor}
      .close-glyph:before,.close-glyph:after{content:"";position:absolute;width:11px;height:1px;border-radius:1px;background:currentColor}
      .close-glyph:before{transform:rotate(45deg)}.close-glyph:after{transform:rotate(-45deg)}
      .maximize-glyph:before{content:"";width:9px;height:9px;border:1px solid currentColor;border-radius:2px}
      .maximize-glyph.restore:before,.maximize-glyph.restore:after{content:"";position:absolute;width:8px;height:8px;border:1px solid currentColor;border-radius:2px;background:#181613}
      .maximize-glyph.restore:before{transform:translate(2px,-2px)}.maximize-glyph.restore:after{transform:translate(-2px,2px)}
      .desktop-boot-screen{display:grid;min-height:calc(100vh - var(--titlebar-space));place-items:center;overflow:hidden;padding:24px;background:#0f0d0a;color:#f6f1e8}
      .desktop-boot-card{width:min(420px,100%);padding:28px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.035);box-shadow:0 24px 80px rgba(0,0,0,.35)}
      .desktop-boot-heading{display:flex;align-items:center;gap:10px}
      .desktop-boot-indicator{display:block;width:8px;height:8px;flex:0 0 auto;border-radius:50%;background:#d69a4c;box-shadow:0 0 16px rgba(214,154,76,.55);animation:desktop-boot-pulse 1.4s ease-in-out infinite}
      .desktop-boot-heading h1{margin:0;color:#f6f1e8;font-size:20px;font-weight:700;letter-spacing:-.02em}
      .desktop-boot-card p{margin:8px 0 0;color:#a9a198;font-size:13px;line-height:1.7}
      @keyframes desktop-boot-pulse{50%{opacity:.35;transform:scale(.78)}}
      @media(prefers-reduced-motion:reduce){.desktop-boot-indicator{animation:none}.window-button{transition:none}}
    </style>
  </head>
  <body>
    <div class="titlebar" role="toolbar" aria-label="Bandi 窗口栏">
      <div class="brand"><span class="mark">B</span><span>Bandi</span></div>
      <span class="section">${safeSection}</span>
      <div class="controls" role="group" aria-label="窗口控制">
        <button class="window-button" id="minimize" type="button" aria-label="最小化" title="最小化"><span class="minus" aria-hidden="true"></span></button>
        <button class="window-button" id="maximize" type="button" aria-label="最大化" title="最大化"><span class="maximize-glyph" aria-hidden="true"></span></button>
        <button class="window-button close" id="close" type="button" aria-label="关闭" title="关闭"><span class="close-glyph" aria-hidden="true"></span></button>
      </div>
    </div>
    <main class="desktop-boot-screen"><section class="desktop-boot-card"><div class="desktop-boot-heading"><span class="desktop-boot-indicator" aria-hidden="true"></span><h1>${safeMessage}</h1></div><p>${safeDetail}</p></section></main>
    <script>
      const bridge = window.bandiDesktop;
      const maximizeButton = document.getElementById("maximize");
      const maximizeGlyph = maximizeButton.querySelector("span");
      const syncWindowState = (state) => {
        const maximized = Boolean(state && state.isMaximized);
        maximizeGlyph.className = maximized ? "maximize-glyph restore" : "maximize-glyph";
        maximizeButton.setAttribute("aria-label", maximized ? "还原窗口" : "最大化");
        maximizeButton.title = maximized ? "还原窗口" : "最大化";
      };
      document.getElementById("minimize").addEventListener("click", () => bridge && bridge.minimizeWindow());
      maximizeButton.addEventListener("click", async () => bridge && syncWindowState(await bridge.toggleMaximizeWindow()));
      document.getElementById("close").addEventListener("click", () => bridge && bridge.closeWindow());
      if (bridge) {
        bridge.getWindowState().then(syncWindowState);
        bridge.onWindowStateChange(syncWindowState);
      }
    </script>
  </body>
</html>`;
}

function createWindow() {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: "#0f0d0a",
    title: "追番中心",
    icon: getAppIconPath(),
    frame: false,
    thickFrame: true,
    roundedCorners: true,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    if (desktopConfig.closeToTray) {
      mainWindow.hide();
      return;
    }
    app.quit();
  });
  mainWindow.on("maximize", publishDesktopWindowState);
  mainWindow.on("unmaximize", publishDesktopWindowState);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  void mainWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(
      bootPage(),
    )}`,
  );
}

function revealWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  tray = new Tray(getAppIconPath());
  tray.setToolTip("追番中心");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开追番中心", click: revealWindow },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]),
  );
  tray.on("double-click", revealWindow);
}

async function boot() {
  bootStage = "storage";
  const userData = app.getPath("userData");
  ensureDir(userData);
  desktopSessionToken = randomSecret(32);
  desktopConfig = loadDesktopConfig(userData);
  startParentLease();
  initializeUpdateController();

  bootStage = "window";
  registerDesktopIpc();
  createWindow();
  createTray();

  // Validate app-owned storage and the user-selected media directory before startup.
  bootStage = "runtime-paths";
  const runtimePathEnv = prepareNextRuntimeDirectories(
    desktopConfig.downloadDir,
  );
  pendingQbitDownloadDir = desktopConfig.downloadDir;

  bootStage = "download-service";
  if (!desktopConfig.qbitPort) {
    desktopConfig.qbitPort = QBIT_PORT_START;
    saveDesktopConfig();
  }
  const initialQbitStart = (async () => {
    const qbitSelection = await selectQbitPort();
    await startQbit(qbitSelection);
  })().catch((err) => {
    markQbitUnavailable(err);
    appendLog(
      "qbit.log",
      `[desktop] Initial qBit start failed: ${err.stack || err}\n`,
    );
  });

  bootStage = "app-service";
  const appUrl = await startNextServer(runtimePathEnv);
  const appOrigin = new URL(appUrl);
  trustedAppOrigins = new Set([
    appOrigin.origin,
    `http://localhost:${appOrigin.port}`,
  ]);
  attachDesktopSessionHeader(appUrl);
  qbitAutoRestartEnabled = true;
  void initialQbitStart.finally(() => {
    if (!qbitReady) scheduleQbitRestart();
  });
  const initialPath =
    desktopConfig.onboardingVersion >= ONBOARDING_VERSION
      ? "/"
      : "/onboarding";
  bootStage = "interface";
  await mainWindow.loadURL(new URL(initialPath, appUrl).toString());
  updateController.start();
  bootStage = "ready";
}

function describeBootFailure(stage, error) {
  const reason = error?.message || String(error || "unknown");
  const feedback = {
    storage: {
      label: "本地存储初始化失败",
      action: "请确认 Bandi 数据目录所在磁盘已连接且可写，然后重新打开应用。",
    },
    window: {
      label: "应用窗口初始化失败",
      action: "请关闭 Bandi 后重新打开；若仍失败，请查看错误日志。",
    },
    "runtime-paths": {
      label: "运行目录不可用",
      action: "请确认提示中的目录存在且可写，然后重新打开应用。",
    },
    "download-service": {
      label: "下载服务初始化失败",
      action: "请重新打开 Bandi；若仍失败，请查看下载服务日志。",
    },
    "app-service": {
      label: "Bandi 核心服务启动失败",
      action: "请关闭 Bandi 后重新打开；若仍失败，请查看错误日志。",
    },
    interface: {
      label: "Bandi 界面加载失败",
      action: "请重新打开 Bandi；下载记录和设置不会受影响。",
    },
  }[stage] || {
    label: "Bandi 启动失败",
    action: "请关闭 Bandi 后重新打开；若仍失败，请查看错误日志。",
  };
  return `${feedback.label}：${reason}。${feedback.action}详细记录位于 logs/desktop.err.log。`;
}

async function waitForQbitExit(timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!qbitProcess || qbitProcess.exitCode != null) return;
    await delay(100);
  }
}

async function shutdownServices() {
  updateController?.stop();
  qbitAutoRestartEnabled = false;
  if (qbitRestartTimer) {
    clearTimeout(qbitRestartTimer);
    qbitRestartTimer = null;
  }
  if (nextProcess && !nextProcess.killed) nextProcess.kill();

  const shutdown = await qbitApi("/api/v2/app/shutdown", { method: "POST" });
  if (!shutdown.ok && shutdown.error !== "webui_unreachable") {
    appendLog("qbit.log", `[desktop] qBit graceful shutdown failed: ${shutdown.error}\n`);
  }
  await waitForQbitExit();
  if (qbitProcess && !qbitProcess.killed) qbitProcess.kill();
  stopParentLease();
}

try {
  configureElectronSessionData();
} catch (error) {
  const reason = error?.message || String(error);
  console.error("[desktop] Electron sessionData setup failed:", error);
  dialog.showErrorBox(
    "Bandi 启动失败",
    `Electron 缓存目录初始化失败：${reason}\n\n请确认失败路径所在磁盘已连接且可写。`,
  );
  app.exit(1);
  throw error;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", revealWindow);
  app.whenReady().then(() => {
    boot().catch((err) => {
      appendLog("desktop.err.log", `${err.stack || err}\n`);
      if (mainWindow) {
        void mainWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(
            bootPage(
              "Bandi 启动失败",
              describeBootFailure(bootStage, err),
              "启动失败",
            ),
          )}`,
        );
      }
    });
  });
}

app.on("activate", revealWindow);

app.on("before-quit", (event) => {
  isQuitting = true;
  if (shutdownComplete) return;
  event.preventDefault();
  if (!shutdownPromise) {
    shutdownPromise = (async () => {
      await preparePortableUpdateOnExit();
      await shutdownServices();
    })().finally(() => {
      shutdownComplete = true;
      app.quit();
    });
  }
});
