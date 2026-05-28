"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

interface AnimeCoverProps {
  src?: string | null;
  alt: string;
  /** aspect ratio, e.g. "16/9" "2/3" — default 16/9 */
  ratio?: string;
  className?: string;
  /** 上方折叠区域的卡片建议给 true：跳过 lazy + 优先解码 */
  priority?: boolean;
  /**
   * 给 next/image 的 sizes 提示，让浏览器只下与展示宽度相匹配的图。
   * 默认按"卡片网格"场景给一个合理值（1280px 屏 4 列 ≈ 280px）。
   */
  sizes?: string;
}

/**
 * Cover image wrapper:
 *   - 走 next/image 优化（自动 webp/avif、按需缩放、本地缓存）→ 跨次访问秒开
 *   - 加载中显示 shimmer skeleton
 *   - 失败 / 超时 / src 缺失 → 显示 `/cover-placeholder.svg`（可后续直接换文件）
 *
 * 超时：Bangumi 的 `lain.bgm.tv` 偶尔会有图片请求挂住几十秒不超时，next/image
 * 优化器自己的 timeout 也不可靠。这里 8 秒兜底强制翻到 failed 状态，避免卡片
 * 一直转 shimmer。
 */
const TIMEOUT_MS = 8000;
const PLACEHOLDER_SRC = "/cover-placeholder.svg";

export function AnimeCover({
  src,
  alt,
  ratio = "16/9",
  className,
  priority = false,
  sizes = "(min-width: 1280px) 320px, (min-width: 768px) 33vw, 50vw",
}: AnimeCoverProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!src);

  // src 变化时重置状态（卡片复用 / 列表过滤会切 src）
  useEffect(() => {
    setLoaded(false);
    setFailed(!src);
  }, [src]);

  // 超时兜底：N 秒还没 onLoad 也没 onError，强制判失败
  useEffect(() => {
    if (!src || loaded || failed) return;
    const t = setTimeout(() => setFailed(true), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [src, loaded, failed]);

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[color:var(--bg-elevated)]",
        className,
      )}
      style={{ aspectRatio: ratio }}
    >
      {/* loading shimmer：仅在有 src 且还没失败、没加载完时显示 */}
      {src && !loaded && !failed && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(110deg, rgba(255,255,255,0.02) 30%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 70%)",
            backgroundSize: "200% 100%",
            animation: "cover-shimmer 1.6s linear infinite",
          }}
        />
      )}

      {src && !failed && (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          // 非优先项交给浏览器 lazy，priority 自动 eager
          loading={priority ? undefined : "lazy"}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      {/* 失败或没 src：占位图。后续把 public/cover-placeholder.svg 换成成品图即可 */}
      {failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={PLACEHOLDER_SRC}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      <style>{`
        @keyframes cover-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
