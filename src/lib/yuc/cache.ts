import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const SNAPSHOT_VERSION = 2;
const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_FAILURE_RETRY_MS = 30 * 60 * 1000;
const DEFAULT_STALE_REFRESH_WAIT_MS = 100;
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xml",
  "application/atom+xml",
  "text/xml",
];

export type YucCacheStatus = "fresh" | "stale";

export interface YucCachedPage<T> {
  items: T[];
  status: YucCacheStatus;
  sourceUrl: string;
  acceptedAt: number;
  checkedAt: number;
  itemCount: number;
}

interface YucSnapshot<T> {
  version: number;
  parserVersion: number;
  key: string;
  sourceUrl: string;
  acceptedAt: number;
  checkedAt: number;
  etag: string | null;
  lastModified: string | null;
  upstreamUpdatedAt: number | null;
  itemCount: number;
  items: T[];
}

export interface YucCacheRequest<T> {
  key: string;
  sourceUrl: string;
  ttlMs: number;
  parserVersion: number;
  parse: (source: string) => T[];
  /** Semantic item count used for last-good validation. Defaults to items.length. */
  countItems?: (items: readonly T[]) => number;
  /** Enable abnormal-decline protection for stable pages. */
  minimumRetainedRatio?: number;
  /** Atom page timestamp; a newer value forces revalidation before TTL expiry. */
  upstreamUpdatedAt?: number | null;
  /** Shared wall-clock deadline for a multi-page first-screen request. */
  deadlineAt?: number;
  /** User-triggered checks bypass the local TTL and perform a conditional request. */
  forceRefresh?: boolean;
}

export interface YucCacheOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheDir?: string | null;
  timeoutMs?: number;
  maxBytes?: number;
  failureRetryMs?: number;
  staleRefreshWaitMs?: number;
  logger?: Pick<Console, "warn">;
}

export class YucUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "YucUnavailableError";
    this.cause = options?.cause;
  }
}

