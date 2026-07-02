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
        setError(data?.error ?? "更新影视库失败");
        return;
      }
      const summary = data.summary as {
        total: number;
        created: number;
        matched: number;
        enriched: number;
      };
      setMessage(
        `已同步 ${summary.total} 条 · 新增 ${summary.created} · 已有 ${summary.matched}`,
      );
      router.refresh();
    } catch {
      setError("更新影视库出错");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="solid"
        size="sm"
        onClick={refreshCatalog}
        disabled={busy}
        leftIcon={
          busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )
        }
      >
        {busy ? "更新中" : "更新影视库"}
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
