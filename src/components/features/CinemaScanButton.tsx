"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Folder, FolderOpen, Loader2 } from "lucide-react";
import { Button, GlassPanel, ResizePanel, ShimmerText } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useErrorShake } from "@/hooks/useErrorShake";
import { getDesktopBridge } from "@/lib/desktop-bridge";

interface ScanSummary {
  titlesScanned: number;
  animeCreated: number;
  animeMatched: number;
  titlesConflicted?: number;
  episodesCreated: number;
  filesImported: number;
  filesSkipped: number;
  filesConflicted?: number;
  skippedFansubFiles?: number;
}

interface ScanPreview {
  titlesScanned: number;
  filesFound: number;
  movies: number;
  dramas?: number;
  series?: number;
  existingMatches?: number;
  newTitles?: number;
  titlesConflicted?: number;
  pathConflicts?: number;
  skippedFansubFiles?: number;
  samples: Array<{
    title: string;
    kind: "movie" | "drama" | "series";
    year: number | null;
    season: number | null;
    files: number;
    action?: "match" | "create" | "conflict";
  }>;
}

type ScanMode = "cinema" | "anime";

/**
 * 本地影视库扫描入口。填入自有影片文件夹的绝对路径 → 预览 → 确认入库。
 * 只扫用户自有文件，不抓盗版（合法边界）。
 */
