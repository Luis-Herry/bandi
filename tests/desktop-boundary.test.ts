import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import {
  ensureDatabaseSchema,
  ensureDesktopDefaults,
} from "../src/db/bootstrap";
import {
  isSafeAbsoluteWindowsPath as isSafeTypeScriptWindowsPath,
  resolveDownloadRoot,
} from "../src/lib/download-root";

const nodeRequire = createRequire(import.meta.url);
const { buildNextProxyEnv, mergeNoProxy } = nodeRequire(
  "../desktop/proxy-env.cjs",
) as {
  buildNextProxyEnv: (
    env: Record<string, string | undefined>,
    fallbackProxyUrl?: string | null,
  ) => Record<string, string>;
  mergeNoProxy: (value?: string) => string;
};
const {
  DEFAULT_DOWNLOAD_DIR,
  isSafeAbsoluteWindowsPath: isSafeDesktopWindowsPath,
  normalizeManagedQbitPort,
  resolveConfiguredDownloadDir,
} = nodeRequire("../desktop/runtime-paths.cjs") as {
  DEFAULT_DOWNLOAD_DIR: string;
  isSafeAbsoluteWindowsPath: (value: unknown) => boolean;
  normalizeManagedQbitPort: (value: unknown) => number;
  resolveConfiguredDownloadDir: (input: {
    existingDownloadDir?: unknown;
    userDataDir: string;
    videosDir: string;
  }) => string;
};

test("managed qBit ports stay isolated from external compatibility ports", () => {
  assert.equal(normalizeManagedQbitPort(18180), 18180);
  assert.equal(normalizeManagedQbitPort(65535), 65535);
  for (const legacyOrInvalid of [undefined, 0, 8080, 18080, 18179, 65536]) {
    assert.equal(normalizeManagedQbitPort(legacyOrInvalid), 0, String(legacyOrInvalid));
  }
});
const {
  getDesktopSessionOrigins,
  withDesktopSessionHeader,
} = nodeRequire("../desktop/session-header.cjs") as {
  getDesktopSessionOrigins: (appUrl: string) => Set<string>;
  withDesktopSessionHeader: (input: {
    allowedOrigins: Set<string>;
    requestUrl: string;
    requestHeaders: Record<string, string>;
    headerName: string;
    headerValue: string;
  }) => Record<string, string>;
};

test("desktop proxy environment always bypasses its local services", () => {
  assert.equal(
    mergeNoProxy("internal.example,LOCALHOST"),
    "internal.example,LOCALHOST,127.0.0.1,::1",
  );

  const existing = buildNextProxyEnv({
    HTTPS_PROXY: "http://proxy.example:8080",
    NO_PROXY: "internal.example",
  });
  assert.equal(existing.HTTP_PROXY, undefined);
  assert.match(existing.NO_PROXY, /internal\.example/);
  assert.match(existing.NO_PROXY, /127\.0\.0\.1/);
  assert.match(existing.NO_PROXY, /localhost/);
  assert.match(existing.NO_PROXY, /::1/);

  const fallback = buildNextProxyEnv({}, "http://127.0.0.1:10808");
  assert.equal(fallback.HTTP_PROXY, "http://127.0.0.1:10808");
  assert.equal(fallback.HTTPS_PROXY, "http://127.0.0.1:10808");
});

test("desktop download policy migrates legacy defaults and preserves custom paths", () => {
  const userDataDir =
    "C:\\Users\\ExampleUser\\AppData\\Roaming\\anime-tracker";
  const videosDir = "C:\\Users\\ExampleUser\\Videos";
  const resolve = (existingDownloadDir?: unknown) =>
    resolveConfiguredDownloadDir({
      existingDownloadDir,
      userDataDir,
      videosDir,
    });

  assert.equal(DEFAULT_DOWNLOAD_DIR, "K:\\BandiData\\downloads");
  assert.equal(resolve(undefined), DEFAULT_DOWNLOAD_DIR);
  assert.equal(resolve("relative/downloads"), DEFAULT_DOWNLOAD_DIR);
  assert.equal(resolve("C:downloads"), DEFAULT_DOWNLOAD_DIR);
  assert.equal(resolve("\\downloads"), DEFAULT_DOWNLOAD_DIR);
  assert.equal(resolve("C:\\"), DEFAULT_DOWNLOAD_DIR);
  assert.equal(
    resolve(`${userDataDir}\\download`),
    DEFAULT_DOWNLOAD_DIR,
  );
  assert.equal(
    resolve(`${videosDir}\\Bandi\\Downloads`),
    DEFAULT_DOWNLOAD_DIR,
  );
  assert.equal(
    resolve("D:\\Media\\Bandi Downloads"),
    "D:\\Media\\Bandi Downloads",
  );
  assert.equal(
    resolve("\\\\media-server\\anime\\Bandi Downloads"),
    "\\\\media-server\\anime\\Bandi Downloads",
  );
});

