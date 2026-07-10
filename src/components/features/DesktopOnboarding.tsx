"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Switch from "@radix-ui/react-switch";
import {
  ArrowRight,
  CheckCircle2,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  MonitorDown,
  Rss,
  ShieldCheck,
  Subtitles,
} from "lucide-react";
import { BrandLogo } from "@/components/features/BrandLogo";
import { Button, GlassPanel, ShimmerText } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatStorageBytes, getDesktopBridge } from "@/lib/desktop-bridge";

type QualityChoice = "keep" | "1080p" | "4k" | "720p";
type SubtitleChoice = "keep" | "zh" | "any";

const QUALITY_VALUES: Record<Exclude<QualityChoice, "keep">, string[]> = {
  "1080p": ["1080p"],
  "4k": ["2160p", "4K", "1080p"],
  "720p": ["720p"],
};

const SIMPLIFIED_SUBTITLE_KEYWORDS = ["简体", "简日", "简中", "CHS", "GB"];

export function DesktopOnboarding() {
  const router = useRouter();
  const [settings, setSettings] = useState<DesktopSettingsState | null>(null);
  const [downloadDir, setDownloadDir] = useState("");
  const [freeSpaceBytes, setFreeSpaceBytes] = useState<number | null>(null);
  const [closeToTray, setCloseToTray] = useState(true);
  const [quality, setQuality] = useState<QualityChoice>("1080p");
  const [subtitles, setSubtitles] = useState<SubtitleChoice>("zh");
  const [qbitReady, setQbitReady] = useState<boolean | null>(null);
  const [rssReady, setRssReady] = useState<boolean | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setError("当前窗口无法访问桌面设置，请重新启动应用");
      return;
    }

    void Promise.all([
      bridge.getSettings(),
      fetch("/api/downloads/qbit/status", { cache: "no-store" })
        .then((res) => res.json())
        .catch(() => null),
      fetch("/api/rss", { cache: "no-store" })
        .then((res) => res.json())
        .catch(() => null),
    ]).then(([desktop, qbit, rss]) => {
      if (desktop.onboardingComplete) {
        router.replace("/");
        return;
      }
      setSettings(desktop);
      setDownloadDir(desktop.downloadDir);
      setFreeSpaceBytes(desktop.freeSpaceBytes);
      setCloseToTray(desktop.closeToTray);
      if (desktop.onboardingMode === "upgrade") {
        setQuality("keep");
        setSubtitles("keep");
      }
      setQbitReady(Boolean(qbit?.connected && qbit?.managed));
      setRssReady(Array.isArray(rss?.items) && rss.items.length > 0);
    });
  }, [router]);

  async function chooseDirectory() {
    const bridge = getDesktopBridge();
    if (!bridge || choosing) return;
    setChoosing(true);
    setError(null);
    try {
      const result = await bridge.chooseDownloadDirectory();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!result.canceled && result.downloadDir) {
        setDownloadDir(result.downloadDir);
        setFreeSpaceBytes(result.freeSpaceBytes ?? null);
      }
    } finally {
      setChoosing(false);
    }
  }

  async function saveResourcePreferences() {
    if (quality === "keep" && subtitles === "keep") return;
    const current = await fetch("/api/preferences", { cache: "no-store" }).then(
      (res) => res.json(),
    );
    const preferences = current?.preferences;
    if (!preferences) return;
    const response = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferredGroups: preferences.preferredGroups,
        requiredKeywords:
          subtitles === "keep"
            ? preferences.requiredKeywords
            : subtitles === "zh"
              ? SIMPLIFIED_SUBTITLE_KEYWORDS
              : [],
        preferredQualities:
          quality === "keep"
            ? preferences.preferredQualities
            : QUALITY_VALUES[quality],
      }),
    });
    if (!response.ok) throw new Error("resource_preferences_failed");
  }

  async function completeOnboarding() {
    const bridge = getDesktopBridge();
    if (!bridge || !downloadDir || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await bridge.saveSettings({
        downloadDir,
        closeToTray,
        completeOnboarding: true,
      });
      if (!result.ok) {
        setError(result.error ?? "保存桌面设置失败");
        return;
      }
      await saveResourcePreferences().catch(() => {
        console.warn("[onboarding] resource preferences were not updated");
      });
      router.replace("/");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const isUpgrade = settings?.onboardingMode === "upgrade";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[color:var(--bg-base)] px-6 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, rgb(var(--accent-rgb) / 0.12), transparent 34%), radial-gradient(circle at 84% 72%, rgb(var(--accent-rgb) / 0.05), transparent 30%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-[940px]">
        <header className="t-stagger is-shown text-center">
          <div className="t-stagger-line t-stagger-line--1 flex justify-center">
            <BrandLogo />
          </div>
          <h1 className="t-stagger-line t-stagger-line--2 mt-5 text-[32px] font-extrabold tracking-[-0.03em] text-[color:var(--text-primary)]">
            {isUpgrade ? "确认新版下载位置" : "准备好你的私人放映厅"}
          </h1>
          <p className="t-stagger-line t-stagger-line--3 mx-auto mt-2 max-w-[620px] text-[13px] leading-6 text-[color:var(--text-secondary)]">
            {isUpgrade
              ? "现有视频会留在原位置，新下载将保存到你确认的文件夹。"
              : "只需确认视频保存位置，其余下载服务已自动准备完成。"}
          </p>
        </header>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <GlassPanel variant="elevated" className="p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-[8px] bg-[rgb(var(--accent-rgb)/0.1)] p-2 text-[color:var(--accent)]">
                <HardDrive size={18} />
              </span>
              <div>
                <h2 className="text-[16px] font-semibold text-[color:var(--text-primary)]">
                  下载目录
                </h2>
                <p className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                  数据库与配置仍由应用管理，这里只保存视频文件
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[10px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] p-4">
              <p className="break-all font-mono text-[12px] leading-5 text-[color:var(--text-primary)]">
                {downloadDir || "正在读取推荐目录…"}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]">
                  <CheckCircle2 size={13} className="text-[color:var(--status-success)]" />
                  可用空间 {formatStorageBytes(freeSpaceBytes)}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={
                    choosing ? (
                      <LoaderCircle size={12} className="animate-spin" />
                    ) : (
                      <FolderOpen size={12} />
                    )
                  }
                  disabled={!settings || choosing || saving}
                  onClick={chooseDirectory}
                >
                  更改位置
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <ChoiceGroup
                icon={<MonitorDown size={14} />}
                label="画质偏好"
                value={quality}
                onChange={(value) => setQuality(value as QualityChoice)}
                options={[
                  ...(isUpgrade
                    ? [{ value: "keep", label: "保持现有" }]
                    : []),
                  { value: "1080p", label: "1080p" },
                  { value: "4k", label: "4K" },
                  { value: "720p", label: "720p" },
                ]}
              />
              <ChoiceGroup
                icon={<Subtitles size={14} />}
                label="字幕偏好"
                value={subtitles}
                onChange={(value) => setSubtitles(value as SubtitleChoice)}
                options={[
                  ...(isUpgrade
                    ? [{ value: "keep", label: "保持现有" }]
                    : []),
                  { value: "zh", label: "简体中文" },
                  { value: "any", label: "不限" },
                ]}
              />
            </div>

            <div className="mt-5 flex items-center justify-between gap-4 rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-4">
              <div>
                <p className="text-[13px] font-medium text-[color:var(--text-primary)]">
                  关闭窗口后继续下载
                </p>
                <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                  窗口缩到系统托盘，下载服务继续运行
                </p>
              </div>
              <Switch.Root
                checked={closeToTray}
                onCheckedChange={setCloseToTray}
                aria-label="关闭窗口后继续下载"
                className="relative h-6 w-11 shrink-0 rounded-full border border-[color:var(--border-default)] bg-[color:var(--bg-surface-hover)] transition-colors data-[state=checked]:border-[color:var(--accent)] data-[state=checked]:bg-[color:var(--accent)]"
              >
                <Switch.Thumb className="block h-4 w-4 translate-x-1 rounded-full bg-[color:var(--text-primary)] shadow-sm transition-transform data-[state=checked]:translate-x-6" />
              </Switch.Root>
            </div>
          </GlassPanel>

          <GlassPanel variant="default" className="p-6">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--text-primary)]">
              <ShieldCheck size={16} className="text-[color:var(--accent)]" />
              自动检查
            </div>
            <div className="mt-4 space-y-2.5">
              <CheckRow
                icon={<HardDrive size={14} />}
                label="下载目录可写"
                ready={settings?.directoryWritable ?? null}
              />
              <CheckRow
                icon={<ShieldCheck size={14} />}
                label="内置下载引擎"
                ready={qbitReady}
              />
              <CheckRow icon={<Rss size={14} />} label="默认 RSS 源" ready={rssReady} />
            </div>
            <p className="mt-5 text-[11px] leading-5 text-[color:var(--text-muted)]">
              端口、账号、上传限制和异常恢复由桌面版自动管理。检查暂时失败也可以进入应用，后台会继续恢复。
            </p>
            {error && (
              <p className="mt-4 rounded-[8px] border border-[rgb(239_68_68/0.25)] bg-[rgb(239_68_68/0.07)] px-3 py-2 text-[11px] leading-5 text-[color:var(--status-error)]">
                {error}
              </p>
            )}
            <Button
              variant="primary"
              className="mt-6 w-full"
              rightIcon={
                saving ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <ArrowRight size={14} />
                )
              }
              disabled={!settings || !downloadDir || saving}
              onClick={completeOnboarding}
            >
              {saving ? (
                <ShimmerText text="正在保存…" />
              ) : isUpgrade ? (
                "确认并进入首页"
              ) : (
                "开始使用 Bandi"
              )}
            </Button>
          </GlassPanel>
        </div>
      </div>
    </main>
  );
}

function ChoiceGroup({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--text-primary)]">
        <span className="text-[color:var(--accent)]">{icon}</span>
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-8 rounded-[7px] border px-2.5 text-[11px] transition-[background-color,border-color,color,transform] active:scale-[0.98] motion-reduce:active:scale-100",
              value === option.value
                ? "border-[color:var(--accent)] bg-[rgb(var(--accent-rgb)/0.12)] text-[color:var(--text-primary)]"
                : "border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-default)] hover:text-[color:var(--text-primary)]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CheckRow({
  icon,
  label,
  ready,
}: {
  icon: React.ReactNode;
  label: string;
  ready: boolean | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] px-3 py-2.5">
      <span className="flex items-center gap-2 text-[12px] text-[color:var(--text-secondary)]">
        <span className="text-[color:var(--text-muted)]">{icon}</span>
        {label}
      </span>
      {ready == null ? (
        <LoaderCircle size={13} className="animate-spin text-[color:var(--text-muted)]" />
      ) : ready ? (
        <CheckCircle2 size={14} className="text-[color:var(--status-success)]" />
      ) : (
        <span className="text-[10px] text-[color:var(--status-warning)]">后台恢复中</span>
      )}
    </div>
  );
}
