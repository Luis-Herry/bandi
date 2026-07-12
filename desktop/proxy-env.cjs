const LOCAL_NO_PROXY_HOSTS = ["127.0.0.1", "localhost", "::1"];

function mergeNoProxy(value) {
  const entries = String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const seen = new Set(entries.map((entry) => entry.toLowerCase()));

  for (const host of LOCAL_NO_PROXY_HOSTS) {
    if (seen.has(host.toLowerCase())) continue;
    entries.push(host);
    seen.add(host.toLowerCase());
  }

  return entries.join(",");
}

function buildNextProxyEnv(env, fallbackProxyUrl = null) {
  const noProxy = mergeNoProxy(env.NO_PROXY || env.no_proxy);
  const hasConfiguredProxy = Boolean(
    env.HTTPS_PROXY ||
      env.HTTP_PROXY ||
      env.https_proxy ||
      env.http_proxy,
  );
  const proxyEnv = {
    NO_PROXY: noProxy,
    no_proxy: noProxy,
  };

  if (!hasConfiguredProxy && fallbackProxyUrl) {
    proxyEnv.HTTP_PROXY = fallbackProxyUrl;
    proxyEnv.HTTPS_PROXY = fallbackProxyUrl;
  }

  return proxyEnv;
}

module.exports = { buildNextProxyEnv, mergeNoProxy };
