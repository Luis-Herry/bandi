import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createYucCache,
  type YucCacheRequest,
} from "../src/lib/yuc/cache";

const SOURCE_URL = "https://yuc.wiki/202607/";

function htmlResponse(
  body: string,
  init: { status?: number; etag?: string; lastModified?: string } = {},
) {
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
  if (init.etag) headers.set("ETag", init.etag);
  if (init.lastModified) headers.set("Last-Modified", init.lastModified);
  return new Response(init.status === 304 ? null : body, {
    status: init.status ?? 200,
    headers,
  });
}

function request(
  parse: (source: string) => string[],
  overrides: Partial<YucCacheRequest<string>> = {},
): YucCacheRequest<string> {
  return {
    key: "season:202607",
    sourceUrl: SOURCE_URL,
    ttlMs: 1_000,
    parserVersion: 1,
    minimumRetainedRatio: 0.7,
    parse,
    ...overrides,
  };
}

test("YUC cache persists normalized facts without raw HTML and reuses TTL hits", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "yuc-cache-"));
  let fetchCount = 0;
  let now = 10_000;
  const rawMarker = "<article>raw-yuc-page-marker</article>";
  const cache = createYucCache({
    cacheDir,
    now: () => now,
    fetchImpl: async () => {
      fetchCount += 1;
      return htmlResponse(rawMarker, { etag: 'W/"first"' });
    },
  });

  try {
    const first = await cache.get(request(() => ["normalized-entry"]));
    now += 500;
    const second = await cache.get(request(() => ["should-not-run"]));

    assert.equal(fetchCount, 1);
    assert.deepEqual(first.items, ["normalized-entry"]);
    assert.deepEqual(second.items, ["normalized-entry"]);

    const files = await readdir(cacheDir);
    assert.equal(files.length, 1);
    const persisted = await readFile(join(cacheDir, files[0]), "utf8");
    assert.match(persisted, /normalized-entry/);
    assert.doesNotMatch(persisted, /raw-yuc-page-marker/);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test("YUC cache sends validators and keeps last-good data on 304", async () => {
  let now = 20_000;
  const seenHeaders: Headers[] = [];
  const responses = [
    htmlResponse("first", {
      etag: 'W/"one"',
      lastModified: "Mon, 13 Jul 2026 00:00:00 GMT",
    }),
    htmlResponse("", { status: 304 }),
  ];
  const cache = createYucCache({
    now: () => now,
    fetchImpl: async (_input, init) => {
      seenHeaders.push(new Headers(init?.headers));
      return responses.shift()!;
    },
  });

  const first = await cache.get(request(() => ["entry"]));
  now += 1_001;
  const second = await cache.get(request(() => ["unexpected"]));

  assert.deepEqual(first.items, ["entry"]);
  assert.deepEqual(second.items, ["entry"]);
  assert.equal(seenHeaders[1].get("If-None-Match"), 'W/"one"');
  assert.equal(
    seenHeaders[1].get("If-Modified-Since"),
    "Mon, 13 Jul 2026 00:00:00 GMT",
  );
});

test("YUC cache atomically replaces an existing Windows snapshot", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "yuc-cache-replace-"));
  let now = 25_000;
  const bodies = ["first", "second"];
  const cache = createYucCache({
    cacheDir,
    now: () => now,
    fetchImpl: async () => htmlResponse(bodies.shift()!),
  });

  try {
    await cache.get(request((source) => [source]));
    now += 1_001;
    const refreshed = await cache.get(request((source) => [source]));
    assert.deepEqual(refreshed.items, ["second"]);

    const afterRestart = createYucCache({
      cacheDir,
      now: () => now,
      fetchImpl: async () => {
        throw new Error("disk snapshot should satisfy this read");
      },
    });
    const restored = await afterRestart.get(request(() => ["unexpected"]));
    assert.deepEqual(restored.items, ["second"]);
    assert.equal((await readdir(cacheDir)).length, 1);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test("YUC cache shares one inflight request per source key", async () => {
  let fetchCount = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cache = createYucCache({
    fetchImpl: async () => {
      fetchCount += 1;
      await gate;
      return htmlResponse("payload");
    },
  });

  const first = cache.get(request(() => ["entry"]));
  const second = cache.get(request(() => ["entry"]));
  release();

  const [a, b] = await Promise.all([first, second]);
  assert.equal(fetchCount, 1);
  assert.deepEqual(a.items, b.items);
});

test("parser versions do not share inflight or accept an incompatible 304", async () => {
  let releaseOld!: () => void;
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  let fetchCount = 0;
  const cache = createYucCache({
    failureRetryMs: 0,
    fetchImpl: async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        await oldGate;
        throw new Error("old parser request failed");
      }
      if (fetchCount === 2) return htmlResponse("v2");
      throw new Error("old parser retry failed");
    },
  });
  const old = cache.get(request((source) => [source]));
  const current = await cache.get(
    request((source) => [source], { parserVersion: 2 }),
  );
  releaseOld();
  await assert.rejects(() => old, /请求失败/);
  assert.equal(fetchCount, 3);
  assert.deepEqual(current.items, ["v2"]);

  let now = 28_000;
  const responses = [htmlResponse("v1"), htmlResponse("", { status: 304 })];
  const incompatible304 = createYucCache({
    now: () => now,
    failureRetryMs: 0,
    fetchImpl: async () => responses.shift()!,
  });
  await incompatible304.get(request((source) => [source]));
  now += 1_001;
  await assert.rejects(
    () =>
      incompatible304.get(
        request((source) => [source], { parserVersion: 2 }),
      ),
    /没有兼容快照/,
  );
});

