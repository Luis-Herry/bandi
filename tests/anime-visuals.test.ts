import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  FALLBACK_ANIME_ACCENT,
  deriveAnimeVisualVars,
} from "../src/lib/anime-visuals";

test("deriveAnimeVisualVars exposes scoped accent and tint variables", () => {
  const vars = deriveAnimeVisualVars("#b87333");

  assert.equal(vars["--anime-accent"], "#b87333");
  assert.equal(vars["--anime-accent-rgb"], "184 115 51");
  assert.equal(vars["--anime-bg-tint"], "rgb(184 115 51 / 0.10)");
  assert.match(vars["--anime-surface-noise-opacity"], /^0\.\d{3}$/);
  assert.match(vars["--anime-halo-intensity"], /^0\.\d{3}$/);
  assert.equal("--accent" in vars, false);
  assert.equal("--accent-rgb" in vars, false);
  assert.equal("--accent-muted" in vars, false);
  assert.equal("--accent-subtle" in vars, false);
});

test("deriveAnimeVisualVars falls back for malformed hex values", () => {
  const vars = deriveAnimeVisualVars("blue");

  assert.equal(vars["--anime-accent"], FALLBACK_ANIME_ACCENT);
  assert.equal(vars["--anime-accent-rgb"], "212 168 83");
  assert.equal(vars["--anime-bg-tint"], "rgb(212 168 83 / 0.10)");
});

test("anime detail uses cover color through local anime variables only", () => {
  const pageSource = readFileSync("src/app/(main)/anime/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("src/app/globals.css", "utf8");

  assert.match(pageSource, /var\(--anime-accent-rgb\)/);
  assert.match(pageSource, /var\(--anime-halo-intensity\)/);
  assert.doesNotMatch(pageSource, /rgb\(var\(--accent-rgb\) \/ var\(--halo-intensity\)\)/);
  assert.match(cssSource, /var\(--anime-bg-tint, transparent\)/);
  assert.match(
    cssSource,
    /--anime-surface-noise-opacity[\s\S]*--surface-noise-opacity, 0\.025/,
  );
});

test("anime detail credits tabs hide incidental scrollbars", () => {
  const tabsSource = readFileSync(
    "src/components/features/AnimeCreditsTabs.tsx",
    "utf8",
  );

  assert.match(tabsSource, /no-scrollbar/);
  assert.match(tabsSource, /overflow-x-auto/);
});

test("character artwork keeps faces visible without cropping full portraits", () => {
  const coverSource = readFileSync(
    "src/components/features/AnimeCover.tsx",
    "utf8",
  );
  const characterCardSource = readFileSync(
    "src/components/features/CharacterCard.tsx",
    "utf8",
  );
  const characterPageSource = readFileSync(
    "src/app/(main)/character/[bgmId]/page.tsx",
    "utf8",
  );

  assert.match(coverSource, /fit\?: "cover" \| "contain"/);
  assert.match(coverSource, /objectPosition\?: string/);
  assert.match(coverSource, /fit === "contain" \? "object-contain" : "object-cover"/);
  assert.match(characterCardSource, /objectPosition="center top"/);
  assert.match(characterPageSource, /fit="contain"/);
  assert.match(characterPageSource, /objectPosition="center top"/);
});

test("douban covers use the same-origin cached image proxy", () => {
  const coverSource = readFileSync(
    "src/components/features/AnimeCover.tsx",
    "utf8",
  );
  const imageRouteSource = readFileSync("src/app/api/img/route.ts", "utf8");
  const coverCacheSource = readFileSync("src/lib/cover-cache.ts", "utf8");
  const cinemaDetailSource = readFileSync(
    "src/app/(main)/anime/[id]/CinemaDetail.tsx",
    "utf8",
  );
  const searchCommandSource = readFileSync(
    "src/components/features/SearchCommand.tsx",
    "utf8",
  );

  assert.match(coverSource, /img\\d\+\\\.doubanio\\\.com/);
  assert.match(coverSource, /\/api\/img\?url=/);
  assert.match(imageRouteSource, /img\\d\+\\\.doubanio\\\.com/);
  assert.match(coverCacheSource, /Referer: "https:\/\/movie\.douban\.com\/"/);
  assert.match(cinemaDetailSource, /<AnimeCover/);
  assert.match(cinemaDetailSource, /className="!absolute inset-0 z-0 h-full w-full"/);
  assert.match(cinemaDetailSource, /className="app-page-container relative z-10/);
  assert.match(searchCommandSource, /<AnimeCover/);
});
