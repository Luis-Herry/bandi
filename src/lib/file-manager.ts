import { spawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import path from "node:path";

interface FileManagerLaunchOptions {
  selectFile?: boolean;
  platform?: NodeJS.Platform;
  windowsRoot?: string;
}

interface FileManagerLaunch {
  command: string;
  args: string[];
}

interface FileManagerChildProcess {
  once(event: "error" | "spawn", listener: () => void): FileManagerChildProcess;
  unref(): void;
}

type FileManagerSpawner = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => FileManagerChildProcess;

export function isPathWithinRoot(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

export function buildFileManagerLaunch(
  targetPath: string,
  {
    selectFile = false,
    platform = process.platform,
    windowsRoot = process.env.SystemRoot || process.env.WINDIR,
  }: FileManagerLaunchOptions = {},
): FileManagerLaunch | null {
  if (platform === "darwin") {
    return {
      command: "/usr/bin/open",
      args: selectFile ? ["-R", targetPath] : [targetPath],
    };
  }

  if (platform !== "win32" || !windowsRoot || !path.win32.isAbsolute(windowsRoot)) {
    return null;
  }

  return {
    command: path.win32.join(windowsRoot, "explorer.exe"),
    args: selectFile ? ["/select,", targetPath] : [targetPath],
  };
}

export async function openInFileManager(
  targetPath: string,
  {
    selectFile = false,
    platform = process.platform,
    windowsRoot = process.env.SystemRoot || process.env.WINDIR,
    spawnProcess = spawn,
  }: FileManagerLaunchOptions & { spawnProcess?: FileManagerSpawner } = {},
): Promise<boolean> {
  const launch = buildFileManagerLaunch(targetPath, {
    selectFile,
    platform,
    windowsRoot,
  });
  if (!launch) return false;

  try {
    return await new Promise<boolean>((resolve) => {
      const child = spawnProcess(launch.command, launch.args, {
        detached: true,
        shell: false,
        stdio: "ignore",
        windowsHide: false,
      });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    });
  } catch {
    return false;
  }
}
