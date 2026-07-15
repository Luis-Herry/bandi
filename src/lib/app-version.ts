export const APP_VERSION_SCHEMA = 1 as const;

export interface AppVersionPayload {
  schema: typeof APP_VERSION_SCHEMA;
  buildId: string | null;
  appVersion: string;
}

export interface VersionCheckState {
  candidateBuildId: string | null;
  consecutiveMatches: number;
  readyBuildId: string | null;
}

const BUILD_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/u;

export function normalizeBuildId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return BUILD_ID_PATTERN.test(normalized) ? normalized : null;
}

export function isVersionDetectionEnabled(buildId: unknown): boolean {
  const normalized = normalizeBuildId(buildId);
  return normalized != null && normalized !== "development";
}

export function parseAppVersionPayload(value: unknown): AppVersionPayload | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AppVersionPayload>;
  if (candidate.schema !== APP_VERSION_SCHEMA) return null;
  const buildId = normalizeBuildId(candidate.buildId);
  if (!buildId) return null;
  return {
    schema: APP_VERSION_SCHEMA,
    buildId,
    appVersion:
      typeof candidate.appVersion === "string" ? candidate.appVersion : "",
  };
}

export function createVersionCheckState(): VersionCheckState {
  return {
    candidateBuildId: null,
    consecutiveMatches: 0,
    readyBuildId: null,
  };
}

export function observeBuildId(
  baselineBuildId: string,
  state: VersionCheckState,
  observedBuildId: string | null,
): VersionCheckState {
  if (state.readyBuildId) return state;
  if (!observedBuildId || observedBuildId === baselineBuildId) {
    return createVersionCheckState();
  }

  const consecutiveMatches =
    state.candidateBuildId === observedBuildId
      ? state.consecutiveMatches + 1
      : 1;
  return {
    candidateBuildId: observedBuildId,
    consecutiveMatches,
    readyBuildId: consecutiveMatches >= 2 ? observedBuildId : null,
  };
}
