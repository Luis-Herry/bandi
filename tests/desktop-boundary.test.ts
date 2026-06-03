import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("desktop packaging boundary survives web sync", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    main?: string;
    scripts?: Record<string, string>;
    build?: {
      asar?: boolean;
      npmRebuild?: boolean;
      files?: string[];
      extraResources?: Array<{ from?: string; to?: string }>;
      directories?: { output?: string };
    };
  };
  const nextConfig = readFileSync("next.config.ts", "utf8");
  const prepareScript = readFileSync("scripts/prepare-standalone.mjs", "utf8");
  const gitignore = readFileSync(".gitignore", "utf8");

  assert.equal(pkg.main, "desktop/main.cjs");
  assert.match(pkg.scripts?.["desktop:prepare"] ?? "", /prepare-standalone\.mjs/);
  assert.match(pkg.scripts?.["desktop:dist"] ?? "", /electron-builder --win/);
  assert.equal(pkg.build?.directories?.output, "release");
  assert.equal(pkg.build?.asar, false);
  assert.equal(pkg.build?.npmRebuild, false);
  assert.ok(pkg.build?.files?.includes(".next/standalone/**/*"));
  assert.ok(
    pkg.build?.extraResources?.some(
      (resource) =>
        resource.from === "vendor/qbittorrent" &&
        resource.to === "vendor/qbittorrent",
    ),
  );
  assert.ok(
    pkg.build?.extraResources?.some(
      (resource) => resource.from === "vendor/node" && resource.to === "vendor/node",
    ),
  );

  assert.match(nextConfig, /output:\s*"standalone"/);
  assert.match(prepareScript, /\.next", "standalone"/);
  assert.match(prepareScript, /copyDir\(staticDir, targetStatic\)/);
  assert.match(prepareScript, /copyDir\(publicDir, path\.join\(standaloneDir, "public"\)\)/);
  assert.match(gitignore, /\/release/);
  assert.match(gitignore, /\/dist/);
  assert.match(gitignore, /\.desktop-verify\//);
});

test("desktop main keeps local qBit and userData runtime paths", () => {
  const mainSource = readFileSync("desktop/main.cjs", "utf8");

  assert.match(mainSource, /QBIT_PORT_DEFAULT = 8080/);
  assert.match(mainSource, /existingQbitPort !== 18180/);
  assert.match(mainSource, /app\.getPath\("userData"\)/);
  assert.match(mainSource, /path\.join\(userData, "qbit-profile"\)/);
  assert.match(mainSource, /path\.join\(userData, "download"\)/);
  assert.match(mainSource, /path\.join\(userData, "data"\)/);
  assert.match(mainSource, /DATABASE_URL: dbPath/);
  assert.match(mainSource, /QBIT_URL: `http:\/\/127\.0\.0\.1:\$\{desktopConfig\.qbitPort\}`/);
  assert.match(mainSource, /ANIME_DESKTOP_APP: "1"/);
});

test("desktop qBit setup guide keeps screenshots and 8080 defaults", () => {
  const guideSource = readFileSync(
    "src/components/features/QbitSetupGuideDialog.tsx",
    "utf8",
  );

  assert.match(guideSource, /不会设置看这里/);
  assert.match(guideSource, /127\.0\.0\.1/);
  assert.match(guideSource, /8080/);
  assert.match(guideSource, /admin/);
  assert.match(guideSource, /对本地主机上的客户端跳过身份验证/);
  assert.match(guideSource, /\/qbit-guide\/main-settings\.png/);
  assert.match(guideSource, /\/qbit-guide\/webui-options\.png/);
  assert.ok(existsSync("public/qbit-guide/main-settings.png"));
  assert.ok(existsSync("public/qbit-guide/webui-options.png"));
});

test("download and settings qBit panels keep the desktop guide entry", () => {
  const downloadsSource = readFileSync(
    "src/app/(main)/admin/downloads/Client.tsx",
    "utf8",
  );
  const settingsSource = readFileSync(
    "src/components/features/AutomationSettingsClient.tsx",
    "utf8",
  );

  for (const source of [downloadsSource, settingsSource]) {
    assert.match(source, /QbitSetupGuideDialog/);
    assert.match(source, /不会设置看这里/);
    assert.match(source, /默认 127\.0\.0\.1:8080/);
  }
  assert.match(downloadsSource, /qbitPort/);
  assert.doesNotMatch(downloadsSource, /端口优先用 18080/);
});

test("desktop login keeps default-account hint without losing the shared brand UI", () => {
  const loginPageSource = readFileSync("src/app/(auth)/login/page.tsx", "utf8");
  const loginShellSource = readFileSync(
    "src/app/(auth)/login/LoginShell.tsx",
    "utf8",
  );

  assert.match(loginPageSource, /ANIME_DESKTOP_APP/);
  assert.match(loginPageSource, /DESKTOP_BOOTSTRAP_USER/);
  assert.match(loginPageSource, /DESKTOP_BOOTSTRAP_PASSWORD/);
  assert.match(loginPageSource, /desktopLoginHint=\{desktopLoginHint\}/);
  assert.match(loginShellSource, /desktopLoginHint\?: string \| null/);
  assert.match(loginShellSource, /BrandLogo/);
  assert.match(loginShellSource, /\{desktopLoginHint && !error &&/);
  assert.match(loginShellSource, /\{!desktopLoginHint && \(/);
});
