/**
 * qBittorrent Web API client (v2).
 *
 * Reads credentials from env: QBIT_URL / QBIT_USER / QBIT_PASS.
 * Never throws — every public method either returns a typed result
 * or a `{ ok: false, error }` envelope so callers can keep the UI alive.
 *
 * Session cookie is cached in-memory and re-auths on 403.
 */

const configuredQbitUrl = process.env.QBIT_URL?.trim();
const DEFAULT_QBIT_URLS = [
  "http://localhost:8080",
  "http://127.0.0.1:18080",
];
const allowLocalFallback =
  !configuredQbitUrl || isLocalDefaultWebUiUrl(configuredQbitUrl);
const QBIT_USER = process.env.QBIT_USER ?? "admin";
const QBIT_PASS = process.env.QBIT_PASS ?? "";

let activeUrl: string | null = configuredQbitUrl
  ? normalizeUrl(configuredQbitUrl)
  : null;
const cookies = new Map<string, { value: string; at: number }>();
const COOKIE_TTL = 25 * 60 * 1000; // 25 min

type AuthResult =
  | { ok: true; cookie: string }
  | { ok: false; error: string };

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function isLocalDefaultWebUiUrl(url: string): boolean {
  const normalized = normalizeUrl(url).toLowerCase();
  return (
    normalized === "http://localhost:8080" ||
    normalized === "http://127.0.0.1:8080"
  );
}

function getCandidateUrls(): string[] {
  const configured = configuredQbitUrl ? [normalizeUrl(configuredQbitUrl)] : [];
  const defaults = allowLocalFallback ? DEFAULT_QBIT_URLS : [];
  const candidates = [...configured, ...defaults].map(normalizeUrl);
  const urls = new Set<string>();
  if (activeUrl && candidates.includes(activeUrl)) urls.add(activeUrl);
  for (const url of candidates) urls.add(url);
  return [...urls];
}

