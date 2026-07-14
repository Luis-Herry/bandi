import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isSafeAbsolutePosixPath, resolveDownloadRoot } from "../src/lib/download-root";

const require = createRequire(import.meta.url);
const runtimePaths = require("../local-server/runtime-paths.cjs");
const localConfig = require("../local-server/config.cjs");
const qbit = require("../local-server/qbit.cjs");
const { createControlServer } = require("../local-server/control-server.cjs");

function tempDirectory(label: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `bandi-${label}-`));
}

test("macOS local paths require absolute non-root directories", () => {
  assert.equal(isSafeAbsolutePosixPath("/Users/luis/Movies/Bandi"), true);
  assert.equal(isSafeAbsolutePosixPath("/"), false);
  assert.equal(isSafeAbsolutePosixPath("Movies/Bandi"), false);
  assert.equal(runtimePaths.defaultMacDownloadDir({
    moviesDir: "/Users/luis/Movies",
    userDataDir: "/Users/luis/Library/Application Support/Bandi",
  }), "/Users/luis/Movies/Bandi/Downloads");
});

test("macOS config recovers the last valid backup without rotating owner secrets", () => {
  const root = tempDirectory("config-recovery");
  try {
    const file = localConfig.configFile(root);
    const base = {
      authSecret: "stable-owner-secret",
      appUser: "admin",
      qbitUser: "admin",
      qbitPassword: "stable-qbit-secret",
      qbitPort: 18180,
      downloadDir: "/Users/luis/Movies/Bandi/Stable",
      onboardingVersion: 1,
      onboardingMode: "new",
      lanAccess: true,
      lanRevision: 3,
      pairedDevices: [],
      pairing: null,
    };
    localConfig.writeJsonAtomic(file, base);
    localConfig.writeJsonAtomic(file, {
      ...base,
      authSecret: "newer-owner-secret",
      qbitPassword: "newer-qbit-secret",
      downloadDir: "/Users/luis/Movies/Bandi/Newer",
    });
    fs.writeFileSync(file, "{broken", "utf8");

    const recovered = localConfig.loadLocalServerConfig({
      userDataDir: root,
      moviesDir: "/Users/luis/Movies",
    });
    assert.equal(recovered.authSecret, "stable-owner-secret");
    assert.equal(recovered.qbitPassword, "stable-qbit-secret");
    assert.equal(recovered.downloadDir, "/Users/luis/Movies/Bandi/Stable");
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).authSecret, "stable-owner-secret");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("macOS config corruption without a valid backup fails closed", () => {
  const root = tempDirectory("config-fail-closed");
  try {
    const file = localConfig.configFile(root);
    fs.writeFileSync(file, "{broken", "utf8");
    assert.throws(
      () => localConfig.loadLocalServerConfig({
        userDataDir: root,
        moviesDir: "/Users/luis/Movies",
      }),
      /配置已损坏，且没有可恢复的备份/,
    );
    assert.equal(fs.readFileSync(file, "utf8"), "{broken");
    assert.equal(fs.existsSync(`${file}.bak`), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local download root follows the launcher config", {
  skip: process.platform === "win32" ? "requires POSIX filesystem semantics" : false,
}, () => {
  const root = tempDirectory("download-root");
  try {
    const downloadDir = path.join(root, "Downloads");
    const configPath = path.join(root, "config.json");
    fs.mkdirSync(downloadDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ downloadDir }), "utf8");
    assert.deepEqual(resolveDownloadRoot({
      ANIME_LOCAL_SERVER_APP: "1",
      LOCAL_SERVER_CONFIG_PATH: configPath,
    }), { ok: true, path: downloadDir });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("pairing is opt-in, single-use, and attempt limited", () => {
  const config = {
    authSecret: "pairing-test-secret",
    lanAccess: false,
    lanRevision: 1,
    pairedDevices: [],
    pairing: null,
  };
  const disabled = localConfig.createPairingCode(config);
    assert.deepEqual(localConfig.pairDevice(config, {
      code: disabled.code,
      name: "iPhone",
    }), { ok: false, error: "lan_disabled" });

    localConfig.setLanAccess(config, true);
    const pairing = localConfig.createPairingCode(config);
    const paired = localConfig.pairDevice(config, {
      code: pairing.code,
      name: "Luis 的 iPhone\n",
    });
    assert.equal(paired.ok, true);
    assert.equal(paired.device.name, "Luis 的 iPhone");
    assert.equal(localConfig.isDeviceActive(
      config,
      paired.device.id,
      paired.device.revision,
    ), true);
    assert.deepEqual(localConfig.pairDevice(config, {
      code: pairing.code,
      name: "Second device",
    }), { ok: false, error: "pairing_expired" });

    const limited = localConfig.createPairingCode(config);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      localConfig.pairDevice(config, { code: "999999", name: "unknown" });
    }
    assert.deepEqual(localConfig.pairDevice(config, {
      code: limited.code,
      name: "Brute force",
    }), { ok: false, error: "pairing_expired" });

  localConfig.setLanAccess(config, false);
  assert.equal(config.pairedDevices.length, 0);
  assert.equal(localConfig.isDeviceActive(
    config,
    paired.device.id,
    paired.device.revision,
  ), false);
});

test("managed macOS qBittorrent config stays loopback-only and hidden", () => {
  const root = tempDirectory("qbit-config");
  try {
    const ini = qbit.writeQbitConfig({
      profileDir: root,
      config: {
        qbitPort: 18180,
        qbitUser: "admin",
        qbitPassword: "generated-secret",
      },
      downloadDir: "/Users/luis/Movies/Bandi/Downloads",
    });
    const source = fs.readFileSync(ini, "utf8");
    assert.match(source, /\[GUI\][\s\S]*StartUpWindowState=Hidden/);
    assert.match(source, /WebUI\\Address=127\.0\.0\.1/);
    assert.match(source, /WebUI\\Port=18180/);
    assert.match(source, /WebUI\\LocalHostAuth=true/);
    assert.match(source, /WebUI\\Password_PBKDF2="@ByteArray\(/);
    assert.doesNotMatch(source, /generated-secret/);
    assert.match(source, /Session\\DefaultSavePath=\/Users\/luis\/Movies\/Bandi\/Downloads/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("private control server rejects requests without its bearer token", async () => {
  const token = "test-control-token";
  const server = createControlServer({
    token,
    handlers: {
      getSettings: () => ({ available: true }),
    },
  });
  const url = await server.listen();
  try {
    const denied = await fetch(`${url}/settings`);
    assert.equal(denied.status, 401);
    const accepted = await fetch(`${url}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { available: true });
  } finally {
    await server.close();
  }
});

test("macOS packaging covers Intel and Apple Silicon with pinned assets", () => {
  const manifest = JSON.parse(readFileSync("local-server/macos-assets.json", "utf8"));
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const builder = readFileSync("local-server/electron-builder.cjs", "utf8");
  const launcher = readFileSync("local-server/main.cjs", "utf8");
  const auth = readFileSync("src/auth.ts", "utf8");

  assert.equal(manifest.qbittorrent.x64.version, "5.0.5");
  assert.equal(manifest.qbittorrent.arm64.version, "5.2.3");
  assert.match(manifest.node.x64.url, /darwin-x64/);
  assert.match(manifest.node.arm64.url, /darwin-arm64/);
  for (const architecture of ["x64", "arm64"]) {
    assert.match(manifest.node[architecture].sha256, /^[a-f0-9]{64}$/);
    assert.match(manifest.qbittorrent[architecture].sha256, /^[a-f0-9]{64}$/);
    assert.match(manifest.qbittorrent[architecture].sourceSha256, /^[a-f0-9]{64}$/);
  }
  assert.ok(packageJson.scripts["local-server:dist:x64"]);
  assert.ok(packageJson.scripts["local-server:dist:arm64"]);
  assert.match(builder, /minimumSystemVersion: "13\.0\.0"/);
  assert.match(builder, /qbittorrent-\$\{qbitVersion\}-source\.tar\.gz/);
  assert.match(launcher, /HOSTNAME: config\.lanAccess \? "0\.0\.0\.0" : "127\.0\.0\.1"/);
  assert.match(launcher, /login\.hash = `token=/);
  assert.match(launcher, /HOST_BOOTSTRAP_TTL_MS = 2 \* 60 \* 1000/);
  assert.match(launcher, /hostBootstrap\.expiresAt <= Date\.now\(\)/);
  assert.match(auth, /id: "local-session"/);
  assert.match(auth, /id: "local-pair"/);
  const qbitSource = readFileSync("local-server/qbit.cjs", "utf8");
  const buildSource = readFileSync("scripts/build-macos-local.mjs", "utf8");
  const instrumentation = readFileSync("instrumentation.ts", "utf8");
  const playRoute = readFileSync("src/app/api/play/route.ts", "utf8");
  assert.match(qbitSource, /dmgHash !== asset\.sha256/);
  assert.match(qbitSource, /"\/usr\/bin\/codesign"/);
  assert.match(qbitSource, /WebUI\\\\LocalHostAuth", "true"/);
  assert.match(qbitSource, /let startPromise = null/);
  assert.match(qbitSource, /createCredentialRepairCycle\(\)/);
  assert.match(qbitSource, /credentialRepairCycle\.isExhausted\(\)/);
  assert.match(qbitSource, /repairCredentialsOnce\(\{/);
  assert.match(qbitSource, /allowCredentialRepair: false,[\s\S]*ensureConfig: false/);
  assert.match(qbitSource, /if \(startPromise\) return startPromise/);
  assert.match(qbitSource, /Rewriting managed qBittorrent credentials and restarting once/);
  assert.match(qbitSource, /failed post-spawn health check/);
  assert.match(qbitSource, /await api\("\/api\/v2\/app\/version"\)/);
  assert.match(launcher, /\(response\.statusCode \|\| 500\) < 500/);
  assert.match(launcher, /BANDI_PARENT_LEASE_PATH: parentLeasePath/);
  assert.match(launcher, /BANDI_PARENT_LEASE_PID: String\(process\.pid\)/);
  assert.match(buildSource, /process\.versions\.node !== assets\.node\.version/);
  assert.match(buildSource, /node-v\$\{assets\.node\.version\}/);
  assert.match(buildSource, /SQLite ABI probe returned unexpected data/);
  assert.match(instrumentation, /classifyParentLease/);
  assert.match(instrumentation, /confirmedShutdown/);
  assert.match(instrumentation, /\/api\/v2\/app\/shutdown/);
  assert.match(playRoute, /"\/usr\/bin\/open"/);
  assert.match(playRoute, /user\.isLocalHost !== true/);
});
