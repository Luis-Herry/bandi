import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";

const tempDir = mkdtempSync(join(tmpdir(), "anime-theme-"));
const dbPath = join(tempDir, "theme.db");
process.env.DATABASE_URL = dbPath;

const sqlite = new Database(dbPath);
sqlite.exec(`
  create table app_settings (
    key text primary key,
    value text not null,
    updated_at integer not null default (unixepoch())
  );
`);
sqlite.close();

test("normalizeUserTheme falls back to default for unknown values", async () => {
  const { DEFAULT_THEME, normalizeUserTheme } = await import("../src/lib/theme");

  assert.equal(normalizeUserTheme("retro"), "retro");
  assert.equal(normalizeUserTheme("peach"), "peach");
  assert.equal(normalizeUserTheme("blue"), DEFAULT_THEME);
  assert.equal(normalizeUserTheme(null), DEFAULT_THEME);
});

test("getUserTheme ignores malformed stored values", async () => {
  const { DEFAULT_THEME, getUserTheme } = await import("../src/lib/theme");
  const db = new Database(dbPath);
  db.prepare(
    "insert or replace into app_settings (key, value) values ('user_theme', json(?))",
  ).run(JSON.stringify({ theme: "purple" }));
  db.close();

  assert.equal(await getUserTheme(), DEFAULT_THEME);
});

test("setUserTheme upserts the current theme", async () => {
  const { getUserTheme, setUserTheme } = await import("../src/lib/theme");

  await setUserTheme("sci-fi");
  assert.equal(await getUserTheme(), "sci-fi");

  await setUserTheme("healing");
  assert.equal(await getUserTheme(), "healing");
});

