const command = process.argv[2];
const port = Number(process.argv[3]);
const args = process.argv.slice(4);

if (!command || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("usage: cdp-client.mjs <command> <port> [...args]");
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const RPC_TIMEOUT_MS = 15_000;

async function findPage(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(
          (target) => target?.type === "page" && typeof target.webSocketDebuggerUrl === "string",
        );
        if (page) return page;
      }
    } catch {}
    await delay(1_000);
  }
  throw new Error("Electron CDP page did not become available");
}

async function connect(pageTimeoutMs) {
  const page = await findPage(pageTimeoutMs);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("CDP WebSocket open timed out")), 10_000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("CDP WebSocket failed to open"));
    }, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(waiter.timeout);
    if (message.error) waiter.reject(new Error(message.error.message || "CDP request failed"));
    else waiter.resolve(message.result);
  });

  socket.addEventListener("close", () => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("CDP WebSocket closed"));
    }
    pending.clear();
  });

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timeout = setTimeout(() => {
      if (!pending.delete(id)) return;
      reject(new Error(`CDP request timed out: ${method}`));
    }, RPC_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeout });
    try {
      socket.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      clearTimeout(timeout);
      pending.delete(id);
      reject(error);
    }
  });

  const evaluate = async (expression, awaitPromise = true) => {
    const response = await call("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || "Runtime evaluation failed");
    }
    return response.result?.value;
  };

  const close = () => {
    try {
      socket.close();
    } catch {}
  };

  return { call, close, evaluate, page };
}

function safeState(state) {
  return {
    mode: state?.mode ?? null,
    status: state?.status ?? null,
    action: state?.action ?? null,
    currentVersion: state?.currentVersion ?? null,
    availableVersion: state?.availableVersion ?? null,
    progressPercent: state?.progressPercent ?? null,
  };
}

async function waitForBridge(client, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const snapshot = await client.evaluate(`(async () => {
        const href = location.href;
        const trustedPage = /^http:\\/\\/(?:127\\.0\\.0\\.1|localhost):\\d+(?:\\/|$)/.test(href);
        const bridgeReady = Boolean(
          window.bandiDesktop?.getUpdateState &&
          window.bandiDesktop?.checkForUpdates &&
          window.bandiDesktop?.installUpdate
        );
        if (!trustedPage || !bridgeReady) return { ready: false, href };
        const state = await window.bandiDesktop.getUpdateState();
        return {
          ready: Boolean(
            state &&
            typeof state.mode === "string" &&
            typeof state.status === "string"
          ),
          href,
          state,
        };
      })()`);
      last = snapshot?.state ? safeState(snapshot.state) : null;
      if (snapshot?.ready) return last;
    } catch {}
    await delay(1_000);
  }
  throw new Error(`Trusted Bandi page did not become ready; last=${JSON.stringify(last)}`);
}

async function readState(client, timeoutMs = 180_000) {
  return await waitForBridge(client, timeoutMs);
}

async function waitForPath(client, pathname, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await client.evaluate(`location.pathname === ${JSON.stringify(pathname)}`)) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`Timed out waiting for navigation to ${pathname}`);
}

async function waitForNotice(client, expectedLabel, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      await waitForBridge(client, 15_000);
      last = await client.evaluate(`(() => {
        const notice = document.querySelector('aside[role="status"]');
        const button = notice?.querySelector('button');
        const style = notice ? getComputedStyle(notice) : null;
        return {
          found: Boolean(notice),
          buttonMatches: button?.textContent?.trim() === ${JSON.stringify(expectedLabel)},
          positionFixed: style?.position === 'fixed',
        };
      })()`);
      if (last?.found && last?.buttonMatches && last?.positionFixed) return last;
    } catch {}
    await delay(500);
  }
  return last || { found: false, buttonMatches: false, positionFixed: false };
}

async function waitForState(client, expectedStatus, expectedVersion, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const remainingMs = Math.max(1, deadline - Date.now());
      last = await readState(client, Math.min(15_000, remainingMs));
      const checkResult = await client.evaluate(
        "window.__bandiAcceptanceLastCheck ?? null",
      );
      if (checkResult?.pending === false && checkResult?.ok === false) {
        throw new Error("Bandi update check request failed");
      }
      if (last.status === "error") throw new Error("Bandi reported an update error");
      const versionMatches = expectedVersion === "-" ||
        last.availableVersion === expectedVersion ||
        last.currentVersion === expectedVersion;
      if (last.status === expectedStatus && versionMatches) return last;
    } catch (error) {
      const message = String(error?.message);
      if (
        message.includes("reported an update error") ||
        message.includes("update check request failed")
      ) throw error;
    }
    await delay(1_000);
  }
  throw new Error(`Timed out waiting for ${expectedStatus}; last=${JSON.stringify(last)}`);
}

const requestedPageTimeout = command === "state" && args[0] ? Number(args[0]) : 180_000;
if (
  !Number.isInteger(requestedPageTimeout) ||
  requestedPageTimeout < 30_000 ||
  requestedPageTimeout > 900_000
) {
  throw new Error("page timeout must be between 30000 and 900000 milliseconds");
}

const client = await connect(requestedPageTimeout);
try {
  if (command === "state") {
    process.stdout.write(`${JSON.stringify(await readState(client))}\n`);
  } else if (command === "trigger-check") {
    await waitForBridge(client);
    await client.evaluate(`(() => {
      window.__bandiAcceptanceLastCheck = { pending: true };
      void window.bandiDesktop.checkForUpdates().then(
        (result) => {
          window.__bandiAcceptanceLastCheck = {
            pending: false,
            ok: Boolean(result?.ok),
            error: result?.error ?? null,
          };
        },
        () => {
          window.__bandiAcceptanceLastCheck = {
            pending: false,
            ok: false,
            error: "rejected",
          };
        },
      );
      return "started";
    })()`, false);
    process.stdout.write('{"started":true}\n');
  } else if (command === "wait-state") {
    const [status, version, rawTimeout = "900000"] = args;
    const timeoutMs = Number(rawTimeout);
    if (!status || !version || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error("wait-state requires status, version, and timeout milliseconds");
    }
    process.stdout.write(`${JSON.stringify(await waitForState(client, status, version, timeoutMs))}\n`);
  } else if (command === "navigate") {
    const [pathname] = args;
    if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//")) {
      throw new Error("navigate requires one safe absolute pathname");
    }
    await waitForBridge(client);
    const origin = await client.evaluate("location.origin");
    if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin)) {
      throw new Error("navigate requires a trusted Bandi origin");
    }
    const url = new URL(pathname, origin).toString();
    await client.call("Page.navigate", { url });
    await waitForPath(client, pathname);
    await waitForBridge(client);
    process.stdout.write('{"navigated":true}\n');
  } else if (command === "notice") {
    const [expectedLabel] = args;
    if (!expectedLabel) throw new Error("notice requires an expected button label");
    const result = await waitForNotice(client, expectedLabel);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (command === "trigger-install") {
    await waitForBridge(client);
    await client.evaluate("void window.bandiDesktop.installUpdate().catch(() => {}); 'started'", false);
    process.stdout.write('{"started":true}\n');
  } else if (command === "close") {
    await waitForBridge(client);
    await client.evaluate("void window.bandiDesktop.closeWindow().catch(() => {}); 'started'", false);
    process.stdout.write('{"started":true}\n');
  } else {
    throw new Error(`Unknown CDP command: ${command}`);
  }
} finally {
  client.close();
}
