const command = process.argv[2];
const port = Number(process.argv[3]);
const args = process.argv.slice(4);

if (!command || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("usage: cdp-client.mjs <command> <port> [...args]");
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findPage(timeoutMs = 180_000) {
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

async function connect() {
  const page = await findPage();
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
    if (message.error) waiter.reject(new Error(message.error.message || "CDP request failed"));
    else waiter.resolve(message.result);
  });

  socket.addEventListener("close", () => {
    for (const waiter of pending.values()) waiter.reject(new Error("CDP WebSocket closed"));
    pending.clear();
  });

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
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
  while (Date.now() < deadline) {
    try {
      const available = await client.evaluate(
        "Boolean(window.bandiDesktop?.getUpdateState && window.bandiDesktop?.checkForUpdates)",
      );
      if (available) return;
    } catch {}
    await delay(1_000);
  }
  throw new Error("Bandi desktop bridge did not become available");
}

async function readState(client) {
  await waitForBridge(client);
  return safeState(await client.evaluate("window.bandiDesktop.getUpdateState()"));
}

async function waitForState(client, expectedStatus, expectedVersion, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await readState(client);
      if (last.status === "error") throw new Error("Bandi reported an update error");
      const versionMatches = expectedVersion === "-" ||
        last.availableVersion === expectedVersion ||
        last.currentVersion === expectedVersion;
      if (last.status === expectedStatus && versionMatches) return last;
    } catch (error) {
      if (String(error?.message).includes("reported an update error")) throw error;
    }
    await delay(1_000);
  }
  throw new Error(`Timed out waiting for ${expectedStatus}; last=${JSON.stringify(last)}`);
}

const client = await connect();
try {
  if (command === "state") {
    process.stdout.write(`${JSON.stringify(await readState(client))}\n`);
  } else if (command === "trigger-check") {
    await waitForBridge(client);
    await client.evaluate("void window.bandiDesktop.checkForUpdates().catch(() => {}); 'started'", false);
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
    const url = new URL(pathname, client.page.url).toString();
    await client.call("Page.navigate", { url });
    await waitForBridge(client);
    process.stdout.write('{"navigated":true}\n');
  } else if (command === "notice") {
    const [expectedLabel] = args;
    if (!expectedLabel) throw new Error("notice requires an expected button label");
    await waitForBridge(client);
    const result = await client.evaluate(`(() => {
      const notice = document.querySelector('aside[role="status"]');
      const button = notice?.querySelector('button');
      const style = notice ? getComputedStyle(notice) : null;
      return {
        found: Boolean(notice),
        buttonMatches: button?.textContent?.trim() === ${JSON.stringify(expectedLabel)},
        positionFixed: style?.position === 'fixed',
      };
    })()`);
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
