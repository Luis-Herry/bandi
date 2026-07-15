import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  authConfig,
  createSessionDeviceKey,
  revalidateLocalDeviceToken,
} from "../src/auth.config";

const apiRoot = path.resolve("src/app/api");
const publicRoutes = new Set([
  path.normalize("auth/[...nextauth]/route.ts"),
  path.normalize("app-version/route.ts"),
  path.normalize("img/route.ts"),
]);

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(filePath);
    return entry.name === "route.ts" ? [filePath] : [];
  });
}

function routeSource(relativePath: string) {
  return readFileSync(path.join(apiRoot, relativePath), "utf8");
}

test("every private API route performs full server-side session validation", () => {
  const missing = routeFiles(apiRoot)
    .map((filePath) => path.relative(apiRoot, filePath))
    .filter((relativePath) => !publicRoutes.has(relativePath))
    .filter((relativePath) => {
      const source = routeSource(relativePath);
      return !/(?:requireUser|requireRouteUser|requireLocalHostRouteUser|getCurrentUser|auth)\s*\(/.test(
        source,
      );
    });

  assert.deepEqual(
    missing,
    [],
    `API routes without full session validation: ${missing.join(", ")}`,
  );
});

test("local filesystem and launcher controls require the host Mac session", () => {
  for (const relativePath of [
    path.normalize("cinema/scan/route.ts"),
    path.normalize("library/local/scan/route.ts"),
    path.normalize("downloads/open-location/route.ts"),
    path.normalize("local-server/[...path]/route.ts"),
  ]) {
    assert.match(routeSource(relativePath), /requireLocalHostRouteUser\s*\(/);
  }

  const helper = readFileSync("src/lib/session.ts", "utf8");
  assert.match(helper, /process\.env\.ANIME_LOCAL_SERVER_APP === "1"/);
  assert.match(helper, /!user\.isLocalHost/);
});

test("paired-device claims are invalidated once the recheck window expires", async () => {
  let checks = 0;
  const token = {
    uid: "owner",
    localDeviceId: "iphone-1",
    localRevision: 4,
    localCheckedAt: 1_000,
    localSessionValid: true,
  };

  await revalidateLocalDeviceToken(token, {
    enabled: true,
    now: 30_999,
    recheckMs: 30_000,
    isDeviceActive: async () => {
      checks += 1;
      return false;
    },
  });
  assert.equal(checks, 0);
  assert.equal(token.uid, "owner");

  await revalidateLocalDeviceToken(token, {
    enabled: true,
    now: 31_000,
    recheckMs: 30_000,
    isDeviceActive: async (deviceId, revision) => {
      checks += 1;
      assert.equal(deviceId, "iphone-1");
      assert.equal(revision, 4);
      return false;
    },
  });
  assert.equal(checks, 1);
  assert.equal(token.uid, undefined);
  assert.equal(token.localSessionValid, false);
});

test("the public Auth.js session exposes only distinct device digests", async () => {
  const sessionCallback = authConfig.callbacks?.session as unknown as (args: {
    session: { user: Record<string, unknown>; expires: string };
    token: Record<string, unknown>;
  }) => Promise<{ user: Record<string, unknown>; expires: string }>;
  assert.equal(typeof sessionCallback, "function");

  const renderSession = (localDeviceId: string) =>
    sessionCallback({
      session: { user: { name: "admin" }, expires: new Date(0).toISOString() },
      token: {
        uid: "owner",
        username: "admin",
        localHost: false,
        localDeviceId,
        localSessionValid: true,
      },
    });

  const [pairedA, pairedB] = await Promise.all([
    renderSession("iphone-a-raw-secret"),
    renderSession("ipad-b-raw-secret"),
  ]);
  const serializedA = JSON.stringify(pairedA);
  const serializedB = JSON.stringify(pairedB);
  assert.doesNotMatch(serializedA, /iphone-a-raw-secret|localDeviceId/);
  assert.doesNotMatch(serializedB, /ipad-b-raw-secret|localDeviceId/);
  assert.match(String(pairedA.user.sessionDeviceKey), /^[A-Za-z0-9_-]{43}$/);
  assert.match(String(pairedB.user.sessionDeviceKey), /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(pairedA.user.sessionDeviceKey, pairedB.user.sessionDeviceKey);
  assert.equal(
    pairedA.user.sessionDeviceKey,
    await createSessionDeviceKey({
      userId: "owner",
      isLocalHost: false,
      localDeviceId: "iphone-a-raw-secret",
    }),
  );

  const authSource = readFileSync("src/auth.ts", "utf8");
  const configSource = readFileSync("src/auth.config.ts", "utf8");
  const sessionSource = readFileSync("src/lib/session.ts", "utf8");
  assert.doesNotMatch(authSource, /session\.user\.localDeviceId/);
  assert.doesNotMatch(configSource, /session\.user\.localDeviceId/);
  assert.doesNotMatch(sessionSource, /localDeviceId/);
  assert.match(sessionSource, /sessionDeviceKey/);
});

test("paired-device screenshots stay on the Mac without revealing host paths", () => {
  const source = routeSource(path.normalize("player/screenshots/route.ts"));
  assert.match(
    source,
    /ANIME_LOCAL_SERVER_APP === "1" && !user\.isLocalHost/,
  );
  assert.match(source, /pairedLocalClient\s*\?\s*false/);
  assert.match(source, /if \(!pairedLocalClient\) \{[\s\S]*result\.directory/);
  assert.match(source, /if \(!pairedLocalClient\) \{[\s\S]*result\.path/);
});

test("pairing copy states the permissions granted to a device", () => {
  const gate = readFileSync(
    "src/components/features/LocalServerSessionGate.tsx",
    "utf8",
  );
  const settings = readFileSync(
    "src/components/features/DesktopDownloadSettings.tsx",
    "utf8",
  );
  for (const source of [gate, settings]) {
    assert.match(source, /可查看全部媒体库并控制下载/);
  }
});
