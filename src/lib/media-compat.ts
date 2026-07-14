import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  accessSync,
  constants as fsConstants,
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import {
  buildCompatibleFfmpegArgs,
  EXPECTED_FFMPEG_SHA256,
  isCompatibleAssetName,
  isCompatibleTaskId,
  type CompatibleMode,
  type MediaProbe,
} from "@/lib/media-compat-command";
import { resolvePlayableEpisodeFile } from "@/lib/player";
import {
  cancelledMediaTaskAccess,
  beginMediaTaskShutdown,
  mediaDirectoryIdentityMatches,
  mediaTaskCanContinue,
  mediaTaskCountsAgainstLimit,
  mediaTaskIdentityMatches,
  readSafeMediaDirectoryIdentity,
  waitForMediaTaskShutdown,
  type MediaDirectoryIdentity,
  type MediaTaskIdentity,
} from "@/lib/media-compat-lifecycle";

export const FFMPEG_STATIC_VERSION = "5.3.0";
export const FFMPEG_STATIC_RELEASE = "b6.1.1";

const PLAYLIST_NAME = "index.m3u8";
const MAX_CONCURRENT_TASKS = 2;
const TASK_TTL_MS = 30 * 60 * 1000;
const TOMBSTONE_TTL_MS = 10 * 60 * 1000;
const CANCEL_WAIT_MS = 2_000;
const STARTUP_TIMEOUT_MS = 45_000;
const PROCESS_TIMEOUT_MS = 15_000;

type TaskState =
  | "probing"
  | "processing"
  | "ready"
  | "complete"
  | "failed"
  | "cancelling";

interface CompatibleTask extends MediaTaskIdentity {
  id: string;
  directory: string;
  directoryIdentity: MediaDirectoryIdentity;
  createdAt: number;
  lastAccessAt: number;
  state: TaskState;
  mode: CompatibleMode | null;
  process: ChildProcess | null;
  errorCode: string | null;
  rememberCancellation: boolean;
  startupDone: Promise<void>;
  finishStartup: () => void;
  startupSettled: boolean;
  cleanupPromise: Promise<void> | null;
}

interface CancelledTaskTombstone extends MediaTaskIdentity {
  expiresAt: number;
}

interface ManagerState {
  tasks: Map<string, CompatibleTask>;
  tombstones: Map<string, CancelledTaskTombstone>;
  verification: Promise<string> | null;
  verifiedHashes: Map<string, string>;
  cleanupTimer: NodeJS.Timeout | null;
  exitHandlerInstalled: boolean;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const globalForMediaCompat = globalThis as typeof globalThis & {
  __bandiMediaCompat?: ManagerState;
};

const manager: ManagerState = globalForMediaCompat.__bandiMediaCompat ?? {
  tasks: new Map(),
  tombstones: new Map(),
  verification: null,
  verifiedHashes: new Map(),
  cleanupTimer: null,
  exitHandlerInstalled: false,
};
globalForMediaCompat.__bandiMediaCompat = manager;
manager.verifiedHashes ??= new Map();
manager.tombstones ??= new Map();

export class MediaCompatibilityError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MediaCompatibilityError";
  }
}

export function resolveMediaCompatCacheRoot(raw = process.env.MEDIA_COMPAT_CACHE_DIR): string {
  if (!raw || !path.isAbsolute(raw)) {
    throw new MediaCompatibilityError(
      "media_cache_unavailable",
      503,
      "兼容播放缓存目录尚未就绪",
    );
  }
  const resolved = path.resolve(raw);
  if (
    path.basename(resolved).toLowerCase() !== "media-compat" ||
    path.basename(path.dirname(resolved)).toLowerCase() !== "cache"
  ) {
    throw new MediaCompatibilityError(
      "media_cache_unsafe",
      503,
      "兼容播放缓存目录未通过安全检查",
    );
  }
  return resolved;
}

function activeTaskCount(): number {
  let count = 0;
  for (const task of manager.tasks.values()) {
    if (mediaTaskCountsAgainstLimit(task.state)) count += 1;
  }
  return count;
}

