import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { ensureDatabaseSchema } from "../src/db/bootstrap";

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
      win?: { icon?: string; target?: string[] };
      nsis?: {
        installerIcon?: string;
        uninstallerIcon?: string;
        installerHeaderIcon?: string;
      };
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
  assert.equal(pkg.build?.win?.icon, "desktop/assets/app-icon.ico");
  assert.ok(pkg.build?.win?.target?.includes("nsis"));
  assert.ok(pkg.build?.win?.target?.includes("portable"));
  assert.equal(pkg.build?.nsis?.installerIcon, "desktop/assets/app-icon.ico");
  assert.equal(pkg.build?.nsis?.uninstallerIcon, "desktop/assets/app-icon.ico");
  assert.equal(pkg.build?.nsis?.installerHeaderIcon, "desktop/assets/app-icon.ico");
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
  assert.ok(existsSync("desktop/assets/app-icon.ico"));
  assert.ok(existsSync("desktop/assets/app-icon.png"));
  assert.ok(existsSync("public/brand/app-logo.png"));
  assert.ok(existsSync("public/favicon.ico"));
  assert.ok(existsSync("public/favicon.png"));
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
  assert.match(mainSource, /getAppIconPath\(\)/);
  assert.match(mainSource, /icon: getAppIconPath\(\)/);
});

test("desktop qBit client only uses the injected URL in desktop mode", () => {
  const qbitSource = readFileSync("src/lib/qbit.ts", "utf8");

  assert.match(qbitSource, /process\.env\.ANIME_DESKTOP_APP === "1"/);
  assert.match(qbitSource, /!isDesktopApp &&/);
  assert.match(qbitSource, /if \(isDesktopApp\)/);
  assert.match(
    qbitSource,
    /return configured\.length > 0 \? configured : \[DEFAULT_QBIT_URLS\[0\]\]/,
  );
});

test("desktop bootstrap creates playback progress storage", () => {
  const bootstrapSource = readFileSync("src/db/bootstrap.ts", "utf8");

  assert.match(bootstrapSource, /CREATE TABLE IF NOT EXISTS playback_progress/);
  assert.match(bootstrapSource, /position_seconds integer NOT NULL DEFAULT 0/);
  assert.match(bootstrapSource, /duration_seconds integer NOT NULL DEFAULT 0/);
  assert.match(bootstrapSource, /playback_progress_user_episode_idx/);
  assert.match(bootstrapSource, /playback_progress_user_recent_idx/);
});

test("desktop bootstrap migrates old anime rows for cinema fields", () => {
  const dir = mkdtempSync(join(tmpdir(), "anime-desktop-bootstrap-"));
  const sqlite = new Database(join(dir, "anime.db"));
  sqlite.exec(`
    CREATE TABLE anime (
      id integer PRIMARY KEY AUTOINCREMENT,
      bangumi_id integer UNIQUE,
      anilist_id integer,
      title text NOT NULL,
      title_ja text,
      cover_url text,
      synopsis text,
      type text NOT NULL,
      status text NOT NULL DEFAULT 'airing',
      total_episodes integer,
      airing_day integer,
      airing_time text,
      season text,
      year integer,
      tags text,
      accent_color text,
      created_at integer NOT NULL DEFAULT (unixepoch()),
      updated_at integer NOT NULL DEFAULT (unixepoch())
    );

    INSERT INTO anime (id, title, type, status)
    VALUES (1, '旧库番剧', 'TV', 'completed');
  `);

  ensureDatabaseSchema(sqlite);

  const columns = new Set(
    (sqlite.prepare("PRAGMA table_info(anime)").all() as Array<{ name: string }>)
      .map((column) => column.name),
  );
  for (const column of [
    "media_type",
    "tmdb_id",
    "douban_id",
    "imdb_id",
    "tmdb_rating",
    "douban_rating",
    "douban_rating_fetched_at",
    "watch_providers",
    "is_adult",
  ]) {
    assert.equal(columns.has(column), true);
  }

  const row = sqlite
    .prepare("SELECT title, media_type, is_adult FROM anime WHERE id = 1")
    .get() as { title: string; media_type: string; is_adult: number };
  assert.deepEqual(row, {
    title: "旧库番剧",
    media_type: "anime",
    is_adult: 0,
  });

  sqlite.close();
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
  assert.match(loginShellSource, /\{desktopLoginHint && !loginError\.message &&/);
  assert.match(loginShellSource, /\{!desktopLoginHint && \(/);
});
