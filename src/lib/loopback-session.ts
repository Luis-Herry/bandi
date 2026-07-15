const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);

function isLoopbackUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function isLoopbackSessionRequest(request: Request) {
  if (!isLoopbackUrl(request.url)) return false;

  const origin = request.headers.get("origin");
  return !origin || isLoopbackUrl(origin);
}
