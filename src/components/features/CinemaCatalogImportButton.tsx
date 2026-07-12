"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

export function CinemaCatalogImportButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshCatalog = async () => {
    setBusy(true);
    setError(null);
    setMessage("正在同步公开影视资料…");

    try {
      const res = await fetch("/api/cinema/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "catalog", limit: 80 }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.summary) {
        setMessage(null);
        setError(data?.error ?? "更新影视库失败");
        return;
      }
      const summary = data.summary as {
        total: number;
        created: number;
        matched: number;
        enriched: number;
        visible: number;
        sources?: {
          douban?: {
            routedToAnime?: number;
            matchedAnimation?: number;
            reclassifiedAnimation?: number;
            skippedAnimeUnmatched?: number;
            conflicts?: number;
            skippedUnclassified?: number;
          };
        };
      };
      const routedToAnime = summary.sources?.douban?.routedToAnime ?? 0;
      const skippedUnclassified =
        summary.sources?.douban?.skippedUnclassified ?? 0;
      const matchedAnimation =
        summary.sources?.douban?.matchedAnimation ?? 0;
      const reclassifiedAnimation =
        summary.sources?.douban?.reclassifiedAnimation ?? 0;
      const skippedAnimeUnmatched =
        summary.sources?.douban?.skippedAnimeUnmatched ?? 0;
      const conflicts = summary.sources?.douban?.conflicts ?? 0;
      setMessage(
        [
          `已同步 ${summary.total} 条`,
          `当前可展示 ${summary.visible} 部`,
          `新增 ${summary.created}`,
          routedToAnime > 0 ? `动漫分流 ${routedToAnime}` : null,
          matchedAnimation > 0 ? `匹配已有 ${matchedAnimation}` : null,
          reclassifiedAnimation > 0
            ? `原地纠正 ${reclassifiedAnimation}`
            : null,
          skippedAnimeUnmatched > 0
            ? `未匹配跳过 ${skippedAnimeUnmatched}`
            : null,
          conflicts > 0 ? `身份冲突 ${conflicts}` : null,
          skippedUnclassified > 0
            ? `题材待确认 ${skippedUnclassified}`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      router.refresh();
    } catch {
      setMessage(null);
      setError("更新影视库出错");
    } finally {
      setBusy(false);
    }
  };

  const loading = busy;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="solid"
        size="sm"
        onClick={refreshCatalog}
        disabled={loading}
        leftIcon={
          loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )
        }
      >
        {loading ? "更新中" : "更新影视库"}
      </Button>
      {message && (
        <p className="text-right text-[11px] text-[color:var(--text-secondary)]">
          {message}
        </p>
      )}
      {error && (
        <p className="text-right text-[11px] text-[color:var(--status-error)]">
          {error}
        </p>
      )}
    </div>
  );
}
