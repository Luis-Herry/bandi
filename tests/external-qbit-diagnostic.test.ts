import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { diagnoseExternalQbit } from "../src/lib/qbit-external-diagnostic";

test("external qBit diagnostic uses fixed read-only loopback endpoints", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return new Response(url.endsWith("webapiVersion") ? "2.15.1" : "v5.2.3", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }) as typeof fetch;

  assert.deepEqual(await diagnoseExternalQbit(fetchStub), {
    connected: true,
    url: "http://127.0.0.1:18080",
    version: "v5.2.3",
    apiVersion: "2.15.1",
  });
  assert.deepEqual(
    calls.map(({ url, init }) => ({
      url,
      method: init?.method,
      body: init?.body,
      cookie: new Headers(init?.headers).get("Cookie"),
      authorization: new Headers(init?.headers).get("Authorization"),
      redirect: init?.redirect,
      hasSignal: init?.signal instanceof AbortSignal,
    })),
    [
      {
        url: "http://127.0.0.1:18080/api/v2/app/version",
        method: "GET",
        body: undefined,
        cookie: null,
        authorization: null,
        redirect: "error",
        hasSignal: true,
      },
      {
        url: "http://127.0.0.1:18080/api/v2/app/webapiVersion",
        method: "GET",
        body: undefined,
        cookie: null,
        authorization: null,
        redirect: "error",
        hasSignal: true,
      },
    ],
  );
});

test("external qBit diagnostic reports auth without sending managed credentials", async () => {
  const result = await diagnoseExternalQbit(
    (async () => new Response("Forbidden", { status: 403 })) as typeof fetch,
  );
  assert.equal(result.connected, false);
  assert.equal(result.authRequired, true);
  assert.match(result.error ?? "", /要求登录/);
});

test("external qBit diagnostic rejects redirects", async () => {
  const result = await diagnoseExternalQbit(
    (async () => new Response(null, {
      status: 302,
      headers: { Location: "http://example.invalid/" },
    })) as typeof fetch,
  );
  assert.equal(result.connected, false);
  assert.equal(result.authRequired, undefined);
});

test("external qBit route is desktop-gated and settings expose an on-demand probe", async () => {
  const route = readFileSync(
    "src/app/api/downloads/qbit/external-status/route.ts",
    "utf8",
  );
  const settings = readFileSync(
    "src/components/features/AutomationSettingsClient.tsx",
    "utf8",
  );
  assert.match(route, /ANIME_DESKTOP_APP !== "1"/);
  assert.match(settings, /外部 qBittorrent 兼容诊断/);
  assert.match(settings, /只读检测本机 18080/);
  assert.match(settings, /\/api\/downloads\/qbit\/external-status/);

  const previousDesktopMode = process.env.ANIME_DESKTOP_APP;
  delete process.env.ANIME_DESKTOP_APP;
  try {
    const { GET } = await import(
      "../src/app/api/downloads/qbit/external-status/route"
    );
    const response = await GET();
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "desktop_only");
  } finally {
    if (previousDesktopMode === undefined) delete process.env.ANIME_DESKTOP_APP;
    else process.env.ANIME_DESKTOP_APP = previousDesktopMode;
  }
});
