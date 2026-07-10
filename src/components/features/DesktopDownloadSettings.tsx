"use client";

import { useEffect, useState } from "react";
import * as Switch from "@radix-ui/react-switch";
import { CheckCircle2, FolderOpen, HardDrive, LoaderCircle } from "lucide-react";
import { Button, ShimmerText } from "@/components/ui";
import { formatStorageBytes, getDesktopBridge } from "@/lib/desktop-bridge";

export function DesktopDownloadSettings() {
  const [settings, setSettings] = useState<DesktopSettingsState | null>(null);
  const [downloadDir, setDownloadDir] = useState("");
  const [freeSpaceBytes, setFreeSpaceBytes] = useState<number | null>(null);
  const [closeToTray, setCloseToTray] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    void bridge.getSettings().then((value) => {
      setSettings(value);
      setDownloadDir(value.downloadDir);
      setFreeSpaceBytes(value.freeSpaceBytes);
      setCloseToTray(value.closeToTray);
    });
  }, []);

  if (!settings) return null;

  async function chooseDirectory() {
    const bridge = getDesktopBridge();
    if (!bridge || choosing) return;
    setChoosing(true);
    setSaved(false);
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

  async function save() {
    const bridge = getDesktopBridge();
    if (!bridge || saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const result = await bridge.saveSettings({ downloadDir, closeToTray });
      if (!result.ok || !result.settings) {
        setError(result.error ?? "保存桌面设置失败");
        return;
      }
      setSettings(result.settings);
      setDownloadDir(result.settings.downloadDir);
      setFreeSpaceBytes(result.settings.freeSpaceBytes);
      setCloseToTray(result.settings.closeToTray);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const dirty = Boolean(
    settings &&
      (settings.downloadDir !== downloadDir || settings.closeToTray !== closeToTray),
  );

  return (
    <div className="mt-4 rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <HardDrive size={15} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[color:var(--text-primary)]">
              视频保存位置
            </p>
            <p className="mt-1 break-all font-mono text-[11px] leading-5 text-[color:var(--text-secondary)]">
              {downloadDir || "正在读取…"}
            </p>
            <p className="mt-1 text-[10px] text-[color:var(--text-muted)]">
              可用空间 {formatStorageBytes(freeSpaceBytes)}；更改后只影响新下载
            </p>
          </div>
        </div>
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

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-[color:var(--border-subtle)] pt-4">
        <div>
          <p className="text-[12px] font-medium text-[color:var(--text-primary)]">
            关闭窗口后继续下载
          </p>
          <p className="mt-1 text-[10px] text-[color:var(--text-muted)]">
            关闭窗口时缩到系统托盘
          </p>
        </div>
        <Switch.Root
          checked={closeToTray}
          onCheckedChange={(value) => {
            setCloseToTray(value);
            setSaved(false);
          }}
          aria-label="关闭窗口后继续下载"
          className="relative h-6 w-11 shrink-0 rounded-full border border-[color:var(--border-default)] bg-[color:var(--bg-surface-hover)] transition-colors data-[state=checked]:border-[color:var(--accent)] data-[state=checked]:bg-[color:var(--accent)]"
        >
          <Switch.Thumb className="block h-4 w-4 translate-x-1 rounded-full bg-[color:var(--text-primary)] shadow-sm transition-transform data-[state=checked]:translate-x-6" />
        </Switch.Root>
      </div>

      <div className="mt-4 flex min-h-8 items-center justify-end gap-3">
        {error && (
          <span className="mr-auto text-[10px] text-[color:var(--status-error)]">
            {error}
          </span>
        )}
        {saved && !error && (
          <span className="mr-auto flex items-center gap-1 text-[10px] text-[color:var(--text-muted)]">
            <CheckCircle2 size={11} className="text-[color:var(--status-success)]" />
            已保存
          </span>
        )}
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty || saving}
          onClick={save}
        >
          {saving ? <ShimmerText text="保存中…" /> : "保存设置"}
        </Button>
      </div>
    </div>
  );
}
