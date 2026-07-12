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
  }

  interface DesktopSettingsSaveInput {
    downloadDir: string;
    closeToTray: boolean;
    completeOnboarding?: boolean;
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
      getWindowState(): Promise<DesktopWindowState>;
      minimizeWindow(): Promise<DesktopWindowActionResult>;
      toggleMaximizeWindow(): Promise<DesktopWindowState>;
      closeWindow(): Promise<DesktopWindowActionResult>;
      onWindowStateChange(
        callback: (state: DesktopWindowState) => void,
      ): () => void;
    };
  }
}
