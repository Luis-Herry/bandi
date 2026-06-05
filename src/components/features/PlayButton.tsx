"use client";

import { Play } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui";
import { cn } from "@/lib/cn";

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
 * 点击进入内置 Web 播放器。播放器页会负责视频流、进度恢复和外部播放器兜底。
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
  const targetEpisode = episode ?? 1;
  const href = `/player/${animeId}/${targetEpisode}`;
  const iconSize = size === "sm" ? 12 : size === "lg" ? 16 : 14;

  return (
    <span className={cn("relative inline-flex", className)}>
      <Button
        asChild
        variant={variant}
        size={size}
        className={cn(iconOnly && "px-0", buttonClassName)}
      >
        <a href={href} aria-label={iconOnly ? label : undefined} title={label}>
          <Play size={iconSize} strokeWidth={2.8} />
          {!iconOnly && label}
        </a>
      </Button>
    </span>
  );
}
