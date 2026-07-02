"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

interface Props {
  animeId: number;
}

export function CinemaDetailEnrichButton({ animeId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enrich = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cinema/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.result?.matched) {
        setError(data?.error ?? "补全失败");
        return;
      }
      router.refresh();
    } catch {
      setError("补全出错");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        onClick={enrich}
        disabled={busy}
        leftIcon={
          busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )
        }
      >
        {busy ? "补全中" : "补全资料"}
      </Button>
      {error && (
        <p className="max-w-[180px] text-right text-[11px] text-[color:var(--status-error)]">
          {error}
        </p>
      )}
    </div>
  );
}
