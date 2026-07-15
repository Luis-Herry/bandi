import { NextRequest, NextResponse } from "next/server";
import { localControlRequest } from "@/lib/local-server-control";
import { requireLocalHostRouteUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const ROUTES = new Map([
  ["GET:settings", "/settings"],
  ["PUT:settings", "/settings"],
  ["POST:choose-download-directory", "/choose-download-directory"],
  ["POST:choose-media-directory", "/choose-media-directory"],
  ["GET:download-service", "/download-service"],
  ["POST:download-service/retry", "/download-service/retry"],
  ["GET:update", "/update"],
  ["POST:update/check", "/update/check"],
  ["POST:update/install", "/update/install"],
  ["POST:update/open-release", "/update/open-release"],
  ["POST:pairing", "/pairing"],
]);

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (process.env.ANIME_LOCAL_SERVER_APP !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const user = await requireLocalHostRouteUser();
  if (user instanceof Response) return user;
  const { path } = await context.params;
  const key = `${request.method}:${path.join("/")}`;
  let controlPath = ROUTES.get(key);
  const deviceMatch = /^devices\/([^/]+)$/.exec(path.join("/"));
  if (request.method === "DELETE" && deviceMatch) {
    controlPath = `/devices/${encodeURIComponent(deviceMatch[1])}`;
  }
  if (!controlPath) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const body = request.method === "GET"
    ? undefined
    : JSON.stringify(await request.json().catch(() => ({})));
  try {
    const result = await localControlRequest(controlPath, {
      method: request.method,
      body,
    });
    return NextResponse.json(result, {
      status: result.error ? 400 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "local_control_failed" },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
