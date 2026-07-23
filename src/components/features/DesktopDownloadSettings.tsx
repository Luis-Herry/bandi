"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  FolderOpen,
  HardDrive,
  Link2,
  LoaderCircle,
  Smartphone,
  Trash2,
} from "lucide-react";
import { Button, MotionSwitch, ShimmerText } from "@/components/ui";
import { formatStorageBytes, getDesktopBridge } from "@/lib/desktop-bridge";

export function DesktopDownloadSettings() {
  const [settings, setSettings] = useState<DesktopSettingsState | null>(null);
  const [downloadDir, setDownloadDir] = useState("");
  const [freeSpaceBytes, setFreeSpaceBytes] = useState<number | null>(null);
  const [closeToTray, setCloseToTray] = useState(true);
  const [lanAccess, setLanAccess] = useState(false);
  const [pairing, setPairing] = useState<{
    code: string;
    expiresAt: number;
    urls: string[];
  } | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    void bridge.getSettings()
      .then((value) => {
        setSettings(value);
        setDownloadDir(value.downloadDir);
        setFreeSpaceBytes(value.freeSpaceBytes);
        setCloseToTray(value.closeToTray);
        setLanAccess(value.lanAccess === true);
      })
      .catch(() => {
        setLoadError(
          document.documentElement.dataset.localServerApp === "true"
            ? "下载目录与局域网设备只能在运行 Bandi 的 Mac 上修改。"
            : "桌面设置暂时无法读取，请重新打开 Bandi。",
        );
      });
  }, []);

  if (!settings) {
    return loadError ? (
      <div className="mt-4 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-3 text-[11px] leading-5 text-[color:var(--text-secondary)]" role="status">
        {loadError}
      </div>
    ) : null;
  }

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
      const result = await bridge.saveSettings({
        downloadDir,
        closeToTray,
        ...(settings?.runtime === "macos-local-web" ? { lanAccess } : {}),
      });
      if (!result.ok || !result.settings) {
        setError(result.error ?? "保存桌面设置失败");
        return;
      }
      setSettings(result.settings);
      setDownloadDir(result.settings.downloadDir);
      setFreeSpaceBytes(result.settings.freeSpaceBytes);
      setCloseToTray(result.settings.closeToTray);
      setLanAccess(result.settings.lanAccess === true);
      if (!result.settings.lanAccess) setPairing(null);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const dirty = Boolean(
    settings &&
      (settings.downloadDir !== downloadDir ||
        (settings.runtime !== "macos-local-web" && settings.closeToTray !== closeToTray) ||
        (settings.runtime === "macos-local-web" && settings.lanAccess !== lanAccess)),
  );
  const isLocalServer = settings.runtime === "macos-local-web";

  async function createPairing() {
    const bridge = getDesktopBridge();
    if (!bridge?.createPairing || pairingBusy) return;
    setPairingBusy(true);
    setError(null);
    try {
      const result = await bridge.createPairing();
      if (!result.ok || !result.code || !result.expiresAt) {
        setError(result.error === "lan_disabled" ? "请先开启并保存局域网访问" : "配对码生成失败");
        return;
      }
      setPairing({
        code: result.code,
        expiresAt: result.expiresAt,
        urls: result.urls || settings?.lanUrls || [],
      });
    } finally {
      setPairingBusy(false);
    }
  }

  async function revokeDevice(deviceId: string) {
    const bridge = getDesktopBridge();
    if (!bridge?.revokeDevice) return;
    const result = await bridge.revokeDevice(deviceId);
    if (!result.ok) return;
    const refreshed = await bridge.getSettings();
    setSettings(refreshed);
  }

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

      {!isLocalServer && (
        <div className="mt-4 border-t border-[color:var(--border-subtle)] pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[12px] font-medium text-[color:var(--text-primary)]">
                关闭窗口后继续下载
              </p>
              <p className="mt-1 text-[10px] text-[color:var(--text-muted)]">
                关闭窗口时缩到系统托盘
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <MotionSwitch
                checked={closeToTray}
                onCheckedChange={(value) => {
                  setCloseToTray(value);
                  setSaved(false);
                }}
                aria-label="关闭窗口后继续下载"
                className="relative h-6 w-11 shrink-0 rounded-full border border-[color:var(--border-default)] bg-[color:var(--bg-surface-hover)] p-1 [--toggle-travel:20px] focus-visible:outline-2 focus-visible:outline-offset-[6px] focus-visible:outline-[color:var(--accent)] data-[state=checked]:border-[color:var(--accent)] data-[state=checked]:bg-[color:var(--accent)]"
                thumbClassName="block h-4 w-4 rounded-full bg-[color:var(--text-primary)] shadow-sm"
              />
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
          {(error || saved) && (
            <div className="mt-2 flex min-h-4 justify-end">
              {error ? (
                <span className="text-[10px] text-[color:var(--status-error)]">{error}</span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-[color:var(--text-muted)]">
                  <CheckCircle2 size={11} className="text-[color:var(--status-success)]" />
                  已保存
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {isLocalServer && (
        <div className="mt-4 border-t border-[color:var(--border-subtle)] pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-start gap-2.5">
              <Smartphone size={15} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
              <div>
                <p className="text-[12px] font-medium text-[color:var(--text-primary)]">允许 iPhone / iPad 访问</p>
                <p className="mt-1 text-[11px] leading-4 text-[color:var(--text-secondary)]">
                  仅在可信家庭网络开启。配对设备可查看全部媒体库并控制下载；共享 Wi-Fi 上请保持关闭
                </p>
              </div>
            </div>
            <MotionSwitch
              checked={lanAccess}
              onCheckedChange={(value) => {
                setLanAccess(value);
                setPairing(null);
                setSaved(false);
              }}
              aria-label="允许局域网设备访问"
              className="relative h-6 w-11 shrink-0 rounded-full border border-[color:var(--border-default)] bg-[color:var(--bg-surface-hover)] p-1 [--toggle-travel:20px] after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-[6px] focus-visible:outline-[color:var(--accent)] data-[state=checked]:border-[color:var(--accent)] data-[state=checked]:bg-[color:var(--accent)]"
              thumbClassName="block h-4 w-4 rounded-full bg-[color:var(--text-primary)] shadow-sm"
            />
          </div>

          {settings.lanAccess && (
            <div className="mt-4 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-hover)] p-3">
              {(settings.lanUrls || []).map((url) => (
                <div key={url} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[color:var(--text-secondary)]">{url}</span>
                  <button
                    type="button"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
                    onClick={() => void navigator.clipboard.writeText(url)}
                    aria-label="复制访问地址"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                leftIcon={pairingBusy ? <LoaderCircle size={12} className="animate-spin" /> : <Link2 size={12} />}
                disabled={pairingBusy}
                onClick={createPairing}
              >
                生成配对码
              </Button>
              {pairing && (
                <div className="mt-3 rounded-[8px] border border-[color:var(--border-default)] bg-[color:var(--bg-base)] px-4 py-3 text-center">
                  <p className="font-mono text-[24px] font-semibold tracking-[0.3em] text-[color:var(--text-primary)]">{pairing.code}</p>
                  <p className="mt-1 text-[11px] text-[color:var(--text-secondary)]">10 分钟内有效；只给正在配对且可查看全部媒体库、控制下载的设备</p>
                </div>
              )}
              {(settings.pairedDevices || []).length > 0 && (
                <div className="mt-4 space-y-2 border-t border-[color:var(--border-subtle)] pt-3">
                  {(settings.pairedDevices || []).map((device) => (
                    <div key={device.id} className="flex items-center gap-2 text-[11px]">
                      <Smartphone size={12} className="text-[color:var(--text-muted)]" />
                      <span className="min-w-0 flex-1 truncate text-[color:var(--text-secondary)]">{device.name}</span>
                      <button
                        type="button"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--status-error)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
                        onClick={() => void revokeDevice(device.id)}
                        aria-label={`移除 ${device.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isLocalServer && (
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
      )}
    </div>
  );
}
