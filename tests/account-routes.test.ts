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

test("profile and settings keep the back button visible across breakpoints", () => {
  for (const source of [profileSource, settingsSource]) {
    assert.match(source, /BackButton/);
    assert.match(source, /fixed left-4 top-20 z-40/);
    assert.match(source, /sm:left-6/);
    assert.match(source, /lg:left-8/);
  }
});

test("settings page keeps theme switching in the top nav only", () => {
  assert.doesNotMatch(settingsSource, /id="appearance"/);
  assert.doesNotMatch(settingsSource, /href: "#appearance"/);
  assert.doesNotMatch(settingsSource, /当前主题/);
  assert.doesNotMatch(settingsSource, /getUserTheme/);
  assert.doesNotMatch(settingsSource, /THEME_OPTIONS/);
});