export function createYucCache(options: YucCacheOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const failureRetryMs = options.failureRetryMs ?? DEFAULT_FAILURE_RETRY_MS;
  const staleRefreshWaitMs =
    options.staleRefreshWaitMs ?? DEFAULT_STALE_REFRESH_WAIT_MS;
  const logger = options.logger ?? console;
  const cacheDir = options.cacheDir?.trim()
    ? path.resolve(options.cacheDir)
    : null;
  const memory = new Map<string, YucSnapshot<unknown>>();
  const inflight = new Map<string, Promise<YucCachedPage<unknown>>>();
  const retryAfter = new Map<string, number>();

  async function get<T>(request: YucCacheRequest<T>): Promise<YucCachedPage<T>> {
    assertYucSourceUrl(request.sourceUrl);
    const operationKey = `${request.key}:parser:${request.parserVersion}`;
    const memoryHit = memory.get(request.key) as YucSnapshot<T> | undefined;
    const diskHit = memoryHit ?? (await readSnapshot<T>(request));
    if (diskHit && !memoryHit) memory.set(request.key, diskHit);

    const current = diskHit;
    const fallback =
      current?.parserVersion === request.parserVersion ? current : undefined;
    const timestamp = now();
    if (
      current &&
      current.parserVersion === request.parserVersion &&
      !request.forceRefresh &&
      timestamp - current.checkedAt < request.ttlMs &&
      snapshotIncludesUpstreamUpdate(current, request.upstreamUpdatedAt)
    ) {
      return toCachedPage(current, "fresh");
    }
    if (!request.forceRefresh && (retryAfter.get(operationKey) ?? 0) > timestamp) {
      if (fallback) return toCachedPage(fallback, "stale");
      throw new YucUnavailableError(
        `长门番堂 ${request.key} 暂时不可用，稍后重试`,
      );
    }

    const existingInflight = inflight.get(operationKey) as
      | Promise<YucCachedPage<T>>
      | undefined;
    if (existingInflight) {
      return fallback
        ? waitForRefreshOrStale(
            existingInflight,
            fallback,
            request.deadlineAt,
          )
        : waitForPromiseWithinDeadline(existingInflight, request.deadlineAt);
    }

    const promise = refresh(request, current)
      .catch((error) => {
        retryAfter.set(operationKey, now() + failureRetryMs);
        if (fallback) return toCachedPage(fallback, "stale");
        throw error instanceof YucUnavailableError
          ? error
          : new YucUnavailableError(`长门番堂 ${request.key} 暂时不可用`, {
              cause: error,
            });
      })
      .finally(() => {
        inflight.delete(operationKey);
      });
    inflight.set(operationKey, promise as Promise<YucCachedPage<unknown>>);
    return fallback
      ? waitForRefreshOrStale(promise, fallback, request.deadlineAt)
      : waitForPromiseWithinDeadline(promise, request.deadlineAt);
  }

  async function waitForRefreshOrStale<T>(
    refreshPromise: Promise<YucCachedPage<T>>,
    current: YucSnapshot<T>,
    deadlineAt: number | undefined,
  ): Promise<YucCachedPage<T>> {
    const deadlineWaitMs = remainingDeadlineMs(deadlineAt);
    const waitMs = Math.min(staleRefreshWaitMs, deadlineWaitMs ?? Infinity);
    if (waitMs <= 0) return toCachedPage(current, "stale");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stale = new Promise<YucCachedPage<T>>((resolve) => {
      timer = setTimeout(
        () => resolve(toCachedPage(current, "stale")),
        waitMs,
      );
    });
    try {
      return await Promise.race([refreshPromise, stale]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function waitForPromiseWithinDeadline<T>(
    promise: Promise<T>,
    deadlineAt: number | undefined,
  ): Promise<T> {
    const waitMs = remainingDeadlineMs(deadlineAt);
    if (waitMs == null) return promise;
    if (waitMs <= 0) {
      throw new YucUnavailableError("长门番堂首屏读取已到达时间预算");
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new YucUnavailableError("长门番堂首屏读取已到达时间预算")),
        waitMs,
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function refresh<T>(
    request: YucCacheRequest<T>,
    previous: YucSnapshot<T> | undefined,
  ): Promise<YucCachedPage<T>> {
    const headers = new Headers({
      Accept: "text/html, application/atom+xml;q=0.9, application/xml;q=0.8",
      "User-Agent": "Bandi-Anime-Tracker/0.1 (+https://yuc.wiki/)",
    });
    if (previous && previous.parserVersion === request.parserVersion) {
      if (previous.etag) headers.set("If-None-Match", previous.etag);
      if (previous.lastModified) {
        headers.set("If-Modified-Since", previous.lastModified);
      }
    }

    const response = await fetchWithRetry(request.sourceUrl, headers);
    if (response.status === 304) {
      if (!previous || previous.parserVersion !== request.parserVersion) {
        throw new YucUnavailableError(
          `长门番堂 ${request.key} 返回 304，但本地没有兼容快照`,
        );
      }
      const updated: YucSnapshot<T> = {
        ...previous,
        parserVersion: request.parserVersion,
        checkedAt: now(),
        etag: response.headers.get("etag") ?? previous.etag,
        lastModified:
          response.headers.get("last-modified") ?? previous.lastModified,
        upstreamUpdatedAt: newestTimestamp(
          previous.upstreamUpdatedAt,
          request.upstreamUpdatedAt,
        ),
      };
      memory.set(request.key, updated);
      retryAfter.delete(`${request.key}:parser:${request.parserVersion}`);
      await persistSnapshot(updated);
      return toCachedPage(updated, "fresh");
    }
    if (!response.ok) {
      throw new YucUnavailableError(
        `长门番堂 ${request.key} 请求失败：HTTP ${response.status}`,
      );
    }
    assertYucResponseUrl(response.url || request.sourceUrl);
    assertContentType(response.headers.get("content-type"));
    const source = await readTextWithinLimit(response, maxBytes);
    const items = request.parse(source);
    const itemCount = countParsedItems(request, items);
    if (!Array.isArray(items) || items.length === 0 || itemCount <= 0) {
      throw new YucUnavailableError(
        `长门番堂 ${request.key} 解析结果为空，已拒绝覆盖 last-good`,
      );
    }

    const minimumRetainedRatio = request.minimumRetainedRatio;
    if (
      previous &&
      previous.parserVersion === request.parserVersion &&
      minimumRetainedRatio != null &&
      itemCount < previous.itemCount * minimumRetainedRatio
    ) {
      const dropRatio = (previous.itemCount - itemCount) / previous.itemCount;
      logger.warn(
        `[yuc-cache] ${request.key} 条目数从 ${previous.itemCount} 降至 ${itemCount}（${(
          dropRatio * 100
        ).toFixed(1)}%），已拒绝覆盖 last-good`,
      );
      throw new YucUnavailableError(
        `长门番堂 ${request.key} 条目数量异常下降`,
      );
    }

    const timestamp = now();
    const snapshot: YucSnapshot<T> = {
      version: SNAPSHOT_VERSION,
      parserVersion: request.parserVersion,
      key: request.key,
      sourceUrl: request.sourceUrl,
      acceptedAt: timestamp,
      checkedAt: timestamp,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      upstreamUpdatedAt: normalizeTimestamp(request.upstreamUpdatedAt),
      itemCount,
      items,
    };
    memory.set(request.key, snapshot);
    retryAfter.delete(`${request.key}:parser:${request.parserVersion}`);
    await persistSnapshot(snapshot);
    return toCachedPage(snapshot, "fresh");
  }

  async function fetchWithRetry(
    sourceUrl: string,
    headers: Headers,
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchImpl(sourceUrl, {
          headers,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if ((response.status === 429 || response.status >= 500) && attempt === 0) {
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt === 0) continue;
      }
    }
    throw new YucUnavailableError("长门番堂请求失败", { cause: lastError });
  }

  async function readSnapshot<T>(
    request: YucCacheRequest<T>,
  ): Promise<YucSnapshot<T> | undefined> {
    if (!cacheDir) return undefined;
    try {
      const raw = await readFile(snapshotPath(cacheDir, request.key), "utf8");
      const parsed = JSON.parse(raw) as Partial<YucSnapshot<T>>;
      if (
        parsed.version !== SNAPSHOT_VERSION ||
        parsed.key !== request.key ||
        parsed.sourceUrl !== request.sourceUrl ||
        !Array.isArray(parsed.items) ||
        !Number.isFinite(parsed.itemCount) ||
        parsed.itemCount !== countParsedItems(request, parsed.items) ||
        parsed.itemCount <= 0 ||
        !Number.isFinite(parsed.acceptedAt) ||
        !Number.isFinite(parsed.checkedAt) ||
        (parsed.upstreamUpdatedAt !== null &&
          !Number.isFinite(parsed.upstreamUpdatedAt))
      ) {
        return undefined;
      }
      return parsed as YucSnapshot<T>;
    } catch {
      return undefined;
    }
  }

  async function persistSnapshot<T>(snapshot: YucSnapshot<T>): Promise<void> {
    if (!cacheDir) return;
    try {
      await mkdir(cacheDir, { recursive: true });
      const target = snapshotPath(cacheDir, snapshot.key);
      const temporary = `${target}.tmp-${process.pid}-${now()}`;
      await writeFile(temporary, JSON.stringify(snapshot), "utf8");
      await rename(temporary, target);
    } catch (error) {
      logger.warn(`[yuc-cache] ${snapshot.key} 快照写入失败`, error);
    }
  }

  return { get };
}

function countParsedItems<T>(
  request: YucCacheRequest<T>,
  items: readonly T[] | unknown,
): number {
  if (!Array.isArray(items)) return 0;
  const count = request.countItems ? request.countItems(items) : items.length;
  if (!Number.isInteger(count) || count < 0) {
    throw new YucUnavailableError(
      `长门番堂 ${request.key} 返回了无效的条目计数`,
    );
  }
  return count;
}

function normalizeTimestamp(value: number | null | undefined): number | null {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : null;
}

function remainingDeadlineMs(deadlineAt: number | undefined): number | null {
  if (!Number.isFinite(deadlineAt) || deadlineAt == null) return null;
  return Math.floor(deadlineAt - Date.now());
}

function newestTimestamp(
  left: number | null | undefined,
  right: number | null | undefined,
): number | null {
  const values = [normalizeTimestamp(left), normalizeTimestamp(right)].filter(
    (value): value is number => value != null,
  );
  return values.length > 0 ? Math.max(...values) : null;
}

function snapshotIncludesUpstreamUpdate<T>(
  snapshot: YucSnapshot<T>,
  upstreamUpdatedAt: number | null | undefined,
): boolean {
  const requested = normalizeTimestamp(upstreamUpdatedAt);
  if (requested == null) return true;
  return (snapshot.upstreamUpdatedAt ?? 0) >= requested;
}

function snapshotPath(cacheDir: string, key: string): string {
  const digest = createHash("sha256").update(key).digest("hex");
  return path.join(cacheDir, `${digest}.json`);
}

function toCachedPage<T>(
  snapshot: YucSnapshot<T>,
  status: YucCacheStatus,
): YucCachedPage<T> {
  return {
    items: snapshot.items,
    status,
    sourceUrl: snapshot.sourceUrl,
    acceptedAt: snapshot.acceptedAt,
    checkedAt: snapshot.checkedAt,
    itemCount: snapshot.itemCount,
  };
}

function assertYucSourceUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "yuc.wiki") {
    throw new YucUnavailableError(`拒绝访问非长门番堂来源：${value}`);
  }
}

function assertYucResponseUrl(value: string): void {
  assertYucSourceUrl(value);
}

function assertContentType(value: string | null): void {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_CONTENT_TYPES.includes(normalized)) {
    throw new YucUnavailableError(
      `长门番堂响应类型无效：${normalized || "missing"}`,
    );
  }
}

async function readTextWithinLimit(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new YucUnavailableError("长门番堂响应超过大小上限");
  }
  if (!response.body) throw new YucUnavailableError("长门番堂响应正文为空");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new YucUnavailableError("长门番堂响应超过大小上限");
    }
    chunks.push(value);
  }
  if (total === 0) throw new YucUnavailableError("长门番堂响应正文为空");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