test("YUC cache returns last-good quickly while an expired page refreshes", async () => {
  let now = 27_000;
  let release!: () => void;
  let fetchCount = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cache = createYucCache({
    now: () => now,
    staleRefreshWaitMs: 0,
    fetchImpl: async () => {
      fetchCount += 1;
      if (fetchCount > 1) await gate;
      return htmlResponse(fetchCount === 1 ? "first" : "second");
    },
  });

  await cache.get(request((source) => [source]));
  now += 1_001;
  const stale = await cache.get(request((source) => [source]));
  assert.equal(stale.status, "stale");
  assert.deepEqual(stale.items, ["first"]);
  release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(fetchCount, 2);
});

test("YUC cache negatively caches a first-load failure", async () => {
  let fetchCount = 0;
  const cache = createYucCache({
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("offline");
    },
  });

  await assert.rejects(() => cache.get(request(() => ["entry"])), /请求失败/);
  await assert.rejects(
    () => cache.get(request(() => ["entry"])),
    /稍后重试/,
  );
  assert.equal(fetchCount, 2);
});

test("a short-deadline leader does not cancel the shared refresh", async () => {
  let fetchCount = 0;
  const cache = createYucCache({
    timeoutMs: 1_000,
    failureRetryMs: 0,
    fetchImpl: async () => {
      fetchCount += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      return htmlResponse("shared-result");
    },
  });
  const startedAt = Date.now();
  const leader = cache.get(
    request((source) => [source], { deadlineAt: startedAt + 60 }),
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  const follower = cache.get(request((source) => [source]));
  await assert.rejects(() => leader, /时间预算/);
  const elapsedMs = Date.now() - startedAt;
  assert.ok(elapsedMs < 250, `deadline took ${elapsedMs}ms`);
  assert.deepEqual((await follower).items, ["shared-result"]);
  assert.equal(fetchCount, 1);
});

test("a deadline caller does not inherit an older unbounded inflight wait", async () => {
  let fetchCount = 0;
  const cache = createYucCache({
    timeoutMs: 1_000,
    failureRetryMs: 0,
    fetchImpl: async () => {
      fetchCount += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      if (fetchCount === 1) throw new Error("retry once");
      return htmlResponse("shared-result");
    },
  });
  const unbounded = cache.get(request((source) => [source]));
  await new Promise<void>((resolve) => setTimeout(resolve, 10));

  const startedAt = Date.now();
  await assert.rejects(
    () =>
      cache.get(
        request((source) => [source], { deadlineAt: startedAt + 60 }),
      ),
    /时间预算/,
  );
  const elapsedMs = Date.now() - startedAt;
  assert.ok(elapsedMs < 150, `inflight deadline took ${elapsedMs}ms`);
  assert.deepEqual((await unbounded).items, ["shared-result"]);
  assert.equal(fetchCount, 2);
});

test("YUC cache accepts a 30 percent drop and rejects a larger drop", async () => {
  const parse = (source: string) =>
    Array.from({ length: Number(source) }, (_, index) => `entry-${index}`);

  let acceptedNow = 30_000;
  const acceptedBodies = ["100", "70"];
  const acceptingCache = createYucCache({
    now: () => acceptedNow,
    fetchImpl: async () => htmlResponse(acceptedBodies.shift()!),
  });
  const first = await acceptingCache.get(request(parse));
  acceptedNow += 1_001;
  const accepted = await acceptingCache.get(request(parse));

  let rejectedNow = 40_000;
  const rejectedBodies = ["100", "69"];
  const warnings: unknown[][] = [];
  const rejectingCache = createYucCache({
    now: () => rejectedNow,
    failureRetryMs: 0,
    logger: { warn: (...args: unknown[]) => warnings.push(args) },
    fetchImpl: async () => htmlResponse(rejectedBodies.shift()!),
  });
  await rejectingCache.get(request(parse));
  rejectedNow += 1_001;
  const rejected = await rejectingCache.get(request(parse));

  assert.equal(first.items.length, 100);
  assert.equal(accepted.items.length, 70);
  assert.equal(rejected.status, "stale");
  assert.equal(rejected.items.length, 100);
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /100.*69/);
});

