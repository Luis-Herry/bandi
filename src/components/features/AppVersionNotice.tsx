"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import {
  createVersionCheckState,
  isVersionDetectionEnabled,
  normalizeBuildId,
  observeBuildId,
  parseAppVersionPayload,
} from "@/lib/app-version";

const INITIAL_CHECK_DELAY_MS = 15_000;
const POLL_INTERVAL_MS = 60_000;
const RESUME_CHECK_THROTTLE_MS = 15_000;
const MISMATCH_CONFIRM_DELAY_MS = 2_000;
const REQUEST_TIMEOUT_MS = 5_000;

export function AppVersionNotice({
  initialBuildId,
}: {
  initialBuildId: string | null;
}) {
  const [readyBuildId, setReadyBuildId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const baselineBuildId = normalizeBuildId(initialBuildId);
    if (!baselineBuildId || !isVersionDetectionEnabled(baselineBuildId)) return;

    let active = true;
    let inFlight = false;
    let lastCheckAt = Date.now();
    let checkState = createVersionCheckState();
    let confirmTimer: number | null = null;

    const clearConfirmTimer = () => {
      if (confirmTimer == null) return;
      window.clearTimeout(confirmTimer);
      confirmTimer = null;
    };

    const checkVersion = async (ignoreThrottle = false) => {
      if (
        !active ||
        inFlight ||
        checkState.readyBuildId ||
        document.hidden
      ) {
        return;
      }
      const now = Date.now();
      if (!ignoreThrottle && now - lastCheckAt < RESUME_CHECK_THROTTLE_MS) {
        return;
      }

      inFlight = true;
      lastCheckAt = now;
      const controller = new AbortController();
      const abortTimer = window.setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );
      try {
        const response = await fetch(`/api/app-version?t=${now}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`app_version_http_${response.status}`);
        const payload = parseAppVersionPayload(await response.json());
        const previousCandidate = checkState.candidateBuildId;
        checkState = observeBuildId(
          baselineBuildId,
          checkState,
          payload?.buildId ?? null,
        );

        if (checkState.readyBuildId) {
          clearConfirmTimer();
          if (active) setReadyBuildId(checkState.readyBuildId);
          return;
        }
        if (!checkState.candidateBuildId) {
          clearConfirmTimer();
          return;
        }
        if (
          checkState.consecutiveMatches === 1 &&
          checkState.candidateBuildId !== previousCandidate
        ) {
          clearConfirmTimer();
          confirmTimer = window.setTimeout(() => {
            confirmTimer = null;
            void checkVersion(true);
          }, MISMATCH_CONFIRM_DELAY_MS);
        }
      } catch {
        checkState = observeBuildId(baselineBuildId, checkState, null);
        clearConfirmTimer();
      } finally {
        window.clearTimeout(abortTimer);
        inFlight = false;
      }
    };

    const checkAfterResume = () => {
      if (!document.hidden) void checkVersion();
    };
    const handleVisibilityChange = () => checkAfterResume();

    const initialTimer = window.setTimeout(
      () => void checkVersion(true),
      INITIAL_CHECK_DELAY_MS,
    );
    const pollTimer = window.setInterval(
      () => void checkVersion(),
      POLL_INTERVAL_MS,
    );
    window.addEventListener("focus", checkAfterResume);
    window.addEventListener("pageshow", checkAfterResume);
    window.addEventListener("online", checkAfterResume);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      window.clearInterval(pollTimer);
      clearConfirmTimer();
      window.removeEventListener("focus", checkAfterResume);
      window.removeEventListener("pageshow", checkAfterResume);
      window.removeEventListener("online", checkAfterResume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [initialBuildId]);

  if (!readyBuildId) return null;

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    window.location.reload();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed left-1/2 z-[70] flex w-[min(520px,calc(100vw-32px))] -translate-x-1/2 items-center gap-3 rounded-[8px] border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)] px-3 py-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-[18px]"
      style={{
        top: "calc(var(--desktop-titlebar-shell-height, 0px) + 5rem)",
      }}
    >
      <span className="min-w-0 flex-1 text-[13px] font-medium text-[color:var(--text-primary)]">
        新版本已就绪
      </span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={refreshing}
        leftIcon={<RefreshCw size={13} className={refreshing ? "animate-spin" : undefined} />}
        onClick={refresh}
      >
        {refreshing ? "正在刷新" : "立即刷新"}
      </Button>
    </div>
  );
}
