const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const APP_PORT_START = 31245;
const QBIT_PORT_DEFAULT = 8080;
const CONFIG_NAME = "config.json";
const DEFAULT_APP_USER = "admin";
const DEFAULT_APP_PASSWORD = "PUBLIC_HISTORY_REDACTED";
const DEFAULT_QBIT_USER = "admin";

let mainWindow = null;
let nextProcess = null;
let qbitProcess = null;
let desktopConfig = null;

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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

function loadDesktopConfig(userDataDir) {
  const file = path.join(userDataDir, CONFIG_NAME);
  const existing = readJson(file);
  const existingQbitPort = Number(existing.qbitPort || 0);
  const qbitPort =
    existingQbitPort && existingQbitPort !== 18180
      ? existingQbitPort
      : QBIT_PORT_DEFAULT;
  const qbitUser =
    existing.qbitUser && existing.qbitUser !== "anime"
      ? existing.qbitUser
      : DEFAULT_QBIT_USER;
  const config = {
    authSecret: existing.authSecret || randomSecret(48),
    appUser: existing.appUser || DEFAULT_APP_USER,
    appPassword: existing.appPassword || DEFAULT_APP_PASSWORD,
    qbitUser,
    qbitPassword: existing.qbitPassword || randomSecret(18),
    qbitPort,
  };
  writeJson(file, config);
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

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.setTimeout(700);
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
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
  for (let port = start; port < start + 80; port += 1) {
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
  setIniValue(lines, "BitTorrent", "Session\\QueueingSystemEnabled", "false");
  setIniValue(lines, "BitTorrent", "Session\\StartPaused", "false");

  fs.writeFileSync(iniPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

async function startQbit() {
  const exe = getQbitExePath();
  if (!fs.existsSync(exe)) {
    appendLog("qbit.log", `[desktop] qBittorrent not found: ${exe}\n`);
    return;
  }

  if (await isPortOpen(desktopConfig.qbitPort)) {
    appendLog(
      "qbit.log",
      `[desktop] qBit port already open: ${desktopConfig.qbitPort}\n`,
    );
    return;
  }

  const userData = app.getPath("userData");
  const profileDir = path.join(userData, "qbit-profile");
  const downloadDir = path.join(userData, "download");
  ensureDir(profileDir);
  ensureDir(downloadDir);
  writeQbitConfig({ profileDir, config: desktopConfig, downloadDir });

  qbitProcess = spawn(
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
  qbitProcess.on("error", (err) => {
    appendLog("qbit.log", `[desktop] qBit start error: ${err.stack || err}\n`);
  });
  qbitProcess.on("exit", (code, signal) => {
    appendLog("qbit.log", `[desktop] qBit exited: ${code ?? signal}\n`);
  });
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
      ANIME_DESKTOP_APP: "1",
      DESKTOP_BOOTSTRAP_USER: desktopConfig.appUser,
      DESKTOP_BOOTSTRAP_PASSWORD: desktopConfig.appPassword,
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

function createWindow(appUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: "#0f0d0a",
    title: "追番中心",
    icon: getAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.loadURL(appUrl);
}

async function boot() {
  const userData = app.getPath("userData");
  ensureDir(userData);
  desktopConfig = loadDesktopConfig(userData);
  await startQbit();
  const appUrl = await startNextServer();
  createWindow(appUrl);
}

app.whenReady().then(() => {
  boot().catch((err) => {
    appendLog("desktop.err.log", `${err.stack || err}\n`);
    app.quit();
  });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow) {
    mainWindow.show();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill();
  }
});
