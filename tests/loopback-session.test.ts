import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isLoopbackSessionRequest } from "../src/lib/loopback-session";

const authSource = readFileSync("src/auth.ts", "utf8");
const loginPageSource = readFileSync(
  "src/app/(auth)/login/page.tsx",
  "utf8",
);
const gateSource = readFileSync(
  "src/components/features/DesktopSessionGate.tsx",
  "utf8",
);
const runnerSource = readFileSync("scripts/run-local-next.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

test("local web sessions accept loopback requests only", () => {
  assert.equal(
    isLoopbackSessionRequest(
      new Request("http://127.0.0.1:3000/api/auth/callback/loopback-session", {
        headers: { origin: "http://localhost:3000" },
      }),
    ),
    true,
  );
  assert.equal(
    isLoopbackSessionRequest(
      new Request("http://192.168.1.25:3000/api/auth/callback/loopback-session"),
    ),
    false,
  );
  assert.equal(
    isLoopbackSessionRequest(
      new Request("http://127.0.0.1:3000/api/auth/callback/loopback-session", {
        headers: { origin: "https://example.com" },
      }),
    ),
    false,
  );
});

test("every supported local runtime avoids the username and password page", () => {
  assert.doesNotMatch(loginPageSource, /LoginShell/);
  assert.match(loginPageSource, /LocalServerSessionGate/);
  assert.match(loginPageSource, /provider="loopback-session"/);
  assert.match(gateSource, /signIn\("desktop-session"/);
  assert.match(gateSource, /signIn\("loopback-session"/);
  assert.match(authSource, /id: "loopback-session"/);
  assert.doesNotMatch(authSource, /signIn\('credentials'|name: "credentials"/);
  assert.doesNotMatch(authSource, /bcrypt\.compare/);
});

test("local preview scripts bind Next to loopback and create an ephemeral session secret", () => {
  assert.equal(packageJson.scripts.dev, "node scripts/run-local-next.mjs dev");
  assert.equal(packageJson.scripts.start, "node scripts/run-local-next.mjs start");
  assert.match(runnerSource, /"-H", "127\.0\.0\.1"/);
  assert.match(runnerSource, /ANIME_LOOPBACK_SESSION: "1"/);
  assert.match(runnerSource, /randomBytes\(32\)\.toString\("base64url"\)/);
});
