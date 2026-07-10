"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Trash2,
  Activity,
  ChevronDown,
  ChevronRight,
  Download,
  HelpCircle,
  Layers,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  AccordionDisclosure,
  Button,
  GlassPanel,
  NumberPop,
  StatusBadge,
  Tag,
} from "@/components/ui";
import { AnimeCover } from "@/components/features/AnimeCover";
import { ConfirmDialog } from "@/components/features/ConfirmDialog";
import { PlayButton } from "@/components/features/PlayButton";
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
  episodeNumber: number | null;
  anime: { id: number; title: string; coverUrl: string | null } | null;
  createdAt: string | number;
}

interface DownloadGroupEntry {
  kind: "group";
  key: string;
  anime: NonNullable<DownloadRow["anime"]>;
  rows: DownloadRow[];
  episodeCount: number;
  statusCounts: Record<DownloadStatus, number>;
}

type DownloadListEntry =
  | { kind: "row"; row: DownloadRow }
  | DownloadGroupEntry;

interface QbitStatus {
  connected: boolean;
  managed: boolean;
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
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedDownloadIds, setSelectedDownloadIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );

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

  const filteredDownloadIds = useMemo(
    () => filteredDownloads.map((d) => d.id),
    [filteredDownloads],
  );
  const downloadListEntries = useMemo(
    () => buildDownloadListEntries(filteredDownloads),
    [filteredDownloads],
  );

  const selectedCount = selectedDownloadIds.size;
  const selectedVisibleCount = useMemo(
    () => filteredDownloadIds.filter((id) => selectedDownloadIds.has(id)).length,
    [filteredDownloadIds, selectedDownloadIds],
  );
  const allVisibleSelected =
    filteredDownloadIds.length > 0 &&
    selectedVisibleCount === filteredDownloadIds.length;

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
  const hasActiveDownload = useMemo(
    () =>
      downloads.some(
        (download) =>
          download.status === "downloading" ||
          /downloading|stalledDL|forcedDL|metaDL|checkingDL/i.test(
            download.liveState ?? "",
          ),
      ),
    [downloads],
  );

  useEffect(() => {
    setSelectedDownloadIds((current) => {
      if (current.size === 0) return current;
      const validIds = new Set(downloads.map((d) => d.id));
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [downloads]);

  /* ── Download handlers ── */

  function toggleDownloadSelection(id: number) {
    setSelectedDownloadIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedDownloadIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const id of filteredDownloadIds) next.delete(id);
      } else {
        for (const id of filteredDownloadIds) next.add(id);
      }
      return next;
    });
  }

  function toggleGroupSelection(ids: number[]) {
    setSelectedDownloadIds((current) => {
      const next = new Set(current);
      const allSelected = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  }

  function toggleGroupExpanded(key: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleDeleteDownload(id: number) {
    const res = await fetch(`/api/downloads/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      showToast({
        title: "移除失败",
        description: j.error ?? res.statusText,
        tone: "error",
      });
      return;
    }
    setSelectedDownloadIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    showToast({ title: "已从下载列表移除", tone: "info" });
    void refresh();
  }

  async function handleBulkDelete(ids: number[]) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/downloads/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: uniqueIds }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast({
          title: "批量移除失败",
          description: j.error ?? res.statusText,
          tone: "error",
        });
        return;
      }
      setSelectedDownloadIds((current) => {
        const next = new Set(current);
        for (const id of uniqueIds) next.delete(id);
        return next;
      });
      showToast({
        title:
          uniqueIds.length === downloads.length
            ? "下载列表已清空"
            : `已移除 ${j.deleted ?? uniqueIds.length} 条下载记录`,
        description: "下载引擎中的任务和本地文件未改动",
        tone: "info",
      });
      await refresh();
    } finally {
      setBulkBusy(false);
    }
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

  async function handleRetryDownload(id: number) {
    const res = await fetch(`/api/downloads/${id}/retry`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      showToast({
        title: "重新下载失败",
        description: j.error ?? res.statusText,
        tone: "error",
      });
      void refresh();
      return;
    }
    showToast({ title: "已重新提交下载", tone: "download" });
    void refresh();
  }

  return (
    <div className="app-page-container py-6 sm:py-8">
      {/* ── 页头 ── */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[color:var(--text-primary)]">
            下载管理
          </h1>
          <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
            查看下载队列与实时传输状态
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
      <QbitStatusCard qbit={qbit} hasActiveDownload={hasActiveDownload} />

      <section className="mt-6">
        <SectionHeader
          icon={<Download size={14} />}
          title="下载列表"
          count={downloads.length}
          action={
          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              {filteredDownloads.length > 0 && (
                <button
                  type="button"
                  onClick={toggleVisibleSelection}
                  className="h-7 inline-flex items-center gap-2 rounded-[6px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] px-2.5 text-[11px] font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border transition-colors",
                      allVisibleSelected
                        ? "border-[color:var(--accent)] bg-[color:var(--accent)]"
                        : "border-[color:var(--border-strong)]",
                    )}
                  >
                    {allVisibleSelected && (
                      <span className="h-1.5 w-1.5 rounded-[2px] bg-[color:var(--accent-contrast)]" />
                    )}
                  </span>
                  {allVisibleSelected
                    ? "取消全选"
                    : tab === "all"
                      ? "全选列表"
                      : "全选当前分类"}
                </button>
              )}
              {selectedCount > 0 && (
                <ConfirmDialog
                  title="移除已选下载记录？"
                  description={`将从本地下载列表移除已选的 ${selectedCount} 条记录。不会删除下载引擎中的任务或本地文件。`}
                  confirmLabel="移除所选"
                  destructive
                  onConfirm={() => handleBulkDelete([...selectedDownloadIds])}
                  trigger={
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={bulkBusy}
                      leftIcon={<Trash2 size={12} />}
                      className="h-7 px-2.5 text-[11px] !text-[color:var(--status-error,#ef4444)] hover:!border-[rgba(239,68,68,0.35)]"
                    >
                      删除所选 <NumberPop value={selectedCount} dirY={-1} />
                    </Button>
                  }
                />
              )}
              {downloads.length > 0 && (
                <ConfirmDialog
                  title="清空下载列表？"
                  description={`将从本地下载列表移除全部 ${downloads.length} 条记录。不会删除下载引擎中的任务或本地文件。`}
                  confirmLabel="清空列表"
                  destructive
                  onConfirm={() => handleBulkDelete(downloads.map((d) => d.id))}
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={bulkBusy}
                      leftIcon={<Trash2 size={12} />}
                      className="h-7 px-2.5 text-[11px] !text-[color:var(--text-secondary)] hover:!text-[color:var(--status-error,#ef4444)]"
                    >
                      清空列表
                    </Button>
                  }
                />
              )}
              <div className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto touch-pan-x">
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
                    <span className="ml-1 opacity-60">
                      <NumberPop value={counts[t] ?? 0} dirY={-1} />
                    </span>
                  </button>
                ),
              )}
              </div>
            </div>
          }
        />
        <GlassPanel className="p-2 space-y-1.5">
          {filteredDownloads.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-[color:var(--text-muted)]">
              {tab === "all" ? "下载列表是空的" : "这个分类下没有任务"}
            </div>
          ) : (
            downloadListEntries.map((entry) =>
              entry.kind === "row" ? (
                <DownloadRowItem
                  key={entry.row.id}
                  row={entry.row}
                  selected={selectedDownloadIds.has(entry.row.id)}
                  onToggleSelected={() => toggleDownloadSelection(entry.row.id)}
                  onDelete={() => handleDeleteDownload(entry.row.id)}
                  onPause={() => handlePauseDownload(entry.row.id)}
                  onResume={() => handleResumeDownload(entry.row.id)}
                  onRetry={() => handleRetryDownload(entry.row.id)}
                />
              ) : (
                <DownloadGroupItem
                  key={entry.key}
                  group={entry}
                  expanded={expandedGroups.has(entry.key)}
                  selectedCount={
                    entry.rows.filter((row) => selectedDownloadIds.has(row.id)).length
                  }
                  onToggleSelected={() =>
                    toggleGroupSelection(entry.rows.map((row) => row.id))
                  }
                  onToggleExpanded={() => toggleGroupExpanded(entry.key)}
                  renderRows={() =>
                    entry.rows.map((row) => (
                      <DownloadRowItem
                        key={row.id}
                        row={row}
                        selected={selectedDownloadIds.has(row.id)}
                        onToggleSelected={() => toggleDownloadSelection(row.id)}
                        onDelete={() => handleDeleteDownload(row.id)}
                        onPause={() => handlePauseDownload(row.id)}
                        onResume={() => handleResumeDownload(row.id)}
                        onRetry={() => handleRetryDownload(row.id)}
                      />
                    ))
                  }
                />
              ),
            )
          )}
        </GlassPanel>
      </section>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────── */

const HIGH_QBIT_UPLOAD_BYTES = 512 * 1024;
const SLOW_QBIT_DOWNLOAD_BYTES = 32 * 1024;

function QbitStatusCard({
  qbit,
  hasActiveDownload,
}: {
  qbit: QbitStatus | null;
  hasActiveDownload: boolean;
}) {
  const connected = qbit?.connected ?? false;
  const hint = qbit?.error
    ? qbitErrorHint(qbit.error, qbit.managed)
    : null;
  const adviceReason = qbitConnectionAdviceReason(qbit, hasActiveDownload);

  return (
    <GlassPanel variant="elevated" className="p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              aria-hidden
              className={cn(
                "mt-[5px] h-2 w-2 shrink-0 rounded-full",
                connected ? "bg-[color:var(--status-success,#4ade80)]" : "bg-[color:var(--text-muted)]",
              )}
              style={
                connected
                  ? { boxShadow: "0 0 8px rgba(74,222,128,0.6)" }
                  : undefined
              }
            />
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--text-primary)]">
                <Activity size={13} />
                {qbit?.managed ? "下载服务" : "qBittorrent"}{" "}
                {connected
                  ? qbit?.managed
                    ? "可用"
                    : "已连接"
                  : qbit?.managed
                    ? "恢复中"
                    : "未连接"}
              </p>
              <p className="mt-0.5 break-words text-[11px] text-[color:var(--text-muted)]">
                {qbit?.managed
                  ? qbit.version
                    ? `内置引擎 ${qbit.version}`
                    : "桌面版自动管理"
                  : qbit?.url ?? "—"}
                {!qbit?.managed && qbit?.version && ` · ${qbit.version}`}
                {!qbit?.managed && qbit?.error && ` · ${qbit.error}`}
              </p>
              {hint && (
                <p className="mt-1 break-words text-[11px] leading-5 text-[color:var(--status-warning)]">
                  {hint}
                </p>
              )}
            </div>
          </div>
          <div className="flex w-full flex-col items-start gap-3 min-[900px]:w-auto min-[900px]:min-w-[210px] min-[900px]:shrink-0 min-[900px]:items-end">
            <div className="grid w-full grid-cols-3 gap-3 text-[12px]">
              <StatCell label="下载" value={formatSpeed(qbit?.dlSpeed)} accent />
              <StatCell label="上传" value={formatSpeed(qbit?.upSpeed)} />
              <StatCell label="剩余空间" value={formatBytes(qbit?.freeSpaceOnDisk)} />
            </div>
            {qbit && !qbit.managed && (
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
            )}
          </div>
        </div>
        {adviceReason && (
          <QbitConnectionAdvice reason={adviceReason} managed={qbit?.managed ?? false} />
        )}
      </div>
    </GlassPanel>
  );
}

function qbitConnectionAdviceReason(
  qbit: QbitStatus | null,
  hasActiveDownload: boolean,
): string | null {
  if (!qbit) return null;
  if (!qbit.connected || qbit.error) {
    return qbit.managed
      ? "内置下载服务暂时不可用，桌面版正在自动恢复。"
      : "qBittorrent Web UI 当前不可用。";
  }
  if ((qbit.upSpeed ?? 0) >= HIGH_QBIT_UPLOAD_BYTES) {
    return "当前上传偏高，可能影响同机网络。";
  }
  if (hasActiveDownload && (qbit.dlSpeed ?? 0) <= SLOW_QBIT_DOWNLOAD_BYTES) {
    return "有下载任务，但当前下载速度很低。";
  }
  return null;
}

function QbitConnectionAdvice({
  reason,
  managed,
}: {
  reason: string;
  managed: boolean;
}) {
  return (
    <AccordionDisclosure
      title="查看连接建议"
      className="w-full border-t border-[color:var(--border-subtle)] pt-2"
      buttonClassName="text-[11px] font-medium text-[color:var(--accent)] transition-colors hover:text-[color:var(--text-primary)]"
      bodyClassName="mt-2 space-y-1 text-[11px] leading-5 text-[color:var(--text-muted)]"
    >
        <p>当前状态：{reason}</p>
        <p>安全下载模式会限制上传，并在下载完成后暂停 torrent。</p>
        <p>
          {managed
            ? "如果 VPN / TUN 仍受影响，可在代理软件里将内置 qbittorrent.exe 进程设为直连。"
            : "如果正在使用 VPN / TUN / 代理，建议将 qbittorrent.exe 设为直连，qBittorrent 自身代理保持“无”。"}
        </p>
    </AccordionDisclosure>
  );
}

function qbitErrorHint(error: string, managed: boolean): string {
  if (managed) {
    return "桌面版会自动选择连接端口并重新启动下载服务，无需手动配置。";
  }
  if (error === "webui_unreachable") {
    return "qBittorrent 进程可能已启动，但 Web UI 没有监听；请检查外部 qBittorrent 的 Web UI 设置。";
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
    <div className="min-w-0 text-left min-[900px]:text-right">
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
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-[color:var(--text-primary)]">
        <span className="text-[color:var(--accent)]">{icon}</span>
        {title}
        {count !== undefined && (
          <span className="inline-flex items-center text-[11px] font-normal text-[color:var(--text-muted)]">
            (
            <NumberPop value={count} dirY={-1} />
            )
          </span>
        )}
      </h2>
      {action && <div className="min-w-0">{action}</div>}
    </div>
  );
}

function buildDownloadListEntries(rows: DownloadRow[]): DownloadListEntry[] {
  const grouped = new Map<string, DownloadGroupEntry>();
  for (const row of rows) {
    if (!row.anime) continue;
    const key = `anime:${row.anime.id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.rows.push(row);
      existing.statusCounts[row.status] += 1;
    } else {
      grouped.set(key, {
        kind: "group",
        key,
        anime: row.anime,
        rows: [row],
        episodeCount: 1,
        statusCounts: {
          pending: row.status === "pending" ? 1 : 0,
          downloading: row.status === "downloading" ? 1 : 0,
          completed: row.status === "completed" ? 1 : 0,
          failed: row.status === "failed" ? 1 : 0,
        },
      });
    }
  }

  for (const group of grouped.values()) {
    const episodeNumbers = new Set(
      group.rows
        .map((row) => row.episodeNumber)
        .filter((episode): episode is number => typeof episode === "number"),
    );
    group.episodeCount = episodeNumbers.size > 0 ? episodeNumbers.size : group.rows.length;
  }

  const entries: DownloadListEntry[] = [];
  const emittedGroups = new Set<string>();
  for (const row of rows) {
    const key = row.anime ? `anime:${row.anime.id}` : null;
    const group = key ? grouped.get(key) : null;
    if (group && group.rows.length > 1) {
      if (!emittedGroups.has(group.key)) {
        entries.push(group);
        emittedGroups.add(group.key);
      }
      continue;
    }
    entries.push({ kind: "row", row });
  }
  return entries;
}

function DownloadGroupItem({
  group,
  expanded,
  selectedCount,
  onToggleSelected,
  onToggleExpanded,
  renderRows,
}: {
  group: DownloadGroupEntry;
  expanded: boolean;
  selectedCount: number;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  renderRows: () => React.ReactNode;
}) {
  const allSelected = selectedCount === group.rows.length;
  const partlySelected = selectedCount > 0 && !allSelected;
  const statusEntries = (["failed", "downloading", "pending", "completed"] as const)
    .filter((status) => group.statusCounts[status] > 0);

  return (
    <div
      className={cn(
        "rounded-[8px] border transition-colors",
        selectedCount > 0
          ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]"
          : "border-transparent hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--bg-surface)]",
      )}
    >
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
        <label className="mt-1 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className="sr-only"
            checked={allSelected}
            onChange={onToggleSelected}
            aria-label={`选择合集：${group.anime.title}`}
          />
          <span
            aria-hidden
            className={cn(
              "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border transition-colors",
              selectedCount > 0
                ? "border-[color:var(--accent)] bg-[color:var(--accent)]"
                : "border-[color:var(--border-strong)]",
            )}
          >
            {allSelected && (
              <span className="h-1.5 w-1.5 rounded-[2px] bg-[color:var(--accent-contrast)]" />
            )}
            {partlySelected && (
              <span className="h-0.5 w-2 rounded-full bg-[color:var(--accent-contrast)]" />
            )}
          </span>
        </label>

        <div className="w-full shrink-0 pt-0.5 sm:w-[96px]">
          <AnimeCover
            src={group.anime.coverUrl}
            alt={group.anime.title}
            ratio="16/9"
            sizes="(min-width: 640px) 96px, 100vw"
            className="rounded-[6px]"
          />
        </div>

        <button
          type="button"
          onClick={onToggleExpanded}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-[4px] border border-[color:var(--accent)]/30 bg-[color:var(--accent-subtle)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--accent)]">
              <Layers size={11} />
              合集 {group.episodeCount} 集
            </span>
            {statusEntries.map((status) => (
              <span
                key={status}
                className="inline-flex items-center gap-1"
              >
                <StatusBadge kind="download" status={status} />
                <span data-tabular className="text-[10px] text-[color:var(--text-muted)]">
                  ×{group.statusCounts[status]}
                </span>
              </span>
            ))}
          </div>
          <p className="truncate text-[12px] text-[color:var(--text-primary)]" title={group.anime.title}>
            {group.anime.title}
          </p>
          <p className="mt-1 text-[10px] text-[color:var(--text-muted)]">
            {expanded ? "已展开" : "已收起"} · {group.rows.length} 条下载记录
          </p>
        </button>

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-label={expanded ? "收起合集" : "展开合集"}
          title={expanded ? "收起合集" : "展开合集"}
          className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-[6px] px-2 text-[11px] font-medium text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]"
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span>{expanded ? "收起" : "展开"}</span>
        </button>
      </div>

      {expanded && (
        <div className="space-y-1 border-t border-[color:var(--border-subtle)] p-2 sm:ml-7 sm:border-l sm:border-t-0 sm:pl-3">
          {renderRows()}
        </div>
      )}
    </div>
  );
}