function captureTaskDirectoryIdentity(directory: string): MediaDirectoryIdentity {
  const identity = readSafeMediaDirectoryIdentity(directory);
  if (!identity) {
    throw new MediaCompatibilityError(
      "media_cache_unsafe",
      503,
      "兼容播放缓存目录未通过安全检查",
    );
  }
  return identity;
}

function requireSafeCacheRoot(): MediaDirectoryIdentity {
  const identity = readSafeMediaDirectoryIdentity(resolveMediaCompatCacheRoot());
  if (!identity) {
    throw new MediaCompatibilityError(
      "media_cache_unsafe",
      503,
      "兼容播放缓存目录未通过安全检查",
    );
  }
  return identity;
}

function taskDirectoryIsSafe(task: CompatibleTask): boolean {
  try {
    const root = requireSafeCacheRoot();
    return (
      mediaDirectoryIdentityMatches(task.directory, task.directoryIdentity) &&
      path.dirname(task.directoryIdentity.realPath) === root.realPath
    );
  } catch {
    return false;
  }
}

function safeRemoveTaskDirectory(task: CompatibleTask): void {
  let root: MediaDirectoryIdentity;
  try {
    root = requireSafeCacheRoot();
  } catch {
    return;
  }
  const resolved = path.resolve(task.directory);
  if (
    path.dirname(resolved) !== root.literalPath ||
    !isCompatibleTaskId(path.basename(resolved))
  ) {
    return;
  }
  try {
    const entry = lstatSync(resolved);
    if (entry.isSymbolicLink()) {
      unlinkSync(resolved);
      return;
    }
    if (!taskDirectoryIsSafe(task)) return;
    rmSync(resolved, { recursive: true, force: true });
  } catch {}
}

function forceCleanupTaskOnExit(task: CompatibleTask): void {
  if (task.process && task.process.exitCode == null) {
    try {
      task.process.kill("SIGKILL");
    } catch {}
  }
  task.process = null;
  safeRemoveTaskDirectory(task);
  manager.tasks.delete(task.id);
}

function finalizeCancelledTask(task: CompatibleTask): void {
  task.process = null;
  safeRemoveTaskDirectory(task);
  if (manager.tasks.get(task.id) === task) manager.tasks.delete(task.id);
  if (task.rememberCancellation) {
    manager.tombstones.set(task.id, {
      ownerUserId: task.ownerUserId,
      sessionDeviceKey: task.sessionDeviceKey,
      expiresAt: Date.now() + TOMBSTONE_TTL_MS,
    });
  }
}

function finishTaskStartup(task: CompatibleTask): void {
  if (task.startupSettled) return;
  task.startupSettled = true;
  task.finishStartup();
}

function beginTaskCleanup(task: CompatibleTask): Promise<void> {
  if (task.cleanupPromise) return task.cleanupPromise;
  task.cleanupPromise = beginMediaTaskShutdown({
    process: task.process,
    startupDone: task.startupDone,
    processWaitMs: CANCEL_WAIT_MS,
    finalize: () => finalizeCancelledTask(task),
  });
  return task.cleanupPromise;
}

async function stopAndCleanupTask(
  task: CompatibleTask,
  remember: boolean,
): Promise<"cancelled" | "pending"> {
  task.rememberCancellation ||= remember;
  task.state = "cancelling";
  return waitForMediaTaskShutdown(beginTaskCleanup(task), CANCEL_WAIT_MS);
}

function cleanupExpiredTasks(now = Date.now()): void {
  for (const task of [...manager.tasks.values()]) {
    if (now - task.lastAccessAt > TASK_TTL_MS) void stopAndCleanupTask(task, false);
  }
  for (const [taskId, tombstone] of manager.tombstones) {
    if (tombstone.expiresAt <= now) manager.tombstones.delete(taskId);
  }
}

