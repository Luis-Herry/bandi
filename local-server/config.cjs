const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeManagedQbitPort,
  resolveConfiguredDownloadDir,
} = require("./runtime-paths.cjs");

const CONFIG_NAME = "config.json";
const ONBOARDING_VERSION = 1;
const DEFAULT_APP_USER = "admin";
const DEFAULT_QBIT_USER = "admin";
const PAIRING_TTL_MS = 10 * 60 * 1000;
const MAX_PAIRING_ATTEMPTS = 8;

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function readJsonResult(file) {
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

function readJson(file) {
  const result = readJsonResult(file);
  return result.ok ? result.value : {};
}

function writeFileDurably(file, content) {
  const handle = fs.openSync(file, "w", 0o600);
  try {
    fs.writeFileSync(handle, content, "utf8");
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

function writeJsonAtomic(file, value, { backupCurrent = true } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  let backupTemporary = null;
  writeFileDurably(temporary, `${JSON.stringify(value, null, 2)}\n`);
  try {
    if (backupCurrent && readJsonResult(file).ok) {
      const backup = `${file}.bak`;
      backupTemporary = `${backup}.tmp-${process.pid}-${Date.now()}`;
      fs.copyFileSync(file, backupTemporary);
      const backupHandle = fs.openSync(backupTemporary, "r+");
      try {
        fs.fsyncSync(backupHandle);
      } finally {
        fs.closeSync(backupHandle);
      }
      fs.renameSync(backupTemporary, backup);
      backupTemporary = null;
    }
    fs.renameSync(temporary, file);
  } catch (error) {
    for (const candidate of [temporary, backupTemporary]) {
      if (!candidate) continue;
      try {
        fs.unlinkSync(candidate);
      } catch {}
    }
    throw error;
  }
}

function configFile(userDataDir) {
  return path.join(userDataDir, CONFIG_NAME);
}

function normalizeDevice(value) {
  if (!value || typeof value !== "object") return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim().slice(0, 48) : "";
  const revision = Number(value.revision || 0);
  if (!id || !name || !Number.isInteger(revision) || revision < 1) return null;
  return {
    id,
    name,
    revision,
    createdAt: Number(value.createdAt || Date.now()),
    lastSeenAt: Number(value.lastSeenAt || value.createdAt || Date.now()),
  };
}

function loadLocalServerConfig({ userDataDir, moviesDir }) {
  const file = configFile(userDataDir);
  const primary = readJsonResult(file);
  let existing = {};
  if (primary.ok) {
    existing = primary.value;
  } else if (!primary.missing) {
    const backup = readJsonResult(`${file}.bak`);
    if (!backup.ok) {
      throw new Error(
        `Bandi 配置已损坏，且没有可恢复的备份：${file}。请保留该文件并联系社区协助恢复。`,
      );
    }
    existing = backup.value;
    writeJsonAtomic(file, existing, { backupCurrent: false });
  }
  const hasExistingConfig = Object.keys(existing).length > 0;
  const existingOnboardingVersion = Number(existing.onboardingVersion || 0);
  const lanRevision = Math.max(1, Math.floor(Number(existing.lanRevision || 1)));
  const config = {
    authSecret: existing.authSecret || randomSecret(48),
    appUser: existing.appUser || DEFAULT_APP_USER,
    qbitUser:
      existing.qbitUser && existing.qbitUser !== "anime"
        ? existing.qbitUser
        : DEFAULT_QBIT_USER,
    qbitPassword: existing.qbitPassword || randomSecret(18),
    qbitPort: normalizeManagedQbitPort(existing.qbitPort),
    downloadDir: resolveConfiguredDownloadDir({
      existingDownloadDir: existing.downloadDir,
      moviesDir,
      userDataDir,
    }),
    onboardingVersion: Number.isInteger(existingOnboardingVersion)
      ? Math.max(0, existingOnboardingVersion)
      : 0,
    onboardingMode:
      existing.onboardingMode === "new" || existing.onboardingMode === "upgrade"
        ? existing.onboardingMode
        : hasExistingConfig
          ? "upgrade"
          : "new",
    lanAccess: existing.lanAccess === true,
    lanRevision,
    pairedDevices: Array.isArray(existing.pairedDevices)
      ? existing.pairedDevices.map(normalizeDevice).filter(Boolean)
      : [],
    pairing:
      existing.pairing &&
      typeof existing.pairing.hash === "string" &&
      Number(existing.pairing.expiresAt) > Date.now()
        ? {
            hash: existing.pairing.hash,
            expiresAt: Number(existing.pairing.expiresAt),
            attempts: Math.max(0, Math.floor(Number(existing.pairing.attempts || 0))),
          }
        : null,
  };
  writeJsonAtomic(file, config);
  return config;
}

function pairingHash(config, code) {
  return crypto
    .createHash("sha256")
    .update(`${config.authSecret}:${code}`, "utf8")
    .digest("hex");
}

function safeEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function createPairingCode(config, now = Date.now()) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  config.pairing = {
    hash: pairingHash(config, code),
    expiresAt: now + PAIRING_TTL_MS,
    attempts: 0,
  };
  return { code, expiresAt: config.pairing.expiresAt };
}

function pairDevice(config, { code, name }, now = Date.now()) {
  if (!config.lanAccess) return { ok: false, error: "lan_disabled" };
  const pairing = config.pairing;
  const normalizedCode = typeof code === "string" ? code.trim() : "";
  if (!/^\d{6}$/.test(normalizedCode)) {
    return { ok: false, error: "invalid_pairing_code" };
  }
  if (!pairing || pairing.expiresAt <= now) {
    config.pairing = null;
    return { ok: false, error: "pairing_expired" };
  }
  if (!safeEqual(pairing.hash, pairingHash(config, normalizedCode))) {
    pairing.attempts += 1;
    if (pairing.attempts >= MAX_PAIRING_ATTEMPTS) config.pairing = null;
    return { ok: false, error: "invalid_pairing_code" };
  }

  const device = {
    id: crypto.randomUUID(),
    name:
      typeof name === "string" && name.trim()
        ? name.trim().replace(/[\r\n\t]/g, " ").slice(0, 48)
        : "局域网设备",
    revision: config.lanRevision,
    createdAt: now,
    lastSeenAt: now,
  };
  config.pairedDevices.push(device);
  config.pairing = null;
  return { ok: true, device };
}

function isDeviceActive(config, deviceId, revision, now = Date.now()) {
  if (!config.lanAccess || Number(revision) !== config.lanRevision) return false;
  const device = config.pairedDevices.find(
    (candidate) => candidate.id === deviceId && candidate.revision === config.lanRevision,
  );
  if (!device) return false;
  device.lastSeenAt = now;
  return true;
}

function revokeDevice(config, deviceId) {
  const previousLength = config.pairedDevices.length;
  config.pairedDevices = config.pairedDevices.filter((device) => device.id !== deviceId);
  return config.pairedDevices.length !== previousLength;
}

function setLanAccess(config, enabled) {
  const next = enabled === true;
  if (config.lanAccess === next) return false;
  config.lanAccess = next;
  config.pairing = null;
  if (!next) {
    config.lanRevision += 1;
    config.pairedDevices = [];
  }
  return true;
}

module.exports = {
  CONFIG_NAME,
  ONBOARDING_VERSION,
  configFile,
  createPairingCode,
  isDeviceActive,
  loadLocalServerConfig,
  pairDevice,
  randomSecret,
  readJson,
  revokeDevice,
  setLanAccess,
  writeJsonAtomic,
};