test("rolling pages may shrink and parser upgrades never reuse incompatible stale data", async () => {
  const parse = (source: string) =>
    Array.from({ length: Number(source) }, (_, index) => `entry-${index}`);

  let rollingNow = 45_000;
  const rollingBodies = ["100", "5"];
  const rolling = createYucCache({
    now: () => rollingNow,
    fetchImpl: async () => htmlResponse(rollingBodies.shift()!),
  });
  await rolling.get(
    request(parse, { key: "future", minimumRetainedRatio: undefined }),
  );
  rollingNow += 1_001;
  const shrunk = await rolling.get(
    request(parse, { key: "future", minimumRetainedRatio: undefined }),
  );
  assert.equal(shrunk.items.length, 5);

  let versionNow = 50_000;
  const versionBodies = ["100", "1"];
  const versioned = createYucCache({
    now: () => versionNow,
    fetchImpl: async () => htmlResponse(versionBodies.shift()!),
  });
  await versioned.get(request(parse));
  versionNow += 1_001;
  const upgraded = await versioned.get(
    request(parse, { parserVersion: 2 }),
  );
  assert.equal(upgraded.items.length, 1);

  let offlineNow = 55_000;
  let offlineCalls = 0;
  const offlineUpgrade = createYucCache({
    now: () => offlineNow,
    failureRetryMs: 0,
    fetchImpl: async () => {
      offlineCalls += 1;
      if (offlineCalls === 1) return htmlResponse("100");
      throw new Error("offline");
    },
  });
  await offlineUpgrade.get(request(parse));
  offlineNow += 1_001;
  await assert.rejects(
    () => offlineUpgrade.get(request(parse, { parserVersion: 2 })),
    /请求失败/,
  );
});

test("a newer Atom timestamp invalidates a page before its TTL expires", async () => {
  let fetchCount = 0;
  const cache = createYucCache({
    fetchImpl: async () => {
      fetchCount += 1;
      return htmlResponse(`payload-${fetchCount}`);
    },
  });
  const firstRequest = request((source) => [source], {
    ttlMs: 60_000,
    upstreamUpdatedAt: 100,
  });
  await cache.get(firstRequest);
  const updated = await cache.get({ ...firstRequest, upstreamUpdatedAt: 200 });
  assert.equal(fetchCount, 2);
  assert.deepEqual(updated.items, ["payload-2"]);
});

test("semantic Atom item counts reject an empty feed and preserve last-good", async () => {
  type AtomSnapshot = { entries: string[] };
  let now = 60_000;
  const bodies = ["full", "empty"];
  const cache = createYucCache({
    now: () => now,
    failureRetryMs: 0,
    fetchImpl: async () => htmlResponse(bodies.shift()!),
  });
  const atomRequest: YucCacheRequest<AtomSnapshot> = {
    key: "atom",
    sourceUrl: "https://yuc.wiki/atom.xml",
    ttlMs: 1_000,
    parserVersion: 1,
    parse: (source) => [
      { entries: source === "full" ? ["season", "movie"] : [] },
    ],
    countItems: (items) => items[0]?.entries.length ?? 0,
    minimumRetainedRatio: 0.7,
  };
  const first = await cache.get(atomRequest);
  now += 1_001;
  const stale = await cache.get(atomRequest);
  assert.equal(first.itemCount, 2);
  assert.equal(stale.status, "stale");
  assert.equal(stale.itemCount, 2);
});

test("YUC cache fails closed when the first response is empty or from another host", async () => {
  const emptyCache = createYucCache({
    fetchImpl: async () => htmlResponse("empty"),
  });
  await assert.rejects(
    () => emptyCache.get(request(() => [])),
    /解析结果为空/,
  );

  const wrongHost = createYucCache({
    fetchImpl: async () => htmlResponse("entry"),
  });
  await assert.rejects(
    () =>
      wrongHost.get({
        ...request(() => ["entry"]),
        sourceUrl: "https://example.com/202607/",
      }),
    /拒绝访问非长门番堂来源/,
  );
});
