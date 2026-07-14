export {};

declare global {
  type DesktopOnboardingMode = "new" | "upgrade";

  interface DesktopSettingsState {
    available: true;
    downloadDir: string;
    freeSpaceBytes: number | null;
    directoryWritable: boolean;
    directoryError: string | null;
    closeToTray: boolean;
    onboardingComplete: boolean;
    onboardingMode: DesktopOnboardingMode;
    runtime?: "windows-desktop" | "macos-local-web";
    lanAccess?: boolean;
    lanUrls?: string[];
    pairedDevices?: Array<{
      id: string;
      name: string;
      createdAt: number;
      lastSeenAt: number;
    }>;
    pairing?: { active: true; expiresAt: number } | null;
  }

  interface DesktopSettingsSaveInput {
    downloadDir: string;
    closeToTray: boolean;
    completeOnboarding?: boolean;
    lanAccess?: boolean;
  }

  interface DesktopSettingsSaveResult {
    ok: boolean;
    error?: string;
    settings?: DesktopSettingsState;
  }

  interface DesktopDirectoryChoice {
    canceled: boolean;
    downloadDir?: string;
    freeSpaceBytes?: number;
    error?: string;
  }

  interface DesktopMediaDirectoryChoice {
    canceled: boolean;
    directoryPath?: string;
  }

  interface DesktopMediaDirectoryInput {
    defaultPath?: string;
    kind?: "anime" | "cinema";
  }

  interface DesktopWindowState {
    isMaximized: boolean;
  }

  interface DesktopWindowActionResult {
    ok: boolean;
  }

  type DesktopDownloadServiceStatus =
    | "starting"
    | "ready"
    | "recovering"
    | "failed";

  interface DesktopDownloadServiceState {
    status: DesktopDownloadServiceStatus;
    message: string | null;
    retrying: boolean;
  }

  interface DesktopDownloadServiceRetryResult {
    ok: boolean;
    state: DesktopDownloadServiceState;
  }

  interface Window {
    bandiDesktop?: {
      getSettings(): Promise<DesktopSettingsState>;
      chooseDownloadDirectory(): Promise<DesktopDirectoryChoice>;
      chooseMediaDirectory(
        input?: DesktopMediaDirectoryInput,
      ): Promise<DesktopMediaDirectoryChoice>;
      saveSettings(
        input: DesktopSettingsSaveInput,
      ): Promise<DesktopSettingsSaveResult>;
      getDownloadServiceState(): Promise<DesktopDownloadServiceState>;
      retryDownloadService(): Promise<DesktopDownloadServiceRetryResult>;
      getWindowState(): Promise<DesktopWindowState>;
      minimizeWindow(): Promise<DesktopWindowActionResult>;
      toggleMaximizeWindow(): Promise<DesktopWindowState>;
      closeWindow(): Promise<DesktopWindowActionResult>;
      onWindowStateChange(
        callback: (state: DesktopWindowState) => void,
      ): () => void;
      onDownloadServiceStateChange(
        callback: (state: DesktopDownloadServiceState) => void,
      ): () => void;
      createPairing?(): Promise<{
        ok: boolean;
        error?: string;
        code?: string;
        expiresAt?: number;
        urls?: string[];
      }>;
      revokeDevice?(deviceId: string): Promise<{ ok: boolean }>;
    };
  }
}
