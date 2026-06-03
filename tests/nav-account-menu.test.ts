import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");
const brandLogoSource = readFileSync("src/components/features/BrandLogo.tsx", "utf8");
const globalsSource = readFileSync("src/app/globals.css", "utf8");
const loginSource = readFileSync("src/app/(auth)/login/LoginShell.tsx", "utf8");

test("Nav keeps brand and compact actions in a single-row header", () => {
  assert.match(navSource, /<BrandLogo \/>/);
  assert.match(navSource, /<Menu \/>/);
  assert.equal(
    [...navSource.matchAll(/<NotificationMenu notifications=\{notifications\} \/>/g)]
      .length,
    2,
  );
  assert.match(
    navSource,
    /relative z-10 ml-auto flex shrink-0 items-center gap-2 min-\[1100px\]:hidden[\s\S]*label=\{TEXT\.search\}[\s\S]*<NotificationMenu notifications=\{notifications\} \/>[\s\S]*label=\{TEXT\.theme\}[\s\S]*label=\{TEXT\.more\}/,
  );
  assert.match(navSource, /label=\{TEXT\.search\}/);
  assert.match(navSource, /label=\{TEXT\.more\}/);
  assert.doesNotMatch(navSource, /notifications\.items\.slice\(0, 3\)/);
  assert.doesNotMatch(navSource, /TEXT\.latestNotifications/);
  assert.doesNotMatch(navSource, /TEXT\.noNotifications/);
  assert.doesNotMatch(navSource, /Bell,/);
  assert.doesNotMatch(navSource, /min-h-28 w-full flex-col/);
  assert.doesNotMatch(navSource, /h-12 w-full items-center/);
  assert.doesNotMatch(navSource, /border-t border-\[color:var\(--border-subtle\)\]/);
  assert.doesNotMatch(navSource, /overflow-x-auto/);
  assert.match(brandLogoSource, /Tv/);
  assert.match(brandLogoSource, /strokeWidth=\{2\}/);
  assert.match(brandLogoSource, /brand-logo-mark/);
  assert.match(brandLogoSource, /brand-logo-float/);
  assert.match(brandLogoSource, /color:\s*"white"/);
  assert.match(globalsSource, /@keyframes brand-logo-float/);
  assert.doesNotMatch(brandLogoSource, /var\(--accent\) 58%, white/);
  assert.doesNotMatch(brandLogoSource, /brand-logo-icon-shell/);
  assert.doesNotMatch(brandLogoSource, /group-hover:-translate-y/);
  assert.doesNotMatch(brandLogoSource, /group-hover:rotate/);
  assert.doesNotMatch(brandLogoSource, /group-hover:scale/);
  assert.doesNotMatch(globalsSource, /rotate\(/);
  assert.doesNotMatch(navSource, /Flame/);
});

test("Login reuses the animated brand mark", () => {
  assert.match(loginSource, /<BrandLogo markSize="md" \/>/);
  assert.match(loginSource, /<BrandLogo showText=\{false\} markSize="lg" \/>/);
  assert.doesNotMatch(loginSource, /Flame/);
});

test("Nav exposes an account menu from the avatar", () => {
  assert.match(navSource, /aria-label=\{TEXT\.openUserMenu\}/);
  assert.match(navSource, /\{TEXT\.profile\}/);
  assert.match(navSource, /\{TEXT\.settings\}/);
  assert.match(navSource, /\{TEXT\.signOut\}/);
});

test("Nav signs out through the client NextAuth helper", () => {
  assert.match(navSource, /from "next-auth\/react"/);
  assert.match(navSource, /signOut\(\{\s*callbackUrl:\s*"\/login"\s*\}\)/s);
});

test("Nav theme menu shows a selected dot and check", () => {
  assert.match(navSource, /border-\[color:var\(--accent\)\]/);
  assert.match(navSource, /h-1\.5 w-1\.5 rounded-full bg-\[color:var\(--accent\)\]/);
  assert.match(navSource, /<Check size=\{13\} className="text-\[color:var\(--accent\)\]"/);
});

test("Nav theme menu labels themes by color only", async () => {
  const { THEME_OPTIONS } = await import("../src/lib/theme-options");

  assert.equal(THEME_OPTIONS.length, 6);
  assert.ok(THEME_OPTIONS.every((theme) => theme.label.length > 0));
  assert.doesNotMatch(navSource, /item\.tone/);
  assert.doesNotMatch(navSource, /mt-0\.5 block truncate text-\[10px\]/);
});
