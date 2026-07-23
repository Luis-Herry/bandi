"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { ConfirmDialog } from "@/components/features/ConfirmDialog";
import { showToast } from "@/components/features/ToastHost";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

interface AnimeSubscriptionButtonProps {
  animeId: number;
  initialSubscribed: boolean;
}

export function AnimeSubscriptionButton({
  animeId,
  initialSubscribed,
}: AnimeSubscriptionButtonProps) {
  const router = useRouter();
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [joining, setJoining] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);

  useEffect(() => {
    setSubscribed(initialSubscribed);
  }, [initialSubscribed]);

  async function joinLibrary() {
    setJoining(true);
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ animeId, watchStatus: "planning" }),
      });
      if (!res.ok) {
        showToast({ title: "加入追番失败", tone: "error" });
        return;
      }

      setSubscribed(true);
      setLikeAnimating(true);
      showToast({ title: "已加入追番", tone: "success" });
      window.dispatchEvent(
        new CustomEvent("anime-library-status-change", {
          detail: { animeId, inLibrary: true },
        }),
      );
      window.dispatchEvent(
        new CustomEvent("anime-watch-status-change", {
          detail: { animeId, watchStatus: "planning" },
        }),
      );
      router.refresh();
    } catch {
      showToast({
        title: "加入追番失败",
        description: "网络连接异常",
        tone: "error",
      });
    } finally {
      setJoining(false);
    }
  }

  async function leaveLibrary() {
    const res = await fetch(`/api/library/${animeId}`, { method: "DELETE" });
    if (!res.ok) {
      showToast({ title: "取消追番失败", tone: "error" });
      throw new Error("failed to leave library");
    }

    setSubscribed(false);
    setLikeAnimating(false);
    showToast({ title: "已取消追番", tone: "info" });
    window.dispatchEvent(
      new CustomEvent("anime-library-status-change", {
        detail: { animeId, inLibrary: false },
      }),
    );
    router.refresh();
  }

  const buttonClass = cn(
    "border-[color:var(--accent-muted)]",
    "bg-[color:var(--accent-subtle)] text-[color:var(--accent)]",
    "hover:border-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)]",
    "focus-visible:outline-[color:var(--accent)]",
    "max-sm:flex-[1_1_calc(50%-5px)]",
  );

  const icon = (
    <span className="t-like-icon inline-flex">
      <Heart className="t-like-heart" size={15} strokeWidth={2.4} />
    </span>
  );
  const motionClass = cn(
    buttonClass,
    "t-like",
    likeAnimating && "is-like-animating",
  );

  if (!subscribed) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        leftIcon={icon}
        disabled={joining}
        data-liked="false"
        className={motionClass}
        onClick={joinLibrary}
        onAnimationEnd={() => setLikeAnimating(false)}
      >
        {joining ? "加入中..." : "加入追番"}
      </Button>
    );
  }

  return (
    <ConfirmDialog
      title="取消追番订阅？"
      description="会移除当前追番记录、评分笔记和进度；番剧资料与下载记录保留。"
      confirmLabel="取消追番"
      destructive
      onConfirm={leaveLibrary}
      trigger={
        <Button
          type="button"
          variant="secondary"
          size="md"
          leftIcon={icon}
          data-liked="true"
          className={motionClass}
          onAnimationEnd={() => setLikeAnimating(false)}
        >
          已加入追番
        </Button>
      }
    />
  );
}
