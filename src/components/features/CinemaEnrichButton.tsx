"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * TMDB / 豆瓣 / 番号 刮削入口。
 *
 * 逐条刮、客户端小并发、实时显示进度（X/总数 · 成功 Y），番号片优先排前先出结果。
 * 每条是独立短请求（~2-6s），不再一批同步几十条把 UI 卡死；可随时停止，已刮的都已落库。
 */
const CONCURRENCY = 4;

export function CinemaEnrichButton({
  scope = "all",
}: {
  scope?: "all" | "local";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);
  const isLocalRefresh = scope === "local";

  const enrich = async () => {
    setBusy(true);
    setError(null);
    setMsg("准备中…");
    stopRef.current = false;

    let ids: number[] = [];
    try {
      const res = await fetch(
        scope === "local"
          ? "/api/cinema/enrich?scope=local"
          : "/api/cinema/enrich",
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.pending)) {
        setError(
          data?.error ??
            (isLocalRefresh ? "获取待刷新列表失败" : "获取待刮列表失败"),
        );
        setBusy(false);
        return;
      }
      ids = data.pending as number[];
      if (ids.length === 0 && data.sourceCount === 0) {
        setMsg(
          isLocalRefresh
            ? "本地库还没有可刷新的条目，请先扫描文件。"
            : "当前没有可刮削的影视条目。",
        );
        setBusy(false);
        return;
      }
    } catch {
      setError("获取待刮列表出错");
      setBusy(false);
      return;
    }

    const total = ids.length;
    if (total === 0) {
      setMsg(scope === "local" ? "本地条目资料已补全。" : "影视资料已补全。");
      setBusy(false);
      return;
    }

    let done = 0;
    let ok = 0;
    let noMatch = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < ids.length && !stopRef.current) {
        const id = ids[cursor++];
        try {
          const res = await fetch("/api/cinema/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ animeId: id }),
          });
          const data = await res.json().catch(() => null);
          if (data?.result?.matched) ok += 1;
          else noMatch += 1;
        } catch {
          // 单条失败（网络/超时）也计未匹配，继续
          noMatch += 1;
        }
        done += 1;
        setMsg(
          `${isLocalRefresh ? "刷新" : "刮削"}中… ${done}/${total} · 成功 ${ok} · 未匹配 ${noMatch}`,
        );
        if (done % 12 === 0) router.refresh(); // 边刮边让封面浮现
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker),
    );

    setMsg(
      stopRef.current
        ? `已停止：处理 ${done}/${total} · 成功 ${ok} · 未匹配 ${noMatch}。`
        : `${isLocalRefresh ? "刷新" : "刮削"}完成：处理 ${done} 条 · 成功 ${ok} · 未匹配 ${noMatch}（未匹配多为没有公开元数据源的条目）。`,
    );
    router.refresh();
    setBusy(false);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {busy && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              stopRef.current = true;
            }}
            leftIcon={<Square size={13} />}
          >
            停止
          </Button>
        )}
        <Button
          variant="solid"
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
          {busy
            ? isLocalRefresh
              ? "刷新中"
              : "刮削中"
            : isLocalRefresh
              ? "刷新资料"
              : "刮削元数据"}
        </Button>
      </div>
      {msg && (
        <p className="text-[11px] text-[color:var(--text-secondary)]">{msg}</p>
      )}
      {error && (
        <p className="text-[11px] text-[color:var(--status-error)]">{error}</p>
      )}
    </div>
  );
}
