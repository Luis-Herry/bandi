const {
  app,
  clipboard,
  dialog,
  Menu,
  net: electronNet,
  nativeImage,
  shell,
  Tray,
} = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const {
  ONBOARDING_VERSION,
  configFile,
  createPairingCode,
  isDeviceActive,
  loadLocalServerConfig,
  pairDevice,
  randomSecret,
  revokeDevice,
  setLanAccess,
  writeJsonAtomic,
} = require("./config.cjs");
const { createControlServer } = require("./control-server.cjs");
const { createQbitManager, findOpenPort } = require("./qbit.cjs");
const { inspectWritableDirectory } = require("./runtime-paths.cjs");
const { autoUpdater } = require("electron-updater");
const {
  createAppUpdateController,
} = require("../runtime/app-update.cjs");
const pkg = require("../package.json");

const APP_PORT_START = 31245;
const CONTROL_RECHECK_MS = 30000;
const HOST_BOOTSTRAP_TTL_MS = 2 * 60 * 1000;
const APP_NAME = "Bandi";
const PARENT_LEASE_INTERVAL_MS = 2000;
const PARENT_LEASE_MAX_AGE_MS = 10000;

app.setName(APP_NAME);
app.setPath("userData", path.join(app.getPath("appData"), APP_NAME));

let config = null;
let controlServer = null;
let controlUrl = null;
let controlToken = null;
let nextProcess = null;
let appPort = 0;
let appUrl = null;
let qbit = null;
let tray = null;
let hostBootstrap = null;
let quitting = false;
let restartTimer = null;
let parentLeasePath = null;
let parentLeaseToken = null;
let parentLeaseTimer = null;
let updateController = null;
let shutdownComplete = false;
let shutdownPromise = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function saveConfig() {
  writeJsonAtomic(configFile(app.getPath("userData")), config);
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
      appendLog("local-server.err.log", `Parent lease renewal failed: ${error}\n`);
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
      {
        pid: process.pid,
        token: parentLeaseToken,
        updatedAt: 0,
      },
      { backupCurrent: false },
    );
  } catch {}
}

function appendLog(name, value) {
  const directory = path.join(app.getPath("userData"), "logs");
  ensureDir(directory);
  fs.appendFileSync(
    path.join(directory, name),
    `[${new Date().toISOString()}] ${String(value)}`,
    "utf8",
  );
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function findAppPort() {
  for (let port = APP_PORT_START; port <= 65535; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error("没有可用的 Bandi 服务端口");
}

function waitForHttp(url, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const retry = () => {
      if (Date.now() - started >= timeoutMs) {
        reject(new Error(`Bandi 核心服务启动超时：${url}`));
        return;
      }
      setTimeout(attempt, 250);
    };
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if ((response.statusCode || 500) < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.setTimeout(1500, () => request.destroy());
      request.on("error", retry);
    };
    attempt();
  });
}

function standaloneDir() {
  return path.join(app.getAppPath(), ".next", "standalone");
}

function standaloneBuildId() {
  try {
    const value = fs
      .readFileSync(path.join(standaloneDir(), ".next", "BUILD_ID"), "utf8")
      .trim();
    return /^[A-Za-z0-9._-]{1,128}$/.test(value) ? value : "";
  } catch {
    return "";
  }
}

function appBundlePath() {
  return path.dirname(path.dirname(path.dirname(app.getPath("exe"))));
}

function hasDeveloperIdSignature() {
  if (!app.isPackaged || pkg.bandiMacAutoUpdate !== true) return false;
  const bundle = appBundlePath();
  const verify = spawnSync(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", bundle],
    { encoding: "utf8" },
  );
  if (verify.status !== 0) return false;
  const details = spawnSync(
    "/usr/bin/codesign",
    ["-dv", "--verbose=4", bundle],
    { encoding: "utf8" },
  );
  return (
    details.status === 0 &&
    /(?:^|\n)Authority=Developer ID Application:/m.test(
      `${details.stdout || ""}\n${details.stderr || ""}`,
    )
  );
}

