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

  interface Window {
    bandiDesktop?: {
      getSettings(): Promise<DesktopSettingsState>;
      chooseDownloadDirectory(): Promise<DesktopDirectoryChoice>;
      saveSettings(
        input: DesktopSettingsSaveInput,
      ): Promise<DesktopSettingsSaveResult>;
    };
  }
}
