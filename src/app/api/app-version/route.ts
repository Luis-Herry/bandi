import { NextResponse } from "next/server";
import { getAppBuildIdentity } from "@/lib/app-build";
import { APP_VERSION_SCHEMA } from "@/lib/app-version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const identity = getAppBuildIdentity();
  return NextResponse.json(
    {
      schema: APP_VERSION_SCHEMA,
      buildId: identity.buildId,
      appVersion: identity.appVersion,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
