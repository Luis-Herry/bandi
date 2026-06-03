"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!src);
  const [shouldLoad, setShouldLoad] = useState(priority);
  const bypassOptimization =
    src != null && /^https:\/\/(?:lain\.bgm\.tv|bangumi\.tv)\//.test(src);

  // src 变化时重置状态（卡片复用 / 列表过滤会切 src）
  useEffect(() => {
    setLoaded(false);
    setFailed(!src);
    setShouldLoad(priority);
  }, [src, priority]);

  // 非首屏封面先等进入视口附近再挂载图片，避免浏览器 lazy 还没开始请求时被超时判失败。
  useEffect(() => {
    if (!src || priority || shouldLoad) return;
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [src, priority, shouldLoad]);

  // 超时兜底：只有真正开始加载后才计时，避免懒加载封面提前落到占位图。
  useEffect(() => {
    if (!src || !shouldLoad || loaded || failed) return;
    const t = setTimeout(() => setFailed(true), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [src, shouldLoad, loaded, failed]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative overflow-hidden bg-[color:var(--bg-elevated)]",
        className,
      )}
      style={{ aspectRatio: ratio }}
    >
      {/* loading shimmer：仅在有 src 且还没失败、没加载完时显示 */}
      {src && shouldLoad && !loaded && !failed && (
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

      {src && shouldLoad && !failed && bypassOptimization && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="eager"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      {src && shouldLoad && !failed && !bypassOptimization && (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          // 非优先项已经由 IntersectionObserver 控制挂载，挂载后直接加载。
          loading={priority ? undefined : "eager"}
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