function initializeUpdateController() {
  const isMacSigned = hasDeveloperIdSignature();
  if (isMacSigned) {
    autoUpdater.channel = `latest-${process.arch}`;
    autoUpdater.allowDowngrade = false;
  }
  updateController = createAppUpdateController({
    app,
    updater: autoUpdater,
    isMacSigned,
    fetchImpl: (input, init) => electronNet.fetch(input, init),
    openExternal: () => shell.openExternal(
      "https://github.com/Luis-Herry/bandi/releases/latest",
    ),
    beforeInstall: async () => {
      quitting = true;
      if (!shutdownPromise) shutdownPromise = shutdown();
      await shutdownPromise;
      shutdownComplete = true;
    },
    log: (entry) => appendLog("update.log", `${JSON.stringify(entry)}\n`),
  });
  updateController.subscribe(() => rebuildTrayMenu());
}

function requestUpdateInstall() {
  if (!updateController || updateController.getState().status !== "ready") {
    return {
      ok: false,
      error: "update_not_ready",
      state: updateController?.getState(),
    };
  }
  const state = updateController.getState();
  setTimeout(() => {
    void updateController.installUpdate().then((result) => {
      if (!result.ok) {
        appendLog(
          "update.log",
          `${JSON.stringify({ event: "install_failed", code: result.error || "install_failed" })}\n`,
        );
      }
    });
  }, 120);
  return { ok: true, state };
}

function nodeExecutable() {
  return path.join(process.resourcesPath, "vendor", "node", "bin", "node");
}

function bundledFfmpegEnvironment() {
  const executable = path.join(
    process.resourcesPath,
    "vendor",
    "ffmpeg",
    "ffmpeg",
  );
  return app.isPackaged && fs.existsSync(executable)
    ? { FFMPEG_PATH: executable, BANDI_BUNDLED_FFMPEG: "1" }
    : {};
}

function nextRuntimePaths() {
  const userData = app.getPath("userData");
  return {
    COVER_CACHE_DIR: path.join(userData, "cache", "covers"),
    MEDIA_COMPAT_CACHE_DIR: path.join(userData, "cache", "media-compat"),
    YUC_CACHE_DIR: path.join(userData, "cache", "yuc"),
    SCREENSHOT_DIR: path.join(app.getPath("pictures"), "Bandi"),
    DOWNLOAD_ROOT: config.downloadDir,
  };
}

function prepareRuntimePaths() {
  const values = nextRuntimePaths();
  for (const [name, directory] of Object.entries(values)) {
    const result = inspectWritableDirectory(directory, { create: true });
    if (!result.ok) throw new Error(`${name} 路径不可用：${result.error}`);
    values[name] = result.directory;
  }
  return values;
}

function nextBaseEnvironment() {
  const env = { ...process.env };
  for (const name of [
    "AUTH_URL",
    "NEXTAUTH_URL",
    "DESKTOP_SESSION_TOKEN",
    "DESKTOP_CONFIG_PATH",
    "ANIME_DESKTOP_APP",
  ]) {
    delete env[name];
  }
  const noProxy = String(env.NO_PROXY || env.no_proxy || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const lowered = new Set(noProxy.map((value) => value.toLowerCase()));
  for (const value of ["127.0.0.1", "localhost", "::1"]) {
    if (!lowered.has(value)) noProxy.push(value);
  }
  env.NO_PROXY = noProxy.join(",");
  env.no_proxy = env.NO_PROXY;
  return env;
}

function localNetworkUrls() {
  if (!appPort || !config?.lanAccess) return [];
  const urls = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      urls.push(`http://${entry.address}:${appPort}`);
    }
  }
  return [...new Set(urls)];
}

function issueHostBootstrap() {
  hostBootstrap = {
    value: randomSecret(32),
    expiresAt: Date.now() + HOST_BOOTSTRAP_TTL_MS,
  };
  return hostBootstrap.value;
}

function consumeHostBootstrap(value) {
  const candidate = typeof value === "string" ? value : "";
  if (!hostBootstrap || hostBootstrap.expiresAt <= Date.now()) {
    hostBootstrap = null;
    return false;
  }
  if (candidate.length !== hostBootstrap.value.length) return false;
  const valid = crypto.timingSafeEqual(
    Buffer.from(hostBootstrap.value),
    Buffer.from(candidate),
  );
  if (valid) hostBootstrap = null;
  return valid;
}

