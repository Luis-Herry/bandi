import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import packageJson from "../../package.json";
import { normalizeBuildId } from "@/lib/app-version";

export interface AppBuildIdentity {
  buildId: string | null;
  appVersion: string;
}

let cachedIdentity: AppBuildIdentity | null = null;

export function getAppBuildIdentity(): AppBuildIdentity {
  if (cachedIdentity) return cachedIdentity;

  const buildId =
    process.env.NODE_ENV === "production"
      ? readProductionBuildId()
      : "development";
  cachedIdentity = {
    buildId,
    appVersion: packageJson.version,
  };
  return cachedIdentity;
}

function readProductionBuildId(): string | null {
  const injected = normalizeBuildId(process.env.BANDI_BUILD_ID);
  if (injected) return injected;

  const candidates = [
    path.join(process.cwd(), ".next", "BUILD_ID"),
    path.join(process.cwd(), ".next", "standalone", ".next", "BUILD_ID"),
  ];
  for (const candidate of candidates) {
    try {
      const buildId = normalizeBuildId(readFileSync(candidate, "utf8"));
      if (buildId) return buildId;
    } catch {
      // A missing build id disables the notice instead of presenting a false update.
    }
  }
  return null;
}