test("theme options define a complete accent token set", async () => {
  const { THEME_OPTIONS } = await import("../src/lib/theme-options");
  const accentValues = new Set<string>();

  for (const theme of THEME_OPTIONS) {
    assert.match(theme.accent, /^#[0-9a-f]{6}$/i, theme.value);
    assert.match(theme.accentRgb, /^\d{1,3} \d{1,3} \d{1,3}$/, theme.value);
    assert.equal(theme.accentMuted, `rgb(${theme.accentRgb} / 0.2)`);
    assert.equal(theme.accentSubtle, `rgb(${theme.accentRgb} / 0.1)`);
    assert.match(theme.accentContrast, /^#[0-9a-f]{6}$/i, theme.value);
    accentValues.add(theme.accent.toLowerCase());
  }

  assert.equal(
    accentValues.size,
    THEME_OPTIONS.length,
    "each theme should have a distinct accent",
  );
});

test("theme palette includes the requested red, warm purple, and peach accents", async () => {
  const { THEME_OPTIONS } = await import("../src/lib/theme-options");
  const byValue = new Map(THEME_OPTIONS.map((theme) => [theme.value, theme]));

  assert.equal(byValue.get("trend")?.tone, "赤红珊瑚");
  assert.equal(byValue.get("trend")?.accent, "#e4575c");

  assert.equal(byValue.get("retro")?.tone, "暖紫");
  assert.equal(byValue.get("retro")?.accent, "#d184d9");

  assert.equal(byValue.get("peach")?.label, "蜜桃粉");
  assert.equal(byValue.get("peach")?.tone, "蜜桃粉");
  assert.equal(byValue.get("peach")?.accent, "#f29aa2");
});

test("theme accent pairs pass WCAG AA contrast for text use", async () => {
  const { THEME_OPTIONS } = await import("../src/lib/theme-options");
  const css = readFileSync("src/app/globals.css", "utf8");

  for (const theme of THEME_OPTIONS) {
    const block = getThemeCssBlock(css, theme.value);
    const bgElevated = getCssHex(block, "--bg-elevated");
    const accentOnBase = contrastRatio(theme.accent, theme.bgBase);
    const accentOnElevated = contrastRatio(theme.accent, bgElevated);
    const contrastOnAccent = contrastRatio(theme.accentContrast, theme.accent);

    assert.ok(
      accentOnBase >= 4.5,
      `${theme.value} accent on base contrast ${accentOnBase.toFixed(2)} is below WCAG AA`,
    );
    assert.ok(
      accentOnElevated >= 4.5,
      `${theme.value} accent on elevated contrast ${accentOnElevated.toFixed(2)} is below WCAG AA`,
    );
    assert.ok(
      contrastOnAccent >= 4.5,
      `${theme.value} accentContrast on accent contrast ${contrastOnAccent.toFixed(2)} is below WCAG AA`,
    );
  }
});

test("globals.css declares accent variables for every theme block", async () => {
  const { THEME_OPTIONS } = await import("../src/lib/theme-options");
  const css = readFileSync("src/app/globals.css", "utf8");
  const requiredVars = [
    "--accent",
    "--accent-rgb",
    "--accent-muted",
    "--accent-subtle",
    "--accent-contrast",
  ];

  for (const theme of THEME_OPTIONS) {
    const block = getThemeCssBlock(css, theme.value);
    const expectedValues = {
      "--accent": theme.accent,
      "--accent-rgb": theme.accentRgb,
      "--accent-muted": theme.accentMuted,
      "--accent-subtle": theme.accentSubtle,
      "--accent-contrast": theme.accentContrast,
    };
    for (const cssVar of requiredVars) {
      assert.match(
        block,
        new RegExp(`${cssVar}\\s*:\\s*${escapeRegExp(expectedValues[cssVar as keyof typeof expectedValues])}\\s*;`),
        `${theme.value} ${cssVar}`,
      );
    }
  }
});

test("theme accent migration removes fixed amber from global UI surfaces", () => {
  const checkedFiles = [
    "src/components/features/Nav.tsx",
    "src/app/(auth)/login/LoginShell.tsx",
    "src/components/features/DuskBackdrop.tsx",
    "src/app/(main)/library/LibraryClient.tsx",
    "src/components/features/WatchStatusMenu.tsx",
    "src/components/ui/Button.tsx",
    "src/components/features/AnimeCard.tsx",
    "src/components/features/EpisodeSourceDialog.tsx",
  ];

  for (const file of checkedFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /#d4a853|#f0b56a|rgba\(212,\s*168,\s*83|255,\s*180,\s*90|255,\s*170,\s*90|180,\s*100,\s*40|255,\s*168,\s*80|255,\s*120,\s*50|255,\s*90,\s*30|180,\s*90,\s*40|120,\s*50,\s*20|255,\s*140,\s*60|240,\s*181,\s*106|text-\[#1a1408\]/i, file);
  }
});

test("AccentProvider does not mutate documentElement theme variables", () => {
  const source = readFileSync("src/components/features/AccentProvider.tsx", "utf8");

  assert.doesNotMatch(source, /document\.documentElement/);
  assert.doesNotMatch(source, /style\.setProperty\("--accent/);
});

test("ThemeSync keeps the selected theme across client navigations", () => {
  const rootLayout = readFileSync("src/app/layout.tsx", "utf8");
  const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");
  const syncSource = readFileSync("src/components/features/ThemeSync.tsx", "utf8");
  const clientSource = readFileSync("src/lib/theme-client.ts", "utf8");

  assert.match(rootLayout, /<ThemeSync initialTheme=\{theme\} \/>/);
  assert.match(navSource, /applyClientTheme\(next\)/);
  assert.match(navSource, /applyClientTheme\(previous\)/);
  assert.match(syncSource, /usePathname/);
  assert.match(syncSource, /MutationObserver/);
  assert.match(syncSource, /THEME_STORAGE_KEY/);
  assert.match(syncSource, /THEME_CHANGE_EVENT/);
  assert.match(clientSource, /anime-theme-change/);
  assert.match(syncSource, /document\.documentElement\.dataset\.theme/);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getThemeCssBlock(css: string, theme: string): string {
  const blockMatch = new RegExp(
    `(?:^|\\n)(?::root,\\s*)?\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`,
  ).exec(css);
  assert.ok(blockMatch, `missing ${theme} theme block`);
  return blockMatch[1];
}

function getCssHex(cssBlock: string, cssVar: string): string {
  const match = new RegExp(`${cssVar}\\s*:\\s*(#[0-9a-f]{6})\\s*;`, "i").exec(cssBlock);
  assert.ok(match, `missing ${cssVar}`);
  return match[1];
}

function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  assert.match(normalized, /^[0-9a-f]{6}$/i, hex);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}
