/**
 * Next.js instrumentation hook — runs once at server start.
 * 这里启动 node-cron 调度。仅在 Node runtime 下注册（Edge 没有 fs/sqlite）。
 */

export type ParentLeaseAction = "healthy" | "exit-only" | "shutdown-qbit";

export interface ParentLeaseSequenceState {
  consecutiveExpiredLeases: number;
}

export function classifyParentLease(
  lease: { pid?: number; token?: string; updatedAt?: number } | null,
  expected: { pid: number; token: string; now: number; maxAgeMs: number },
): ParentLeaseAction {
  if (!lease || lease.token !== expected.token || lease.pid !== expected.pid) {
    return "exit-only";
  }
  return expected.now - Number(lease.updatedAt || 0) > expected.maxAgeMs
    ? "shutdown-qbit"
    : "healthy";
}

export function advanceParentLeaseSequence(
  state: ParentLeaseSequenceState,
  action: ParentLeaseAction,
): ParentLeaseSequenceState & { exitOnly: boolean; shutdownQbit: boolean } {
  const consecutiveExpiredLeases = action === "shutdown-qbit"
    ? state.consecutiveExpiredLeases + 1
    : 0;
  return {
    consecutiveExpiredLeases,
    exitOnly: action === "exit-only",
    shutdownQbit:
      action === "shutdown-qbit" && consecutiveExpiredLeases >= 3,
  };
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const leasePath = process.env.BANDI_PARENT_LEASE_PATH;
  const leaseToken = process.env.BANDI_PARENT_LEASE_TOKEN;
  const leaseParentPid = Number(process.env.BANDI_PARENT_LEASE_PID);
  if (
    leasePath &&
    leaseToken &&
    Number.isInteger(leaseParentPid) &&
    leaseParentPid > 0
  ) {
    const { readFileSync } = await import("node:fs");
    const maxAgeMs = Math.max(
      5000,
      Number(process.env.BANDI_PARENT_LEASE_MAX_AGE_MS || 10000),
    );
    let leaseSequence: ParentLeaseSequenceState = {
      consecutiveExpiredLeases: 0,
    };
    let shuttingDown = false;

    const exitManagedRuntime = async (shutdownQbit: boolean) => {
      if (shuttingDown) return;
      shuttingDown = true;
      let confirmedShutdown = false;
      if (shutdownQbit) {
        try {
          const latestLease = JSON.parse(readFileSync(leasePath, "utf8")) as {
            pid?: number;
            token?: string;
            updatedAt?: number;
          };
          confirmedShutdown = classifyParentLease(latestLease, {
            pid: leaseParentPid,
            token: leaseToken,
            now: Date.now(),
            maxAgeMs,
          }) === "shutdown-qbit";
        } catch {
          confirmedShutdown = false;
        }
      }
      const qbitUrl = process.env.QBIT_URL;
      const qbitUser = process.env.QBIT_USER;
      const qbitPassword = process.env.QBIT_PASS;
      if (confirmedShutdown && qbitUrl && qbitUser && qbitPassword) {
        try {
          const login = await fetch(`${qbitUrl}/api/v2/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: qbitUrl,
            },
            body: new URLSearchParams({
              username: qbitUser,
              password: qbitPassword,
            }),
            signal: AbortSignal.timeout(1800),
          });
          const cookie = login.headers.get("set-cookie")?.split(";")[0];
          if (login.ok && cookie) {
            await fetch(`${qbitUrl}/api/v2/app/shutdown`, {
              method: "POST",
              headers: { Cookie: cookie, Referer: qbitUrl },
              signal: AbortSignal.timeout(2500),
            });
          }
        } catch {}
      }
      process.exit(0);
    };

    const checkParentLease = () => {
      let action: ParentLeaseAction = "exit-only";
      try {
        const lease = JSON.parse(readFileSync(leasePath, "utf8")) as {
          pid?: number;
          token?: string;
          updatedAt?: number;
        };
        action = classifyParentLease(lease, {
          pid: leaseParentPid,
          token: leaseToken,
          now: Date.now(),
          maxAgeMs,
        });
      } catch {}
      const nextSequence = advanceParentLeaseSequence(leaseSequence, action);
      leaseSequence = {
        consecutiveExpiredLeases: nextSequence.consecutiveExpiredLeases,
      };
      if (nextSequence.exitOnly) {
        void exitManagedRuntime(false);
      } else if (nextSequence.shutdownQbit) {
        void exitManagedRuntime(true);
      }
    };
    const leaseTimer = setInterval(checkParentLease, 2000);
    leaseTimer.unref();
  }

  // 动态 import 避免把 cron / better-sqlite3 拽到 edge bundle 里
  const { startCronJobs } = await import("@/lib/cron");
  startCronJobs();
}
