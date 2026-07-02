"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  CheckCircle2,
  HelpCircle,
  Pencil,
  Plus,
  RefreshCw,
  Rss,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TestTube,
  Trash2,
  X,
} from "lucide-react";
import {
  AccordionDisclosure,
  Button,
  GlassPanel,
  ShimmerText,
  TextField,
  TextSwap,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/features/ConfirmDialog";
import { QbitSetupGuideDialog } from "@/components/features/QbitSetupGuideDialog";
import { RssEditDialog, type RssSourceDraft } from "@/components/features/RssEditDialog";
import { cn } from "@/lib/cn";

interface DownloadPreferences {
  preferredGroups: string[];
  requiredKeywords: string[];
  preferredQualities: string[];
}

interface RssSource {
  id: number;
  name: string;
  url: string;
  isActive: boolean;
  filters: Record<string, unknown> | null;
  lastCheckedAt: string | number | null;
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

const QUALITY_PRESETS = ["2160p", "1080p", "720p", "480p"];

export function AutomationSettingsClient() {
  const [rssList, setRssList] = useState<RssSource[]>([]);
  const [qbit, setQbit] = useState<QbitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refreshEnvironment = useCallback(async () => {
    setRefreshing(true);
    try {
      const [rss, qbitStatus] = await Promise.all([
        fetch("/api/rss").then((r) => r.json()),
        fetch("/api/downloads/qbit/status").then((r) => r.json()),
      ]);
      setRssList(rss.items ?? []);
      setQbit(qbitStatus);
    } catch (error) {
      console.error("[automation-settings] refresh failed", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshEnvironment();
  }, [refreshEnvironment]);

  async function handleSaveRss(draft: RssSourceDraft) {
    const body = {
      name: draft.name,
      url: draft.url,
      filters: draft.filters,
      isActive: draft.isActive,
    };
    if (draft.id) {
      await fetch(`/api/rss/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/rss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    void refreshEnvironment();
  }

  async function handleDeleteRss(id: number) {
    await fetch(`/api/rss/${id}`, { method: "DELETE" });
    void refreshEnvironment();
  }

  async function handleTestRss(id: number) {
    const res = await fetch(`/api/rss/${id}/test`, { method: "POST" }).then(
      (r) => r.json(),
    );
    alert(
      res.ok
        ? `测试成功：拉取到 ${res.itemCount ?? 0} 条记录${res.matched != null ? `，匹配 ${res.matched} 条` : ""}`
        : `测试失败：${res.error ?? "未知错误"}`,
    );
  }

  async function handleToggleActive(source: RssSource) {
    await fetch(`/api/rss/${source.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !source.isActive }),
    });
    void refreshEnvironment();
  }

  async function handleRunRssCron() {
    await fetch("/api/cron/check-rss", { method: "POST" });
    void refreshEnvironment();
  }

  return (
    <div className="space-y-6">
      <section id="download-preferences" className="scroll-mt-20">
        <PreferencesCard />
      </section>

      <section id="rss" className="scroll-mt-20">
        <SettingsSection
          icon={<Rss size={16} />}
          title="RSS 源"
          subtitle="自动检查更新时使用的订阅源、过滤规则和启停状态"
          action={
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={
                  <RefreshCw
                    size={12}
                    className={refreshing ? "animate-spin" : undefined}
                  />
                }
                onClick={handleRunRssCron}
                disabled={loading || refreshing}
              >
                立即检查
              </Button>
              <RssEditDialog
                onSave={handleSaveRss}
                trigger={
                  <Button variant="primary" size="sm" leftIcon={<Plus size={12} />}>
                    新增
                  </Button>
                }
              />
            </div>
          }
        >
          <div className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-2">
            {loading ? (
              <EmptyText>
                <ShimmerText text="加载 RSS 源中…" />
              </EmptyText>
            ) : rssList.length === 0 ? (
              <EmptyText>还没有 RSS 源</EmptyText>
            ) : (
              <div className="space-y-1.5">
                {rssList.map((source) => (
                  <RssRow
                    key={source.id}
                    source={source}
                    onTest={() => handleTestRss(source.id)}
                    onToggle={() => handleToggleActive(source)}
                    onSave={handleSaveRss}
                    onDelete={() => handleDeleteRss(source.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </SettingsSection>
      </section>

      <section id="qbit" className="scroll-mt-20">
        <SettingsSection
          icon={<Settings2 size={16} />}
          title="qBittorrent"
          subtitle="连接配置由本地环境变量提供，页面负责检测当前可用性"
          action={
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
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
              <Button
                variant="secondary"
                size="sm"
                leftIcon={
                  <RefreshCw
                    size={12}
                    className={refreshing ? "animate-spin" : undefined}
                  />
                }
                onClick={refreshEnvironment}
                disabled={refreshing}
              >
                刷新状态
              </Button>
            </div>
          }
        >
          <QbitStatusPanel qbit={qbit} loading={loading} />
        </SettingsSection>
      </section>
    </div>
  );
}

function PreferencesCard() {
  const [prefs, setPrefs] = useState<DownloadPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetch("/api/preferences").then((r) => r.json());
        if (!cancelled && result?.preferences) {
          setPrefs(result.preferences as DownloadPreferences);
        }
      } catch (error) {
        console.error("[preferences] load failed", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        alert(`保存失败：${error.error ?? res.statusText}`);
        return;
      }
      setSavedAt(Date.now());
    } catch (error) {
      console.error("[preferences] save failed", error);
      alert("保存失败，看控制台");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      icon={<SlidersHorizontal size={16} />}
      title="下载偏好"
      subtitle="自动匹配资源时使用的全局规则，保存后立即影响 RSS 检查"
      action={
        <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end sm:gap-3">
          {savedAt && !saving && (
            <span className="flex items-center gap-1 text-[11px] text-[color:var(--text-muted)]">
              <CheckCircle2 size={12} className="text-[color:var(--accent)]" />
              已保存
            </span>
          )}
          <Button
            variant="primary"
            size="sm"
            disabled={loading || saving || !prefs}
            onClick={handleSave}
            className="min-w-[72px]"
          >
            <TextSwap value={saving ? "保存中…" : "保存"} shimmer={saving} />
          </Button>
        </div>
      }
    >
      {loading || !prefs ? (
        <EmptyText>
          <ShimmerText text="加载下载偏好中…" />
        </EmptyText>
      ) : (
        <div className="space-y-4">
          <TagListField
            label="字幕组白名单"
            hint="命中任一字幕组即放行"
            values={prefs.preferredGroups}
            onChange={(value) => setPrefs({ ...prefs, preferredGroups: value })}
          />
          <TagListField
            label="必含关键字"
            hint="命中任意一个即放行，常用：简体 / 简日 / CHS"
            values={prefs.requiredKeywords}
            onChange={(value) => setPrefs({ ...prefs, requiredKeywords: value })}
          />
          <TagListField
            label="优先画质"
            hint="按顺序匹配，首个命中即接受"
            values={prefs.preferredQualities}
            onChange={(value) => setPrefs({ ...prefs, preferredQualities: value })}
            presets={QUALITY_PRESETS}
          />
        </div>
      )}
    </SettingsSection>
  );
}

function SettingsSection({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <GlassPanel variant="elevated" className="p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 text-[color:var(--accent)]">{icon}</span>
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-[color:var(--text-primary)]">
              {title}
            </h2>
            <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {subtitle}
            </p>
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="mt-5">{children}</div>
    </GlassPanel>
  );
}

function RssRow({
  source,
  onTest,
  onToggle,
  onSave,
  onDelete,
}: {
  source: RssSource;
  onTest: () => void;
  onToggle: () => void;
  onSave: (draft: RssSourceDraft) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const last =
    source.lastCheckedAt != null
      ? formatRelativeTime(
          new Date(
            typeof source.lastCheckedAt === "number"
              ? source.lastCheckedAt * 1000
              : source.lastCheckedAt,
          ),
        )
      : "从未检查";

  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-transparent p-3 transition-colors touch-pan-y hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--bg-surface-hover)] sm:flex-row sm:items-start">
      <button
        type="button"
        onClick={onToggle}
        aria-label={source.isActive ? "停用" : "启用"}
        className={cn(
          "h-2 w-2 shrink-0 rounded-full transition-colors sm:mt-1",
          source.isActive ? "bg-[color:var(--accent)]" : "bg-[color:var(--text-muted)]",
        )}
        style={
          source.isActive
            ? { boxShadow: "0 0 6px rgb(var(--accent-rgb) / 0.6)" }
            : undefined
        }
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
          {source.name}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
          {source.url}
        </p>
        <p data-tabular className="mt-1 text-[10px] text-[color:var(--text-muted)]">
          最近检查：{last}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-start sm:self-auto">
        <IconAction label="测试" onClick={onTest}>
          <TestTube size={13} />
        </IconAction>
        <RssEditDialog
          initial={{
            id: source.id,
            name: source.name,
            url: source.url,
            filters: (source.filters as RssSourceDraft["filters"]) ?? {},
            isActive: source.isActive,
          }}
          onSave={onSave}
          trigger={
            <button
              type="button"
              aria-label="编辑"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]"
            >
              <Pencil size={13} />
            </button>
          }
        />
        <ConfirmDialog
          title="删除这个 RSS 源？"
          description={`「${source.name}」 删除后不会影响已下载内容，但会停止自动检查。`}
          confirmLabel="删除"
          destructive
          onConfirm={onDelete}
          trigger={
            <button
              type="button"
              aria-label="删除"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--status-error)]"
            >
              <Trash2 size={13} />
            </button>
          }
        />
      </div>
    </div>
  );
}

function QbitStatusPanel({
  qbit,
  loading,
}: {
  qbit: QbitStatus | null;
  loading: boolean;
}) {
  const connected = qbit?.connected ?? false;

  if (loading && !qbit) {
    return (
      <EmptyText>
        <ShimmerText text="检测 qBittorrent 中…" />
      </EmptyText>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-5">
        <SummaryTile
          label="连接状态"
          value={connected ? "已连接" : "未连接"}
          active={connected}
        />
        <SummaryTile
          label="Web UI"
          value={qbit?.url ?? "自动检测本机 Web UI"}
          compact
        />
        <SummaryTile label="当前下载" value={formatSpeed(qbit?.dlSpeed)} />
        <SummaryTile label="当前上传" value={formatSpeed(qbit?.upSpeed)} />
        <SummaryTile label="磁盘剩余" value={formatBytes(qbit?.freeSpaceOnDisk)} compact />
      </div>

      <div className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-3">
        <p className="flex items-center gap-2 text-[12px] font-medium text-[color:var(--text-primary)]">
          <Activity size={14} className="text-[color:var(--accent)]" />
          桌面版默认 127.0.0.1:8080；连接配置由桌面主进程注入，可通过本地配置 qbitPort 调整。
        </p>
        <AccordionDisclosure
          title="高级连接说明"
          icon={
            <ShieldCheck
              size={14}
              className="shrink-0 text-[color:var(--accent)]"
            />
          }
          className="mt-3 border-t border-[color:var(--border-subtle)] pt-3"
          buttonClassName="text-[12px] font-medium text-[color:var(--text-secondary)] transition-colors hover:text-[color:var(--text-primary)]"
          bodyClassName="mt-2 space-y-1.5 text-[12px] leading-5 text-[color:var(--text-muted)]"
        >
            <p>
              安全下载模式会限制上传，并在下载完成后暂停 torrent，减少后台做种对网络的占用。
            </p>
            <p>
              如果正在使用 VPN / TUN / 代理，建议在代理软件里将 qbittorrent.exe
              设为直连，qBittorrent 自身代理保持“无”。
            </p>
        </AccordionDisclosure>
        {qbit?.error && (
          <p className="mt-2 text-[12px] text-[color:var(--status-warning)]">
            {qbit.error}
          </p>
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  active,
  compact,
}: {
  label: string;
  value: string;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-3">
      <p className="text-[11px] text-[color:var(--text-muted)]">{label}</p>
      <p
        data-tabular
        className={cn(
          "mt-2 truncate font-semibold text-[color:var(--text-primary)]",
          compact ? "text-[13px]" : "text-[20px]",
          active && "text-[color:var(--accent)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function TagListField({
  label,
  hint,
  values,
  onChange,
  presets,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  presets?: string[];
}) {
  const [draft, setDraft] = useState("");

  function addValue(value: string) {
    const next = value.trim();
    if (!next) return;
    if (values.some((item) => item.toLowerCase() === next.toLowerCase())) return;
    onChange([...values, next]);
  }

  const availablePresets = presets?.filter(
    (preset) => !values.some((value) => value.toLowerCase() === preset.toLowerCase()),
  );

  return (
    <div>
      <div className="mb-1.5 flex flex-col gap-1 min-[520px]:flex-row min-[520px]:items-baseline min-[520px]:justify-between min-[520px]:gap-4">
        <label className="text-[12px] font-medium text-[color:var(--text-primary)]">
          {label}
        </label>
        {hint && (
          <span className="text-[10px] text-[color:var(--text-muted)]">{hint}</span>
        )}
      </div>

      <div className="mb-2 flex min-h-6 flex-wrap gap-1.5">
        {values.length === 0 && (
          <span className="text-[11px] italic text-[color:var(--text-muted)]">
            空，表示不限制
          </span>
        )}
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-[6px] border border-[color:var(--accent-muted)] bg-[color:var(--accent-subtle)] px-2 py-0.5 text-[11px] font-medium leading-[1.4] text-[color:var(--accent)]"
          >
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter((item) => item !== value))}
              aria-label={`移除 ${value}`}
              className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full opacity-60 transition-opacity hover:bg-[color:var(--bg-surface-hover)] hover:opacity-100"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center">
        <TextField
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue(draft);
              setDraft("");
            }
          }}
          placeholder="输入后回车添加"
          className="h-9 flex-1"
        />
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={!draft.trim()}
          onClick={() => {
            addValue(draft);
            setDraft("");
          }}
        >
          添加
        </Button>
      </div>

      {availablePresets && availablePresets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="mr-1 self-center text-[10px] text-[color:var(--text-muted)]">
            预设：
          </span>
          {availablePresets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => addValue(preset)}
              className="rounded-[6px] border border-[color:var(--border-subtle)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-default)] hover:text-[color:var(--text-primary)]"
            >
              + {preset}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--bg-surface-hover)] hover:text-[color:var(--text-primary)]"
    >
      {children}
    </button>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return (
    <p className="py-8 text-center text-[12px] text-[color:var(--text-muted)]">
      {children}
    </p>
  );
}

function formatSpeed(value?: number): string {
  if (!value || value <= 0) return "—";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let next = value;
  let unit = 0;
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024;
    unit++;
  }
  return `${next.toFixed(next >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let next = value;
  let unit = 0;
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024;
    unit++;
  }
  return `${next.toFixed(next >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}
