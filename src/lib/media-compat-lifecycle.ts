import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

export interface MediaTaskIdentity {
  ownerUserId: string;
  sessionDeviceKey: string;
}

export interface MediaDirectoryIdentity {
  literalPath: string;
  realPath: string;
  device: number;
  inode: number;
}

function sameFilesystemPath(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const normalized = path.normalize(value);
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  return normalize(left) === normalize(right);
}

export function readSafeMediaDirectoryIdentity(
  directory: string,
): MediaDirectoryIdentity | null {
  const literalPath = path.resolve(directory);
  try {
    const entry = lstatSync(literalPath);
    const realPath = realpathSync(literalPath);
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      !sameFilesystemPath(literalPath, realPath)
    ) {
      return null;
    }
    return {
      literalPath,
      realPath,
      device: entry.dev,
      inode: entry.ino,
    };
  } catch {
    return null;
  }
}

export function mediaDirectoryIdentityMatches(
  directory: string,
  expected: MediaDirectoryIdentity,
): boolean {
  const current = readSafeMediaDirectoryIdentity(directory);
  return (
    !!current &&
    sameFilesystemPath(current.literalPath, expected.literalPath) &&
    sameFilesystemPath(current.realPath, expected.realPath) &&
    current.device === expected.device &&
    current.inode === expected.inode
  );
}

export function createMediaSessionIdentity({
  userId,
  isLocalHost,
  localDeviceId,
}: {
  userId: string;
  isLocalHost: boolean;
  localDeviceId?: string;
}): MediaTaskIdentity {
  const deviceIdentity = isLocalHost
    ? `host:${userId}`
    : localDeviceId
      ? `paired:${userId}:${localDeviceId}`
      : `web-owner:${userId}`;
  return {
    ownerUserId: userId,
    sessionDeviceKey: createHash("sha256")
      .update(deviceIdentity, "utf8")
      .digest("base64url"),
  };
}

export interface KillableMediaProcess {
  exitCode: number | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: "close", listener: () => void): unknown;
}

export type MediaTaskLimitState =
  | "probing"
  | "processing"
  | "ready"
  | "complete"
  | "failed"
  | "cancelling";

export function mediaTaskIdentityMatches(
  owner: MediaTaskIdentity,
  requester: MediaTaskIdentity,
): boolean {
  return (
    owner.ownerUserId === requester.ownerUserId &&
    owner.sessionDeviceKey === requester.sessionDeviceKey
  );
}

export function cancelledMediaTaskAccess(
  tombstone: MediaTaskIdentity | undefined,
  requester: MediaTaskIdentity,
): "missing" | "already_cancelled" | "forbidden" {
  if (!tombstone) return "missing";
  return mediaTaskIdentityMatches(tombstone, requester)
    ? "already_cancelled"
    : "forbidden";
}

export function mediaTaskCountsAgainstLimit(state: MediaTaskLimitState): boolean {
  return ["probing", "processing", "ready", "cancelling"].includes(state);
}

export function mediaTaskCanContinue(
  registered: boolean,
  state: MediaTaskLimitState,
): boolean {
  return registered && state !== "cancelling";
}

export async function stopMediaTaskProcess({
  process,
  timeoutMs,
  finalize,
}: {
  process: KillableMediaProcess | null;
  timeoutMs: number;
  finalize: () => void;
}): Promise<"cancelled" | "pending"> {
  let finalized = false;
  const finish = () => {
    if (finalized) return;
    finalized = true;
    finalize();
  };

  if (!process || process.exitCode !== null) {
    finish();
    return "cancelled";
  }

  const closed = new Promise<void>((resolve) => {
    process.once("close", resolve);
  });
  void closed.then(finish);

  try {
    process.kill("SIGKILL");
  } catch {}

  let timer: NodeJS.Timeout | null = null;
  const completed = await Promise.race([
    closed.then(() => true),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
      timer.unref();
    }),
  ]);
  if (timer) clearTimeout(timer);
  if (completed) {
    finish();
    return "cancelled";
  }
  return "pending";
}

export function beginMediaTaskShutdown({
  process,
  startupDone,
  processWaitMs,
  finalize,
}: {
  process: KillableMediaProcess | null;
  startupDone: Promise<void>;
  processWaitMs: number;
  finalize: () => void;
}): Promise<void> {
  let finishProcess = () => {};
  const processDone = new Promise<void>((resolve) => {
    finishProcess = resolve;
  });
  void stopMediaTaskProcess({
    process,
    timeoutMs: processWaitMs,
    finalize: finishProcess,
  });
  return Promise.all([startupDone, processDone]).then(() => finalize());
}

export async function waitForMediaTaskShutdown(
  cleanup: Promise<void>,
  timeoutMs: number,
): Promise<"cancelled" | "pending"> {
  let timer: NodeJS.Timeout | null = null;
  const result = await Promise.race([
    cleanup.then(() => "cancelled" as const),
    new Promise<"pending">((resolve) => {
      timer = setTimeout(() => resolve("pending"), timeoutMs);
      timer.unref();
    }),
  ]);
  if (timer) clearTimeout(timer);
  return result;
}
