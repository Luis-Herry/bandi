function getDesktopSessionOrigins(appUrl) {
  const appOrigin = new URL(appUrl);
  const localhostOrigin = new URL(appUrl);
  localhostOrigin.hostname = "localhost";
  return new Set([appOrigin.origin, localhostOrigin.origin]);
}

function withDesktopSessionHeader({
  allowedOrigins,
  requestUrl,
  requestHeaders,
  headerName,
  headerValue,
}) {
  let requestOrigin;
  try {
    requestOrigin = new URL(requestUrl).origin;
  } catch {
    return requestHeaders;
  }

  if (!allowedOrigins.has(requestOrigin)) return requestHeaders;

  return {
    ...requestHeaders,
    [headerName]: headerValue,
  };
}

module.exports = {
  getDesktopSessionOrigins,
  withDesktopSessionHeader,
};
