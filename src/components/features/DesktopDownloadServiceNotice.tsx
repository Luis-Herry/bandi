"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { getDesktopBridge } from "@/lib/desktop-bridge";

export function DesktopDownloadServiceNotice() {
  const [service, setService] =
    useState<DesktopDownloadServiceState | null>(null);
  const [manualRetry, setManualRetry] = useState(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    let mounted = true;
    void bridge
      .getDownloadServiceState()
      .then((state) => {
        if (mounted) setService(state);
      })
      .catch(() => {
        if (!mounted) return;
        setService({
          status: "failed",
          message: "无法读取下载服务状态，请重新打开 Bandi 后再试。",
          retrying: false,
        });
      });
    const unsubscribe = bridge.onDownloadServiceStateChange((state) => {
      setService(state);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (!service || service.status === "starting" || service.status === "ready") {
    return null;
  }

  const retrying = manualRetry || service.retrying;

  return (
    <aside
      role="alert"
      aria-live="polite"
      className="fixed right-[var(--app-page-gutter)] top-[calc(var(--desktop-titlebar-shell-height)+76px)] z-[75] flex w-[360px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-[8px] border border-[rgba(251,191,36,0.22)] bg-[color:var(--bg-elevated)] px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-[18px]"
    >
      <span
        aria-hidden
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[rgba(251,191,36,0.22)] bg-[rgba(251,191,36,0.08)] text-[color:var(--status-warning)]"
      >
        <AlertCircle size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[13px] font-medium text-[color:var(--text-primary)]">
          下载服务暂时不可用
        </strong>
        <span className="mt-0.5 block text-[11px] leading-5 text-[color:var(--text-muted)]">
          {service.message}
        </span>
      </span>
      <Button
        variant="secondary"
        size="sm"
        className="mt-0.5 shrink-0"
        leftIcon={
          <RefreshCw
            size={12}
            className={retrying ? "animate-spin" : undefined}
          />
        }
        disabled={retrying}
        onClick={async () => {
          const bridge = getDesktopBridge();
          if (!bridge || retrying) return;
          setManualRetry(true);
          try {
            const result = await bridge.retryDownloadService();
            setService(result.state);
          } catch {
            setService({
              status: "failed",
              message: "重试请求未能完成，请重新打开 Bandi 后再试。",
              retrying: false,
            });
          } finally {
            setManualRetry(false);
          }
        }}
      >
        {retrying ? "重试中" : "立即重试"}
      </Button>
    </aside>
  );
}