function ensureLifecycleHandlers(): void {
  if (!manager.cleanupTimer) {
    manager.cleanupTimer = setInterval(cleanupExpiredTasks, 10 * 60 * 1000);
    manager.cleanupTimer.unref();
  }
  if (!manager.exitHandlerInstalled) {
    manager.exitHandlerInstalled = true;
    process.once("exit", () => {
      for (const task of [...manager.tasks.values()]) forceCleanupTaskOnExit(task);
    });
  }
}

function runCommand(
  executable: string,
  args: string[],
  timeoutMs = PROCESS_TIMEOUT_MS,
  ownerTask?: CompatibleTask,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    if (ownerTask && taskWasCancelled(ownerTask)) {
      reject(
        new MediaCompatibilityError(
          "compatible_cancelled",
          499,
          "兼容播放任务已取消",
        ),
      );
      return;
    }
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (ownerTask) ownerTask.process = child;
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const append = (current: string, chunk: Buffer) =>
      (current + chunk.toString("utf8")).slice(-512 * 1024);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", reject);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    timer.unref();
    child.once("close", (code) => {
      clearTimeout(timer);
      if (ownerTask?.process === child) ownerTask.process = null;
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

function hashFile(absPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(absPath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex").toUpperCase()));
  });
}

function normalizeSha256(value: string | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-F0-9]{64}$/.test(normalized) ? normalized : null;
}

function resolveExecutableCandidate(candidate: string): string | null {
  if (!path.isAbsolute(candidate)) return null;
  try {
    const resolved = realpathSync(path.resolve(candidate));
    if (!statSync(resolved).isFile()) return null;
    accessSync(resolved, fsConstants.X_OK);
    return resolved;
  } catch {
    return null;
  }
}

function discoverSystemFfmpeg(): string | null {
  const executableName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates: string[] = [];
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    candidates.push(
      path.join(
        process.env.LOCALAPPDATA,
        "Microsoft",
        "WinGet",
        "Links",
        "ffmpeg.exe",
      ),
    );
  }
  if (process.platform === "darwin") {
    candidates.push(
      "/opt/homebrew/bin/ffmpeg",
      "/usr/local/bin/ffmpeg",
      "/opt/local/bin/ffmpeg",
    );
  }
  for (const directory of String(process.env.PATH ?? "").split(path.delimiter)) {
    const cleaned = directory.trim().replace(/^"|"$/g, "");
    if (cleaned && path.isAbsolute(cleaned)) {
      candidates.push(path.join(cleaned, executableName));
    }
  }
  for (const candidate of new Set(candidates)) {
    const resolved = resolveExecutableCandidate(candidate);
    if (resolved) return resolved;
  }
  return null;
}

