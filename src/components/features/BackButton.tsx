"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 详情页 hero 左上角的返回按钮。
 *
 * 浮在封面图上方，半透明深色玻璃质感（封面图通常较亮）。
 * - 有历史：router.back()
 * - 直接打开链接（history.length <= 1）：兜底回 /library
 *
 * 初始视为"有历史"，避免 SSR 与 client 不一致引发的 hydration mismatch。
 */
interface BackButtonProps {
  /** 兜底跳转地址，默认 /library */
  fallbackHref?: string;
  className?: string;
}

const sharedClass = cn(
  "back-button",
  "inline-flex items-center justify-center",
  "w-10 h-10 rounded-full",
  "bg-black/40 backdrop-blur",
  "border border-white/10",
  "text-white/85",
  "transition-[background,transform,border-color,color] duration-150",
  "hover:bg-black/60 hover:text-white hover:border-white/20 hover:scale-[1.04]",
  "active:scale-100",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-0",
);

export function BackButton({
  fallbackHref = "/library",
  className,
}: BackButtonProps) {
  const router = useRouter();
  // 初始视为"有历史"，避免首屏 SSR 后立刻替换 DOM
  const [hasHistory, setHasHistory] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasHistory(window.history.length > 1);
    }
  }, []);

  if (!hasHistory) {
    return (
      <Link
        href={fallbackHref}
        aria-label="返回"
        title="返回"
        className={cn(sharedClass, className)}
      >
        <ArrowLeft size={18} strokeWidth={2.2} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="返回"
      title="返回"
      className={cn(sharedClass, className)}
    >
      <ArrowLeft size={18} strokeWidth={2.2} />
    </button>
  );
}
