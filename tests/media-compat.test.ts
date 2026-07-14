import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ffmpegStatic from "ffmpeg-static";
import {
  buildCompatibleFfmpegArgs,
  EXPECTED_FFMPEG_SHA256,
  isCompatibleAssetName,
  isCompatibleTaskId,
} from "../src/lib/media-compat-command";
import {
  beginMediaTaskShutdown,
  cancelledMediaTaskAccess,
  createMediaSessionIdentity,
  mediaTaskCanContinue,
  mediaTaskCountsAgainstLimit,
  mediaTaskIdentityMatches,
  readSafeMediaDirectoryIdentity,
  stopMediaTaskProcess,
} from "../src/lib/media-compat-lifecycle";

const read = (relativePath: string) => readFileSync(relativePath, "utf8");

function optionValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : undefined;
}

test("compatible HLS command remuxes Safari codecs and normalizes audio", () => {
  const outputDirectory = path.resolve("test-cache", "media-compat", "A".repeat(32));
  const aacArgs = buildCompatibleFfmpegArgs({
    inputPath: path.resolve("media", "episode.mkv"),
    outputDirectory,
    mode: "remux",
    probe: { videoCodec: "h264", audioCodec: "aac" },
  });
  assert.equal(optionValue(aacArgs, "-c:v"), "copy");
  assert.equal(optionValue(aacArgs, "-c:a"), "copy");
  assert.equal(optionValue(aacArgs, "-hls_segment_type"), "fmp4");
  assert.equal(optionValue(aacArgs, "-hls_fmp4_init_filename"), "init.mp4");
  assert.equal(optionValue(aacArgs, "-hls_playlist_type"), "vod");
  assert.ok(aacArgs.includes("independent_segments+temp_file"));
  assert.ok(!aacArgs.includes("-c"));

  const hevcArgs = buildCompatibleFfmpegArgs({
    inputPath: path.resolve("media", "episode.mkv"),
    outputDirectory,
    mode: "remux",
    probe: { videoCodec: "hevc", audioCodec: "flac" },
  });
  assert.equal(optionValue(hevcArgs, "-tag:v"), "hvc1");
  assert.equal(optionValue(hevcArgs, "-c:a"), "aac");
});

test("incompatible codecs are converted to H.264, AAC, and fMP4 HLS", () => {
  const args = buildCompatibleFfmpegArgs({
    inputPath: path.resolve("media", "episode.mkv"),
    outputDirectory: path.resolve("cache", "media-compat", "B".repeat(32)),
    mode: "transcode",
    probe: { videoCodec: "av1", audioCodec: "opus" },
  });
  assert.equal(optionValue(args, "-c:v"), "libx264");
  assert.equal(optionValue(args, "-c:a"), "aac");
  assert.equal(optionValue(args, "-pix_fmt"), "yuv420p");
  assert.equal(optionValue(args, "-force_key_frames"), "expr:gte(t,n_forced*4)");
  assert.equal(optionValue(args, "-hls_segment_type"), "fmp4");
  assert.match(args.at(-1) ?? "", /index\.m3u8$/);
});