async function openBandi(targetPath = null) {
  if (!appUrl) return;
  const from = targetPath ||
    (config.onboardingVersion >= ONBOARDING_VERSION ? "/" : "/onboarding");
  const login = new URL("/login", appUrl);
  login.searchParams.set("from", from.startsWith("/") ? from : "/");
  login.hash = `token=${encodeURIComponent(issueHostBootstrap())}`;
  await shell.openExternal(login.toString());
}

function settingsState() {
  const inspection = inspectWritableDirectory(config.downloadDir);
  return {
    available: true,
    runtime: "macos-local-web",
    downloadDir: config.downloadDir,
    freeSpaceBytes: inspection.ok ? inspection.freeSpaceBytes : null,
    directoryWritable: inspection.ok,
    directoryError: inspection.ok ? null : inspection.error,
    closeToTray: true,
    onboardingComplete: config.onboardingVersion >= ONBOARDING_VERSION,
    onboardingMode: config.onboardingMode,
    lanAccess: config.lanAccess,
    lanUrls: localNetworkUrls(),
    pairedDevices: config.pairedDevices.map(({ id, name, createdAt, lastSeenAt }) => ({
      id,
      name,
      createdAt,
      lastSeenAt,
    })),
    pairing: config.pairing
      ? { active: true, expiresAt: config.pairing.expiresAt }
      : null,
  };
}

