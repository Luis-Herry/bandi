import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeWatchProviders,
  type WatchProvidersCache,
} from "../src/db/schema";
import { providerLabelOf } from "../src/lib/db-helpers/cinema";

function cache(region: string, names: string[]): WatchProvidersCache {
  return {
    region,
    providers: names.map((providerName, i) => ({
      providerId: i + 1,
      providerName,
      type: "flatrate" as const,
    })),
    fetchedAt: 0,
  };
}

/* ===== normalizeWatchProviders：向后兼容（旧单对象行不能崩） ===== */

test("normalizeWatchProviders: null / undefined → 空数组", () => {
  assert.deepEqual(normalizeWatchProviders(null), []);
  assert.deepEqual(normalizeWatchProviders(undefined), []);
});

test("normalizeWatchProviders: 历史单对象 → 包成单元素数组", () => {
  const legacy = cache("CN", ["爱奇艺"]);
  assert.deepEqual(normalizeWatchProviders(legacy), [legacy]);
});

test("normalizeWatchProviders: 双线数组 → 原样返回", () => {
  const arr = [cache("CN", ["腾讯视频"]), cache("US", ["Netflix"])];
  assert.equal(normalizeWatchProviders(arr), arr);
});

/* ===== providerLabelOf：CN 优先 + 跨区去重 ===== */

test("providerLabelOf: 空 → null", () => {
  assert.equal(providerLabelOf([]), null);
  assert.equal(providerLabelOf([cache("CN", [])]), null);
});

test("providerLabelOf: 单平台 → 'X 可看'", () => {
  assert.equal(providerLabelOf([cache("CN", ["爱奇艺"])]), "爱奇艺 可看");
});

test("providerLabelOf: 多平台 → '首个 等 N 个平台可看'", () => {
  assert.equal(
    providerLabelOf([cache("CN", ["腾讯视频", "咪咕视频"])]),
    "腾讯视频 等 2 个平台可看",
  );
});

test("providerLabelOf: 双线计数跨区合并，CN 平台排首位", () => {
  // 海外区在数组里排前面，但 CN 应被排到标签首位（用户在国内最可能直接点开）
  const label = providerLabelOf([
    cache("US", ["Netflix", "Hulu"]),
    cache("CN", ["腾讯视频"]),
  ]);
  assert.equal(label, "腾讯视频 等 3 个平台可看");
});

test("providerLabelOf: 只有海外（国内无版权）→ 海外平台打头", () => {
  assert.equal(providerLabelOf([cache("US", ["Netflix"])]), "Netflix 可看");
});

test("providerLabelOf: 跨区同名平台只计一次", () => {
  const label = providerLabelOf([
    cache("CN", ["哔哩哔哩"]),
    cache("US", ["哔哩哔哩", "Netflix"]),
  ]);
  assert.equal(label, "哔哩哔哩 等 2 个平台可看");
});
