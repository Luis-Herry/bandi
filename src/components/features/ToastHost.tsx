"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Info,
  Play,
} from "lucide-react";
import { cn } from "@/lib/cn";

export type ToastTone = "info" | "success" | "warning" | "error" | "download" | "play";

export interface AppToast {
  title: string;
  description?: string;
  tone?: ToastTone;
}

const TOAST_EVENT = "anime-toast";

export function showToast(toast: AppToast) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AppToast>(TOAST_EVENT, { detail: toast }));
}

export function ToastHost() {
  const [toast, setToast] = useState<(AppToast & { id: number }) | null>(null);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<AppToast>).detail;
      if (!detail?.title) return;
      setToast({
        id: Date.now(),
        tone: detail.tone ?? "info",
        title: detail.title,
        description: detail.description,
      });
    };

    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      key={toast.id}
      role="status"
      className={cn(
        "fixed right-6 top-20 z-[70] flex min-w-[280px] max-w-[min(420px,calc(100vw-32px))] items-center gap-3",
        "rounded-[8px] border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)] px-4 py-3",
        "shadow-[0_18px_50px_rgba(0,0,0,0.42)] backdrop-blur-[18px]",
        "animate-[toast-slide-in_220ms_cubic-bezier(0.22,1,0.36,1)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border",
          toneClass(toast.tone ?? "info"),
        )}
      >
        {toastIcon(toast.tone ?? "info")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-[color:var(--text-primary)]">
          {toast.title}
        </span>
        {toast.description && (
          <span className="mt-0.5 block truncate text-[11px] text-[color:var(--text-muted)]">
            {toast.description}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px opacity-70"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}

function toneClass(tone: ToastTone) {
  if (tone === "success") {
    return "border-[rgba(74,222,128,0.22)] bg-[rgba(74,222,128,0.08)] text-[color:var(--status-success)]";
  }
  if (tone === "warning") {
    return "border-[rgba(251,191,36,0.22)] bg-[rgba(251,191,36,0.08)] text-[color:var(--status-warning)]";
  }
  if (tone === "error") {
    return "border-[rgba(239,68,68,0.24)] bg-[rgba(239,68,68,0.09)] text-[color:var(--status-error)]";
  }
  return "border-[color:var(--accent-muted)] bg-[color:var(--accent-subtle)] text-[color:var(--accent)]";
}

function toastIcon(tone: ToastTone) {
  if (tone === "success") return <CheckCircle2 size={15} />;
  if (tone === "warning" || tone === "error") return <AlertCircle size={15} />;
  if (tone === "download") return <Download size={15} />;
  if (tone === "play") return <Play size={15} fill="currentColor" />;
  return <Info size={15} />;
}
