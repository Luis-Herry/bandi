const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  shell,
} = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const APP_PORT_START = 31245;
const QBIT_PORT_START = 18180;
const QBIT_START_TIMEOUT_MS = 25000;
const CONFIG_NAME = "config.json";
const ONBOARDING_VERSION = 1;
const DESKTOP_AUTH_HEADER = "X-Bandi-Desktop-Token";
const DEFAULT_APP_USER = "admin";
const DEFAULT_APP_PASSWORD = "PUBLIC_HISTORY_REDACTED";
const DEFAULT_QBIT_USER = "admin";

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
let pendingQbitDownloadDir = null;
let isQuitting = false;
let shutdownComplete = false;
let shutdownPromise = null;
let desktopSessionToken = null;

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
  const downloadDir = path.resolve(value.trim());
  if (!path.isAbsolute(downloadDir) || downloadDir === path.parse(downloadDir).root) {
    return { ok: false, error: "下载目录不能直接使用磁盘根目录" };
  }

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

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function configFile(userDataDir = app.getPath("userData")) {
  return path.join(userDataDir, CONFIG_NAME);
}

function saveDesktopConfig() {
  writeJson(configFile(), desktopConfig);
}

function loadDesktopConfig(userDataDir) {
  const existing = readJson(configFile(userDataDir));
  const hasExistingConfig = Object.keys(existing).length > 0;
  const existingQbitPort = Number(existing.qbitPort || 0);
  const qbitPort =
    Number.isInteger(existingQbitPort) &&
    existingQbitPort >= 1024 &&
    existingQbitPort <= 65535
      ? existingQbitPort
      : 0;
  const qbitUser =
    existing.qbitUser && existing.qbitUser !== "anime"
      ? existing.qbitUser
      : DEFAULT_QBIT_USER;
  const fallbackDownloadDir = hasExistingConfig
    ? path.join(userDataDir, "download")
    : path.join(app.getPath("videos"), "Bandi", "Downloads");
  const existingOnboardingVersion = Number(existing.onboardingVersion || 0);
  const config = {
    authSecret: existing.authSecret || randomSecret(48),
    appUser: existing.appUser || DEFAULT_APP_USER,
    appPassword:
      existing.appPassword ||
      (hasExistingConfig ? DEFAULT_APP_PASSWORD : randomSecret(18)),
    qbitUser,
    qbitPassword: existing.qbitPassword || randomSecret(18),
    qbitPort,
    downloadDir:
      typeof existing.downloadDir === "string" && existing.downloadDir.trim()
        ? path.resolve(existing.downloadDir.trim())
        : fallbackDownloadDir,
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
  writeJson(configFile(userDataDir), config);
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

async function findOpenPort(start) {
  for (let port = start; port < start + 200; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`No open local port found from ${start}`);
}

function waitForHttp(url, timeoutMs = 25000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(tick, 350);
      });
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
  setIniValue(lines, "Preferences", "WebUI\\LocalHostAuth", "false");
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

  fs.writeFileSync(iniPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
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
  throw new Error(`qBittorrent health check failed: ${lastError}`);
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
  });
  child.on("exit", (code, signal) => {
    if (qbitProcess === child) qbitProcess = null;
    qbitReady = false;
    appendLog("qbit.log", `[desktop] qBit exited: ${code ?? signal}\n`);
    if (qbitAutoRestartEnabled && !isQuitting) scheduleQbitRestart();
  });
}

async function startQbit(preselected = null) {
  const exe = getQbitExePath();
  if (!fs.existsSync(exe)) {
    throw new Error(`qBittorrent not found: ${exe}`);
  }

  const selection = preselected ?? (await selectQbitPort());
  desktopConfig.qbitPort = selection.port;
  saveDesktopConfig();

  if (selection.adopt) {
    qbitReady = true;
    const pending = await applyPendingQbitDownloadDirectory();
    if (!pending.ok) {
      qbitReady = false;
      throw new Error(`qBittorrent save path update failed: ${pending.error}`);
    }
    qbitRestartAttempt = 0;
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
  writeQbitConfig({ profileDir, config: desktopConfig, downloadDir });

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

  const status = await waitForQbit();
  qbitReady = true;
  const pending = await applyPendingQbitDownloadDirectory();
  if (!pending.ok) {
    qbitReady = false;
    throw new Error(`qBittorrent save path update failed: ${pending.error}`);
  }
  qbitRestartAttempt = 0;
  appendLog(
    "qbit.log",
    `[desktop] Managed qBittorrent ready on 127.0.0.1:${desktopConfig.qbitPort} (${status.data.trim()})\n`,
  );
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
    try {
      await startQbit();
    } catch (err) {
      appendLog(
        "qbit.log",
        `[desktop] qBit recovery failed: ${err.stack || err}\n`,
      );
    } finally {
      qbitRestarting = false;
      if (!qbitReady && !isQuitting) scheduleQbitRestart();
    }
  }, waitMs);
}

