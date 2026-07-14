const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const {
  createCredentialRepairCycle,
} = require("./qbit-credential-repair.cjs");
const assets = require("./macos-assets.json");

const QBIT_PORT_START = 18180;
const START_TIMEOUT_MS = 30000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function findOpenPort(start = QBIT_PORT_START) {
  for (let port = start; port <= 65535; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error("没有可用的下载服务端口");
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
    if (lines.length && lines.at(-1).trim() !== "") lines.push("");
    lines.push(sectionHeader);
    sectionStart = lines.length - 1;
  }
  let sectionEnd = lines.length;
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (/^\[[^\]]+\]\s*$/.test(lines[index])) {
      sectionEnd = index;
      break;
    }
  }
  const prefix = `${key}=`;
  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    if (lines[index].startsWith(prefix)) {
      lines[index] = `${key}=${value}`;
      return;
    }
  }
  lines.splice(sectionEnd, 0, `${key}=${value}`);
}

function escapeIniPath(value) {
  return value.replace(/\\/g, "\\\\");
}

function writeQbitConfig({ profileDir, config, downloadDir }) {
  const configDir = path.join(profileDir, "qBittorrent_anime", "config");
  fs.mkdirSync(configDir, { recursive: true });
  const iniPath = path.join(configDir, "qBittorrent.ini");
  const lines = fs.existsSync(iniPath)
    ? fs.readFileSync(iniPath, "utf8").split(/\r?\n/)
    : [];

  setIniValue(lines, "LegalNotice", "Accepted", "true");
  setIniValue(lines, "GUI", "StartUpWindowState", "Hidden");
  setIniValue(lines, "Preferences", "General\\StartMinimized", "true");
  setIniValue(lines, "Preferences", "General\\MinimizeToTray", "true");
  setIniValue(lines, "Preferences", "General\\ExitConfirm", "false");
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
  const handle = fs.openSync(temporary, "w", 0o600);
  try {
    fs.writeFileSync(handle, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  try {
    fs.renameSync(temporary, iniPath);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {}
    throw error;
  }
  return iniPath;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120000,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${path.basename(command)} failed: ${result.error?.message || result.stderr || result.stdout || result.status}`,
    );
  }
  return result.stdout.trim();
}

function findMountedQbitApp(mountPoint) {
  const direct = path.join(mountPoint, "qBittorrent.app");
  if (fs.existsSync(path.join(direct, "Contents", "MacOS", "qbittorrent"))) {
    return direct;
  }
  const entry = fs
    .readdirSync(mountPoint, { withFileTypes: true })
    .find((candidate) => candidate.isDirectory() && candidate.name.endsWith(".app"));
  if (!entry) throw new Error("qBittorrent DMG 中没有应用程序");
  return path.join(mountPoint, entry.name);
}

function installBundledQbit({ resourcesPath, userDataDir, arch = process.arch }) {
  const asset = assets.qbittorrent[arch];
  if (!asset) throw new Error(`不支持的 macOS 架构：${arch}`);
  const dmg = path.join(resourcesPath, "vendor", "qbittorrent", "qbittorrent.dmg");
  if (!fs.existsSync(dmg)) throw new Error(`内置 qBittorrent DMG 缺失：${dmg}`);
  const dmgHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(dmg))
    .digest("hex");
  if (dmgHash !== asset.sha256) {
    throw new Error("内置 qBittorrent DMG 校验失败，请重新安装 Bandi");
  }

  const installRoot = path.join(
    userDataDir,
    "managed-qbittorrent",
    `${asset.version}-${arch}`,
  );
  const installedApp = path.join(installRoot, "qBittorrent.app");
  const executable = path.join(installedApp, "Contents", "MacOS", "qbittorrent");
  if (fs.existsSync(executable)) {
    verifyQbitSignature(installedApp);
    return { executable, version: asset.version };
  }

  fs.mkdirSync(installRoot, { recursive: true });
  const mountPoint = path.join(userDataDir, "mounts", `qbit-${process.pid}-${Date.now()}`);
  fs.mkdirSync(mountPoint, { recursive: true });
  let mounted = false;
  try {
    run("/usr/bin/hdiutil", [
      "attach",
      dmg,
      "-nobrowse",
      "-readonly",
      "-mountpoint",
      mountPoint,
    ]);
    mounted = true;
    run("/usr/bin/ditto", [findMountedQbitApp(mountPoint), installedApp]);
  } finally {
    if (mounted) {
      try {
        run("/usr/bin/hdiutil", ["detach", mountPoint]);
      } catch {
        run("/usr/bin/hdiutil", ["detach", mountPoint, "-force"]);
      }
    }
    fs.rmSync(mountPoint, { recursive: true, force: true });
  }
  if (!fs.existsSync(executable)) throw new Error("qBittorrent 安装未产生可执行文件");
  verifyQbitSignature(installedApp);
  return { executable, version: asset.version };
}

function verifyQbitSignature(appPath) {
  run("/usr/bin/codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    appPath,
  ]);
}

function createQbitManager({ resourcesPath, userDataDir, config, saveConfig, log, onState }) {
  let child = null;
  let ready = false;
  let retrying = false;
  let stopping = false;
  let restartTimer = null;
  let restartAttempt = 0;
  let startPromise = null;
  const credentialRepairCycle = createCredentialRepairCycle();
  const expectedExits = new WeakSet();
  let state = { status: "starting", message: null, retrying: false };

  const updateState = (status, message = null) => {
    state = { status, message, retrying };
    onState?.(state);
  };
  const stateSnapshot = () => ({ ...state, status: ready ? "ready" : state.status, retrying });

  async function login() {
    if (!config.qbitPort) return { ok: false, error: "missing_port" };
    const baseUrl = `http://127.0.0.1:${config.qbitPort}`;
    try {
      const response = await fetch(`${baseUrl}/api/v2/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: baseUrl,
        },
        body: new URLSearchParams({
          username: config.qbitUser,
          password: config.qbitPassword,
        }),
        signal: AbortSignal.timeout(1800),
      });
      const text = await response.text();
      if (!response.ok) return { ok: false, error: `auth_http_${response.status}` };
      if (text.trim().toLowerCase() === "fails.") return { ok: false, error: "auth_failed" };
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      return cookie ? { ok: true, baseUrl, cookie } : { ok: false, error: "auth_cookie_missing" };
    } catch {
      return { ok: false, error: "webui_unreachable" };
    }
  }

  async function api(pathname, init = {}) {
    const auth = await login();
    if (!auth.ok) return auth;
    try {
      const headers = new Headers(init.headers);
      headers.set("Cookie", auth.cookie);
      headers.set("Referer", auth.baseUrl);
      const response = await fetch(`${auth.baseUrl}${pathname}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(2500),
      });
      const data = await response.text();
      return response.ok
        ? { ok: true, data }
        : { ok: false, error: `http_${response.status}` };
    } catch {
      return { ok: false, error: "webui_unreachable" };
    }
  }

  async function waitUntilReady() {
    const started = Date.now();
    let lastError = "webui_unreachable";
    while (Date.now() - started < START_TIMEOUT_MS) {
      if (stopping) throw new Error("qBittorrent start cancelled during shutdown");
      const result = await api("/api/v2/app/version");
      if (result.ok) return result.data.trim();
      lastError = result.error;
      if (
        lastError === "auth_failed" ||
        lastError === "auth_cookie_missing" ||
        lastError.startsWith("auth_http_")
      ) {
        break;
      }
      await delay(400);
    }
    const error = new Error(`qBittorrent health check failed: ${lastError}`);
    error.code = lastError;
    throw error;
  }

  function isAuthError(value) {
    const code = typeof value === "string" ? value : value?.code;
    return (
      code === "auth_failed" ||
      code === "auth_cookie_missing" ||
      String(code || "").startsWith("auth_http_")
    );
  }

  function waitForChildExit(spawned, timeoutMs = 5000) {
    if (!spawned || spawned.exitCode != null) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (exited) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        spawned.off("exit", onExit);
        resolve(exited);
      };
      const onExit = () => finish(true);
      const timer = setTimeout(() => finish(spawned.exitCode != null), timeoutMs);
      timer.unref?.();
      spawned.once("exit", onExit);
    });
  }

  async function stopOwnedChild(spawned, reason) {
    if (!spawned || spawned.exitCode != null) return;
    expectedExits.add(spawned);
    if (child === spawned) child = null;
    log(`Stopping managed qBittorrent: ${reason}\n`);
    try {
      spawned.kill("SIGTERM");
    } catch {}
    if (await waitForChildExit(spawned, 3500)) return;
    try {
      spawned.kill("SIGKILL");
    } catch {}
    await waitForChildExit(spawned, 1500);
  }

  function credentialRepairExhausted(errorCode = "auth_failed") {
    const error = new Error(
      `qBittorrent credential repair exhausted: ${errorCode}`,
    );
    error.code = "credential_repair_exhausted";
    return error;
  }

  async function repairManagedCredentials({ spawned, installed, profileDir }) {
    return credentialRepairCycle.repairCredentialsOnce({
      stop: () => stopOwnedChild(spawned, "authentication repair"),
      rewriteCredentials: () => {
        log("Rewriting managed qBittorrent credentials and restarting once\n");
        writeQbitConfig({ profileDir, config, downloadDir: config.downloadDir });
      },
      restart: async () => ({
        authenticated: true,
        value: await launchManagedQbit({
          installed,
          profileDir,
          allowCredentialRepair: false,
          ensureConfig: false,
        }),
      }),
    });
  }

  function scheduleRestart() {
    if (stopping || retrying || restartTimer) return;
    const waitMs = Math.min(1000 * 2 ** restartAttempt, 30000);
    restartAttempt += 1;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      void start().catch((error) => {
        log(`qBittorrent recovery failed: ${error.stack || error}\n`);
        updateState("recovering", "下载服务暂时不可用，Bandi 正在后台重试；本地播放仍可使用。");
        scheduleRestart();
      });
    }, waitMs);
  }

  async function choosePort() {
    if (config.qbitPort) {
      const existing = await api("/api/v2/app/version");
      if (existing.ok) return { port: config.qbitPort, adopt: true };
      if (await canListen(config.qbitPort)) return { port: config.qbitPort, adopt: false };
    }
    return { port: await findOpenPort(), adopt: false };
  }

  async function launchManagedQbit({
    installed,
    profileDir,
    allowCredentialRepair,
    ensureConfig = true,
  }) {
    if (ensureConfig) {
      writeQbitConfig({ profileDir, config, downloadDir: config.downloadDir });
    }
    const spawned = spawn(
      installed.executable,
      [
        `--profile=${profileDir}`,
        "--configuration=anime",
        `--webui-port=${config.qbitPort}`,
        "--no-splash",
      ],
      { detached: false, stdio: "ignore" },
    );
    child = spawned;
    spawned.on("error", (error) => log(`qBittorrent start error: ${error.stack || error}\n`));
    spawned.on("exit", (code, signal) => {
      const wasCurrent = child === spawned;
      if (wasCurrent) child = null;
      const expected = expectedExits.has(spawned);
      expectedExits.delete(spawned);
      log(`qBittorrent exited: ${code ?? signal}\n`);
      if (wasCurrent) ready = false;
      if (wasCurrent && !expected && !stopping) {
        updateState("recovering", "下载服务意外退出，Bandi 正在后台恢复；本地播放仍可使用。");
        scheduleRestart();
      }
    });

    try {
      return await waitUntilReady();
    } catch (error) {
      if (allowCredentialRepair && isAuthError(error)) {
        const repaired = await repairManagedCredentials({
          spawned,
          installed,
          profileDir,
        });
        if (repaired.authenticated) return repaired.value;
        throw credentialRepairExhausted(error.code);
      }
      await stopOwnedChild(spawned, "failed post-spawn health check");
      if (isAuthError(error)) throw credentialRepairExhausted(error.code);
      throw error;
    }
  }

  async function startOnce({ allowCredentialRepair = true } = {}) {
    retrying = true;
    updateState("starting");
    try {
      if (credentialRepairCycle.isExhausted() && allowCredentialRepair) {
        const authenticated = await api("/api/v2/app/version");
        if (!authenticated.ok) {
          throw credentialRepairExhausted(authenticated.error);
        }
        credentialRepairCycle.markAuthenticatedReady();
        ready = true;
        restartAttempt = 0;
        updateState("ready");
        return stateSnapshot();
      }
      let selection = null;
      if (child && child.exitCode == null) {
        const ownedProbe = await api("/api/v2/app/version");
        if (ownedProbe.ok) {
          selection = { port: config.qbitPort, adopt: true };
        } else {
          const repairCredentials = isAuthError(ownedProbe.error);
          const owned = child;
          if (repairCredentials && allowCredentialRepair) {
            const installed = installBundledQbit({ resourcesPath, userDataDir });
            const profileDir = path.join(userDataDir, "qbit-profile");
            fs.mkdirSync(config.downloadDir, { recursive: true });
            const repaired = await repairManagedCredentials({
              spawned: owned,
              installed,
              profileDir,
            });
            if (repaired.authenticated) {
              credentialRepairCycle.markAuthenticatedReady();
              ready = true;
              restartAttempt = 0;
              updateState("ready");
              log(`Managed qBittorrent ${repaired.value} ready on 127.0.0.1:${config.qbitPort}\n`);
              return stateSnapshot();
            }
            throw credentialRepairExhausted(ownedProbe.error);
          }
          await stopOwnedChild(owned, "health recovery");
          if (repairCredentials) throw credentialRepairExhausted(ownedProbe.error);
          selection = { port: config.qbitPort, adopt: false };
        }
      }
      selection = selection ?? (await choosePort());
      config.qbitPort = selection.port;
      saveConfig();
      let version;
      if (!selection.adopt) {
        const installed = installBundledQbit({ resourcesPath, userDataDir });
        const profileDir = path.join(userDataDir, "qbit-profile");
        fs.mkdirSync(config.downloadDir, { recursive: true });
        version = await launchManagedQbit({
          installed,
          profileDir,
          allowCredentialRepair,
        });
      } else {
        version = await waitUntilReady();
      }
      credentialRepairCycle.markAuthenticatedReady();
      ready = true;
      restartAttempt = 0;
      updateState("ready");
      log(`Managed qBittorrent ${version} ready on 127.0.0.1:${config.qbitPort}\n`);
      return stateSnapshot();
    } catch (error) {
      ready = false;
      if (child) await stopOwnedChild(child, "failed start cleanup");
      updateState("recovering", "下载服务暂时不可用，Bandi 正在后台重试；本地播放仍可使用。");
      throw error;
    } finally {
      retrying = false;
      state = { ...state, retrying: false };
      onState?.(stateSnapshot());
    }
  }

  async function start() {
    if (startPromise) return startPromise;
    startPromise = startOnce()
      .catch((error) => {
        if (!stopping) scheduleRestart();
        throw error;
      })
      .finally(() => {
        startPromise = null;
      });
    return startPromise;
  }

  async function setDownloadDirectory(downloadDir) {
    writeQbitConfig({
      profileDir: path.join(userDataDir, "qbit-profile"),
      config,
      downloadDir,
    });
    if (!ready) return { ok: true };
    return api("/api/v2/app/setPreferences", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ json: JSON.stringify({ save_path: downloadDir }) }),
    });
  }

  async function retry() {
    if (ready) {
      const authenticated = await api("/api/v2/app/version");
      if (authenticated.ok) return { ok: true, state: stateSnapshot() };
      ready = false;
      updateState("recovering", "正在重新认证下载服务；浏览和本地播放仍可使用。");
    }
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    try {
      await start();
      return { ok: true, state: stateSnapshot() };
    } catch (error) {
      ready = false;
      retrying = false;
      updateState("failed", "下载服务仍未恢复，请重启 Bandi；本地播放和资料不会受影响。");
      log(`Manual qBittorrent retry failed: ${error.stack || error}\n`);
      scheduleRestart();
      return { ok: false, state: stateSnapshot() };
    }
  }

  async function stop() {
    stopping = true;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (startPromise) await startPromise.catch(() => {});
    await api("/api/v2/app/shutdown", { method: "POST" });
    if (child) await stopOwnedChild(child, "application shutdown");
    ready = false;
  }

  return {
    getState: stateSnapshot,
    retry,
    setDownloadDirectory,
    start,
    stop,
  };
}

module.exports = {
  createQbitManager,
  findOpenPort,
  installBundledQbit,
  makeQbitPasswordHash,
  writeQbitConfig,
};
