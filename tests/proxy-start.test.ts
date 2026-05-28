import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};

test("production start enables Node environment proxy support", () => {
  const startScript = packageJson.scripts?.start ?? "";

  assert.match(startScript, /--use-env-proxy/);
  assert.match(startScript, /\bnext\b.*\bstart\b/);
});
