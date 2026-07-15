import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APP_VERSION_SCHEMA,
  createVersionCheckState,
  isVersionDetectionEnabled,
  normalizeBuildId,
  observeBuildId,
  parseAppVersionPayload,
} from "../src/lib/app-version";

test("app version parsing accepts only the current protocol and safe build ids", () => {
  assert.equal(normalizeBuildId(" build-A_1\n"), "build-A_1");
  assert.equal(normalizeBuildId("build id"), null);
  assert.equal(isVersionDetectionEnabled("development"), false);
  assert.equal(isVersionDetectionEnabled("build-A"), true);
  assert.deepEqual(
    parseAppVersionPayload({
      schema: APP_VERSION_SCHEMA,
      buildId: "build-B",
      appVersion: "0.1.5",
    }),
    { schema: APP_VERSION_SCHEMA, buildId: "build-B", appVersion: "0.1.5" },
  );
  assert.equal(
    parseAppVersionPayload({ schema: 2, buildId: "build-B" }),
    null,
  );
});

test("a new build must be observed twice before the refresh notice is ready", () => {
  let state = createVersionCheckState();
  state = observeBuildId("build-A", state, "build-B");
  assert.deepEqual(state, {
    candidateBuildId: "build-B",
    consecutiveMatches: 1,
    readyBuildId: null,
  });
  state = observeBuildId("build-A", state, "build-B");
  assert.equal(state.readyBuildId, "build-B");
});

test("baseline responses and request failures break a pending mismatch", () => {
  const pending = observeBuildId(
    "build-A",
    createVersionCheckState(),
    "build-B",
  );
  assert.deepEqual(
    observeBuildId("build-A", pending, "build-A"),
    createVersionCheckState(),
  );
  assert.deepEqual(
    observeBuildId("build-A", pending, null),
    createVersionCheckState(),
  );
});

test("version endpoint and global notice keep Safari checks uncached and resumable", () => {
  const buildSource = readFileSync("src/lib/app-build.ts", "utf8");
  const routeSource = readFileSync("src/app/api/app-version/route.ts", "utf8");
  const noticeSource = readFileSync(
    "src/components/features/AppVersionNotice.tsx",
    "utf8",
  );
  const layoutSource = readFileSync("src/app/layout.tsx", "utf8");
  const middlewareSource = readFileSync("src/middleware.ts", "utf8");

  assert.match(buildSource, /process\.env\.BANDI_BUILD_ID/);
  assert.match(buildSource, /\.next", "BUILD_ID/);
  assert.match(buildSource, /"development"/);
  assert.match(routeSource, /no-store, no-cache, must-revalidate/);
  assert.match(routeSource, /force-dynamic/);
  assert.match(noticeSource, /INITIAL_CHECK_DELAY_MS = 15_000/);
  assert.match(noticeSource, /POLL_INTERVAL_MS = 60_000/);
  for (const event of ["focus", "pageshow", "online", "visibilitychange"]) {
    assert.match(noticeSource, new RegExp(`addEventListener\\(\\"${event}\\"`));
    assert.match(noticeSource, new RegExp(`removeEventListener\\(\\"${event}\\"`));
  }
  assert.match(noticeSource, /新版本已就绪/);
  assert.match(noticeSource, /立即刷新/);
  assert.match(layoutSource, /<AppVersionNotice initialBuildId=\{buildIdentity\.buildId\}/);
  assert.match(middlewareSource, /pathname === "\/api\/app-version"/);
});
