"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Button, GlassPanel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getDesktopBridge } from "@/lib/desktop-bridge";

export function DesktopUpdateSettings() {
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

  if (!update || update.mode === "development" || update.status === "unsupported") {
    return null;
  }

  const detail = getSettingsDetail(update);
  const actionLabel = getSettingsActionLabel(update);
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
    <GlassPanel variant="elevated" className="p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 text-[color:var(--accent)]">
            <RefreshCw size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-[color:var(--text-primary)]">
              应用更新
            </h2>
            <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              检查 Bandi 新版本并完成当前安装方式支持的更新流程
            </p>
          </div>
        </div>
        {actionLabel && (
          <Button
            type="button"
            variant={update.status === "ready" ? "primary" : "secondary"}
            size="sm"
            className="shrink-0 self-start"
            disabled={submitting || update.status === "checking"}
            leftIcon={getActionIcon(update.action, submitting)}
            onClick={runAction}
          >
            {submitting ? "处理中…" : actionLabel}
          </Button>
        )}
      </header>

      <div className="mt-5 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-4">
        <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border",
                update.status === "error"
                  ? "border-[rgba(248,113,113,0.22)] bg-[rgba(248,113,113,0.08)] text-[color:var(--status-error)]"
                  : "border-[color:var(--accent-muted)] bg-[color:var(--accent-subtle)] text-[color:var(--accent)]",
              )}
            >
              {getStatusIcon(update.status)}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[color:var(--text-primary)]">
                {detail.title}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-[color:var(--text-muted)]">
                {detail.description}
              </p>
            </div>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1 text-[11px] min-[520px]:text-right">
            <div>
              <dt className="text-[color:var(--text-muted)]">当前版本</dt>
              <dd data-tabular className="mt-0.5 font-medium text-[color:var(--text-primary)]">
                {update.currentVersion}
              </dd>
            </div>
            <div>
              <dt className="text-[color:var(--text-muted)]">更新方式</dt>
              <dd className="mt-0.5 font-medium text-[color:var(--text-primary)]">
                {getModeLabel(update.mode)}
              </dd>
            </div>
          </dl>
        </div>
        {update.status === "downloading" && progress != null && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[10px] text-[color:var(--text-muted)]">
              <span>下载进度</span>
              <span data-tabular>{progress}%</span>
            </div>
            <div
              className="h-1 overflow-hidden rounded-full bg-[color:var(--border-subtle)]"
              role="progressbar"
              aria-label="更新下载进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div
                className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

function getSettingsDetail(update: DesktopUpdateState) {
  const version = update.availableVersion ? ` ${update.availableVersion}` : "";
  if (update.status === "idle") {
    return { title: "可以检查更新", description: "检查过程会在后台完成，不影响当前使用。" };
  }
  if (update.status === "checking") {
    return { title: "正在检查更新", description: "正在连接 Bandi 发布服务…" };
  }
  if (update.status === "up-to-date") {
    return { title: "已经是最新版本", description: `当前安装的 Bandi ${update.currentVersion} 无需更新。` };
  }
  if (update.status === "available") {
    return {
      title: `发现 Bandi${version}`,
      description: update.action === "open-release"
        ? "此安装方式需要从发布页下载新版。"
        : "正在准备下载，完成后会显示安装操作。",
    };
  }
  if (update.status === "downloading") {
    return { title: `正在下载 Bandi${version}`, description: "可以继续使用应用，下载完成后会提示安装。" };
  }
  if (update.status === "ready") {
    return {
      title: `Bandi${version} 已准备好`,
      description: update.action === "install-portable"
        ? "退出当前便携版后，将自动运行下载好的新版。"
        : "重启 Bandi 即可完成更新。",
    };
  }
  if (update.status === "installing") {
    return { title: "正在安装更新", description: "Bandi 即将关闭并完成更新。" };
  }
  return { title: "检查更新失败", description: update.message || "请稍后重新检查。" };
}

function getStatusIcon(status: DesktopUpdateStatus) {
  if (status === "checking" || status === "downloading" || status === "installing") {
    return <LoaderCircle size={15} className="animate-spin" />;
  }
  if (status === "up-to-date") return <CheckCircle2 size={15} />;
  if (status === "ready") return <RotateCcw size={15} />;
  if (status === "available") return <Download size={15} />;
  if (status === "error") return <AlertCircle size={15} />;
  return <RefreshCw size={15} />;
}

function getSettingsActionLabel(update: DesktopUpdateState) {
  if (update.action === "restart-to-install") return "重启并更新";
  if (update.action === "install-portable") return "退出并运行新版";
  if (update.action === "open-release") return "下载新版";
  if (update.action === "check") return update.status === "error" ? "重新检查" : "检查更新";
  return null;
}

function getActionIcon(action: DesktopUpdateAction, submitting: boolean) {
  if (submitting) return <LoaderCircle size={12} className="animate-spin" />;
  if (action === "restart-to-install") return <RotateCcw size={12} />;
  if (action === "install-portable" || action === "open-release") return <Download size={12} />;
  return <RefreshCw size={12} />;
}

function getModeLabel(mode: DesktopUpdateMode) {
  if (mode === "nsis") return "Windows 安装版";
  if (mode === "portable") return "Windows 便携版";
  if (mode === "mac-installed") return "macOS 应用";
  if (mode === "mac-manual") return "macOS 手动更新";
  return "开发环境";
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
