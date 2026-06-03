"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, Loader2, Play } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui";
import { cn } from "@/lib/cn";
import { showToast } from "@/components/features/ToastHost";

interface PlayButtonProps {
  animeId: number;
  /** 指定要播的集号；不传则后端按当前进度选择目标集。 */
  episode?: number;
  /** 按钮文案；通常会包含 EP 标号 */
  label: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  buttonClassName?: string;
  /** 仅显示图标小按钮的模式（行列表里挤不下文字时） */
  iconOnly?: boolean;
}

/**
 * 通用「播放」按钮。
 *
 * 点击 → POST /api/play → 服务端调用 qBit 拿文件路径 → 用 Windows 默认关联程序打开。
 * 失败时按钮下方/旁边弹一段简短错误，3 秒后自动隐藏。
 */
export function PlayButton({
  animeId,
  episode,
  label,
  variant = "primary",
  size = "md",
  className,
  buttonClassName,
  iconOnly,
}: PlayButtonProps) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(null), 3500);
    return () => clearTimeout(t);
  }, [err]);

  const handleClick = () => {
    if (pending) return;
    setErr(null);
    start(async () => {
      try {
        const res = await fetch("/api/play", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            animeId,
            ...(episode != null ? { episode } : {}),
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        if (!res.ok) {
          const message = data?.message ?? data?.error ?? "无法播放";
          setErr(message);
          showToast({
            title: "播放失败",
            description: message,
            tone: "error",
          });
        } else {
          showToast({
            title: "正在启动本地播放器",
            tone: "play",
          });
        }
      } catch {
        setErr("无法播放（网络错误）");
        showToast({
          title: "播放失败",
          description: "网络连接异常",
          tone: "error",
        });
      }
    });
  };

  const iconSize = size === "sm" ? 12 : size === "lg" ? 16 : 14;

  return (
    <span className={cn("relative inline-flex", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={pending}
        aria-label={iconOnly ? label : undefined}
        title={label}
        className={cn(iconOnly && "px-0", buttonClassName)}
      >
        {pending ? (
          <Loader2 size={iconSize} strokeWidth={2.5} className="animate-spin" />
        ) : (
          <Play size={iconSize} strokeWidth={2.8} />
        )}
        {!iconOnly && (pending ? "启动中…" : label)}
      </Button>

      {err && (
        <span
          role="status"
          className={cn(
            "absolute z-10 top-full left-0 mt-1.5 inline-flex items-center gap-1 whitespace-nowrap",
            "rounded-[6px] px-2 py-1 text-[11px]",
            "bg-[rgba(239,68,68,0.10)] text-[color:var(--status-error)]",
            "border border-[rgba(239,68,68,0.25)]",
            "shadow-sm",
          )}
        >
          <AlertCircle size={11} />
          {err}
        </span>
      )}
    </span>
  );
}
