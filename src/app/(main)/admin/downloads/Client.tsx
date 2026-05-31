"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Trash2,
  Activity,
  Download,
  Pause,
  Play,
  HelpCircle,
} from "lucide-react";
import { GlassPanel, Button, StatusBadge, Tag } from "@/components/ui";
import { AnimeCover } from "@/components/features/AnimeCover";
import { ConfirmDialog } from "@/components/features/ConfirmDialog";
import { QbitSetupGuideDialog } from "@/components/features/QbitSetupGuideDialog";
import { showToast } from "@/components/features/ToastHost";
import { cn } from "@/lib/cn";
import type { DownloadStatus } from "@/components/ui";

/* ─── Types ─────────────────────────────────────────────────── */

interface DownloadRow {
  id: number;
  title: string;
  status: DownloadStatus;
  progress: number;
  speed: string | null;
  errorMessage: string | null;
  liveProgress: number | null;
  liveSpeed: number | null;
  liveState: string | null;
  anime: { id: number; title: string; coverUrl: string | null } | null;
  createdAt: string | number;
}

interface QbitStatus {
  connected: boolean;
  url: string;
  version?: string;
  apiVersion?: string;
  dlSpeed?: number;
  upSpeed?: number;
  freeSpaceOnDisk?: number;
  error?: string;
}

/* ─── Client ────────────────────────────────────────────────── */

export function DownloadsAdminClient() {
  const [downloads, setDownloads] = useState<DownloadRow[]>([]);
  const [qbit, setQbit] = useState<QbitStatus | null>(null);
  const [tab, setTab] = useState<"all" | DownloadStatus>("all");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [downloadResult, qbitStatus] = await Promise.all([
        fetch("/api/downloads").then((r) => r.json()),
        fetch("/api/downloads/qbit/status").then((r) => r.json()),
      ]);
      setDownloads(downloadResult.items ?? []);
      setQbit(qbitStatus);
    } catch (e) {
      console.error("[downloads-admin] refresh failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const filteredDownloads = useMemo(
    () => (tab === "all" ? downloads : downloads.filter((d) => d.status === tab)),
    [downloads, tab],
  );

  const counts = useMemo(() => {
    const out: Record<string, number> = {
      all: downloads.length,
      pending: 0,
      downloading: 0,
      completed: 0,
      failed: 0,
    };
    for (const d of downloads) out[d.status] = (out[d.status] ?? 0) + 1;
    return out;
  }, [downloads]);

  /* ── Download handlers ── */

  async function handleDeleteDownload(id: number) {
    await fetch(`/api/downloads/${id}`, { method: "DELETE" });
    showToast({ title: "已从下载列表移除", tone: "info" });
    void refresh();
  }

  async function handlePauseDownload(id: number) {
    const res = await fetch(`/api/downloads/${id}/pause`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      showToast({
        title: "暂停失败",
        description: j.error ?? res.statusText,
        tone: "error",
      });
      return;
    }
    showToast({ title: "下载任务已暂停", tone: "info" });
    void refresh();
  }

  async function handleResumeDownload(id: number) {
    const res = await fetch(`/api/downloads/${id}/resume`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      showToast({
        title: "继续失败",
        description: j.error ?? res.statusText,
        tone: "error",
      });
      return;
    }
    showToast({ title: "下载任务已继续", tone: "download" });
    void refresh();
  }

  return (
    <div className="mx-auto max-w-[1440px] px-8 py-8">
      {/* ── 页头 ── */}
      <header className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[color:var(--text-primary)]">
            下载管理
          </h1>
          <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
            查看下载队列与 qBittorrent 实时状态
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RefreshCw size={12} className={loading ? "animate-spin" : ""} />}
          onClick={refresh}
        >
          刷新
        </Button>
      </header>

      {/* ── qBit 状态卡片 ── */}
      <QbitStatusCard qbit={qbit} />

      <section className="mt-6">
        <SectionHeader
          icon={<Download size={14} />}
          title="下载列表"
          count={downloads.length}
          action={
            <div className="flex items-center gap-1">
              {(["all", "downloading", "completed", "pending", "failed"] as const).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      "h-7 px-2.5 rounded-[6px] text-[11px] font-medium transition-colors",
                      tab === t
                        ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
                        : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-surface-hover)]",
                    )}
                  >
                    {tabLabel(t)}
                    <span data-tabular className="ml-1 opacity-60">
                      {counts[t] ?? 0}
                    </span>
                  </button>
                ),
              )}
            </div>
          }
        />
        <GlassPanel className="p-2 space-y-1.5">
          {filteredDownloads.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-[color:var(--text-muted)]">
              {tab === "all" ? "下载列表是空的" : "这个分类下没有任务"}
            </div>
          ) : (
            filteredDownloads.map((d) => (
              <DownloadRowItem
                key={d.id}
                row={d}
                onDelete={() => handleDeleteDownload(d.id)}
                onPause={() => handlePauseDownload(d.id)}
                onResume={() => handleResumeDownload(d.id)}
              />
            ))
          )}
        </GlassPanel>
      </section>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────── */

