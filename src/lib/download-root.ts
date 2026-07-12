import {
  accessSync,
  constants,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";

export type DownloadRootResult =
  | { ok: true; path: string }
  | { ok: false; message: string };

interface DownloadRootEnvironment {
  ANIME_DESKTOP_APP?: string;
  DESKTOP_CONFIG_PATH?: string;
  DOWNLOAD_ROOT?: string;
}

export function isFullyQualifiedWindowsPath(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const candidate = value.trim();
  if (/^[\\/]{2}[?.][\\/]/.test(candidate)) return false;
  const hasDriveRoot = /^[A-Za-z]:[\\/]/.test(candidate);
  const hasCompleteUncRoot =
    /^[\\/]{2}[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(candidate);
  return (
    (hasDriveRoot || hasCompleteUncRoot) &&
    path.win32.isAbsolute(candidate)
  );
}

export function isSafeAbsoluteWindowsPath(value: unknown): value is string {
  if (!isFullyQualifiedWindowsPath(value)) return false;
  const normalized = path.win32.normalize(value.trim());
  return normalized !== path.win32.parse(normalized).root;
}

export function resolveDownloadRoot(
  env: DownloadRootEnvironment = {
    ANIME_DESKTOP_APP: process.env.ANIME_DESKTOP_APP,
    DESKTOP_CONFIG_PATH: process.env.DESKTOP_CONFIG_PATH,
    DOWNLOAD_ROOT: process.env.DOWNLOAD_ROOT,
  },
): DownloadRootResult {
  let configured: string | undefined;
  let desktopConfigPath: string | undefined;

  if (env.ANIME_DESKTOP_APP === "1") {
    const configPath = env.DESKTOP_CONFIG_PATH?.trim();
    if (!configPath) {
      return {
        ok: false,
        message: "桌面配置路径不可用：DESKTOP_CONFIG_PATH 未配置。",
      };
    }
    if (!isSafeAbsoluteWindowsPath(configPath)) {
      return {
        ok: false,
        message: `桌面配置路径不可用：${configPath} 必须是完整的 Windows 盘符或 UNC 路径，且不能使用根目录。`,
      };
    }
    desktopConfigPath = path.win32.normalize(configPath);
    try {
      const config = JSON.parse(readFileSync(desktopConfigPath, "utf8")) as {
        downloadDir?: unknown;
      };
      configured =
        typeof config.downloadDir === "string"
          ? config.downloadDir.trim()
          : undefined;
    } catch (error) {
      return {
        ok: false,
        message: `桌面配置路径不可用：${configPath}（${errorMessage(error)}）。`,
      };
    }
  } else {
    configured = env.DOWNLOAD_ROOT?.trim();
  }

  if (!configured) {
    return {
      ok: false,
      message: desktopConfigPath
        ? `下载目录不可用：${desktopConfigPath} 没有有效的 downloadDir。`
        : "下载目录不可用：DOWNLOAD_ROOT 未配置。",
    };
  }
  if (!isSafeAbsoluteWindowsPath(configured)) {
    return {
      ok: false,
      message: `下载目录不可用：${configured} 必须是完整的 Windows 盘符或 UNC 子目录。`,
    };
  }

  const downloadRoot = path.win32.normalize(configured);

  try {
    if (!statSync(downloadRoot).isDirectory()) {
      return {
        ok: false,
        message: `下载目录不可用：${downloadRoot} 不是文件夹。`,
      };
    }
    accessSync(downloadRoot, constants.R_OK | constants.W_OK);
  } catch (error) {
    return {
      ok: false,
      message: `下载目录不可用：${downloadRoot}（${errorMessage(error)}）。`,
    };
  }
  return { ok: true, path: downloadRoot };
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String(error.code);
  }
  return error instanceof Error ? error.message : "unknown";
}
