import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") {
  console.error("Usage: node scripts/run-local-next.mjs <dev|start>");
  process.exit(1);
}

const nextCli = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const child = spawn(
  process.execPath,
  ["--use-env-proxy", nextCli, mode, "-H", "127.0.0.1"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ANIME_LOOPBACK_SESSION: "1",
      AUTH_SECRET:
        process.env.AUTH_SECRET || randomBytes(32).toString("base64url"),
    },
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
