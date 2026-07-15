"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { showToast } from "@/components/features/ToastHost";
import { Button, type ButtonProps } from "@/components/ui";
import type { AnimeMetadataRefreshScope } from "@/lib/anime-metadata-refresh";
import type { BgmSeason } from "@/lib/bangumi";

type RefreshButtonProps = Omit<ButtonProps, "onClick" | "leftIcon"> & {
  scope: AnimeMetadataRefreshScope;
  animeId?: number;
  year?: number;
  season?: BgmSeason;
  label?: string;
  onRefreshed?: () => void | Promise<void>;
};

interface RefreshResult {
  outcome?: "updated" | "unchanged" | "partial" | "needs_review";
  canonicalAnimeId?: number | null;
  animeMerged?: number;
  bangumiLinked?: number;
  yucLinked?: number;
  episodesUpserted?: number;
  downloadsReattached?: number;
  duplicateDownloadsRemoved?: number;
  rssAliasesUpdated?: number;
  synopsesLocalized?: number;
  bangumiSubjects?: number;
  yucEntries?: number;
  warnings?: string[];
  error?: string;
}

export function AnimeDataRefreshButton({
  scope,
  animeId,
  year,
  season,
  label = "检查更新",
  onRefreshed,
  children,
  disabled,
  ...buttonProps
}: RefreshButtonProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  async function handleRefresh() {
    if (checking) return;
    setChecking(true);
    try {
      const response = await fetch("/api/anime/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, animeId, year, season }),
      });
      const result = (await response.json().catch(() => ({}))) as RefreshResult;
      if (!response.ok) throw new Error(result.error ?? "refresh_failed");

      showToast(buildRefreshToast(result, scope));
      await onRefreshed?.();
      if (
        scope === "anime" &&
        animeId != null &&
        result.canonicalAnimeId != null &&
        result.canonicalAnimeId !== animeId
      ) {
        router.replace(`/anime/${result.canonicalAnimeId}`);
      } else {
        router.refresh();
      }
    } catch {
      showToast({
        title: "资料刷新失败",
        description: "网络或上游服务暂不可用，请稍后重试",
        tone: "error",
      });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      leftIcon={
        <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
      }
      onClick={handleRefresh}
      disabled={disabled || checking}
      {...buttonProps}
    >
      {checking ? "正在刷新" : children ?? label}
    </Button>
  );
}

function buildRefreshToast(
  result: RefreshResult,
  scope: RefreshButtonProps["scope"],
) {
  const warnings = result.warnings ?? [];
  if (result.outcome === "needs_review") {
    return {
      title: "需要手动确认关联",
      description: cleanWarning(warnings[0]) ?? "发现多个可能匹配的条目",
      tone: "warning" as const,
    };
  }
  if (result.outcome === "partial") {
    return {
      title: "资料已部分刷新",
      description: cleanWarning(warnings[0]) ?? "部分上游资料暂不可用",
      tone: "warning" as const,
    };
  }
  if (result.outcome === "unchanged") {
    return {
      title: "资料已是最新",
      description: "Bangumi、长门番堂与 RSS 关联无需调整",
      tone: "info" as const,
    };
  }
  if (scope === "season") {
    const localized = countLabel(result.synopsesLocalized, "补中文简介");
    return {
      title: "季度资料已刷新",
      description: [
        `Bangumi ${result.bangumiSubjects ?? 0} 部`,
        `长门 ${result.yucEntries ?? 0} 部`,
        localized,
      ].filter(Boolean).join(" · "),
      tone: "success" as const,
    };
  }
  const changes = [
    countLabel(result.animeMerged, "合并条目"),
    countLabel(result.bangumiLinked, "关联 Bangumi"),
    countLabel(result.episodesUpserted, "补齐剧集"),
    countLabel(result.downloadsReattached, "重挂下载"),
    countLabel(result.duplicateDownloadsRemoved, "清理重复记录"),
    countLabel(result.synopsesLocalized, "补中文简介"),
  ].filter(Boolean);
  return {
    title: "资料刷新完成",
    description: changes.join(" · ") || "关联与剧集资料已更新",
    tone: "success" as const,
  };
}

function countLabel(value: number | undefined, label: string): string {
  return value && value > 0 ? `${label} ${value}` : "";
}

function cleanWarning(value: string | undefined): string | undefined {
  return value?.replace(/^AMBIGUOUS:/u, "");
}
