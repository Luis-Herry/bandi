import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};
const localNextRunner = readFileSync("scripts/run-local-next.mjs", "utf8");

test("production start enables Node environment proxy support", () => {
  const startScript = packageJson.scripts?.start ?? "";

  assert.match(startScript, /run-local-next\.mjs start/);
  assert.match(localNextRunner, /--use-env-proxy/);
  assert.match(localNextRunner, /next[\\/]dist[\\/]bin[\\/]next/);
  assert.match(localNextRunner, /"-H", "127\.0\.0\.1"/);
});