test("runtime paths require a complete Windows drive or UNC subpath", () => {
  const accepted = [
    "D:\\Media\\Bandi",
    "D:/Media/Bandi",
    "\\\\media-server\\anime\\Bandi",
  ];
  const rejected = [
    "relative/path",
    "C:relative",
    "\\root-relative",
    "/root-relative",
    "C:\\",
    "\\\\media-server\\anime\\",
    "\\\\?\\C:\\BandiData",
  ];

  for (const value of accepted) {
    assert.equal(isSafeDesktopWindowsPath(value), true, value);
    assert.equal(isSafeTypeScriptWindowsPath(value), true, value);
  }
  for (const value of rejected) {
    assert.equal(isSafeDesktopWindowsPath(value), false, value);
    assert.equal(isSafeTypeScriptWindowsPath(value), false, value);
  }
});

test("desktop download root follows config changes without restarting Next", () => {
  const root = mkdtempSync(join(tmpdir(), "bandi-download-root-"));
  const first = join(root, "first");
  const second = join(root, "second");
  const configPath = join(root, "config.json");
  mkdirSync(first);
  mkdirSync(second);

  writeFileSync(configPath, JSON.stringify({ downloadDir: first }), "utf8");
  const env = {
    ANIME_DESKTOP_APP: "1",
    DESKTOP_CONFIG_PATH: configPath,
    DOWNLOAD_ROOT: "Z:\\ignored-in-desktop-mode",
  };
  assert.deepEqual(resolveDownloadRoot(env), {
    ok: true,
    path: first,
  });

  for (const configPathValue of [
    "relative/config.json",
    "C:config.json",
    "\\config.json",
  ]) {
    const invalidConfigPath = resolveDownloadRoot({
      ANIME_DESKTOP_APP: "1",
      DESKTOP_CONFIG_PATH: configPathValue,
    });
    assert.equal(invalidConfigPath.ok, false, configPathValue);
  }

  writeFileSync(configPath, JSON.stringify({ downloadDir: second }), "utf8");
  assert.deepEqual(resolveDownloadRoot(env), {
    ok: true,
    path: second,
  });
  assert.deepEqual(
    resolveDownloadRoot({
      ANIME_DESKTOP_APP: "0",
      DESKTOP_CONFIG_PATH: configPath,
      DOWNLOAD_ROOT: first,
    }),
    { ok: true, path: first },
  );

  const missing = join(root, "missing");
  writeFileSync(configPath, JSON.stringify({ downloadDir: missing }), "utf8");
  const result = resolveDownloadRoot(env);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.includes(missing));

  writeFileSync(configPath, "{}", "utf8");
  const missingSetting = resolveDownloadRoot(env);
  assert.equal(missingSetting.ok, false);
  if (!missingSetting.ok) {
    assert.ok(missingSetting.message.includes(configPath));
  }

  for (const invalidDownloadDir of [
    "relative/downloads",
    "C:downloads",
    "\\downloads",
  ]) {
    writeFileSync(
      configPath,
      JSON.stringify({ downloadDir: invalidDownloadDir }),
      "utf8",
    );
    const invalidDownloadRoot = resolveDownloadRoot(env);
    assert.equal(invalidDownloadRoot.ok, false, invalidDownloadDir);
  }
});

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
  assert.match(
    pkg.scripts?.["desktop:prepare"] ?? "",
    /generate-third-party-licenses\.mjs/,
  );
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
  assert.ok(pkg.build?.files?.includes("THIRD_PARTY_LICENSES.txt"));
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
  assert.match(
    prepareScript,
    /mirrorDir\(staticDir, path\.join\(standaloneDir, "\.next", "static"\)\)/,
  );
  assert.match(
    prepareScript,
    /removeStandaloneDir\(path\.join\(standaloneDir, "\.next", "cache"\)\)/,
  );
  assert.match(
    prepareScript,
    /mirrorDir\(publicDir, path\.join\(standaloneDir, "public"\)\)/,
  );
  assert.match(gitignore, /\/release/);
  assert.match(gitignore, /\/dist/);
  assert.match(gitignore, /\.desktop-verify\//);
  assert.ok(existsSync("desktop/assets/app-icon.ico"));
  assert.ok(existsSync("desktop/assets/app-icon.png"));
  assert.ok(existsSync("desktop/preload.cjs"));
  assert.ok(existsSync("public/brand/app-logo.png"));
  assert.ok(existsSync("public/favicon.ico"));
  assert.ok(existsSync("public/favicon.png"));
});

