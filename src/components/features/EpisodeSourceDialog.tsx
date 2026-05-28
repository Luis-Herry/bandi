"use client";

/**
 * 单集找源弹窗。
 *
 * 打开时自动用 番剧名 + 集数 作为关键词，拉所有 active RSS 源，列出候选 release。
 * 用户可：
 *   - 修改关键词重搜
 *   - 选某条 release → POST /api/downloads 推送磁链
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BookmarkPlus, Download, Loader2, RefreshCw, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Tag } from "@/components/ui";
import type { DownloadDuplicateReason } from "@/lib/download-dedupe";

interface Candidate {
  sourceId: number;
  sourceName: string;
  title: string;
  magnet: string | null;
  link: string;
  pubDate: string | null;
  size: string | null;
  group: string | null;
  quality: string | null;
}

interface ApiResponse {
  animeId: number;
  animeTitle: string;
  titleJa: string | null;
  scope: "episode" | "season";
  episode: number;
  episodeId: number | null;
  aliases: string[];
  savedAliases: string[];
  candidates: Candidate[];
  message?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animeId: number;
  episodeNumber: number;
  animeTitle: string;
  sourceScope?: "episode" | "season";
}

type PushState =
  | { kind: "idle" }
  | { kind: "pushing" }
  | { kind: "ok" }
  | { kind: "skipped"; label: string }
  | { kind: "fail"; msg: string };

export function EpisodeSourceDialog({
  open,
  onOpenChange,
  animeId,
  episodeNumber,
  animeTitle,
  sourceScope = "episode",
}: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [aliasSaving, setAliasSaving] = useState(false);
  const [removingAlias, setRemovingAlias] = useState<string | null>(null);
  // 每条候选独立的推送状态，key 用 magnet
  const [pushById, setPushById] = useState<Record<string, PushState>>({});

  const reqIdRef = useRef(0);

  const fetchSources = useCallback(
    async (overrideQ?: string) => {
      const id = ++reqIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const url = new URL(
          `/api/anime/${animeId}/episodes/${episodeNumber}/sources`,
          window.location.origin,
        );
        if (sourceScope === "season") url.searchParams.set("scope", "season");
        if (overrideQ && overrideQ.trim()) url.searchParams.set("q", overrideQ.trim());
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) throw new Error(`http_${res.status}`);
        const j = (await res.json()) as ApiResponse;
        if (id !== reqIdRef.current) return;
        setData(j);
        setPushById({});
      } catch (e) {
        if (id !== reqIdRef.current) return;
        setError(e instanceof Error ? e.message : "未知错误");
      } finally {
        if (id === reqIdRef.current) setLoading(false);
      }
    },
    [animeId, episodeNumber, sourceScope],
  );

  // 打开时自动拉
  useEffect(() => {
    if (!open) return;
    setData(null);
    setQ("");
    setError(null);
    setAliasSaving(false);
    setRemovingAlias(null);
    setPushById({});
    void fetchSources();
  }, [open, fetchSources]);

  const submitOverride = () => {
    void fetchSources(q);
  };

  const saveAlias = async () => {
    const alias = normalizeAliasInput(q);
    if (!alias || isSavedAlias(alias, data?.savedAliases ?? [])) return;
    setAliasSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/anime/${animeId}/rss-aliases`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alias }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        aliases?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? `http_${res.status}`);
      const savedAliases = j.aliases ?? [];
      setData((current) =>
        current
          ? {
              ...current,
              savedAliases,
              aliases: mergeAliasLabels(savedAliases, current.aliases),
            }
          : current,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存修正失败");
    } finally {
      setAliasSaving(false);
    }
  };

  const removeAlias = async (alias: string) => {
    setRemovingAlias(alias);
    setError(null);
    try {
      const res = await fetch(`/api/anime/${animeId}/rss-aliases`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alias }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? `http_${res.status}`);
      void fetchSources(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除修正失败");
    } finally {
      setRemovingAlias(null);
    }
  };

  const onPush = async (c: Candidate) => {
    if (!c.magnet) return;
    const key = c.magnet;
    setPushById((s) => ({ ...s, [key]: { kind: "pushing" } }));
    try {
      const res = await fetch("/api/downloads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: c.title,
          magnetUrl: c.magnet,
          animeId,
          episodeId: data?.episodeId ?? null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        qbit?: boolean;
        error?: string;
        duplicate?: boolean;
        reason?: DownloadDuplicateReason;
      };
      if (!res.ok) throw new Error(j.error ?? `http_${res.status}`);
      if (j.duplicate) {
        setPushById((s) => ({
          ...s,
          [key]: { kind: "skipped", label: duplicateLabel(j.reason) },
        }));
        return;
      }
      if (j.qbit === false) {
        setPushById((s) => ({
          ...s,
          [key]: { kind: "fail", msg: j.error ?? "qBit 推送失败" },
        }));
        return;
      }
      setPushById((s) => ({ ...s, [key]: { kind: "ok" } }));
    } catch (e) {
      setPushById((s) => ({
        ...s,
        [key]: {
          kind: "fail",
          msg: e instanceof Error ? e.message : "推送失败",
        },
      }));
    }
  };

  const normalizedQ = normalizeAliasInput(q);
  const aliasAlreadySaved =
    !!normalizedQ && isSavedAlias(normalizedQ, data?.savedAliases ?? []);
  const canSaveAlias = !!normalizedQ && !aliasAlreadySaved && !aliasSaving;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/65 backdrop-blur-[6px] z-50" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-[14%] -translate-x-1/2 z-50",
            "w-[760px] max-w-[94vw] max-h-[78vh] flex flex-col",
            "rounded-[10px] overflow-hidden",
            "border border-[color:var(--border-default)]",
            "bg-[color:var(--bg-elevated)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
            "backdrop-blur-[20px] focus:outline-none",
          )}
        >
          {/* 标题区 */}
          <div className="px-5 py-4 border-b border-[color:var(--border-subtle)] shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="text-[15px] font-semibold text-[color:var(--text-primary)] truncate">
                  {animeTitle}
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-[12px] text-[color:var(--text-muted)]">
                  {sourceScope === "season"
                    ? "全集 · 从 RSS 订阅中找下载源"
                    : `第 ${String(episodeNumber).padStart(2, "0")} 集 · 从 RSS 订阅中找下载源`}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="关闭"
                  className="w-7 h-7 inline-flex items-center justify-center rounded-[6px] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-surface-hover)] transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </Dialog.Close>
            </div>

            {/* 关键词输入 */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 h-8 px-2.5 rounded-[6px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] focus-within:border-[color:var(--accent)]">
                <Search
                  size={13}
                  className="text-[color:var(--text-muted)] shrink-0"
                />
                <input
                  data-no-focus-ring
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitOverride();
                  }}
                  placeholder={data?.aliases?.[0] ?? animeTitle}
                  className="flex-1 bg-transparent outline-none text-[12px] text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]"
                />
              </div>
              <button
                type="button"
                onClick={submitOverride}
                disabled={loading}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border",
                  "border-[color:var(--border-default)] bg-[color:var(--bg-surface)]",
                  "text-[12px] text-[color:var(--text-secondary)]",
                  "hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-colors",
                )}
              >
                {loading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                重搜
              </button>
              <button
                type="button"
                onClick={() => void saveAlias()}
                disabled={!canSaveAlias}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border",
                  "border-[color:var(--border-default)] bg-[color:var(--bg-surface)]",
                  "text-[12px] text-[color:var(--text-secondary)]",
                  "hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-colors",
                )}
              >
                {aliasSaving ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <BookmarkPlus size={12} />
                )}
                {aliasAlreadySaved ? "已保存" : "保存修正"}
              </button>
            </div>

            {data?.savedAliases && data.savedAliases.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]">
                <span>已保存修正：</span>
                {data.savedAliases.map((alias) => (
                  <span
                    key={alias}
                    className="inline-flex items-center gap-1 px-1.5 py-px rounded-[3px] bg-[color:var(--accent-subtle)] border border-[color:var(--accent-muted)] text-[color:var(--accent)]"
                  >
                    {alias}
                    <button
                      type="button"
                      aria-label={`删除 ${alias}`}
                      onClick={() => void removeAlias(alias)}
                      disabled={removingAlias === alias}
                      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-[3px] hover:bg-[color:var(--bg-surface-hover)] disabled:opacity-50"
                    >
                      {removingAlias === alias ? (
                        <Loader2 size={9} className="animate-spin" />
                      ) : (
                        <X size={9} />
                      )}
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 别名提示 */}
            {data?.aliases && data.aliases.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]">
                <span>匹配关键词：</span>
                {data.aliases.map((a) => (
                  <span
                    key={a}
                    className="px-1.5 py-px rounded-[3px] bg-[color:var(--bg-surface)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto">
            {loading && !data && (
              <div className="py-16 text-center">
                <Loader2
                  size={20}
                  className="mx-auto animate-spin text-[color:var(--text-muted)]"
                />
                <p className="mt-3 text-[12px] text-[color:var(--text-muted)]">
                  正在扫描 RSS 源…
                </p>
              </div>
            )}

            {error && (
              <div className="py-12 text-center">
                <p className="text-[12px] text-[color:var(--status-error,#ef4444)]">
                  请求失败：{error}
                </p>
              </div>
            )}

            {data && data.candidates.length === 0 && !loading && (
              <div className="py-12 text-center px-6">
                <p className="text-[13px] text-[color:var(--text-secondary)]">
                  {data.message ?? "未找到匹配的下载源"}
                </p>
                {!data.message && (
                  <p className="mt-2 text-[11px] text-[color:var(--text-muted)] leading-relaxed">
                    试试改关键词，或确认 RSS 源里有这一集
                    <br />
                    （番剧最近没更新这一集也会查不到）
                  </p>
                )}
              </div>
            )}

            {data && data.candidates.length > 0 && (
              <ul className="p-2 space-y-1.5">
                {data.candidates.map((c) => (
                  <CandidateRow
                    key={(c.magnet ?? c.link) + c.title}
                    c={c}
                    state={pushById[c.magnet ?? ""] ?? { kind: "idle" }}
                    onPush={() => void onPush(c)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* 底部状态 */}
          {data && data.candidates.length > 0 && (
            <div className="px-4 py-2 border-t border-[color:var(--border-subtle)] text-[11px] text-[color:var(--text-muted)] shrink-0">
              共 {data.candidates.length} 条候选 · 按发布时间排序
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function duplicateLabel(reason?: DownloadDuplicateReason): string {
  if (reason === "episode-downloaded") return "本集已下载";
  if (reason === "same-episode") return "本集已在队列";
  return "磁链已存在";
}

function normalizeAliasInput(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isSavedAlias(alias: string, savedAliases: string[]): boolean {
  const key = alias.toLowerCase();
  return savedAliases.some((item) => item.toLowerCase() === key);
}

function mergeAliasLabels(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const alias = normalizeAliasInput(item);
      if (!alias) continue;
      const key = alias.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(alias);
    }
  }
  return out;
}

/* ─────────── Row ─────────── */

function CandidateRow({
  c,
  state,
  onPush,
}: {
  c: Candidate;
  state: PushState;
  onPush: () => void;
}) {
  return (
    <li
      className={cn(
        "group flex items-start gap-3 p-2.5 rounded-[8px] border",
        "border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)]",
        "hover:border-[color:var(--border-default)] hover:bg-[color:var(--bg-surface-hover)]",
        "transition-colors",
      )}
    >
      <div className="flex-1 min-w-0">
        <p
          className="text-[12px] text-[color:var(--text-primary)] leading-snug truncate"
          title={c.title}
        >
          {c.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
          {c.group && (
            <span className="px-1.5 py-px rounded-[3px] bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-muted)]">
              {c.group}
            </span>
          )}
          {c.quality && (
            <Tag variant="default">{c.quality}</Tag>
          )}
          {c.size && (
            <span className="text-[color:var(--text-muted)]" data-tabular>
              {c.size === "0" ? "—" : formatMaybeBytes(c.size)}
            </span>
          )}
          {c.pubDate && (
            <span className="text-[color:var(--text-muted)]" data-tabular>
              {formatRelative(c.pubDate)}
            </span>
          )}
          <span className="text-[color:var(--text-muted)] ml-auto">
            {c.sourceName}
          </span>
        </div>
      </div>

      <PushButton state={state} onPush={onPush} disabled={!c.magnet} />
    </li>
  );
}

function PushButton({
  state,
  onPush,
  disabled,
}: {
  state: PushState;
  onPush: () => void;
  disabled?: boolean;
}) {
  if (state.kind === "ok") {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] text-[11px] text-[color:var(--status-success,#4ade80)] bg-[rgba(74,222,128,0.08)] border border-[rgba(74,222,128,0.20)]">
        已加入队列
      </span>
    );
  }
  if (state.kind === "skipped") {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] text-[11px] text-[color:var(--text-secondary)] bg-[color:var(--bg-surface-hover)] border border-[color:var(--border-subtle)]">
        {state.label}
      </span>
    );
  }
  if (state.kind === "fail") {
    return (
      <button
        type="button"
        onClick={onPush}
        title={state.msg}
        className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] text-[11px] text-[color:var(--status-error,#ef4444)] bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.20)] hover:bg-[rgba(239,68,68,0.16)]"
      >
        重试
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onPush}
      disabled={disabled || state.kind === "pushing"}
      className={cn(
        "shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] text-[11px] font-medium",
        "border transition-colors",
        "bg-[color:var(--accent)] text-[color:var(--accent-contrast)] border-transparent",
        "hover:brightness-110",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100",
      )}
    >
      {state.kind === "pushing" ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <Download size={11} strokeWidth={2.5} />
      )}
      下载
    </button>
  );
}

/* ── small format helpers ─────────────────────────────────────── */

function formatMaybeBytes(s: string): string {
  // RSS enclosure 的 length 字段一般是字节数
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return s;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < hr) return `${Math.max(1, Math.round(diff / min))} 分钟前`;
  if (diff < day) return `${Math.round(diff / hr)} 小时前`;
  if (diff < 7 * day) return `${Math.round(diff / day)} 天前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