async function verifyFfmpeg(): Promise<string> {
  const configuredPath = process.env.BANDI_FFMPEG_PATH || process.env.FFMPEG_PATH;
  const configuredExecutable = configuredPath
    ? resolveExecutableCandidate(configuredPath)
    : null;
  if (configuredPath && !configuredExecutable) {
    throw new MediaCompatibilityError(
      "ffmpeg_path_invalid",
      503,
      "兼容播放组件路径无效；请在宿主机重新设置后重启 Bandi",
    );
  }
  const executable = configuredExecutable ?? discoverSystemFfmpeg();
  if (!executable) {
    throw new MediaCompatibilityError(
      "ffmpeg_unavailable",
      503,
      "请在宿主机安装 FFmpeg 6–8，或设置 BANDI_FFMPEG_PATH 与 BANDI_FFMPEG_SHA256 后重启 Bandi",
    );
  }
  const platformKey = `${process.platform}-${process.arch}`;
  const actualHash = await hashFile(executable);
  const bundled = process.env.BANDI_BUNDLED_FFMPEG === "1";
  const configuredExpectedHash = normalizeSha256(
    process.env.BANDI_FFMPEG_SHA256,
  );
  const expectedHash = bundled
    ? EXPECTED_FFMPEG_SHA256[platformKey]
    : configuredPath
      ? configuredExpectedHash
      : null;
  if (configuredPath && !bundled && !configuredExpectedHash) {
    throw new MediaCompatibilityError(
      "ffmpeg_hash_required",
      503,
      "自定义兼容播放组件还需要 BANDI_FFMPEG_SHA256 校验值",
    );
  }
  const previousHash = manager.verifiedHashes.get(executable);
  if (
    (bundled && !expectedHash) ||
    (expectedHash && actualHash !== expectedHash) ||
    (previousHash && previousHash !== actualHash)
  ) {
    throw new MediaCompatibilityError(
      "ffmpeg_integrity_failed",
      503,
      "兼容播放组件完整性校验失败",
    );
  }
  if (previousHash === actualHash) return executable;
  const [version, encoders] = await Promise.all([
    runCommand(executable, ["-hide_banner", "-version"]),
    runCommand(executable, ["-hide_banner", "-encoders"]),
  ]);
  const versionMatch = (version.stdout + version.stderr).match(
    /ffmpeg version\s+(?:n)?(\d+)\.(\d+)/i,
  );
  const majorVersion = Number(versionMatch?.[1]);
  if (
    version.code !== 0 ||
    version.timedOut ||
    !Number.isFinite(majorVersion) ||
    majorVersion < 6 ||
    majorVersion > 8 ||
    encoders.code !== 0 ||
    encoders.timedOut ||
    !/\blibx264\b/i.test(encoders.stdout + encoders.stderr) ||
    !/^\s*A\S*\s+.*\baac\b/im.test(encoders.stdout + encoders.stderr)
  ) {
    throw new MediaCompatibilityError(
      "ffmpeg_capability_failed",
      503,
      "宿主机 FFmpeg 版本或 H.264/AAC 编码能力不符合兼容播放要求",
    );
  }
  manager.verifiedHashes.set(executable, actualHash);
  return executable;
}

function getVerifiedFfmpeg(): Promise<string> {
  manager.verification ??= verifyFfmpeg().finally(() => {
    manager.verification = null;
  });
  return manager.verification;
}

async function probeMedia(
  executable: string,
  inputPath: string,
  task: CompatibleTask,
): Promise<MediaProbe> {
  const result = await runCommand(executable, [
    "-nostdin",
    "-hide_banner",
    "-i",
    inputPath,
  ], PROCESS_TIMEOUT_MS, task);
  if (result.timedOut) {
    throw new MediaCompatibilityError(
      "media_probe_timeout",
      504,
      "读取视频信息超时",
    );
  }
  const lines = result.stderr.split(/\r?\n/);
  const videoLine =
    lines.find((line) => /Video:/i.test(line) && !/attached pic/i.test(line)) ??
    lines.find((line) => /Video:/i.test(line));
  const audioLine = lines.find((line) => /Audio:/i.test(line));
  const videoCodec = videoLine?.match(/Video:\s*([^,\s]+)/i)?.[1]?.toLowerCase();
  const audioCodec = audioLine?.match(/Audio:\s*([^,\s]+)/i)?.[1]?.toLowerCase() ?? null;
  if (!videoCodec) {
    throw new MediaCompatibilityError(
      "video_stream_missing",
      422,
      "文件里没有可播放的视频轨道",
    );
  }
  return { videoCodec, audioCodec };
}

function clearGeneratedAssets(task: CompatibleTask): void {
  safeRemoveTaskDirectory(task);
  if (existsSync(task.directory)) {
    throw new MediaCompatibilityError(
      "media_cache_unsafe",
      503,
      "兼容播放缓存目录未通过安全检查",
    );
  }
  mkdirSync(task.directory, { recursive: false, mode: 0o700 });
  task.directoryIdentity = captureTaskDirectoryIdentity(task.directory);
}