function DownloadRowItem({
  row,
  selected,
  onToggleSelected,
  onDelete,
  onPause,
  onResume,
  onRetry,
}: {
  row: DownloadRow;
  selected: boolean;
  onToggleSelected: () => void;
  onDelete: () => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  // 实时 progress 优先用 qBit 数据，落库 progress 是 0-100 整数
  const pct =
    row.liveProgress != null
      ? Math.round(row.liveProgress * 100)
      : row.progress;

  const speed = row.liveSpeed != null && row.liveSpeed > 0
    ? formatSpeed(row.liveSpeed)
    : row.speed ?? null;

  const isControllableStatus =
    row.status === "downloading" || row.status === "pending";
  // qBit 任务状态决定显示暂停还是继续：
  // - pausedDL / stoppedDL → 已暂停，给 ▶ 继续按钮
  // - downloading / queuedDL / stalledDL 等下载态 → 给 ⏸ 暂停按钮
  // - completed 只给播放和删除，不再暴露 qBit 控制
  const isPaused =
    isControllableStatus &&
    (row.liveState === "pausedDL" || row.liveState === "stoppedDL");
  const canControl =
    isControllableStatus &&
    (row.liveState != null
      ? row.liveState !== "error" && row.liveState !== "missingFiles"
      : row.status === "downloading");
  const episodeLabel =
    row.episodeNumber != null
      ? String(row.episodeNumber).padStart(2, "0")
      : null;
  const playerHref =
    row.status === "completed" && row.anime && row.episodeNumber != null
      ? `/player/${row.anime.id}/${row.episodeNumber}`
      : null;

  return (
    <div
      className={cn(
        "p-3 rounded-[8px] border transition-colors",
        selected
          ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]"
          : "border-transparent hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--bg-surface)]",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <label className="mt-1 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className="sr-only"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`选择下载记录：${row.title}`}
          />
          <span
            aria-hidden
            className={cn(
              "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border transition-colors",
              selected
                ? "border-[color:var(--accent)] bg-[color:var(--accent)]"
                : "border-[color:var(--border-strong)]",
            )}
          >
            {selected && (
              <span className="h-1.5 w-1.5 rounded-[2px] bg-[color:var(--accent-contrast)]" />
            )}
          </span>
        </label>
        {row.anime && (
          <div className="w-full shrink-0 pt-0.5 sm:w-[96px]">
            {playerHref && episodeLabel ? (
              <a
                href={playerHref}
                aria-label={`播放 ${row.anime.title} EP.${episodeLabel}`}
                className="group block rounded-[6px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
              >
                <AnimeCover
                  src={row.anime.coverUrl}
                  alt={row.anime.title}
                  ratio="16/9"
                  sizes="(min-width: 640px) 96px, 100vw"
                  className="rounded-[6px] transition-[filter] duration-150 group-hover:brightness-110"
                />
              </a>
            ) : (
              <AnimeCover
                src={row.anime.coverUrl}
                alt={row.anime.title}
                ratio="16/9"
                sizes="(min-width: 640px) 96px, 100vw"
                className="rounded-[6px]"
              />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
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
          {playerHref && row.anime && episodeLabel ? (
            <a
              href={playerHref}
              aria-label={`播放 ${row.anime.title} EP.${episodeLabel}`}
              className="block rounded-[4px] text-[12px] text-[color:var(--text-primary)] transition-colors hover:text-[color:var(--accent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
              title={row.title}
            >
              <span className="block truncate">{row.title}</span>
            </a>
          ) : (
            <p className="text-[12px] text-[color:var(--text-primary)] truncate" title={row.title}>
              {row.title}
            </p>
          )}
          {row.errorMessage && (
            <p className="mt-1 text-[10px] text-[color:var(--status-error,#ef4444)]">
              {row.errorMessage}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 self-start sm:self-auto">
          {playerHref && row.anime && episodeLabel && row.episodeNumber != null && (
            <PlayButton
              animeId={row.anime.id}
              episode={row.episodeNumber}
              label={`播放 EP.${episodeLabel}`}
              variant="secondary"
              size="sm"
              iconOnly
              buttonClassName="h-7 w-7 rounded-[6px] text-[color:var(--accent)] hover:brightness-110"
            />
          )}
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
          {row.status === "failed" && (
            <button
              type="button"
              onClick={onRetry}
              aria-label="重新下载"
              title="重新下载"
              className="inline-flex h-7 items-center justify-center gap-1 rounded-[6px] px-2 text-[11px] font-medium text-[color:var(--accent)] transition-colors hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]"
            >
              <RotateCcw size={13} />
              <span>重新下载</span>
            </button>
          )}
          <ConfirmDialog
            title="从列表移除？"
            description="只会从本地列表移除，下载引擎中的任务和本地文件保持不变。"
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
        <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3">
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