function LocalMediaScanButton({ mode }: { mode: ScanMode }) {
  const router = useRouter();
  const isAnime = mode === "anime";
  const apiPath = isAnime ? "/api/library/local/scan" : "/api/cinema/scan";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [desktopPickerAvailable, setDesktopPickerAvailable] = useState(false);
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const scanError = useErrorShake();
  const [preview, setPreview] = useState<ScanPreview | null>(null);

  useEffect(() => {
    setDesktopPickerAvailable(Boolean(getDesktopBridge()?.chooseMediaDirectory));
  }, []);

  // 展开时回填已保存的扫描目录
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(apiPath)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.roots?.[0]) setPath((p) => p || d.roots[0]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiPath, open]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (!root.contains(event.target)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const runScan = async ({ preview }: { preview: boolean }) => {
    const previewOnly = preview;
    const root = path.trim();
    if (!root) {
      scanError.showError(
        isAnime ? "请选择本地动漫文件夹" : "请填写本地影视文件夹的绝对路径",
      );
      return;
    }
    setBusy(true);
    scanError.clear();
    setMsg(null);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roots: [root], preview }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        scanError.showError(data?.error ?? (previewOnly ? "预览失败" : "扫描失败"));
        return;
      }

      if (previewOnly) {
        const s = data.summary as ScanPreview;
        setPreview(s);
        setMsg(
          isAnime
            ? `预览完成：识别 ${s.titlesScanned} 部动漫 / ${s.filesFound} 个文件，其中系列 ${s.series ?? 0} 部、电影 ${s.movies} 部；将复用 ${s.existingMatches ?? 0} 部、新建 ${s.newTitles ?? 0} 部` +
                (s.pathConflicts
                  ? `，${s.pathConflicts} 个文件已有其他归属，将跳过`
                  : "") +
                "。确认后再写入本地库。"
            : `预览完成：识别 ${s.titlesScanned} 个条目 / ${s.filesFound} 个文件，其中电视剧 ${s.dramas ?? 0} 部、电影 ${s.movies} 部` +
                (s.skippedFansubFiles
                  ? `，跳过 ${s.skippedFansubFiles} 个字幕组动画（动漫请在番剧侧管理）`
                  : "") +
                "。确认后再写入本地库。",
        );
        return;
      }

      const s = data.summary as ScanSummary;
      setPreview(null);
      setMsg(
        `导入完成：识别 ${s.titlesScanned} 个条目，新增 ${s.animeCreated} 部 / 复用 ${s.animeMatched} 部，导入 ${s.filesImported} 个文件` +
          (s.filesSkipped ? `，跳过 ${s.filesSkipped} 个已有` : "") +
          (s.filesConflicted ? `，跳过 ${s.filesConflicted} 个归属冲突` : "") +
          (s.titlesConflicted ? `，跳过 ${s.titlesConflicted} 个同名冲突` : "") +
          (s.skippedFansubFiles
            ? `，跳过 ${s.skippedFansubFiles} 个字幕组动画（动漫请在番剧侧管理）`
            : "") +
          "。",
      );
      router.refresh();
    } catch {
      scanError.showError(previewOnly ? "预览请求出错" : "扫描请求出错");
    } finally {
      setBusy(false);
    }
  };

  const previewScan = () => runScan({ preview: true });
  const confirmImport = () => runScan({ preview: false });

  const chooseDirectory = async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.chooseMediaDirectory || choosingDirectory) return;
    setChoosingDirectory(true);
    scanError.clear();
    try {
      const result = await bridge.chooseMediaDirectory({
        defaultPath: path.trim() || undefined,
        kind: mode,
      });
      if (!result.canceled && result.directoryPath) {
        setPath(result.directoryPath);
        setPreview(null);
        setMsg(null);
      }
    } catch {
      scanError.showError("无法打开文件夹选择器，请直接输入目录路径");
    } finally {
      setChoosingDirectory(false);
    }
  };

  return (
    <div ref={rootRef} className="relative inline-flex justify-end">
      <Button
        variant="solid"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        leftIcon={<Folder size={14} />}
        aria-expanded={open}
        aria-controls={panelId}
      >
        扫描本地库
      </Button>

      {open && (
        <GlassPanel
          id={panelId}
          variant="elevated"
          className={cn(
            "absolute right-0 top-[calc(100%+8px)] z-40 w-[min(calc(100vw-32px),420px)] p-3",
            "shadow-[0_18px_48px_rgba(0,0,0,0.5)]",
          )}
          style={{
            background: "var(--bg-elevated)",
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
          }}
        >
          <ResizePanel innerClassName="space-y-2">
          <div className="flex items-center gap-2">
            <input
              data-no-focus-ring
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setPreview(null);
                setMsg(null);
                scanError.clear();
              }}
              placeholder={
                isAnime
                  ? "本地动漫文件夹，例如 D:\\Anime 或 E:\\动画"
                  : "本地影片文件夹绝对路径，例如 D:\\Movies 或 E:\\剧集"
              }
              spellCheck={false}
              className={cn(
                "t-input h-9 min-w-0 flex-1 rounded-[8px] border px-3 text-[13px]",
                "bg-[color:var(--bg-elevated)] border-[color:var(--border-default)]",
                "text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]",
                "outline-none focus:border-[color:var(--accent)]",
                scanError.hasError && "is-error",
                scanError.isShaking && "is-shaking",
              )}
            />
            {desktopPickerAvailable && (
              <Button
                size="sm"
                variant="secondary"
                onClick={chooseDirectory}
                disabled={choosingDirectory || busy}
                leftIcon={
                  choosingDirectory ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FolderOpen size={14} />
                  )
                }
                className="shrink-0"
              >
                {choosingDirectory ? "选择中" : "选择文件夹"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={previewScan}
              disabled={busy}
              leftIcon={busy ? <Loader2 size={14} className="animate-spin" /> : undefined}
            >
              {busy ? <ShimmerText text="扫描中" /> : "预览扫描"}
            </Button>
            {preview && (
              <Button size="sm" onClick={confirmImport} disabled={busy}>
                确认导入
              </Button>
            )}
            <span className="text-[11px] text-[color:var(--text-muted)]">
              先预览数量，确认后才写入本地库
            </span>
          </div>
          {preview && preview.samples.length > 0 && (
            <div className="space-y-1 rounded-[8px] border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)] p-2">
              {preview.samples.map((item, index) => (
                <div
                  key={`${item.kind}-${item.title}-${item.season ?? 0}-${index}`}
                  className="flex items-center justify-between gap-3 text-[11px] text-[color:var(--text-muted)]"
                >
                  <span className="min-w-0 truncate text-[color:var(--text-secondary)]">
                    {item.title}
                  </span>
                  <span className="shrink-0">
                    {item.kind === "movie"
                      ? "电影"
                      : item.kind === "series"
                        ? "动漫系列"
                        : "电视剧"}
                    {item.year ? ` · ${item.year}` : ""}
                    {item.kind !== "movie" && item.season
                      ? ` · S${item.season}`
                      : ""}
                    {item.action === "match"
                      ? " · 复用资料"
                      : item.action === "create"
                        ? " · 新建本地条目"
                        : item.action === "conflict"
                          ? " · 同名冲突"
                          : ""}
                    {" · "}
                    {item.files} 个文件
                  </span>
                </div>
              ))}
            </div>
          )}
          {msg && (
            <p className="text-[12px] text-[color:var(--status-success)]">{msg}</p>
          )}
          {scanError.message && (
            <p
              role={scanError.visible ? "alert" : undefined}
              className={cn(
                "t-error-msg text-[12px] text-[color:var(--status-error)]",
                scanError.visible && "is-visible",
              )}
            >
              {scanError.message}
            </p>
          )}
          </ResizePanel>
        </GlassPanel>
      )}
    </div>
  );
}

export function CinemaScanButton() {
  return <LocalMediaScanButton mode="cinema" />;
}

export function AnimeLocalScanButton() {
  return <LocalMediaScanButton mode="anime" />;
}
