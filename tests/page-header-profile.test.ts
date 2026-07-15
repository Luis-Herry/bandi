import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  parseProfileDisplayName,
} from "../src/lib/profile-display-name";

const pageHeaderSource = readFileSync(
  "src/components/features/PageHeader.tsx",
  "utf8",
);
const localLibrarySource = readFileSync(
  "src/app/(main)/library/local/LocalLibraryClient.tsx",
  "utf8",
);
const statsSource = readFileSync("src/app/(main)/stats/page.tsx", "utf8");
const downloadsSource = readFileSync(
  "src/app/(main)/admin/downloads/Client.tsx",
  "utf8",
);
const cinemaLocalSource = readFileSync(
  "src/app/(main)/cinema/CinemaClient.tsx",
  "utf8",
);
const cinemaEnrichSource = readFileSync(
  "src/components/features/CinemaEnrichButton.tsx",
  "utf8",
);
const profilePageSource = readFileSync(
  "src/app/(main)/profile/page.tsx",
  "utf8",
);
const mainLayoutSource = readFileSync(
  "src/app/(main)/layout.tsx",
  "utf8",
);
const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");
const profileHeaderSource = readFileSync(
  "src/components/features/ProfileHeader.tsx",
  "utf8",
);
const profileRouteSource = readFileSync(
  "src/app/api/profile/route.ts",
  "utf8",
);
const profileStoreSource = readFileSync("src/lib/profile.ts", "utf8");

test("local library, stats, and downloads use one page header hierarchy", () => {
  assert.match(pageHeaderSource, /data-page-header/);
  assert.match(pageHeaderSource, /sm:min-h-\[72px\]/);
  assert.match(pageHeaderSource, /text-\[28px\] font-bold/);
  assert.match(pageHeaderSource, /description[\s\S]*mt-2 text-\[12px\]/);

  for (const source of [
    localLibrarySource,
    cinemaLocalSource,
    statsSource,
    downloadsSource,
  ]) {
    assert.match(source, /<PageHeader/);
  }
  assert.match(localLibrarySource, /title="本地库"/);
  assert.match(cinemaLocalSource, /title="本地库"/);
  assert.match(cinemaLocalSource, /你保存在本地的电视剧和电影/);
  assert.match(cinemaEnrichSource, /isLocalRefresh[\s\S]*"刷新资料"/);
  assert.match(statsSource, /title="统计"/);
  assert.match(downloadsSource, /title="下载管理"/);
});

test("stats report year follows the runtime year", () => {
  assert.match(statsSource, /const reportYear = new Date\(\)\.getFullYear\(\)/);
  assert.match(
    statsSource,
    /getStatsReport\(user\.id, \{ year: reportYear \}\)/,
  );
  assert.match(statsSource, /description=\{`\$\{report\.year\} 年度报告`\}/);
  assert.doesNotMatch(statsSource, /2026 年度报告/);
});

test("profile display name is editable without changing the login username", () => {
  assert.equal(existsSync("src/app/api/profile/route.ts"), true);
  assert.match(profilePageSource, /getProfileDisplayName\(user\.id, user\.username\)/);
  assert.match(profilePageSource, /<ProfileHeader initialDisplayName=\{displayName\}/);
  assert.match(profileHeaderSource, /修改名称/);
  assert.match(profileHeaderSource, /保存名称/);
  assert.match(profileHeaderSource, /eyebrow="个人中心"/);
  assert.doesNotMatch(profileHeaderSource, /description="个人中心"/);
  assert.match(mainLayoutSource, /getProfileDisplayName\(session\.user\.id, username\)/);
  assert.match(mainLayoutSource, /username=\{displayName\}/);
  assert.match(profileHeaderSource, /bandi:profile-display-name-change/);
  assert.match(navSource, /bandi:profile-display-name-change/);
  assert.match(navSource, /name=\{displayName\}/);
  assert.match(profileHeaderSource, /fetch\("\/api\/profile"/);
  assert.match(profileRouteSource, /requireRouteUser\(\)/);
  assert.match(profileRouteSource, /setProfileDisplayName\(user\.id, result\.value\)/);
  assert.match(profileStoreSource, /profile_display_name:/);
  assert.doesNotMatch(profileStoreSource, /update\(users\)|users\.username/);
});

test("profile display names are normalized and bounded", () => {
  assert.deepEqual(parseProfileDisplayName("  陆  凌华  "), {
    ok: true,
    value: "陆 凌华",
  });
  assert.equal(parseProfileDisplayName("   ").ok, false);
  assert.equal(parseProfileDisplayName("bad\u0000name").ok, false);
  assert.equal(
    parseProfileDisplayName("名".repeat(PROFILE_DISPLAY_NAME_MAX_LENGTH + 1)).ok,
    false,
  );
});