test("the pinned binary produces a playable fMP4 HLS fixture", (t) => {
  if (!ffmpegStatic) return t.skip("ffmpeg-static binary is unavailable");
  const root = mkdtempSync(path.join(os.tmpdir(), "bandi-media-compat-test-"));
  const input = path.join(root, "input.mkv");
  const output = path.join(root, "output");
  mkdirSync(output);
  try {
    const fixture = spawnSync(
      ffmpegStatic,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=320x180:r=24:d=1",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=48000:cl=stereo",
        "-t",
        "1",
        "-c:v",
        "mpeg4",
        "-c:a",
        "aac",
        input,
      ],
      { encoding: "utf8" },
    );
    assert.equal(fixture.status, 0, fixture.stderr);
    const converted = spawnSync(
      ffmpegStatic,
      buildCompatibleFfmpegArgs({
        inputPath: input,
        outputDirectory: output,
        mode: "transcode",
        probe: { videoCodec: "mpeg4", audioCodec: "aac" },
      }),
      { cwd: output, encoding: "utf8" },
    );
    assert.equal(converted.status, 0, converted.stderr);
    assert.ok(existsSync(path.join(output, "index.m3u8")));
    assert.ok(existsSync(path.join(output, "init.mp4")));
    assert.ok(readdirSync(output).some((name) => /^segment_\d{6}\.m4s$/.test(name)));
    assert.match(read(path.join(output, "index.m3u8")), /#EXT-X-MAP:URI="init\.mp4"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("task and HLS asset identifiers reject paths and user-controlled names", () => {
  assert.equal(isCompatibleTaskId("Abc_123-".repeat(4)), true);
  for (const invalid of ["short", "../" + "A".repeat(32), "A".repeat(31), "A".repeat(33)]) {
    assert.equal(isCompatibleTaskId(invalid), false);
  }
  for (const valid of ["init.mp4", "segment_000000.m4s", "segment_999999.m4s"]) {
    assert.equal(isCompatibleAssetName(valid), true);
  }
  for (const invalid of ["index.m3u8", "../init.mp4", "title.m4s", "segment_1.m4s"]) {
    assert.equal(isCompatibleAssetName(invalid), false);
  }
});

test("host and each paired device receive isolated media task identities", () => {
  const host = createMediaSessionIdentity({ userId: "owner", isLocalHost: true });
  const pairedA = createMediaSessionIdentity({
    userId: "owner",
    isLocalHost: false,
    localDeviceId: "iphone-a-secret-id",
  });
  const pairedARepeat = createMediaSessionIdentity({
    userId: "owner",
    isLocalHost: false,
    localDeviceId: "iphone-a-secret-id",
  });
  const pairedB = createMediaSessionIdentity({
    userId: "owner",
    isLocalHost: false,
    localDeviceId: "ipad-b-secret-id",
  });

  assert.deepEqual(pairedA, pairedARepeat);
  assert.equal(mediaTaskIdentityMatches(host, pairedA), false);
  assert.equal(mediaTaskIdentityMatches(pairedA, pairedB), false);
  assert.equal(mediaTaskIdentityMatches(pairedA, pairedARepeat), true);
  assert.doesNotMatch(pairedA.sessionDeviceKey, /iphone-a-secret-id/);
  assert.equal(pairedA.sessionDeviceKey.length, 43);
});

test("leaked task ids stay forbidden across same-owner devices and tombstones are idempotent", () => {
  const pairedA = createMediaSessionIdentity({
    userId: "owner",
    isLocalHost: false,
    localDeviceId: "iphone-a",
  });
  const pairedB = createMediaSessionIdentity({
    userId: "owner",
    isLocalHost: false,
    localDeviceId: "iphone-b",
  });
  const otherOwner = createMediaSessionIdentity({
    userId: "other-owner",
    isLocalHost: true,
  });

  assert.equal(cancelledMediaTaskAccess(pairedA, pairedA), "already_cancelled");
  assert.equal(cancelledMediaTaskAccess(pairedA, pairedB), "forbidden");
  assert.equal(cancelledMediaTaskAccess(pairedA, otherOwner), "forbidden");
  assert.equal(cancelledMediaTaskAccess(undefined, pairedA), "missing");
});

test("cancellation kills the child before deleting cache and releasing the concurrency slot", async () => {
  class FakeProcess extends EventEmitter {
    exitCode: number | null = null;
    killed = false;
    kill() {
      this.killed = true;
      return true;
    }
  }

  const root = mkdtempSync(path.join(os.tmpdir(), "bandi-media-cancel-test-"));
  const directory = path.join(root, "task");
  mkdirSync(directory);
  const tasks = new Map([["task", { state: "cancelling" as const }]]);
  const child = new FakeProcess();
  const cancellation = stopMediaTaskProcess({
    process: child,
    timeoutMs: 1_000,
    finalize: () => {
      rmSync(directory, { recursive: true, force: true });
      tasks.delete("task");
    },
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(child.killed, true);
  assert.equal(tasks.size, 1);
  assert.equal(existsSync(directory), true);
  assert.equal(mediaTaskCountsAgainstLimit("cancelling"), true);

  child.exitCode = 137;
  child.emit("close");
  assert.equal(await cancellation, "cancelled");
  assert.equal(tasks.size, 0);
  assert.equal(existsSync(directory), false);
  assert.equal(mediaTaskCountsAgainstLimit("complete"), false);
  rmSync(root, { recursive: true, force: true });
});

test("a stuck cancellation keeps its slot until the child eventually closes", async () => {
  class FakeProcess extends EventEmitter {
    exitCode: number | null = null;
    kill() {
      return true;
    }
  }

  const child = new FakeProcess();
  let released = false;
  const result = await stopMediaTaskProcess({
    process: child,
    timeoutMs: 5,
    finalize: () => {
      released = true;
    },
  });
  assert.equal(result, "pending");
  assert.equal(released, false);
  assert.equal(mediaTaskCountsAgainstLimit("cancelling"), true);

  child.exitCode = 137;
  child.emit("close");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(released, true);
});

test("a slow probe cancellation keeps its slot until both child and startup settle", async () => {
  class FakeProcess extends EventEmitter {
    exitCode: number | null = null;
    killed = false;
    kill() {
      this.killed = true;
      return true;
    }
  }

  let finishStartup = () => {};
  const startupDone = new Promise<void>((resolve) => {
    finishStartup = resolve;
  });
  const child = new FakeProcess();
  let childCount = 2;
  const tasks = new Map([
    ["slow-probe", { state: "cancelling" as const }],
    ["other-task", { state: "processing" as const }],
  ]);
  const cleanup = beginMediaTaskShutdown({
    process: child,
    startupDone,
    processWaitMs: 1_000,
    finalize: () => tasks.delete("slow-probe"),
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(child.killed, true);
  assert.equal(tasks.size, 2);
  assert.equal(
    [...tasks.values()].filter((task) => mediaTaskCountsAgainstLimit(task.state)).length,
    2,
  );
  assert.equal(mediaTaskCanContinue(true, "cancelling"), false);
  assert.equal(childCount <= 2, true);

  child.exitCode = 137;
  childCount -= 1;
  child.emit("close");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(tasks.size, 2, "startup barrier must keep the cancelling slot");

  finishStartup();
  await cleanup;
  assert.equal(tasks.size, 1);
  assert.equal(childCount, 1);
});

test("a symlink or junction used as the media cache root fails closed", (t) => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "bandi-media-root-test-"));
  const target = mkdtempSync(path.join(os.tmpdir(), "bandi-media-root-target-"));
  const linkedRoot = path.join(parent, "media-compat");
  try {
    try {
      symlinkSync(target, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      return t.skip(`directory links are unavailable: ${String(error)}`);
    }
    assert.equal(readSafeMediaDirectoryIdentity(linkedRoot), null);
    assert.ok(readSafeMediaDirectoryIdentity(target));
  } finally {
    try {
      unlinkSync(linkedRoot);
    } catch {}
    rmSync(parent, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("compatible route is authenticated, private, and constrained to one handler", () => {
  const route = read("src/app/api/player/compatible/[...path]/route.ts");
  assert.match(route, /requireRouteUser\(\)/);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.match(route, /X-Content-Type-Options": "nosniff"/);
  assert.match(route, /application\/vnd\.apple\.mpegurl/);
  assert.match(route, /resolveCompatibleAsset/);

  const server = read("src/lib/media-compat.ts");
  assert.match(server, /MAX_CONCURRENT_TASKS = 2/);
  assert.match(server, /TASK_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(server, /randomBytes\(24\)\.toString\("base64url"\)/);
  assert.match(server, /shell: false/g);
  assert.match(route, /getCurrentSessionIdentity\(user\)/);
  assert.match(route, /export async function DELETE/);
  assert.match(server, /ownerUserId/);
  assert.match(server, /sessionDeviceKey/);
  assert.match(server, /compatible_forbidden[\s\S]*403/);
  assert.match(server, /cancelledMediaTaskAccess/);
  assert.match(server, /taskWasCancelled/);
  assert.match(server, /taskDirectoryIsSafe/);
  assert.match(server, /requireSafeCacheRoot\(\)/);
  assert.match(server, /requireTaskActive\(task\)/g);
  assert.match(server, /probeMedia\(executable, resolved\.file\.absPath, task\)/);
  assert.match(server, /startupDone/);
  assert.match(server, /entry\.isSymbolicLink\(\)/);
  assert.match(server, /resolveSafeTaskFile\(task, PLAYLIST_NAME\)/);
  assert.match(server, /path\.dirname\(resolved\) !== root/);
  assert.match(server, /preferredMode === "remux"/);
  assert.match(server, /mode: "transcode"/);
  assert.match(server, /process\.env\.BANDI_FFMPEG_PATH/);
  assert.match(server, /Microsoft[\s\S]*WinGet[\s\S]*Links/);
  assert.match(server, /\/opt\/homebrew\/bin\/ffmpeg/);
  assert.match(server, /\/usr\/local\/bin\/ffmpeg/);
  assert.match(server, /BANDI_FFMPEG_SHA256/);
  assert.doesNotMatch(server, /fileName|animeTitle|episodeTitle/);
  assert.doesNotMatch(server, /from "ffmpeg-static"/);
  assert.match(route, /isLocalHost: user\.isLocalHost/);
  assert.match(server, /宿主机未安装兼容播放组件/);
});

test("player defaults to Range and offers native Safari HLS without host actions", () => {
  const player = read("src/app/(main)/player/[animeId]/[episode]/PlayerClient.tsx");
  assert.match(player, /const \[videoSource, setVideoSource\] = useState\(streamUrl\)/);
  assert.match(player, /src=\{videoSource\}/);
  assert.match(player, /canPlayType\("application\/vnd\.apple\.mpegurl"\)/);
  assert.match(player, /fetch\("\/api\/player\/compatible\/start"/);
  assert.match(player, /method: "DELETE"/);
  assert.match(player, /cancelActiveCompatibleTask\(true\)/);
  assert.match(player, /window\.addEventListener\("pagehide", persistBeforeLeaving\)/);
  assert.match(player, /return \(\) => \{[\s\S]*cancelActiveCompatibleTask\(true\)/);
  assert.match(player, /await cancelActiveCompatibleTask\(false\)/);
  assert.match(player, /canOpenExternalPlayer &&/);
  assert.match(player, /Safari 无法解码当前封装或编码/);

  const page = read("src/app/(main)/player/[animeId]/[episode]/page.tsx");
  assert.match(page, /process\.env\.ANIME_LOCAL_SERVER_APP !== "1" \|\| user\.isLocalHost/);
});

test("failed progress saves stay queued until a successful response", () => {
  const player = read("src/app/(main)/player/[animeId]/[episode]/PlayerClient.tsx");
  const responseGuard = player.indexOf("if (!res.ok) return false;");
  const savedWatermark = player.indexOf(
    "lastSavedPositionRef.current = payload.positionSeconds;",
  );
  assert.ok(responseGuard >= 0 && savedWatermark > responseGuard);
  assert.match(player, /pendingProgressRef\.current = payload/);
  assert.match(player, /window\.setInterval\(retryPendingProgress, 15_000\)/);
  assert.match(player, /window\.addEventListener\("online", retryPendingProgress\)/);
  assert.match(player, /keepalive/);
});

test("public packages exclude FFmpeg while local-only builds stay gated", () => {
  const pkg = JSON.parse(read("package.json")) as {
    name: string;
    homepage: string;
    repository: { url: string };
    bugs: { url: string };
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    build: { appId: string; extraResources: Array<{ from: string; to: string }> };
  };
  assert.equal(pkg.name, "anime-tracker");
  assert.equal(pkg.build.appId, "cn.luis.anime-tracker.desktop");
  assert.equal(pkg.dependencies["ffmpeg-static"], undefined);
  assert.equal(pkg.devDependencies["ffmpeg-static"], "5.3.0");
  assert.match(pkg.homepage, /Luis-Herry\/bandi/);
  assert.match(pkg.repository.url, /Luis-Herry\/bandi/);
  assert.match(pkg.bugs.url, /Luis-Herry\/bandi/);
  assert.equal(
    pkg.build.extraResources.some((item) => /ffmpeg/i.test(item.from + item.to)),
    false,
  );

  assert.ok(ffmpegStatic);
  const platformKey = `${process.platform}-${process.arch}`;
  const expectedHash = EXPECTED_FFMPEG_SHA256[platformKey];
  assert.ok(expectedHash, `missing ffmpeg hash gate for ${platformKey}`);
  const actualHash = createHash("sha256")
    .update(readFileSync(ffmpegStatic as string))
    .digest("hex")
    .toUpperCase();
  assert.equal(actualHash, expectedHash);
  const version = spawnSync(ffmpegStatic as string, ["-hide_banner", "-version"], {
    encoding: "utf8",
  });
  assert.equal(version.status, 0);
  assert.match(version.stdout + version.stderr, /ffmpeg version\s+\S+/);
  if (platformKey === "win32-x64") {
    assert.match(version.stdout + version.stderr, /ffmpeg version 6\.1\.1/);
  }
  const encoders = spawnSync(ffmpegStatic as string, ["-hide_banner", "-encoders"], {
    encoding: "utf8",
  });
  assert.equal(encoders.status, 0);
  assert.match(encoders.stdout + encoders.stderr, /\blibx264\b/);
  assert.match(encoders.stdout + encoders.stderr, /^\s*A\S*\s+.*\baac\b/im);

  for (const mainFile of ["desktop/main.cjs", "local-server/main.cjs"]) {
    const source = read(mainFile);
    assert.match(source, /FFMPEG_PATH/);
    assert.match(source, /MEDIA_COMPAT_CACHE_DIR/);
    assert.match(source, /BANDI_BUNDLED_FFMPEG/);
  }
  const macBuilder = read("local-server/electron-builder.cjs");
  assert.match(macBuilder, /process\.arch !== arch/);
  assert.match(macBuilder, /ffmpeg-static 5\.3\.0 .* integrity check failed/);
  assert.match(macBuilder, /vendor\/ffmpeg\/ffmpeg/);
  assert.match(macBuilder, /BANDI_LOCAL_ONLY_FFMPEG/);
  assert.match(macBuilder, /LOCAL-ONLY-DO-NOT-RELEASE/);

  const localWindowsBuilder = read("desktop/electron-builder-local.cjs");
  assert.match(localWindowsBuilder, /LOCAL-ONLY-DO-NOT-RELEASE/);
  assert.match(localWindowsBuilder, /verify-ffmpeg-runtime\.mjs/);
  assert.match(read("desktop/LOCAL_ONLY_DO_NOT_RELEASE.txt"), /DO NOT upload/);

  const sourceOffer = read("scripts/prepare-ffmpeg-source-offer.mjs");
  assert.match(sourceOffer, /status: "candidate_only"/);
  assert.match(sourceOffer, /releaseBlocked: true/);
  assert.match(sourceOffer, /statically linked external library/);
});

test("manifest adds an installable shell without offline media caching", () => {
  const manifest = read("src/app/manifest.ts");
  assert.match(manifest, /name: "Bandi"/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /start_url: "\/"/);
  assert.match(manifest, /\/brand\/app-logo\.png/);
  assert.doesNotMatch(manifest, /serviceWorker|service-worker|sw\.js/i);
  assert.equal(existsSync("public/sw.js"), false);
  assert.equal(existsSync("src/app/sw.ts"), false);
});