test("bundled qBittorrent keeps the pinned runtime and matching source notices", () => {
  const notice = readFileSync("vendor/qbittorrent/NOTICE.txt", "utf8");

  assert.match(notice, /qBittorrent v5\.2\.3/);
  assert.match(
    notice,
    /ff508e2f912d59c9eabaf03633ebacfd45c2049f38dcac027b8a7d7ad867ab2f/,
  );
  assert.match(
    notice,
    /f69360ae8545a64f4fc84fb6bacef03d77a6aa0793a4c14d4a28651ca26a27d1/,
  );
  assert.ok(existsSync("vendor/qbittorrent/qbittorrent.exe"));
  assert.ok(existsSync("vendor/qbittorrent/qbittorrent-5.2.3.tar.xz"));
  assert.ok(existsSync("vendor/qbittorrent/COPYING"));
  assert.ok(existsSync("vendor/qbittorrent/COPYING.GPLv2"));
  assert.ok(existsSync("vendor/qbittorrent/COPYING.GPLv3"));
  assert.ok(existsSync("vendor/qbittorrent/AUTHORS"));
});

test("desktop main keeps local qBit and userData runtime paths", () => {
  const mainSource = readFileSync("desktop/main.cjs", "utf8");
  const bootstrapSource = readFileSync("src/db/bootstrap.ts", "utf8");

  assert.match(mainSource, /QBIT_PORT_START = 18180/);
  assert.match(mainSource, /findOpenPort\(QBIT_PORT_START\)/);
  assert.match(mainSource, /app\.getPath\("userData"\)/);
  assert.match(mainSource, /path\.join\(userData, "qbit-profile"\)/);
  assert.match(mainSource, /downloadDir = desktopConfig\.downloadDir/);
  assert.match(mainSource, /path\.join\(userData, "data"\)/);
  assert.match(mainSource, /DATABASE_URL: dbPath/);
  assert.ok(
    mainSource.includes(
      'COVER_CACHE_DIR: "H:\\\\BandiData\\\\cache\\\\covers"',
    ),
  );
  assert.ok(
    mainSource.includes(
      'YUC_CACHE_DIR: "H:\\\\BandiData\\\\cache\\\\yuc"',
    ),
  );
  assert.ok(
    mainSource.includes('SCREENSHOT_DIR: "H:\\\\BandiData\\\\screenshots"'),
  );
  assert.match(
    mainSource,
    /resolveConfiguredDownloadDir\(\{[\s\S]*existingDownloadDir: existing\.downloadDir/,
  );
  assert.match(
    mainSource,
    /prepareNextRuntimeDirectories\([\s\S]*desktopConfig\.downloadDir/,
  );
  assert.match(mainSource, /\.\.\.runtimePathEnv/);
  assert.match(mainSource, /startNextServer\(runtimePathEnv\)/);
  assert.match(mainSource, /QBIT_URL: `http:\/\/127\.0\.0\.1:\$\{desktopConfig\.qbitPort\}`/);
  assert.match(mainSource, /QBIT_CONFIG_PATH: configFile\(userData\)/);
  assert.match(mainSource, /DESKTOP_CONFIG_PATH: configFile\(userData\)/);
  assert.match(mainSource, /ANIME_DESKTOP_APP: "1"/);
  assert.doesNotMatch(mainSource, /DEFAULT_APP_PASSWORD/);
  assert.doesNotMatch(mainSource, /DESKTOP_BOOTSTRAP_PASSWORD/);
  assert.doesNotMatch(mainSource, /appPassword/);
  assert.doesNotMatch(bootstrapSource, /DESKTOP_BOOTSTRAP_PASSWORD/);
  assert.match(bootstrapSource, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(mainSource, /getAppIconPath\(\)/);
  assert.match(mainSource, /icon: getAppIconPath\(\)/);
});

test("desktop bootstrap creates an unreachable random password", () => {
  const dir = mkdtempSync(join(tmpdir(), "anime-desktop-credentials-"));
  const sqlite = new Database(join(dir, "anime.db"));
  const previousUser = process.env.DESKTOP_BOOTSTRAP_USER;

  try {
    ensureDatabaseSchema(sqlite);
    process.env.DESKTOP_BOOTSTRAP_USER = "desktop-user";
    ensureDesktopDefaults(sqlite);

    const user = sqlite
      .prepare(
        "SELECT id, password_hash AS passwordHash FROM users WHERE username = ?",
      )
      .get("desktop-user") as { id: string; passwordHash: string };
    assert.ok(user.id);
    assert.match(user.passwordHash, /^\$2[aby]\$/);
  } finally {
    sqlite.close();
    if (previousUser === undefined) delete process.env.DESKTOP_BOOTSTRAP_USER;
    else process.env.DESKTOP_BOOTSTRAP_USER = previousUser;
  }
});

test("runtime storage APIs require injected absolute directories", () => {
  const mainSource = readFileSync("desktop/main.cjs", "utf8");
  const coverSource = readFileSync("src/lib/cover-cache.ts", "utf8");
  const screenshotSource = readFileSync(
    "src/app/api/player/screenshots/route.ts",
    "utf8",
  );
  const downloadsSource = readFileSync(
    "src/app/api/downloads/route.ts",
    "utf8",
  );
  const downloadRootSource = readFileSync(
    "src/lib/download-root.ts",
    "utf8",
  );

  assert.match(coverSource, /process\.env\.COVER_CACHE_DIR/);
  assert.match(screenshotSource, /process\.env\.SCREENSHOT_DIR/);
  assert.match(downloadRootSource, /env\.DOWNLOAD_ROOT/);
  assert.match(downloadRootSource, /env\.DESKTOP_CONFIG_PATH/);
  assert.match(
    downloadRootSource,
    /readFileSync\(desktopConfigPath, "utf8"\)/,
  );
  assert.match(mainSource, /isSafeAbsoluteWindowsPath\(value\)[\s\S]*path\.resolve/);
  assert.match(coverSource, /isSafeAbsoluteWindowsPath\(configured\)/);
  assert.match(screenshotSource, /isSafeAbsoluteWindowsPath\(configured\)/);
  assert.match(downloadsSource, /resolveDownloadRoot\(\)/);
  for (const source of [
    coverSource,
    screenshotSource,
    downloadsSource,
    downloadRootSource,
  ]) {
    assert.doesNotMatch(source, /process\.cwd\(\)/);
  }
  assert.match(screenshotSource, /screenshot_directory_unavailable/);
  assert.match(downloadsSource, /download_directory_unavailable/);
  assert.match(
    downloadsSource,
    /syncExternalDownloads\(live, downloadRoot\.path\)/,
  );
});

test("Electron session data moves to H before app readiness", () => {
  const mainSource = readFileSync("desktop/main.cjs", "utf8");
  assert.ok(
    mainSource.includes(
      'ELECTRON_SESSION_DATA_DIR = "H:\\\\BandiData\\\\cache\\\\electron"',
    ),
  );
  assert.match(mainSource, /app\.setPath\("sessionData", inspection\.downloadDir\)/);
  const setupIndex = mainSource.lastIndexOf("configureElectronSessionData();");
  const lockIndex = mainSource.indexOf("app.requestSingleInstanceLock()");
  const readyIndex = mainSource.indexOf("app.whenReady()");
  assert.ok(setupIndex >= 0 && setupIndex < lockIndex);
  assert.ok(lockIndex < readyIndex);
  assert.match(mainSource, /app\.exit\(1\);[\s\S]*throw error/);
});

test("desktop owns qBit readiness, recovery, tray, and graceful shutdown", () => {
  const mainSource = readFileSync("desktop/main.cjs", "utf8");

  assert.match(mainSource, /async function probeQbit\(\)/);
  assert.match(mainSource, /waitForQbit\(\)/);
  assert.match(mainSource, /Scheduling qBit recovery/);
  assert.match(mainSource, /const initialQbitStart = startQbit\(qbitSelection\)/);
  assert.match(mainSource, /void initialQbitStart\.finally/);
  assert.match(mainSource, /app\.requestSingleInstanceLock\(\)/);
  assert.match(mainSource, /new Tray\(getAppIconPath\(\)\)/);
  assert.match(mainSource, /\{ label: "退出", click: \(\) => app\.quit\(\) \}/);
  assert.doesNotMatch(mainSource, /退出并停止下载/);
  assert.match(mainSource, /\/api\/v2\/app\/shutdown/);
  assert.match(mainSource, /mainWindow\.hide\(\)/);
});

test("desktop qBit client only uses the injected URL in desktop mode", () => {
  const qbitSource = readFileSync("src/lib/qbit.ts", "utf8");

  assert.match(qbitSource, /process\.env\.ANIME_DESKTOP_APP === "1"/);
  assert.match(qbitSource, /process\.env\.QBIT_CONFIG_PATH/);
  assert.match(qbitSource, /readFileSync\(qbitConfigPath, "utf8"\)/);
  assert.match(qbitSource, /if \(isDesktopApp\)/);
  assert.match(
    qbitSource,
    /return configured\.length > 0 \? configured : \[DEFAULT_QBIT_URLS\[0\]\]/,
  );
  assert.match(qbitSource, /managed: isDesktopApp/);
  assert.match(qbitSource, /\/api\/v2\/sync\/maindata\?rid=0/);
  assert.match(qbitSource, /serverState\?\.free_space_on_disk/);
  assert.doesNotMatch(qbitSource, /xfer\.data\.free_space_on_disk/);
});

test("desktop automation settings use non-blocking app feedback", () => {
  const settingsSource = readFileSync(
    "src/components/features/AutomationSettingsClient.tsx",
    "utf8",
  );

  assert.match(settingsSource, /showToast\(\{/);
  assert.match(settingsSource, /title: "RSS 测试成功"/);
  assert.match(settingsSource, /title: "RSS 测试失败"/);
  assert.doesNotMatch(settingsSource, /\balert\(/);
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

test("external qBit setup guide remains available as a web-mode fallback", () => {
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

test("download and settings panels hide infrastructure details in managed mode", () => {
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
    assert.match(source, /qbit && !qbit\.managed/);
    assert.match(source, /下载服务/);
    assert.doesNotMatch(source, /默认 127\.0\.0\.1:8080/);
  }
  assert.match(downloadsSource, /自动选择连接端口/);
  assert.match(settingsSource, /关闭窗口后会缩到托盘继续下载/);
});

test("desktop login establishes a local session without showing credentials", () => {
  const mainSource = readFileSync("desktop/main.cjs", "utf8");
  const loginPageSource = readFileSync("src/app/(auth)/login/page.tsx", "utf8");
  const loginShellSource = readFileSync(
    "src/app/(auth)/login/LoginShell.tsx",
    "utf8",
  );
  const sessionGateSource = readFileSync(
    "src/components/features/DesktopSessionGate.tsx",
    "utf8",
  );
  const authSource = readFileSync("src/auth.ts", "utf8");
  const middlewareSource = readFileSync("src/middleware.ts", "utf8");

  assert.match(loginPageSource, /ANIME_DESKTOP_APP/);
  assert.match(loginPageSource, /DesktopSessionGate/);
  assert.doesNotMatch(loginPageSource, /DESKTOP_BOOTSTRAP_PASSWORD/);
  assert.doesNotMatch(loginShellSource, /desktopLoginHint/);
  assert.match(loginShellSource, /BrandLogo/);
  assert.match(sessionGateSource, /signIn\("desktop-session"/);
  assert.match(sessionGateSource, /正在打开你的私人放映厅/);
  assert.match(authSource, /const isDesktopApp = process\.env\.ANIME_DESKTOP_APP === "1"/);
  assert.match(authSource, /\.\.\.\(!isDesktopApp/);
  assert.match(authSource, /\.\.\.\(isDesktopApp/);
  assert.match(authSource, /id: "desktop-session"/);
  assert.match(authSource, /x-bandi-desktop-token/);
  assert.match(authSource, /timingSafeEqual/);
  assert.match(middlewareSource, /searchParams\.get\("from"\)/);
  assert.match(middlewareSource, /from && from\.startsWith\("\/"\) \? from : "\/"/);
  assert.match(mainSource, /require\("\.\/session-header\.cjs"\)/);
  assert.match(
    mainSource,
    /urls: \[\.\.\.allowedOrigins\]\.map\(\(origin\) => `\$\{origin\}\/\*`\)/,
  );
  assert.match(mainSource, /withDesktopSessionHeader\(\{/);
});

test("desktop session header stays on the two local app origins", () => {
  const appUrl = "http://127.0.0.1:31245";
  const headerName = "X-Bandi-Desktop-Token";
  const headerValue = "test-token";
  const allowedOrigins = getDesktopSessionOrigins(appUrl);

  assert.deepEqual([...allowedOrigins], [
    "http://127.0.0.1:31245",
    "http://localhost:31245",
  ]);

  for (const requestUrl of [
    "http://127.0.0.1:31245/api/auth/providers",
    "http://localhost:31245/api/auth/callback/desktop-session",
  ]) {
    const requestHeaders = { Accept: "application/json" };
    const result = withDesktopSessionHeader({
      allowedOrigins,
      requestUrl,
      requestHeaders,
      headerName,
      headerValue,
    });

    assert.notStrictEqual(result, requestHeaders);
    assert.deepEqual(result, {
      Accept: "application/json",
      [headerName]: headerValue,
    });
    assert.deepEqual(requestHeaders, { Accept: "application/json" });
  }

  for (const requestUrl of [
    "http://127.0.0.1:31246/api/auth/providers",
    "http://localhost:31246/api/auth/providers",
    "https://127.0.0.1:31245/api/auth/providers",
    "https://localhost:31245/api/auth/providers",
    "http://localhost.evil.test:31245/api/auth/providers",
    "http://example.com:31245/api/auth/providers",
  ]) {
    const requestHeaders = {
      Accept: "application/json",
      "X-Existing": "kept",
    };
    const result = withDesktopSessionHeader({
      allowedOrigins,
      requestUrl,
      requestHeaders,
      headerName,
      headerValue,
    });

    assert.strictEqual(result, requestHeaders);
    assert.deepEqual(result, {
      Accept: "application/json",
      "X-Existing": "kept",
    });
    assert.equal(Object.hasOwn(result, headerName), false);
  }
});

test("desktop first-run onboarding owns download location and tray behavior", () => {
  const mainSource = readFileSync("desktop/main.cjs", "utf8");
  const preloadSource = readFileSync("desktop/preload.cjs", "utf8");
  const onboardingSource = readFileSync(
    "src/components/features/DesktopOnboarding.tsx",
    "utf8",
  );
  const desktopSettingsSource = readFileSync(
    "src/components/features/DesktopDownloadSettings.tsx",
    "utf8",
  );
  const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");

  assert.match(mainSource, /ONBOARDING_VERSION = 1/);
  assert.equal(DEFAULT_DOWNLOAD_DIR, "K:\\BandiData\\downloads");
  assert.match(mainSource, /const videosDir = app\.getPath\("videos"\)/);
  assert.match(mainSource, /resolveConfiguredDownloadDir/);
  assert.match(mainSource, /inspectDownloadDirectory/);
  assert.match(mainSource, /fs\.statfsSync/);
  assert.match(mainSource, /bandi:get-desktop-settings/);
  assert.match(mainSource, /bandi:choose-download-directory/);
  assert.match(mainSource, /bandi:save-desktop-settings/);
  assert.match(mainSource, /\/api\/v2\/app\/setPreferences/);
  assert.match(mainSource, /pendingQbitDownloadDir = inspection\.downloadDir/);
  assert.match(mainSource, /applyPendingQbitDownloadDirectory/);
  assert.match(mainSource, /preload: path\.join\(__dirname, "preload\.cjs"\)/);
  assert.match(mainSource, /DESKTOP_SESSION_TOKEN: desktopSessionToken/);
  assert.match(mainSource, /onBeforeSendHeaders/);
  assert.match(mainSource, /"\/onboarding"/);
  assert.match(mainSource, /if \(desktopConfig\.closeToTray\)/);
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld\("bandiDesktop"/);
  assert.match(onboardingSource, /确认新版下载位置/);
  assert.match(onboardingSource, /completeOnboarding: true/);
  assert.match(onboardingSource, /1080p/);
  assert.match(onboardingSource, /关闭窗口后继续下载/);
  assert.match(desktopSettingsSource, /更改后只影响新下载/);
  assert.match(navSource, /!isDesktop &&/);
});

test("desktop replaces native Windows chrome with a themed custom titlebar", () => {
  const mainSource = readFileSync("desktop/main.cjs", "utf8");
  const preloadSource = readFileSync("desktop/preload.cjs", "utf8");
  const rootLayoutSource = readFileSync("src/app/layout.tsx", "utf8");
  const mainLayoutSource = readFileSync("src/app/(main)/layout.tsx", "utf8");
  const titlebarSource = readFileSync(
    "src/components/features/DesktopTitlebar.tsx",
    "utf8",
  );
  const backButtonSource = readFileSync(
    "src/components/features/BackButton.tsx",
    "utf8",
  );
  const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");
  const settingsSource = readFileSync(
    "src/app/(main)/settings/page.tsx",
    "utf8",
  );
  const spaceSwitcherSource = readFileSync(
    "src/components/features/SpaceSwitcher.tsx",
    "utf8",
  );
  const globalsSource = readFileSync("src/app/globals.css", "utf8");

  assert.match(mainSource, /frame: false/);
  assert.match(mainSource, /thickFrame: true/);
  assert.match(mainSource, /roundedCorners: true/);
  assert.match(mainSource, /\["--use-env-proxy", serverEntry\]/);
  assert.match(mainSource, /const LOCAL_PROXY_PORT = 10808/);
  assert.match(mainSource, /const proxyEnv = await getNextProxyEnv\(\)/);
  assert.match(mainSource, /buildNextProxyEnv\(process\.env/);
  assert.match(mainSource, /Menu\.setApplicationMenu\(null\)/);
  assert.match(mainSource, /bandi:minimize-window/);
  assert.match(mainSource, /bandi:toggle-maximize-window/);
  assert.match(mainSource, /bandi:close-window/);
  assert.match(mainSource, /mainWindow\.on\("maximize"/);
  assert.match(mainSource, /mainWindow\.on\("unmaximize"/);
  assert.match(mainSource, /<div class="boot-heading"><i aria-hidden="true"><\/i><h1>/);
  assert.match(mainSource, /\.boot-heading\{display:flex;align-items:center;gap:10px\}/);
  assert.match(mainSource, /h1\{margin:0;/);
  assert.match(preloadSource, /bandi:window-state-changed/);
  assert.match(preloadSource, /bandi:choose-media-directory/);
  assert.match(mainSource, /ipcMain\.handle\("bandi:choose-media-directory"/);
  assert.match(mainSource, /选择本地影视文件夹/);
  assert.match(mainSource, /选择本地动漫文件夹/);
  assert.match(mainSource, /mediaKind === "anime"/);
  assert.equal(
    titlebarSource.includes('[/^\\/cinema\\/[^/]+/, "影视详情"]'),
    true,
  );
  assert.match(rootLayoutSource, /data-desktop-app=/);
  assert.match(rootLayoutSource, /isDesktop && <DesktopTitlebar/);
  assert.match(mainLayoutSource, /desktop-nav-spacer/);
  assert.match(mainLayoutSource, /desktop-page-scroll/);
  assert.match(titlebarSource, /desktop-titlebar-controls/);
  assert.match(titlebarSource, /aria-label="窗口控制"/);
  assert.match(backButtonSource, /"back-button"/);
  assert.match(navSource, /--desktop-titlebar-shell-height/);
  assert.doesNotMatch(navSource, /<BrandLogo \/>/);
  assert.equal([...navSource.matchAll(/<SpaceSwitcher /g)].length, 1);
  assert.match(spaceSwitcherSource, /hidden min-\[360px\]:inline/);
  assert.match(spaceSwitcherSource, /aria-label=\{s\.label\}/);
  assert.match(globalsSource, /-webkit-app-region: drag/);
  assert.match(globalsSource, /-webkit-app-region: no-drag/);
  assert.match(
    globalsSource,
    /html\[data-desktop-app="true"\] \.fixed > \.back-button\s*\{[^}]*translate: 0 var\(--desktop-titlebar-shell-height\)/s,
  );
  const titlebarRule =
    /\.desktop-titlebar\s*\{(?<body>[^}]*)\}/s.exec(globalsSource)?.groups
      ?.body ?? "";
  assert.match(titlebarRule, /top: 0;/);
  assert.match(titlebarRule, /right: 0;/);
  assert.match(titlebarRule, /left: 0;/);
  assert.match(titlebarRule, /height: 44px;/);
  assert.match(titlebarRule, /background: var\(--bg-elevated\);/);
  assert.doesNotMatch(titlebarRule, /border(?:-radius)?:/);
  assert.doesNotMatch(titlebarRule, /box-shadow:/);
  assert.doesNotMatch(titlebarRule, /backdrop-filter:/);
  assert.match(
    globalsSource,
    /html\[data-desktop-app="true"\]\s*\{[^}]*overflow: hidden;[^}]*scrollbar-gutter: auto;/s,
  );
  assert.match(
    globalsSource,
    /html\[data-desktop-app="true"\] body\s*\{[^}]*overflow: hidden;/s,
  );
  assert.match(
    globalsSource,
    /\.desktop-page-scroll\s*\{[^}]*overflow-y: auto;[^}]*scrollbar-gutter: auto;/s,
  );
  assert.match(settingsSource, /desktop-page-sticky/);
  assert.match(
    globalsSource,
    /html\[data-desktop-app="true"\] \.desktop-page-sticky\s*\{[^}]*top: 1rem;/s,
  );
  assert.match(globalsSource, /\.desktop-titlebar-window-button\s*\{[^}]*corner-shape: squircle/s);
  assert.match(
    globalsSource,
    /\.desktop-titlebar-window-button\s*\{[^}]*transition:[^}]*var\(--duration-quick\)[^}]*var\(--duration-micro\)/s,
  );
});

test("desktop page viewports stay inside the titlebar and navigation shell", () => {
  const globalsSource = readFileSync("src/app/globals.css", "utf8");
  const homeHeroSource = readFileSync(
    "src/components/features/HomeHero.tsx",
    "utf8",
  );
  const onboardingSource = readFileSync(
    "src/components/features/DesktopOnboarding.tsx",
    "utf8",
  );
  const playerSource = readFileSync(
    "src/app/(main)/player/[animeId]/[episode]/PlayerClient.tsx",
    "utf8",
  );

  assert.match(homeHeroSource, /home-hero/);
  assert.match(
    globalsSource,
    /html\[data-desktop-app="true"\] \.home-hero\s*\{[^}]*margin-top: 0;/s,
  );
  assert.match(onboardingSource, /desktop-onboarding-viewport/);
  assert.match(
    globalsSource,
    /html\[data-desktop-app="true"\] \.desktop-onboarding-viewport\s*\{[^}]*height: calc\(100vh - var\(--desktop-titlebar-shell-height\)\);[^}]*overflow-y: auto;/s,
  );
  assert.match(playerSource, /desktop-player-shell/);
  assert.match(playerSource, /desktop-player-stage/);
  assert.match(
    globalsSource,
    /html\[data-desktop-app="true"\] \.desktop-player-shell\s*\{[^}]*min-height: calc\(100vh - var\(--desktop-titlebar-shell-height\) - 64px\);/s,
  );
  assert.match(
    globalsSource,
    /html\[data-desktop-app="true"\] \.desktop-player-stage\s*\{[^}]*min-height: calc\(100vh - var\(--desktop-titlebar-shell-height\) - 104px\);/s,
  );
});
