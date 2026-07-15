export function getDesktopBridge() {
  if (typeof window === "undefined") return null;
  if (window.bandiDesktop) return window.bandiDesktop;
  if (document.documentElement.dataset.localServerApp !== "true") return null;
  return createLocalServerBridge();
}

async function localRequest<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/local-server${pathname}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const value = await response.json().catch(() => ({ error: "invalid_response" }));
  if (!response.ok) throw new Error(value.error || `local_server_http_${response.status}`);
  return value as T;
}

function createLocalServerBridge(): NonNullable<Window["bandiDesktop"]> {
  return {
    getSettings: () => localRequest<DesktopSettingsState>("/settings"),
    chooseDownloadDirectory: () => localRequest<DesktopDirectoryChoice>(
      "/choose-download-directory",
      { method: "POST", body: "{}" },
    ),
    chooseMediaDirectory: (input) => localRequest<DesktopMediaDirectoryChoice>(
      "/choose-media-directory",
      { method: "POST", body: JSON.stringify(input || {}) },
    ),
    saveSettings: (input) => localRequest<DesktopSettingsSaveResult>("/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
    getDownloadServiceState: () => localRequest<DesktopDownloadServiceState>(
      "/download-service",
    ),
    retryDownloadService: () => localRequest<DesktopDownloadServiceRetryResult>(
      "/download-service/retry",
      { method: "POST", body: "{}" },
    ),
    getUpdateState: () => localRequest<DesktopUpdateState>("/update"),
    checkForUpdates: () => localRequest<DesktopUpdateResult>("/update/check", {
      method: "POST",
      body: "{}",
    }),
    installUpdate: () => localRequest<DesktopUpdateResult>("/update/install", {
      method: "POST",
      body: "{}",
    }),
    openUpdatePage: () => localRequest<DesktopUpdateResult>(
      "/update/open-release",
      { method: "POST", body: "{}" },
    ),
    getWindowState: async () => ({ isMaximized: false }),
    minimizeWindow: async () => ({ ok: false }),
    toggleMaximizeWindow: async () => ({ isMaximized: false }),
    closeWindow: async () => ({ ok: false }),
    onWindowStateChange: () => () => undefined,
    onDownloadServiceStateChange: (callback) => {
      let active = true;
      const poll = async () => {
        while (active) {
          await new Promise((resolve) => window.setTimeout(resolve, 2500));
          if (!active) break;
          if (document.hidden) continue;
          try {
            callback(await localRequest<DesktopDownloadServiceState>("/download-service"));
          } catch {
            // The launcher may be restarting the local service after a LAN change.
          }
        }
      };
      void poll();
      return () => { active = false; };
    },
    onUpdateStateChange: (callback) => {
      let active = true;
      const poll = async () => {
        while (active) {
          await new Promise((resolve) => window.setTimeout(resolve, 2500));
          if (!active) break;
          if (document.hidden) continue;
          try {
            callback(await localRequest<DesktopUpdateState>("/update"));
          } catch {
            // The launcher may be restarting after applying an update.
          }
        }
      };
      void poll();
      return () => { active = false; };
    },
    createPairing: () => localRequest("/pairing", { method: "POST", body: "{}" }),
    revokeDevice: (deviceId) => localRequest(
      `/devices/${encodeURIComponent(deviceId)}`,
      { method: "DELETE" },
    ),
  };
}

export function formatStorageBytes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) return "无法读取";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = unit >= 3 ? 1 : 0;
  return `${size.toFixed(digits)} ${units[unit]}`;
}
