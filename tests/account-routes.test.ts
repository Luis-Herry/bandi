import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");
const profileSource = readFileSync("src/app/(main)/profile/page.tsx", "utf8");
const settingsSource = readFileSync("src/app/(main)/settings/page.tsx", "utf8");

test("account menu links to profile and settings pages", () => {
  assert.match(navSource, /href="\/profile"/);
  assert.match(navSource, /href="\/settings"/);
});

test("profile and settings routes exist", () => {
  assert.equal(existsSync("src/app/(main)/profile/page.tsx"), true);
  assert.equal(existsSync("src/app/(main)/settings/page.tsx"), true);
});

test("profile and settings reuse the detail page back button placement", () => {
  for (const source of [profileSource, settingsSource]) {
    assert.match(source, /BackButton/);
    assert.match(source, /fixed top-20 left-8 z-40/);
  }
});
