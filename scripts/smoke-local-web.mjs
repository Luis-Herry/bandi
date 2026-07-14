import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createControlServer } = require("../local-server/control-server.cjs");
const root = process.cwd();
const smokeRoot = path.join(root, ".local-web-smoke", `${process.pid}-${Date.now()}`);
fs.mkdirSync(smokeRoot, { recursive: true });

function runtimePath(value) {
  if (process.platform !== "win32") return value;
  const driveRoot = path.parse(root).root;
  const relative = path.relative(driveRoot, value);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Smoke path left the current drive: ${value}`);
  }
  return `/${relative.split(path.sep).join("/")}`;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("port unavailable"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

class CookieJar {
  cookies = new Map();

  update(response) {
    const values = response.headers.getSetCookie?.() || [];
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  async fetch(url, init = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set("Cookie", this.header());
    const response = await fetch(url, { ...init, headers, redirect: "manual" });
    this.update(response);
    return response;
  }
}

async function waitFor(url, child) {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (child.exitCode != null) throw new Error(`Next exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopChild(child) {
  if (!child || child.exitCode != null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode == null) child.kill("SIGKILL");
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function signIn(baseUrl, provider, credentials) {
  const jar = new CookieJar();
  const csrfResponse = await jar.fetch(`${baseUrl}/api/auth/csrf`);
  assert.equal(csrfResponse.status, 200);
  const { csrfToken } = await csrfResponse.json();
  const callback = await jar.fetch(`${baseUrl}/api/auth/callback/${provider}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body: new URLSearchParams({
      csrfToken,
      callbackUrl: `${baseUrl}/`,
      ...credentials,
    }),
  });
  assert.equal(callback.status, 200);
  const result = await callback.json();
  assert.ok(!String(result.url || "").includes("error="), JSON.stringify(result));
  const sessionResponse = await jar.fetch(`${baseUrl}/api/auth/session`);
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json();
  assert.ok(session?.user?.id);
  return { jar, session };
}

const configPath = path.join(smokeRoot, "config.json");
const downloadDir = path.join(smokeRoot, "Downloads");
const runtimeDownloadDir = runtimePath(downloadDir);
fs.mkdirSync(downloadDir, { recursive: true });
fs.writeFileSync(configPath, JSON.stringify({
  downloadDir: runtimeDownloadDir,
  qbitPort: 18180,
  qbitUser: "admin",
  qbitPassword: crypto.randomBytes(16).toString("hex"),
}), "utf8");

let hostTokenAvailable = true;
let pairAvailable = true;
const controlToken = crypto.randomBytes(24).toString("base64url");
const settings = {
  available: true,
  runtime: "macos-local-web",
  downloadDir: runtimeDownloadDir,
  freeSpaceBytes: 1024,
  directoryWritable: true,
  directoryError: null,
  closeToTray: true,
  onboardingComplete: true,
  onboardingMode: "new",
  lanAccess: true,
  lanUrls: [],
  pairedDevices: [],
  pairing: null,
};
const control = createControlServer({
  token: controlToken,
  handlers: {
    getSettings: () => settings,
    authorizeHost: ({ token }) => {
      const ok = hostTokenAvailable && token === "smoke-bootstrap";
      if (ok) hostTokenAvailable = false;
      return { ok };
    },
    pairDevice: ({ code }) => {
      if (!pairAvailable || code !== "123456") return { ok: false, error: "invalid_pairing_code" };
      pairAvailable = false;
      return {
        ok: true,
        device: { id: "smoke-device", name: "Smoke iPhone", revision: 1 },
      };
    },
    getDeviceState: () => ({ active: true }),
  },
});

let next = null;
try {
  const controlUrl = await control.listen();
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  next = spawn(
    process.execPath,
    ["--use-env-proxy", "server.js"],
    {
      cwd: path.join(root, ".next", "standalone"),
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        PORT: String(port),
        DATABASE_URL: path.join(smokeRoot, "anime.db"),
        AUTH_SECRET: crypto.randomBytes(48).toString("base64url"),
        AUTH_TRUST_HOST: "true",
        ANIME_LOCAL_SERVER_APP: "1",
        LOCAL_SERVER_BOOTSTRAP_USER: "admin",
        LOCAL_SERVER_CONFIG_PATH: runtimePath(configPath),
        DOWNLOAD_ROOT: runtimeDownloadDir,
        COVER_CACHE_DIR: runtimePath(path.join(smokeRoot, "cache", "covers")),
        YUC_CACHE_DIR: runtimePath(path.join(smokeRoot, "cache", "yuc")),
        SCREENSHOT_DIR: runtimePath(path.join(smokeRoot, "screenshots")),
        QBIT_URL: "http://127.0.0.1:18180",
        QBIT_CONFIG_PATH: runtimePath(configPath),
        BANDI_CONTROL_URL: controlUrl,
        BANDI_CONTROL_TOKEN: controlToken,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stderr = "";
  next.stderr.on("data", (chunk) => { stderr += String(chunk); });
  await waitFor(`${baseUrl}/api/auth/providers`, next);

  const providers = await fetch(`${baseUrl}/api/auth/providers`).then((response) => response.json());
  assert.deepEqual(Object.keys(providers).sort(), ["local-pair", "local-session"]);

  const host = await signIn(baseUrl, "local-session", { bootstrapToken: "smoke-bootstrap" });
  assert.equal(host.session.user.isLocalHost, true);
  const hostSettings = await host.jar.fetch(`${baseUrl}/api/local-server/settings`);
  assert.equal(hostSettings.status, 200);
  assert.equal((await hostSettings.json()).runtime, "macos-local-web");

  const repeatedHost = await signIn(baseUrl, "local-session", { bootstrapToken: "smoke-bootstrap" })
    .then(() => false)
    .catch(() => true);
  assert.equal(repeatedHost, true);

  const device = await signIn(baseUrl, "local-pair", {
    pairingCode: "123456",
    deviceName: "Smoke iPhone",
  });
  assert.equal(device.session.user.isLocalHost, false);
  const deviceSettings = await device.jar.fetch(`${baseUrl}/api/local-server/settings`);
  assert.equal(deviceSettings.status, 403);

  console.log("[local-web-smoke] host session, one-time token, pairing, and host-only controls passed");
  if (stderr.trim()) {
    const plain = stderr.replace(/\u001b\[[0-9;]*m/g, "");
    assert.match(plain, /CredentialsSignin/);
    console.log("[local-web-smoke] expected one-time-token rejection was logged");
  }
} finally {
  await stopChild(next);
  await control.close();
  await new Promise((resolve) => setTimeout(resolve, 200));
  fs.rmSync(smokeRoot, { recursive: true, force: true });
  const parent = path.dirname(smokeRoot);
  if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
}