async function auth(baseUrl: string): Promise<AuthResult> {
  const cached = cookies.get(baseUrl);
  if (cached && Date.now() - cached.at < COOKIE_TTL) {
    return { ok: true, cookie: cached.value };
  }
  try {
    const body = new URLSearchParams({
      username: QBIT_USER,
      password: QBIT_PASS,
    });
    const res = await fetch(`${baseUrl}/api/v2/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: baseUrl,
      },
      body,
    });
    if (!res.ok) return { ok: false, error: `auth_http_${res.status}` };
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const cookie = setCookie.split(";")[0];
      cookies.set(baseUrl, { value: cookie, at: Date.now() });
      return { ok: true, cookie };
    }
    const text = await res.text().catch(() => "");
    if (text.trim().toLowerCase() === "fails.") {
      return { ok: false, error: "auth_failed" };
    }
    return { ok: false, error: "auth_cookie_missing" };
  } catch {
    return { ok: false, error: "webui_unreachable" };
  }
}

async function request<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<
  | { ok: true; data: T; url: string }
  | { ok: false; error: string; url: string }
> {
  let lastError:
    | { ok: false; error: string; url: string }
    | null = null;
  for (const baseUrl of getCandidateUrls()) {
    const result = await requestFromUrl<T>(baseUrl, path, init);
    if (result.ok) {
      activeUrl = baseUrl;
      return result;
    }
    lastError = result;
    if (!allowLocalFallback) return result;
    if (result.error === "webui_unreachable") continue;
    if (result.error.startsWith("auth_http_")) continue;
    if (result.error.startsWith("http_")) continue;
    return result;
  }
  return lastError ?? {
    ok: false,
    error: "webui_unreachable",
    url: activeUrl ?? DEFAULT_QBIT_URLS[0],
  };
}

async function requestFromUrl<T = unknown>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<
  | { ok: true; data: T; url: string }
  | { ok: false; error: string; url: string }
> {
  try {
    const authResult = await auth(baseUrl);
    if (!authResult.ok)
      return { ok: false, error: authResult.error, url: baseUrl };
    const headers = new Headers(init.headers);
    headers.set("Cookie", authResult.cookie);
    headers.set("Referer", baseUrl);
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    if (res.status === 403) {
      cookies.delete(baseUrl);
      const retryAuth = await auth(baseUrl);
      if (!retryAuth.ok)
        return { ok: false, error: retryAuth.error, url: baseUrl };
      headers.set("Cookie", retryAuth.cookie);
      const res2 = await fetch(`${baseUrl}${path}`, { ...init, headers });
      if (!res2.ok)
        return { ok: false, error: `http_${res2.status}`, url: baseUrl };
      return { ...(await parse<T>(res2)), url: baseUrl };
    }
    if (!res.ok)
      return { ok: false, error: `http_${res.status}`, url: baseUrl };
    return { ...(await parse<T>(res)), url: baseUrl };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "unknown",
      url: baseUrl,
    };
  }
}

async function parse<T>(
  res: Response,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const text = await res.text();
  if (!text) return { ok: true, data: undefined as T };
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: true, data: text as T };
  }
}

/* ── Public API ─────────────────────────────────────────────── */

export interface QbitStatus {
  connected: boolean;
  url: string;
  version?: string;
  apiVersion?: string;
  dlSpeed?: number; // bytes/s
  upSpeed?: number;
  dlInfoData?: number;
  upInfoData?: number;
  freeSpaceOnDisk?: number;
  error?: string;
}

export interface QbitTorrent {
  hash: string;
  name: string;
  size: number;
  progress: number; // 0..1
  dlspeed: number;
  upspeed: number;
  eta: number;
  state: string;
  category?: string;
  save_path?: string;
}

export async function getStatus(): Promise<QbitStatus> {
  const version = await request<string>("/api/v2/app/version");
  if (!version.ok)
    return { connected: false, url: version.url, error: version.error };
  const apiVersion = await request<string>("/api/v2/app/webapiVersion");
  const xfer = await request<{
    dl_info_speed: number;
    up_info_speed: number;
    dl_info_data: number;
    up_info_data: number;
    free_space_on_disk?: number;
  }>("/api/v2/transfer/info");
  return {
    connected: true,
    url: version.url,
    version: version.data,
    apiVersion: apiVersion.ok ? apiVersion.data : undefined,
    dlSpeed: xfer.ok ? xfer.data.dl_info_speed : 0,
    upSpeed: xfer.ok ? xfer.data.up_info_speed : 0,
    dlInfoData: xfer.ok ? xfer.data.dl_info_data : 0,
    upInfoData: xfer.ok ? xfer.data.up_info_data : 0,
    freeSpaceOnDisk: xfer.ok ? xfer.data.free_space_on_disk : undefined,
  };
}

export async function listTorrents(): Promise<QbitTorrent[]> {
  const r = await request<QbitTorrent[]>("/api/v2/torrents/info");
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

export interface QbitTorrentFile {
  /** 相对于 save_path 的路径，正斜杠分隔 */
  name: string;
  size: number;
  progress: number; // 0..1
}

/** 单个 torrent 的基础信息 + 文件列表，用于定位下载完成后的物理路径。 */
export async function getTorrentFiles(
  hash: string,
): Promise<{
  ok: true;
  savePath: string;
  files: QbitTorrentFile[];
} | { ok: false; error: string }> {
  // /api/v2/torrents/info?hashes=xxx 取 save_path
  const info = await request<QbitTorrent[]>(
    `/api/v2/torrents/info?hashes=${encodeURIComponent(hash.toLowerCase())}`,
  );
  if (!info.ok) return { ok: false, error: info.error };
  if (!Array.isArray(info.data) || info.data.length === 0)
    return { ok: false, error: "torrent_not_found" };
  const savePath = info.data[0].save_path ?? "";
  if (!savePath) return { ok: false, error: "no_save_path" };

  const files = await request<QbitTorrentFile[]>(
    `/api/v2/torrents/files?hash=${encodeURIComponent(hash.toLowerCase())}`,
  );
  if (!files.ok) return { ok: false, error: files.error };
  if (!Array.isArray(files.data)) return { ok: false, error: "no_files" };

  return { ok: true, savePath, files: files.data };
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 → 小写 hex；非法字符或长度不为 32 时返回 null。 */
function base32ToHex(b32: string): string | null {
  const clean = b32.toUpperCase().replace(/=+$/, "");
  if (clean.length !== 32) return null;
  if (!/^[A-Z2-7]+$/.test(clean)) return null;
  let bits = "";
  for (const c of clean) {
    const v = BASE32_ALPHABET.indexOf(c);
    if (v < 0) return null;
    bits += v.toString(2).padStart(5, "0");
  }
  // BT v1 infohash = SHA-1 20 字节 = 160 bit
  bits = bits.slice(0, 160);
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/**
 * 从 magnet URL 提取 v1 infohash（40 字符小写 hex）。
 * 接受 hex (40) 和 base32 (32) 两种写法 —— BT 协议允许任一。
 */
export function extractMagnetHash(magnet: string): string | null {
  // urn:btih:HASH 里的 HASH 可以是 40 hex 或 32 base32
  const m = /xt=urn:btih:([A-Za-z0-9]+)/.exec(magnet);
  if (!m) return null;
  const raw = m[1];
  if (/^[a-fA-F0-9]{40}$/.test(raw)) return raw.toLowerCase();
  if (/^[A-Z2-7]{32}$/i.test(raw)) return base32ToHex(raw);
  return null;
}

export interface AddTorrentOptions {
  category?: string;
  savePath?: string;
  upLimit?: number;
  dlLimit?: number;
  ratioLimit?: number;
  seedingTimeLimit?: number;
  paused?: boolean;
}

export function buildAddTorrentForm(
  magnetOrUrl: string,
  options: AddTorrentOptions = {},
): URLSearchParams {
  const form = new URLSearchParams();
  form.set("urls", magnetOrUrl);
  if (options.category) form.set("category", options.category);
  if (options.savePath) form.set("savepath", options.savePath);
  if (options.upLimit != null) form.set("upLimit", String(options.upLimit));
  if (options.dlLimit != null) form.set("dlLimit", String(options.dlLimit));
  if (options.ratioLimit != null)
    form.set("ratioLimit", String(options.ratioLimit));
  if (options.seedingTimeLimit != null) {
    form.set("seedingTimeLimit", String(options.seedingTimeLimit));
  }
  if (options.paused != null) form.set("paused", String(options.paused));
  return form;
}

export async function addTorrent(
  magnetOrUrl: string,
  options: AddTorrentOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  const form = buildAddTorrentForm(magnetOrUrl, options);
  const r = await request<string>("/api/v2/torrents/add", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

export async function pauseTorrent(
  hash: string,
): Promise<{ ok: boolean; error?: string }> {
  const form = new URLSearchParams({ hashes: hash });
  const r = await request("/api/v2/torrents/pause", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function resumeTorrent(
  hash: string,
): Promise<{ ok: boolean; error?: string }> {
  const form = new URLSearchParams({ hashes: hash });
  const r = await request("/api/v2/torrents/resume", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function deleteTorrent(
  hash: string,
  deleteFiles = false,
): Promise<{ ok: boolean; error?: string }> {
  const form = new URLSearchParams({
    hashes: hash,
    deleteFiles: String(deleteFiles),
  });
  const r = await request("/api/v2/torrents/delete", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** Format bytes/s for display, e.g. 4.2 MB/s */
export function formatSpeed(bps: number | undefined): string {
  if (!bps || bps <= 0) return "—";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let v = bps;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`;
}

/** Format bytes for display, e.g. 1.4 GB */
export function formatBytes(b: number | undefined): string {
  if (!b || b <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = b;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`;
}