function QbitStatusCard({ qbit }: { qbit: QbitStatus | null }) {
  const connected = qbit?.connected ?? false;
  const hint = qbit?.error ? qbitErrorHint(qbit.error) : null;
  return (
    <GlassPanel variant="elevated" className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            aria-hidden
            className={cn(
              "w-2 h-2 rounded-full",
              connected ? "bg-[color:var(--status-success,#4ade80)]" : "bg-[color:var(--text-muted)]",
            )}
            style={
              connected
                ? { boxShadow: "0 0 8px rgba(74,222,128,0.6)" }
                : undefined
            }
          />
          <div>
            <p className="text-[13px] font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
              <Activity size={13} />
              qBittorrent {connected ? "已连接" : "未连接"}
            </p>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
              {qbit?.url ?? "默认 127.0.0.1:8080"}
              {qbit?.version && ` · v${qbit.version}`}
              {qbit?.error && ` · ${qbit.error}`}
            </p>
            {hint && (
              <p className="mt-1 text-[11px] text-[color:var(--status-warning)]">
                {hint}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-[12px]">
          <QbitSetupGuideDialog
            trigger={
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<HelpCircle size={12} />}
              >
                不会设置看这里
              </Button>
            }
          />
          <div className="flex items-center gap-6">
            <StatCell label="下载" value={formatSpeed(qbit?.dlSpeed)} accent />
            <StatCell label="上传" value={formatSpeed(qbit?.upSpeed)} />
            <StatCell label="剩余空间" value={formatBytes(qbit?.freeSpaceOnDisk)} />
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

function qbitErrorHint(error: string): string {
  if (error === "webui_unreachable") {
    return "qBittorrent 进程可能已启动，但 Web UI 没有监听；桌面版默认使用 127.0.0.1:8080，若端口被占用，可在本地配置里改 qbitPort 后重启。";
  }
  if (error === "auth_failed" || error === "auth_cookie_missing") {
    return "Web UI 能访问，但登录失败；检查 QBIT_USER / QBIT_PASS 是否和 qBit Web UI 一致。";
  }
  if (error.startsWith("auth_http_") || error.startsWith("http_")) {
    return "Web UI 返回异常状态；确认 qBit Web UI 页面能在浏览器里打开。";
  }
  return "刷新会重新检测 qBit；如果持续失败，先确认 Web UI 地址和端口。";
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="text-right">
      <p
        data-tabular
        className="text-[14px] font-semibold tracking-tight"
        style={{ color: accent ? "var(--accent)" : "var(--text-primary)" }}
      >
        {value}
      </p>
      <p className="text-[10px] text-[color:var(--text-muted)]">{label}</p>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  count,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
        <span className="text-[color:var(--accent)]">{icon}</span>
        {title}
        {count !== undefined && (
          <span data-tabular className="text-[11px] text-[color:var(--text-muted)] font-normal">
            ({count})
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}

function DownloadRowItem({
  row,
  onDelete,
  onPause,
  onResume,
}: {
  row: DownloadRow;
  onDelete: () => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
}) {
  // 实时 progress 优先用 qBit 数据，落库 progress 是 0-100 整数
  const pct =
    row.liveProgress != null
      ? Math.round(row.liveProgress * 100)
      : row.progress;

  const speed = row.liveSpeed != null && row.liveSpeed > 0
    ? formatSpeed(row.liveSpeed)
    : row.speed ?? null;

  // qBit 任务状态决定显示暂停还是继续：
  // - pausedDL / pausedUP → 已暂停，给 ▶ 继续按钮
  // - downloading / 任何 _UP 完成态 → 在跑，给 ⏸ 暂停按钮
  // - 没有 liveState（qBit 离线 / 任务还没建好）→ 用 DB status 兜底
  const isPaused =
    row.liveState === "pausedDL" || row.liveState === "pausedUP";
  const canControl =
    row.liveState != null
      ? row.liveState !== "error" && row.liveState !== "missingFiles"
      : row.status === "downloading";

  return (
    <div className="p-3 rounded-[8px] border border-transparent hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--bg-surface)] transition-colors">
      <div className="flex items-start gap-3">
        {row.anime && (
          <div className="w-[96px] shrink-0 pt-0.5">
            <AnimeCover
              src={row.anime.coverUrl}
              alt={row.anime.title}
              ratio="16/9"
              sizes="96px"
              className="rounded-[6px]"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge kind="download" status={row.status} />
            {isPaused && (
              <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium bg-[color:var(--bg-surface-hover)] text-[color:var(--text-muted)] border border-[color:var(--border-subtle)]">
                已暂停
              </span>
            )}
            {row.anime && (
              <Tag variant="default">{row.anime.title}</Tag>
            )}
          </div>
          <p className="text-[12px] text-[color:var(--text-primary)] truncate" title={row.title}>
            {row.title}
          </p>
          {row.errorMessage && (
            <p className="mt-1 text-[10px] text-[color:var(--status-error,#ef4444)]">
              {row.errorMessage}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canControl && (
            isPaused ? (
              <button
                type="button"
                onClick={onResume}
                aria-label="继续"
                title="继续"
                className="w-7 h-7 inline-flex items-center justify-center rounded-[6px] text-[color:var(--text-muted)] hover:text-[color:var(--accent)] hover:bg-[color:var(--bg-surface-hover)] transition-colors"
              >
                <Play size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onPause}
                aria-label="暂停"
                title="暂停"
                className="w-7 h-7 inline-flex items-center justify-center rounded-[6px] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-surface-hover)] transition-colors"
              >
                <Pause size={13} />
              </button>
            )
          )}
          <ConfirmDialog
            title="从列表移除？"
            description="只会从本地列表移除，qBittorrent 中的下载需要在 qBit 里单独处理。"
            confirmLabel="移除"
            destructive
            onConfirm={onDelete}
            trigger={
              <button
                type="button"
                aria-label="删除"
                className="w-7 h-7 inline-flex items-center justify-center rounded-[6px] text-[color:var(--text-muted)] hover:text-[color:var(--status-error,#ef4444)] hover:bg-[color:var(--bg-surface-hover)] transition-colors"
              >
                <Trash2 size={13} />
              </button>
            }
          />
        </div>
      </div>

      {(row.status === "downloading" || isPaused) && (
        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1 h-[4px] rounded-full bg-[color:var(--bg-surface-hover)] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: "var(--accent)",
                transition: "width 400ms var(--ease-default)",
              }}
            />
          </div>
          <span data-tabular className="text-[11px] text-[color:var(--text-secondary)]">
            {pct}%
          </span>
          {speed && (
            <span data-tabular className="text-[11px] text-[color:var(--text-muted)]">
              {speed}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── helpers ───────────────────────────────────────────────── */

function tabLabel(t: "all" | DownloadStatus): string {
  return {
    all: "全部",
    pending: "等待",
    downloading: "下载中",
    completed: "完成",
    failed: "失败",
  }[t];
}

function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return "—";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let v = bps;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`;
}

function formatBytes(b?: number): string {
  if (!b || b <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = b;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`;
}
