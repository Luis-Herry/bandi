const crypto = require("node:crypto");
const http = require("node:http");

const MAX_BODY_BYTES = 32 * 1024;

function safeTokenEqual(expected, received) {
  if (!expected || !received || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    request.on("data", (chunk) => {
      length += chunk.length;
      if (length > MAX_BODY_BYTES) {
        reject(new Error("request_too_large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    request.on("error", reject);
  });
}

function createControlServer({ token, handlers }) {
  if (!token) throw new Error("control token is required");
  const server = http.createServer(async (request, response) => {
    const authorization = request.headers.authorization || "";
    const received = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!safeTokenEqual(token, received)) {
      sendJson(response, 401, { error: "unauthorized" });
      return;
    }

    const url = new URL(request.url || "/", "http://127.0.0.1");
    try {
      if (request.method === "GET" && url.pathname === "/settings") {
        sendJson(response, 200, await handlers.getSettings());
        return;
      }
      if (request.method === "PUT" && url.pathname === "/settings") {
        sendJson(response, 200, await handlers.saveSettings(await readJsonBody(request)));
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/choose-download-directory"
      ) {
        sendJson(response, 200, await handlers.chooseDownloadDirectory());
        return;
      }
      if (request.method === "POST" && url.pathname === "/choose-media-directory") {
        sendJson(
          response,
          200,
          await handlers.chooseMediaDirectory(await readJsonBody(request)),
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/download-service") {
        sendJson(response, 200, await handlers.getDownloadServiceState());
        return;
      }
      if (request.method === "POST" && url.pathname === "/download-service/retry") {
        sendJson(response, 200, await handlers.retryDownloadService());
        return;
      }
      if (request.method === "GET" && url.pathname === "/update") {
        sendJson(response, 200, await handlers.getUpdateState());
        return;
      }
      if (request.method === "POST" && url.pathname === "/update/check") {
        sendJson(response, 200, await handlers.checkForUpdates());
        return;
      }
      if (request.method === "POST" && url.pathname === "/update/install") {
        sendJson(response, 200, await handlers.installUpdate());
        return;
      }
      if (request.method === "POST" && url.pathname === "/update/open-release") {
        sendJson(response, 200, await handlers.openUpdatePage());
        return;
      }
      if (request.method === "POST" && url.pathname === "/pairing") {
        sendJson(response, 200, await handlers.createPairing());
        return;
      }
      if (request.method === "POST" && url.pathname === "/auth/host") {
        const result = await handlers.authorizeHost(await readJsonBody(request));
        sendJson(response, result.ok ? 200 : 401, result);
        return;
      }
      if (request.method === "POST" && url.pathname === "/auth/pair") {
        const result = await handlers.pairDevice(await readJsonBody(request));
        sendJson(response, result.ok ? 200 : 401, result);
        return;
      }
      const deviceMatch = /^\/auth\/device\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && deviceMatch) {
        sendJson(
          response,
          200,
          await handlers.getDeviceState({
            deviceId: decodeURIComponent(deviceMatch[1]),
            revision: Number(url.searchParams.get("revision") || 0),
          }),
        );
        return;
      }
      const revokeMatch = /^\/devices\/([^/]+)$/.exec(url.pathname);
      if (request.method === "DELETE" && revokeMatch) {
        sendJson(
          response,
          200,
          await handlers.revokeDevice(decodeURIComponent(revokeMatch[1])),
        );
        return;
      }
      sendJson(response, 404, { error: "not_found" });
    } catch (error) {
      sendJson(response, 500, {
        error: error?.message || String(error || "unknown"),
      });
    }
  });

  return {
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("control server address unavailable"));
            return;
          }
          resolve(`http://127.0.0.1:${address.port}`);
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { createControlServer, safeTokenEqual };
