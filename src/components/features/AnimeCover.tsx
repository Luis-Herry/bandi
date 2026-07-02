"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  resizeBangumiImageUrl,
  type BangumiImageRole,
} from "@/lib/bangumi-image";

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
  /** Bangumi 图片按展示场景降尺寸，避免列表页拉原图后超时。 */
  imageRole?: BangumiImageRole;
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
const TIMEOUT_MS = 15000;
const PLACEHOLDER_SRC = "/cover-placeholder.svg";

export function AnimeCover({
  src,
  alt,
  ratio = "16/9",
  className,
  priority = false,
  sizes = "(min-width: 1280px) 320px, (min-width: 768px) 33vw, 50vw",
  imageRole = "card",
}: AnimeCoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const rawResolved = src ? resizeBangumiImageUrl(src, imageRole) : null;
  // DMM 封面经自有代理端点（服务器走代理抓，浏览器只访问同源 /api/img，不直连 DMM）
  const resolvedSrc =
    rawResolved && /^https:\/\/pics\.dmm\.co\.jp\//.test(rawResolved)
      ? `/api/img?url=${encodeURIComponent(rawResolved)}`
      : rawResolved;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!resolvedSrc);
  const [shouldLoad, setShouldLoad] = useState(priority);
  const [resetting, setResetting] = useState(false);
  const resetFrameRef = useRef<number | null>(null);
  // bgm 直连图 + 同源 /api/img（DMM 代理）走原生 <img>；其余走 next/image 优化。
  const bypassOptimization =
    resolvedSrc != null &&
    (/^https:\/\/(?:lain\.bgm\.tv|bangumi\.tv)\//.test(resolvedSrc) ||
      resolvedSrc.startsWith("/api/img"));

  // src 变化时重置状态（卡片复用 / 列表过滤会切 src）
  useEffect(() => {
    if (resetFrameRef.current != null) {
      window.cancelAnimationFrame(resetFrameRef.current);
    }
    setResetting(true);
    setLoaded(false);
    setFailed(!resolvedSrc);
    setShouldLoad(priority);
    resetFrameRef.current = window.requestAnimationFrame(() => {
      resetFrameRef.current = window.requestAnimationFrame(() => {
        setResetting(false);
        resetFrameRef.current = null;
      });
    });

    return () => {
      if (resetFrameRef.current != null) {
        window.cancelAnimationFrame(resetFrameRef.current);
        resetFrameRef.current = null;
      }
    };
  }, [resolvedSrc, priority]);

  const attachImageRef = useCallback((node: HTMLImageElement | null) => {
    imageRef.current = node;
    if (node?.complete && node.naturalWidth > 0) {
      setLoaded(true);
      setFailed(false);
    }
  }, []);

  // 非首屏封面先等进入视口附近再挂载图片，避免浏览器 lazy 还没开始请求时被超时判失败。
  useEffect(() => {
    if (!resolvedSrc || priority || shouldLoad) return;
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
  }, [resolvedSrc, priority, shouldLoad]);

  // 超时兜底：只有真正开始加载后才计时，避免懒加载封面提前落到占位图。
  useEffect(() => {
    if (!resolvedSrc || !shouldLoad || loaded || failed) return;
    const node = imageRef.current;
    if (node?.complete && node.naturalWidth > 0) {
      setLoaded(true);
      return;
    }
    const t = setTimeout(() => setFailed(true), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [resolvedSrc, shouldLoad, loaded, failed]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "t-skel relative overflow-hidden bg-[color:var(--bg-elevated)]",
        loaded && !failed && "is-revealed",
        resetting && "is-resetting",
        className,
      )}
      style={{ aspectRatio: ratio }}
    >
      {/* loading shimmer：仅在有 src 且还没失败、没加载完时显示 */}
      {resolvedSrc && shouldLoad && !loaded && !failed && (
        <div className="t-skel-skeleton is-pulsing">
          <div className="t-skel-block" />
        </div>
      )}

      {resolvedSrc && shouldLoad && !failed && bypassOptimization && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={attachImageRef}
          src={resolvedSrc}
          alt={alt}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => {
            setLoaded(true);
            setFailed(false);
          }}
          onError={() => setFailed(true)}
          className={cn(
            // Bangumi 直连图可能在 hydration 前已加载完；保持图片节点可见，避免错过 onLoad 后永久透明。
            "absolute inset-0 h-full w-full object-cover",
          )}
        />
      )}

      {resolvedSrc && shouldLoad && !failed && !bypassOptimization && (
        <Image
          src={resolvedSrc}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          // 非优先项已经由 IntersectionObserver 控制挂载，挂载后直接加载。
          loading={priority ? undefined : "eager"}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="t-skel-content object-cover"
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
    </div>
  );
}
