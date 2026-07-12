const EXTERNAL_QBIT_URL = "http://127.0.0.1:18080";
const DIAGNOSTIC_TIMEOUT_MS = 2_500;

export interface ExternalQbitDiagnostic {
  connected: boolean;
  url: typeof EXTERNAL_QBIT_URL;
  version?: string;
  apiVersion?: string;
  authRequired?: boolean;
  error?: string;
}

class ExternalQbitAuthError extends Error {}

async function readPlainText(
  fetchImpl: typeof fetch,
  endpoint: string,
): Promise<string> {
  const response = await fetchImpl(`${EXTERNAL_QBIT_URL}${endpoint}`, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(DIAGNOSTIC_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) {
    throw new ExternalQbitAuthError("external_qbit_auth_required");
  }
  if (!response.ok) throw new Error(`external_qbit_http_${response.status}`);

  const value = (await response.text()).trim();
  if (!value || value.length > 64 || /[<>\r\n]/.test(value)) {
    throw new Error("external_qbit_invalid_response");
  }
  return value;
}

/**
 * Fixed, read-only probe for the separately installed system qBittorrent.
 * It never reuses managed credentials and never reads torrents or preferences.
 */
export async function diagnoseExternalQbit(
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalQbitDiagnostic> {
  try {
    const version = await readPlainText(fetchImpl, "/api/v2/app/version");
    const apiVersion = await readPlainText(fetchImpl, "/api/v2/app/webapiVersion");
    return {
      connected: true,
      url: EXTERNAL_QBIT_URL,
      version,
      apiVersion,
    };
  } catch (error) {
    if (error instanceof ExternalQbitAuthError) {
      return {
        connected: false,
        url: EXTERNAL_QBIT_URL,
        authRequired: true,
        error: "外部 qBittorrent 可访问，但 Web UI 要求登录。",
      };
    }
    return {
      connected: false,
      url: EXTERNAL_QBIT_URL,
      error: "未检测到外部 qBittorrent。",
    };
  }
}
