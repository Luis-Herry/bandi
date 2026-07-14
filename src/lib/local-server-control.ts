import "server-only";

interface ControlResult {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

function controlConfiguration() {
  const url = process.env.BANDI_CONTROL_URL?.trim();
  const token = process.env.BANDI_CONTROL_TOKEN?.trim();
  if (process.env.ANIME_LOCAL_SERVER_APP !== "1" || !url || !token) {
    throw new Error("local_control_unavailable");
  }
  return { url: url.replace(/\/$/, ""), token };
}

export async function localControlRequest<T extends ControlResult>(
  pathname: string,
  init: RequestInit = {},
): Promise<T> {
  const { url, token } = controlConfiguration();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${url}${pathname}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  const value = (await response.json().catch(() => ({ error: "invalid_response" }))) as T;
  if (!response.ok && response.status >= 500) {
    throw new Error(value.error || `local_control_http_${response.status}`);
  }
  return value;
}

export async function authorizeLocalHost(token: string) {
  return localControlRequest<{ ok: boolean }>("/auth/host", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function pairLocalDevice(code: string, name: string) {
  return localControlRequest<{
    ok: boolean;
    error?: string;
    device?: {
      id: string;
      name: string;
      revision: number;
    };
  }>("/auth/pair", {
    method: "POST",
    body: JSON.stringify({ code, name }),
  });
}

export async function isLocalDeviceActive(deviceId: string, revision: number) {
  const result = await localControlRequest<{ active: boolean }>(
    `/auth/device/${encodeURIComponent(deviceId)}?revision=${encodeURIComponent(String(revision))}`,
  );
  return result.active;
}