function spawnFfmpegTask({
  executable,
  inputPath,
  task,
  mode,
  probe,
}: {
  executable: string;
  inputPath: string;
  task: CompatibleTask;
  mode: CompatibleMode;
  probe: MediaProbe;
}): Promise<number | null> {
  if (!taskDirectoryIsSafe(task)) {
    throw new MediaCompatibilityError(
      "media_cache_unsafe",
      503,
      "兼容播放缓存目录未通过安全检查",
    );
  }
  task.mode = mode;
  task.state = "processing";
  const child = spawn(
    executable,
    buildCompatibleFfmpegArgs({
      inputPath,
      outputDirectory: task.directory,
      mode,
      probe,
    }),
    {
      cwd: task.directory,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
  task.process = child;
  return new Promise((resolve) => {
    child.once("error", () => resolve(null));
    child.once("close", (code) => resolve(code));
  });
}

function taskWasCancelled(task: CompatibleTask): boolean {
  return task.state === "cancelling";
}

function requireTaskActive(task: CompatibleTask): void {
  if (
    !mediaTaskCanContinue(manager.tasks.get(task.id) === task, task.state)
  ) {
    throw new MediaCompatibilityError(
      "compatible_cancelled",
      499,
      "兼容播放任务已取消",
    );
  }
}

async function runTask({
  executable,
  inputPath,
  task,
  probe,
  preferredMode,
}: {
  executable: string;
  inputPath: string;
  task: CompatibleTask;
  probe: MediaProbe;
  preferredMode: CompatibleMode;
}): Promise<void> {
  const firstCode = await spawnFfmpegTask({
    executable,
    inputPath,
    task,
    mode: preferredMode,
    probe,
  });
  if (manager.tasks.get(task.id) !== task || taskWasCancelled(task)) return;
  if (firstCode === 0) {
    task.state = "complete";
    task.process = null;
    return;
  }

  if (preferredMode === "remux") {
    clearGeneratedAssets(task);
    const fallbackCode = await spawnFfmpegTask({
      executable,
      inputPath,
      task,
      mode: "transcode",
      probe,
    });
    if (manager.tasks.get(task.id) !== task || taskWasCancelled(task)) return;
    if (fallbackCode === 0) {
      task.state = "complete";
      task.process = null;
      return;
    }
  }

  task.state = "failed";
  task.errorCode = "ffmpeg_failed";
  task.process = null;
  safeRemoveTaskDirectory(task);
}

async function waitForPlaylist(task: CompatibleTask): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  const playlistPath = path.join(task.directory, PLAYLIST_NAME);
  while (Date.now() < deadline) {
    requireTaskActive(task);
    if (!taskDirectoryIsSafe(task)) {
      throw new MediaCompatibilityError(
        "media_cache_unsafe",
        503,
        "兼容播放缓存目录未通过安全检查",
      );
    }
    if (task.state === "failed") {
      throw new MediaCompatibilityError(
        task.errorCode ?? "ffmpeg_failed",
        422,
        "这个文件暂时无法转换为兼容格式",
      );
    }
    try {
      if (statSync(playlistPath).size > 0) {
        if (task.state === "processing") task.state = "ready";
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new MediaCompatibilityError(
    "compatible_start_timeout",
    504,
    "兼容播放准备超时，可以稍后重试",
  );
}

export async function startCompatiblePlayback({
  ownerUserId,
  sessionDeviceKey,
  animeId,
  episode,
}: {
  ownerUserId: string;
  sessionDeviceKey: string;
  animeId: number;
  episode: number;
}): Promise<{ taskId: string; mode: CompatibleMode; playlistUrl: string }> {
  ensureLifecycleHandlers();
  cleanupExpiredTasks();
  if (activeTaskCount() >= MAX_CONCURRENT_TASKS) {
    throw new MediaCompatibilityError(
      "compatible_busy",
      429,
      "已有兼容播放任务在运行，请稍后再试",
    );
  }
  const root = resolveMediaCompatCacheRoot();
  mkdirSync(root, { recursive: true, mode: 0o700 });
  requireSafeCacheRoot();
  const taskId = randomBytes(24).toString("base64url");
  const directory = path.join(root, taskId);
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  let finishStartup = () => {};
  const startupDone = new Promise<void>((resolve) => {
    finishStartup = resolve;
  });
  const task: CompatibleTask = {
    id: taskId,
    ownerUserId,
    sessionDeviceKey,
    directory,
    directoryIdentity: captureTaskDirectoryIdentity(directory),
    createdAt: Date.now(),
    lastAccessAt: Date.now(),
    state: "probing",
    mode: null,
    process: null,
    errorCode: null,
    rememberCancellation: false,
    startupDone,
    finishStartup,
    startupSettled: false,
    cleanupPromise: null,
  };
  manager.tasks.set(taskId, task);

  let result: {
    taskId: string;
    mode: CompatibleMode;
    playlistUrl: string;
  } | null = null;
  let failure: unknown = null;
  try {
    const resolved = await resolvePlayableEpisodeFile({
      userId: ownerUserId,
      animeId,
      episode,
    });
    requireTaskActive(task);
    if (!resolved.ok) {
      throw new MediaCompatibilityError(
        resolved.error,
        resolved.status,
        resolved.message,
      );
    }
    const executable = await getVerifiedFfmpeg();
    requireTaskActive(task);
    const probe = await probeMedia(executable, resolved.file.absPath, task);
    requireTaskActive(task);
    const preferredMode: CompatibleMode = ["h264", "hevc", "h265"].includes(
      probe.videoCodec,
    )
      ? "remux"
      : "transcode";
    requireTaskActive(task);
    void runTask({
      executable,
      inputPath: resolved.file.absPath,
      task,
      probe,
      preferredMode,
    }).catch((error) => {
      if (manager.tasks.get(task.id) !== task || taskWasCancelled(task)) return;
      task.state = "failed";
      task.errorCode =
        error instanceof MediaCompatibilityError ? error.code : "ffmpeg_failed";
    });
    await waitForPlaylist(task);
    requireTaskActive(task);
    result = {
      taskId,
      mode: task.mode ?? preferredMode,
      playlistUrl: `/api/player/compatible/${taskId}/playlist`,
    };
  } catch (error) {
    failure = error;
  } finally {
    finishTaskStartup(task);
  }
  if (failure) {
    await stopAndCleanupTask(task, false);
    throw failure;
  }
  if (!result) {
    await stopAndCleanupTask(task, false);
    throw new MediaCompatibilityError(
      "compatible_failed",
      500,
      "兼容播放启动失败",
    );
  }
  return result;
}

function forbiddenTask(): never {
  throw new MediaCompatibilityError(
    "compatible_forbidden",
    403,
    "当前设备无权访问这个兼容播放任务",
  );
}

function requireOwnedTask(
  taskId: string,
  requester: MediaTaskIdentity,
): CompatibleTask {
  if (!isCompatibleTaskId(taskId)) {
    throw new MediaCompatibilityError("compatible_not_found", 404, "兼容播放任务不存在");
  }
  const task = manager.tasks.get(taskId);
  if (!task) {
    const tombstone = manager.tombstones.get(taskId);
    if (cancelledMediaTaskAccess(tombstone, requester) === "forbidden") forbiddenTask();
    throw new MediaCompatibilityError("compatible_not_found", 404, "兼容播放任务不存在");
  }
  if (!mediaTaskIdentityMatches(task, requester)) forbiddenTask();
  if (task.state === "failed" || task.state === "cancelling") {
    throw new MediaCompatibilityError("compatible_not_found", 404, "兼容播放任务不存在");
  }
  if (!taskDirectoryIsSafe(task)) {
    throw new MediaCompatibilityError(
      "media_cache_unsafe",
      503,
      "兼容播放缓存目录未通过安全检查",
    );
  }
  task.lastAccessAt = Date.now();
  return task;
}

function resolveSafeTaskFile(
  task: CompatibleTask,
  candidateName: string,
): { absPath: string; size: number } | null {
  if (!taskDirectoryIsSafe(task)) return null;
  const absPath = path.resolve(task.directory, candidateName);
  if (path.dirname(absPath) !== task.directory) return null;
  try {
    const entry = lstatSync(absPath);
    const realPath = realpathSync(absPath);
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      path.dirname(realPath) !== task.directoryIdentity.realPath
    ) {
      return null;
    }
    return { absPath: realPath, size: entry.size };
  } catch {
    return null;
  }
}

export function readCompatiblePlaylist(
  taskId: string,
  requester: MediaTaskIdentity,
): string {
  const task = requireOwnedTask(taskId, requester);
  const playlistFile = resolveSafeTaskFile(task, PLAYLIST_NAME);
  if (!playlistFile) {
    throw new MediaCompatibilityError("compatible_pending", 425, "兼容播放仍在准备中");
  }
  let playlist: string;
  try {
    playlist = readFileSync(playlistFile.absPath, "utf8");
  } catch {
    throw new MediaCompatibilityError("compatible_pending", 425, "兼容播放仍在准备中");
  }
  const lines = playlist.split(/\r?\n/).map((line) => {
    if (line.startsWith("#EXT-X-MAP:")) {
      return line.replace(/URI="([^"]+)"/, (_match, uri: string) => {
        const name = path.basename(uri);
        if (!isCompatibleAssetName(name) || name !== "init.mp4") {
          throw new MediaCompatibilityError("compatible_manifest_invalid", 500, "兼容播放清单异常");
        }
        return `URI="asset/${name}"`;
      });
    }
    if (!line || line.startsWith("#")) return line;
    const name = path.basename(line.trim());
    if (!isCompatibleAssetName(name) || name === "init.mp4") {
      throw new MediaCompatibilityError("compatible_manifest_invalid", 500, "兼容播放清单异常");
    }
    return `asset/${name}`;
  });
  return lines.join("\n");
}

