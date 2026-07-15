import { spawn } from "node:child_process";
import path from "node:path";

export function isPathWithinRoot(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

export function openInFileManager(
  targetPath: string,
  { selectFile = false }: { selectFile?: boolean } = {},
): boolean {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    return false;
  }
  try {
    const command = process.platform === "darwin" ? "/usr/bin/open" : "explorer.exe";
    const args =
      process.platform === "darwin"
        ? selectFile
          ? ["-R", targetPath]
          : [targetPath]
        : selectFile
          ? ["/select,", targetPath]
          : [targetPath];
    const child = spawn(command, args, {
      detached: true,
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
