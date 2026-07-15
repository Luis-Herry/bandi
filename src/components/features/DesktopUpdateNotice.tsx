"use client";

import { useEffect, useState } from "react";
import {
  Download,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui";
import { getDesktopBridge } from "@/lib/desktop-bridge";

export function DesktopUpdateNotice() {
  const [update, setUpdate] = useState<DesktopUpdateState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    let mounted = true;
    void bridge.getUpdateState().then((state) => {
      if (mounted) setUpdate(state);
    }).catch(() => undefined);
    const unsubscribe = bridge.onUpdateStateChange((state) => {
      if (mounted) setUpdate(state);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (!update || update.mode === "development") return null;
  const visible =
    update.status === "downloading" ||
    update.status === "ready" ||
    (update.status === "available" && update.action === "open-release");
  if (!visible) return null;

  const content = getNoticeContent(update);
  const actionLabel = getActionLabel(update.action);
  const progress = normalizeProgress(update.progressPercent);

  const runAction = async () => {
    const bridge = getDesktopBridge();
    if (!bridge || submitting || update.action === "none") return;
    setSubmitting(true);
    try {
      const result = await runBridgeAction(bridge, update.action);
      if (result.state) setUpdate(result.state);
      if (!result.ok && !result.state) {
        setUpdate({
          ...update,
          status: "error",
          action: "check",
          progressPercent: null,
          message: "更新操作未能完成，请稍后重试。",
        });
      }
    } catch {
      setUpdate({
        ...update,
        status: "error",
        action: "check",
        progressPercent: null,
        message: "更新操作未能完成，请稍后重试。",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-5 right-[var(--app-page-gutter)] z-[75] w-[380px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[8px] border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)] shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-[18px]"
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span
          aria-hidden
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[color:var(--accent-muted)] bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
        >
          {getNoticeIcon(update.status)}
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[13px] font-medium text-[color:var(--text-primary)]">
            {content.title}
          </strong>
          <span className="mt-0.5 block text-[11px] leading-5 text-[color:var(--text-muted)]">
            {content.description}
          </span>
        </span>
        {actionLabel && (
          <Button
            type="button"
            variant={update.status === "ready" ? "primary" : "secondary"}
            size="sm"
            className="mt-0.5 shrink-0"
            disabled={submitting}
            leftIcon={getActionIcon(update.action, submitting)}
            onClick={runAction}
          >
            {submitting ? "处理中…" : actionLabel}
          </Button>
        )}
      </div>
      {update.status === "downloading" && progress != null && (
        <div
          className="h-0.5 bg-[color:var(--border-subtle)]"
          role="progressbar"
          aria-label="更新下载进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className="h-full bg-[color:var(--accent)] transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </aside>
  );
}

function getNoticeContent(update: DesktopUpdateState) {
  const version = update.availableVersion ? ` ${update.availableVersion}` : "";
  if (update.status === "downloading") {
    const progress = normalizeProgress(update.progressPercent);
    return {
      title: `正在下载 Bandi${version}`,
      description: progress == null ? "下载完成后会提示安装。" : `已完成 ${progress}%，下载完成后会提示安装。`,
    };
  }
  if (update.status === "ready") {
    return {
      title: `Bandi${version} 已准备好`,
      description: update.action === "install-portable"
        ? "退出当前便携版后，将自动运行下载好的新版。"
        : "重启 Bandi 即可完成更新。",
    };
  }
  if (update.status === "available") {
    return {
      title: `发现 Bandi${version}`,
      description: "此安装方式需要从发布页下载新版。",
    };
  }
  return {
    title: "正在检查 Bandi 更新",
    description: "发现可用版本后会在这里提示。",
  };
}

function getNoticeIcon(status: DesktopUpdateStatus) {
  if (status === "ready") return <RotateCcw size={15} />;
  if (status === "available") return <Download size={15} />;
  return <LoaderCircle size={15} className="animate-spin" />;
}

function getActionIcon(action: DesktopUpdateAction, submitting: boolean) {
  if (submitting) return <LoaderCircle size={12} className="animate-spin" />;
  if (action === "restart-to-install") return <RotateCcw size={12} />;
  if (action === "install-portable" || action === "open-release") {
    return <Download size={12} />;
  }
  return null;
}

function getActionLabel(action: DesktopUpdateAction) {
  if (action === "restart-to-install") return "重启并更新";
  if (action === "install-portable") return "退出并运行新版";
  if (action === "open-release") return "下载新版";
  return null;
}

function normalizeProgress(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function runBridgeAction(
  bridge: NonNullable<Window["bandiDesktop"]>,
  action: DesktopUpdateAction,
) {
  if (action === "check") return bridge.checkForUpdates();
  if (action === "restart-to-install" || action === "install-portable") {
    return bridge.installUpdate();
  }
  if (action === "open-release") return bridge.openUpdatePage();
  return { ok: true } satisfies DesktopUpdateResult;
}