async function startNextServer() {
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

  nextProcess = spawn(getNodeExePath(), [serverEntry], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
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
      ANIME_DESKTOP_APP: "1",
      DESKTOP_BOOTSTRAP_USER: desktopConfig.appUser,
      DESKTOP_BOOTSTRAP_PASSWORD: desktopConfig.appPassword,
      DESKTOP_SESSION_TOKEN: desktopSessionToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  nextProcess.stdout.on("data", (chunk) => appendLog("next.log", chunk));
  nextProcess.stderr.on("data", (chunk) => appendLog("next.err.log", chunk));
  nextProcess.on("exit", (code, signal) => {
    appendLog("next.log", `[desktop] Next exited: ${code ?? signal}\n`);
  });

  await waitForHttp(appUrl);
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
  ipcMain.handle("bandi:save-desktop-settings", (_event, input) =>
    saveDesktopSettings(input),
  );
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
  const origin = new URL(appUrl).origin;
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [`${origin}/*`] },
    (details, callback) => {
      details.requestHeaders[DESKTOP_AUTH_HEADER] = desktopSessionToken;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
}

function bootPage(message, detail = "请稍候，追番中心会自动完成剩余步骤。") {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      :root{--titlebar-space:44px}
      *{box-sizing:border-box}
      html,body{height:100%;margin:0;background:#0f0d0a;color:#f6f1e8;font-family:Inter,"Microsoft YaHei",sans-serif}
      body{display:grid;place-items:center;padding-top:var(--titlebar-space)}
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
      main{width:min(420px,calc(100vw - 48px));padding:28px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.035);box-shadow:0 24px 80px rgba(0,0,0,.35)}
      .boot-heading{display:flex;align-items:center;gap:10px}
      i{display:block;width:8px;height:8px;flex:0 0 auto;border-radius:50%;background:#d69a4c;box-shadow:0 0 16px rgba(214,154,76,.55);animation:pulse 1.4s ease-in-out infinite}
      h1{margin:0;font-size:20px;letter-spacing:-.02em}
      p{margin:8px 0 0;color:#a9a198;font-size:13px;line-height:1.7}
      @keyframes pulse{50%{opacity:.35;transform:scale(.78)}}
      @media(prefers-reduced-motion:reduce){i{animation:none}.window-button{transition:none}}
    </style>
  </head>
  <body>
    <div class="titlebar" role="toolbar" aria-label="Bandi 窗口栏">
      <div class="brand"><span class="mark">B</span><span>Bandi</span></div>
      <span class="section">启动中</span>
      <div class="controls" role="group" aria-label="窗口控制">
        <button class="window-button" id="minimize" type="button" aria-label="最小化" title="最小化"><span class="minus" aria-hidden="true"></span></button>
        <button class="window-button" id="maximize" type="button" aria-label="最大化" title="最大化"><span class="maximize-glyph" aria-hidden="true"></span></button>
        <button class="window-button close" id="close" type="button" aria-label="关闭" title="关闭"><span class="close-glyph" aria-hidden="true"></span></button>
      </div>
    </div>
    <main><div class="boot-heading"><i aria-hidden="true"></i><h1>${message}</h1></div><p>${detail}</p></main>
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
      bootPage("正在启动下载服务"),
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
      { label: "退出并停止下载", click: () => app.quit() },
    ]),
  );
  tray.on("double-click", revealWindow);
}

async function boot() {
  const userData = app.getPath("userData");
  ensureDir(userData);
  desktopSessionToken = randomSecret(32);
  desktopConfig = loadDesktopConfig(userData);
  registerDesktopIpc();
  createWindow();
  createTray();

  const qbitSelection = await selectQbitPort();
  desktopConfig.qbitPort = qbitSelection.port;
  saveDesktopConfig();
  const initialQbitStart = startQbit(qbitSelection).catch((err) => {
    appendLog("qbit.log", `[desktop] Initial qBit start failed: ${err.stack || err}\n`);
  });

  const appUrl = await startNextServer();
  attachDesktopSessionHeader(appUrl);
  qbitAutoRestartEnabled = true;
  void initialQbitStart.finally(() => {
    if (!qbitReady) scheduleQbitRestart();
  });
  const initialPath =
    desktopConfig.onboardingVersion >= ONBOARDING_VERSION
      ? "/"
      : "/onboarding";
  await mainWindow.loadURL(new URL(initialPath, appUrl).toString());
}

async function waitForQbitExit(timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!qbitProcess || qbitProcess.exitCode != null) return;
    await delay(100);
  }
}

async function shutdownServices() {
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
              "追番中心启动失败",
              "应用数据保持不变。请重新启动；如果仍然失败，可查看 logs/desktop.err.log。",
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
    shutdownPromise = shutdownServices().finally(() => {
      shutdownComplete = true;
      app.quit();
    });
  }
});