async function chooseDirectory(input = {}) {
  const defaultPath =
    typeof input.defaultPath === "string" && input.defaultPath.startsWith("/")
      ? input.defaultPath
      : config.downloadDir;
  const result = await dialog.showOpenDialog({
    title: input.title || "选择文件夹",
    defaultPath,
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  return { canceled: false, directoryPath: result.filePaths[0] };
}

async function saveSettings(input) {
  const inspection = inspectWritableDirectory(input?.downloadDir, { create: true });
  if (!inspection.ok) return inspection;
  const previousDownloadDir = config.downloadDir;
  const previousLanAccess = config.lanAccess;
  if (inspection.directory !== previousDownloadDir) {
    const result = await qbit.setDownloadDirectory(inspection.directory);
    if (!result.ok) {
      return { ok: false, error: `下载服务暂时无法切换目录：${result.error}` };
    }
    config.downloadDir = inspection.directory;
  }
  if (input?.completeOnboarding) {
    config.onboardingVersion = ONBOARDING_VERSION;
    config.onboardingMode = "new";
  }
  if (typeof input?.lanAccess === "boolean") setLanAccess(config, input.lanAccess);
  saveConfig();
  rebuildTrayMenu();
  if (config.lanAccess !== previousLanAccess) scheduleNextRestart();
  return { ok: true, settings: settingsState() };
}

function controlHandlers() {
  return {
    getSettings: () => settingsState(),
    saveSettings,
    chooseDownloadDirectory: async () => {
      const result = await chooseDirectory({
        title: "选择 Bandi 视频保存位置",
        defaultPath: config.downloadDir,
      });
      if (result.canceled) return result;
      const inspection = inspectWritableDirectory(result.directoryPath, { create: true });
      return inspection.ok
        ? {
            canceled: false,
            downloadDir: inspection.directory,
            freeSpaceBytes: inspection.freeSpaceBytes,
          }
        : { canceled: false, error: inspection.error };
    },
    chooseMediaDirectory: (input) => chooseDirectory({
      title: input?.kind === "cinema" ? "选择影视目录" : "选择动漫目录",
      defaultPath: input?.defaultPath,
    }),
    getDownloadServiceState: () => qbit.getState(),
    retryDownloadService: () => qbit.retry(),
    getUpdateState: () => updateController.getState(),
    checkForUpdates: () => updateController.checkForUpdates(),
    installUpdate: () => requestUpdateInstall(),
    openUpdatePage: () => updateController.openUpdatePage(),
    authorizeHost: (input) => ({ ok: consumeHostBootstrap(input?.token) }),
    createPairing: () => {
      if (!config.lanAccess) return { ok: false, error: "lan_disabled" };
      const result = createPairingCode(config);
      saveConfig();
      return { ok: true, ...result, urls: localNetworkUrls() };
    },
    pairDevice: (input) => {
      const result = pairDevice(config, input || {});
      saveConfig();
      rebuildTrayMenu();
      return result;
    },
    getDeviceState: ({ deviceId, revision }) => {
      const active = isDeviceActive(config, deviceId, revision);
      if (active) saveConfig();
      return { active };
    },
    revokeDevice: (deviceId) => {
      const revoked = revokeDevice(config, deviceId);
      if (revoked) saveConfig();
      rebuildTrayMenu();
      return { ok: revoked };
    },
  };
}

async function startControlServer() {
  controlToken = randomSecret(32);
  controlServer = createControlServer({
    token: controlToken,
    handlers: controlHandlers(),
  });
  controlUrl = await controlServer.listen();
}

async function stopNext() {
  if (!nextProcess) return;
  const child = nextProcess;
  nextProcess = null;
  if (!child.killed) child.kill("SIGTERM");
  const started = Date.now();
  while (child.exitCode == null && Date.now() - started < 5000) await delay(100);
  if (child.exitCode == null) child.kill("SIGKILL");
}

async function startNext() {
  const entry = path.join(standaloneDir(), "server.js");
  const node = nodeExecutable();
  if (!fs.existsSync(entry)) throw new Error("Next standalone 缺失，请重新安装 Bandi");
  if (!fs.existsSync(node)) throw new Error("内置 Node.js 缺失，请重新安装 Bandi");
  appPort = await findAppPort();
  appUrl = `http://127.0.0.1:${appPort}`;
  const dataDirectory = path.join(app.getPath("userData"), "data");
  ensureDir(dataDirectory);
  nextProcess = spawn(node, ["--use-env-proxy", "server.js"], {
    cwd: standaloneDir(),
    env: {
      ...nextBaseEnvironment(),
      ...prepareRuntimePaths(),
      NODE_ENV: "production",
      BANDI_BUILD_ID: standaloneBuildId(),
      BANDI_APP_VERSION: app.getVersion(),
      HOSTNAME: config.lanAccess ? "0.0.0.0" : "127.0.0.1",
      PORT: String(appPort),
      DATABASE_URL: path.join(dataDirectory, "anime.db"),
      AUTH_SECRET: config.authSecret,
      AUTH_TRUST_HOST: "true",
      QBIT_URL: `http://127.0.0.1:${config.qbitPort}`,
      QBIT_USER: config.qbitUser,
      QBIT_PASS: config.qbitPassword,
      QBIT_CONFIG_PATH: configFile(app.getPath("userData")),
      LOCAL_SERVER_CONFIG_PATH: configFile(app.getPath("userData")),
      ...bundledFfmpegEnvironment(),
      ANIME_LOCAL_SERVER_APP: "1",
      LOCAL_SERVER_BOOTSTRAP_USER: config.appUser,
      BANDI_CONTROL_URL: controlUrl,
      BANDI_CONTROL_TOKEN: controlToken,
      LOCAL_SESSION_RECHECK_MS: String(CONTROL_RECHECK_MS),
      BANDI_PARENT_LEASE_PATH: parentLeasePath,
      BANDI_PARENT_LEASE_TOKEN: parentLeaseToken,
      BANDI_PARENT_LEASE_PID: String(process.pid),
      BANDI_PARENT_LEASE_MAX_AGE_MS: String(PARENT_LEASE_MAX_AGE_MS),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  nextProcess.stdout.on("data", (chunk) => appendLog("next.log", chunk));
  nextProcess.stderr.on("data", (chunk) => appendLog("next.err.log", chunk));
  nextProcess.on("exit", (code, signal) => {
    appendLog("next.log", `Bandi service exited: ${code ?? signal}\n`);
    if (!quitting && nextProcess) {
      nextProcess = null;
      scheduleNextRestart();
    }
  });
  try {
    await waitForHttp(appUrl);
  } catch (error) {
    await stopNext();
    throw error;
  }
  rebuildTrayMenu();
}

function scheduleNextRestart() {
  if (quitting || restartTimer) return;
  restartTimer = setTimeout(async () => {
    restartTimer = null;
    try {
      await stopNext();
      await startNext();
      await openBandi("/settings");
    } catch (error) {
      appendLog("local-server.err.log", `${error.stack || error}\n`);
      dialog.showErrorBox("Bandi 服务恢复失败", String(error.message || error));
    }
  }, 700);
}

function trayIcon() {
  const source = path.join(standaloneDir(), "public", "brand", "app-logo.png");
  const image = nativeImage.createFromPath(source).resize({ width: 18, height: 18 });
  image.setTemplateImage(true);
  return image;
}

function rebuildTrayMenu() {
  if (!tray) return;
  const urls = localNetworkUrls();
  const qbitState = qbit?.getState();
  const updateState = updateController?.getState();
  const downloadLabel = qbitState?.status === "ready"
    ? "下载服务：已连接"
    : "下载服务：后台恢复中";
  const updateItem = updateState?.status === "ready"
    ? { label: "重启并更新", click: () => requestUpdateInstall() }
    : updateState?.action === "open-release"
      ? { label: "下载新版", click: () => void updateController.openUpdatePage() }
      : updateState?.status === "downloading"
        ? {
            label: `正在下载更新${updateState.progressPercent == null ? "" : `：${updateState.progressPercent}%`}`,
            enabled: false,
          }
        : {
            label: updateState?.status === "checking" ? "正在检查更新" : "检查更新",
            enabled: updateState?.status !== "checking",
            click: () => void updateController?.checkForUpdates(),
          };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 Bandi", click: () => void openBandi() },
    { label: downloadLabel, enabled: false },
    { label: config?.lanAccess ? "局域网访问：已开启" : "局域网访问：已关闭", enabled: false },
    ...(urls[0]
      ? [{
          label: "复制 iPhone 访问地址",
          click: () => clipboard.writeText(urls[0]),
        }]
      : []),
    { label: "打开设置", click: () => void openBandi("/settings") },
    updateItem,
    { type: "separator" },
    { label: "退出 Bandi", click: () => app.quit() },
  ]));
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip(APP_NAME);
  tray.on("click", () => void openBandi());
  rebuildTrayMenu();
}

async function boot() {
  const userData = app.getPath("userData");
  ensureDir(userData);
  config = loadLocalServerConfig({
    userDataDir: userData,
    moviesDir: app.getPath("videos"),
  });
  startParentLease();
  initializeUpdateController();
  if (!config.qbitPort) {
    config.qbitPort = await findOpenPort();
    saveConfig();
  }
  qbit = createQbitManager({
    resourcesPath: process.resourcesPath,
    userDataDir: userData,
    config,
    saveConfig,
    log: (message) => appendLog("qbit.log", message),
    onState: () => rebuildTrayMenu(),
  });
  await startControlServer();
  createTray();
  const qbitStart = qbit.start().catch((error) => {
    appendLog("qbit.log", `Initial qBittorrent start failed: ${error.stack || error}\n`);
  });
  await startNext();
  await openBandi();
  updateController.start();
  void qbitStart;
}

async function shutdown() {
  quitting = true;
  updateController?.stop();
  if (restartTimer) clearTimeout(restartTimer);
  await stopNext();
  await qbit?.stop();
  await controlServer?.close();
  stopParentLease();
}

if (process.platform !== "darwin") {
  dialog.showErrorBox("平台不受支持", "Bandi Local Web 当前只支持 macOS 13 或更高版本。");
  app.exit(1);
} else {
  const lock = app.requestSingleInstanceLock();
  if (!lock) {
    app.quit();
  } else {
    app.on("second-instance", () => void openBandi());
    app.whenReady().then(() => {
      app.dock?.hide();
      return boot();
    }).catch((error) => {
      appendLog("local-server.err.log", `${error.stack || error}\n`);
      dialog.showErrorBox(
        "Bandi 启动失败",
        `${error.message || error}\n\n详细记录位于 ~/Library/Application Support/Bandi/logs/。`,
      );
    });
    app.on("before-quit", (event) => {
      if (shutdownComplete) return;
      event.preventDefault();
      if (!shutdownPromise) {
        shutdownPromise = shutdown().finally(() => {
          shutdownComplete = true;
          app.quit();
        });
      }
    });
  }
}