export function resolveCompatibleAsset(
  taskId: string,
  assetName: string,
  requester: MediaTaskIdentity,
): { absPath: string; contentType: string; size: number } {
  if (!isCompatibleAssetName(assetName)) {
    throw new MediaCompatibilityError("compatible_asset_not_found", 404, "兼容播放分片不存在");
  }
  const task = requireOwnedTask(taskId, requester);
  const asset = resolveSafeTaskFile(task, assetName);
  if (!asset) {
    throw new MediaCompatibilityError("compatible_asset_not_found", 404, "兼容播放分片不存在");
  }
  return {
    absPath: asset.absPath,
    contentType: assetName.endsWith(".mp4") ? "video/mp4" : "video/iso.segment",
    size: asset.size,
  };
}

export async function cancelCompatiblePlayback(
  taskId: string,
  requester: MediaTaskIdentity,
): Promise<"cancelled" | "pending" | "already_cancelled"> {
  cleanupExpiredTasks();
  if (!isCompatibleTaskId(taskId)) {
    throw new MediaCompatibilityError("compatible_not_found", 404, "兼容播放任务不存在");
  }
  const task = manager.tasks.get(taskId);
  if (!task) {
    const tombstone = manager.tombstones.get(taskId);
    const access = cancelledMediaTaskAccess(tombstone, requester);
    if (access === "missing") {
      throw new MediaCompatibilityError("compatible_not_found", 404, "兼容播放任务不存在");
    }
    if (access === "forbidden") forbiddenTask();
    return "already_cancelled";
  }
  if (!mediaTaskIdentityMatches(task, requester)) forbiddenTask();
  return stopAndCleanupTask(task, true);
}

export function mediaCompatibilityErrorResponse(
  error: unknown,
  options: { isLocalHost?: boolean } = {},
): Response {
  const normalized =
    error instanceof MediaCompatibilityError
      ? error
      : new MediaCompatibilityError("compatible_failed", 500, "兼容播放启动失败");
  const message =
    process.env.ANIME_LOCAL_SERVER_APP === "1" &&
    options.isLocalHost === false &&
    normalized.code.startsWith("ffmpeg_")
      ? "宿主机未安装兼容播放组件"
      : normalized.message;
  return Response.json(
    { error: normalized.code, message },
    {
      status: normalized.status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(normalized.status === 425 ? { "Retry-After": "1" } : {}),
      },
    },
  );
}
