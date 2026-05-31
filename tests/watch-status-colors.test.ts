import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ONHOLD_PURPLE = "#c084fc";
const ONHOLD_TEXT_PURPLE = "#d8b4fe";
const OLD_ONHOLD_ORANGE = /#e5772e|#f0925a|229,\s*119,\s*46/i;

const statusBadgeSource = readFileSync(
  "src/components/ui/StatusBadge.tsx",
  "utf8",
);
const watchStatusMenuSource = readFileSync(
  "src/components/features/WatchStatusMenu.tsx",
  "utf8",
);
const libraryPageSource = readFileSync(
  "src/app/(main)/library/page.tsx",
  "utf8",
);

test("onhold watch status uses purple across badge, button, and stats", () => {
  const badgeOnhold = getObjectBlock(statusBadgeSource, "onhold");
  assert.match(badgeOnhold, new RegExp(escapeRegExp(ONHOLD_PURPLE), "i"));
  assert.match(badgeOnhold, new RegExp(escapeRegExp(ONHOLD_TEXT_PURPLE), "i"));
  assert.doesNotMatch(badgeOnhold, OLD_ONHOLD_ORANGE);

  const buttonOnhold = getLineContaining(watchStatusMenuSource, "onhold:");
  assert.match(buttonOnhold, new RegExp(escapeRegExp(ONHOLD_PURPLE), "i"));
  assert.doesNotMatch(buttonOnhold, OLD_ONHOLD_ORANGE);

  const statsOnhold = getLineContaining(libraryPageSource, "stats.onhold");
  assert.match(statsOnhold, new RegExp(escapeRegExp(ONHOLD_PURPLE), "i"));
  assert.doesNotMatch(statsOnhold, OLD_ONHOLD_ORANGE);
});

test("dropped watch status keeps its red tone distinct from onhold", () => {
  const badgeDropped = getObjectBlock(statusBadgeSource, "dropped");
  assert.match(badgeDropped, /#b85a4a/i);

  const buttonDropped = getLineContaining(watchStatusMenuSource, "dropped:");
  assert.match(buttonDropped, /#b85a4a/i);
});

function getObjectBlock(source: string, key: string): string {
  const match = new RegExp(`\\b${key}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`).exec(
    source,
  );
  assert.ok(match, `missing object block for ${key}`);
  return match[1];
}

function getLineContaining(source: string, fragment: string): string {
  const line = source.split(/\r?\n/).find((item) => item.includes(fragment));
  assert.ok(line, `missing line containing ${fragment}`);
  return line;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
