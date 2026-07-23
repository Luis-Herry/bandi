import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");
const brandLogoSource = readFileSync("src/components/features/BrandLogo.tsx", "utf8");
const globalsSource = readFileSync("src/app/globals.css", "utf8");
const layoutSource = readFileSync("src/app/layout.tsx", "utf8");
const loginSource = readFileSync("src/app/(auth)/login/LoginShell.tsx", "utf8");
const duskBackdropSource = readFileSync(
  "src/components/features/DuskBackdrop.tsx",
  "utf8",
);
const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");
const localLibrarySource = readFileSync(
  "src/app/(main)/library/local/LocalLibraryClient.tsx",
  "utf8",
);
const chineseBrandPattern = new RegExp(String.fromCharCode(0x756a, 0x90b8));

test("Nav keeps the space switcher and compact actions in a single-row header", () => {
  assert.doesNotMatch(navSource, /<BrandLogo \/>/);
  assert.equal([...navSource.matchAll(/<SpaceSwitcher /g)].length, 1);
  assert.match(
    navSource,
    /relative z-10 flex min-w-0 shrink-0 items-center[\s\S]*<SpaceSwitcher[\s\S]*<nav className="pointer-events-auto absolute top-1\/2 left-\[var\(--app-page-gutter\)\] hidden -translate-y-1\/2 items-center gap-4 min-\[1100px\]:flex xl:gap-5"/,
  );
  assert.doesNotMatch(navSource, /variant="mobile"/);
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
  assert.match(brandLogoSource, /brandLogoSrc = "\/brand\/app-logo\.png"/);
  assert.match(brandLogoSource, /<img/);
  assert.match(brandLogoSource, /brand-logo-mark/);
  assert.match(brandLogoSource, /brand-logo-float/);
  assert.match(globalsSource, /@keyframes brand-logo-float/);
  assert.doesNotMatch(brandLogoSource, /var\(--accent\) 58%, white/);
  assert.doesNotMatch(brandLogoSource, /brand-logo-icon-shell/);
  assert.doesNotMatch(brandLogoSource, /group-hover:-translate-y/);
  assert.doesNotMatch(brandLogoSource, /group-hover:rotate/);
  assert.doesNotMatch(brandLogoSource, /group-hover:scale/);
  const brandLogoKeyframes =
    globalsSource.match(
      /@keyframes brand-logo-float[\s\S]*?(?=\n\.brand-logo-float\s*\{)/,
    )?.[0] ?? "";
  assert.match(brandLogoKeyframes, /translateY\(/);
  assert.doesNotMatch(brandLogoKeyframes, /rotate\(/);
  assert.doesNotMatch(navSource, /Flame/);
});

test("Brand copy uses Bandi across metadata, nav, logo, and login", () => {
  assert.match(layoutSource, /default:\s*"Bandi"/);
  assert.match(layoutSource, /template:\s*"%s · Bandi"/);
  assert.match(layoutSource, /applicationName:\s*"Bandi"/);
  assert.match(layoutSource, /description:\s*"你的私人放映厅"/);
  assert.match(layoutSource, /\/favicon\.ico/);
  assert.match(layoutSource, /\/brand\/app-logo\.png/);
  assert.match(brandLogoSource, /Bandi/);
  assert.match(brandLogoSource, /subtitle = "你的私人放映厅"/);
  assert.match(navSource, /account:\s*"Bandi \\u8d26\\u6237"/);
  assert.match(navSource, /titleHome:\s*"Bandi \\u9996\\u9875"/);
  assert.match(loginSource, /登录后进入你的私人放映厅/);
  assert.doesNotMatch(loginSource, /© 2026 Bandi/);
  assert.match(homeSource, /<Tag variant="accent">Bandi<\/Tag>/);

  for (const source of [layoutSource, brandLogoSource, loginSource, homeSource]) {
    assert.doesNotMatch(source, chineseBrandPattern);
    assert.doesNotMatch(source, /追番中心/);
    assert.doesNotMatch(source, /你的个人媒体中心/);
    assert.doesNotMatch(source, /你的个人追番中心/);
  }
});

test("Login keeps only the centered brand mark", () => {
  assert.doesNotMatch(loginSource, /<BrandLogo markSize="md" \/>/);
  assert.match(loginSource, /<BrandLogo showText=\{false\} markSize="lg" \/>/);
  assert.doesNotMatch(loginSource, /Flame/);
});

test("Login backdrop uses a three-scene invisible-core sequence", () => {
  assert.match(duskBackdropSource, /login-scene-1\.mp4/);
  assert.match(duskBackdropSource, /login-scene-2\.mp4/);
  assert.match(duskBackdropSource, /login-scene-3\.mp4/);
  assert.match(duskBackdropSource, /SCENE_TWO_AUDIO_FADE_SECONDS = 0\.7/);
  assert.match(duskBackdropSource, /<video[\s\S]*src=\{SCENE_THREE_SRC\}[\s\S]*loop[\s\S]*muted/);
  assert.match(duskBackdropSource, /applySceneTwoVolume/);
  assert.match(duskBackdropSource, /aria-label="开始播放登录动画"/);
  assert.match(duskBackdropSource, /opacity-0/);
  assert.match(duskBackdropSource, /CROSSFADE_MS = 700/);
  assert.doesNotMatch(duskBackdropSource, /login-background\.mp4/);
  assert.doesNotMatch(duskBackdropSource, /开启放映/);
  assert.match(loginSource, /showCard \? "pointer-events-auto" : "pointer-events-none"/);
});

test("Nav exposes an account menu from the avatar", () => {
  assert.match(navSource, /aria-label=\{TEXT\.openUserMenu\}/);
  assert.match(navSource, /\{TEXT\.profile\}/);
  assert.match(navSource, /\{TEXT\.settings\}/);
  assert.match(navSource, /\{TEXT\.signOut\}/);
});

test("anime detail opened from local library keeps local library nav active", () => {
  assert.match(
    localLibrarySource,
    /href=\{`\/anime\/\$\{it\.anime\.id\}\?from=local`\}/,
  );
  assert.match(navSource, /useSearchParams/);
  assert.match(navSource, /searchParams\.get\("from"\) === "local"/);
  assert.match(navSource, /l\.href === "\/library\/local" && isLocalAnimeDetail/);
  assert.match(
    navSource,
    /l\.href === "\/library" &&\s*isTrackedAnimeDetail &&\s*!isLocalAnimeDetail/,
  );
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
