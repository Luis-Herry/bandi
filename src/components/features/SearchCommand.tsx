"use client";

/**
 * 全局搜索 Cmd+K 对话框。
 *
 * 打开方式：
 *   - 全局 keydown 监听 cmd/ctrl + K
 *   - Nav 顶部触发按钮派发同样的合成事件
 *
 * 搜索后端：GET /api/anime/search?q=...
 *   - 本地 SQLite 优先（命中 ≥ 5 条则不走外网）
 *   - 不足时 Bangumi fallback，结果带 source 标识
 *   - 登录态会附带 inLibrary 标记
 *
 * 点击/回车行为：
 *   - 本地命中  → 直接跳 /anime/[id]
 *   - Bangumi 命中 → POST /api/anime/sync 同步元数据（不创建 userAnime）→ 跳详情页
 *     "想看"是用户的主动决策，搜索只负责查看详情。
 *
 * 键盘：↑↓ 选择、Enter 触发、Esc 关闭（Radix Dialog 自带）。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/cn";

interface SearchHit {
  source: "local" | "bangumi";
  id: number | null;
  bangumiId: number | null;
  title: string;
  titleJa: string | null;
  year: number | null;
  coverUrl: string | null;
  inLibrary?: boolean;
}

const DEBOUNCE_MS = 220;

export default function SearchCommand() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);

  /* ── open via cmd/ctrl + K (global) ─────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── reset state when closing ───────────────────────────────── */
  useEffect(() => {
    if (!open) {
      // 留 q 不重置体验更友好（重新打开能看到上次输入），但清掉选中
      setActive(0);
    }
  }, [open]);

  /* ── debounce ───────────────────────────────────────────────── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  /* ── fetch ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    if (!debouncedQ) {
      setHits([]);
      setLoading(false);
      return;
    }
    const id = ++reqIdRef.current;
    setLoading(true);
    fetch(`/api/anime/search?q=${encodeURIComponent(debouncedQ)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { hits: [] }))
      .then((j: { hits?: SearchHit[] }) => {
        if (id !== reqIdRef.current) return; // stale
        setHits(j.hits ?? []);
        setActive(0);
      })
      .catch(() => {
        if (id !== reqIdRef.current) return;
        setHits([]);
      })
      .finally(() => {
        if (id === reqIdRef.current) setLoading(false);
      });
  }, [debouncedQ, open]);

  /* ── navigation handler ─────────────────────────────────────── */
  const go = useCallback(
    async (hit: SearchHit) => {
      if (adding) return;
      if (hit.source === "local" && hit.id != null) {
        router.push(`/anime/${hit.id}`);
        setOpen(false);
        return;
      }
      if (hit.source === "bangumi" && hit.bangumiId != null) {
        setAdding(true);
        try {
          const res = await fetch("/api/anime/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bangumiId: hit.bangumiId }),
          });
          if (!res.ok) throw new Error(`sync failed ${res.status}`);
          const j = (await res.json()) as { animeId?: number };
          if (j.animeId) {
            router.push(`/anime/${j.animeId}`);
            setOpen(false);
          }
        } catch (e) {
          console.error("[search] sync from bangumi failed:", e);
        } finally {
          setAdding(false);
        }
      }
    },
    [adding, router],
  );

  /* ── keyboard nav within input ──────────────────────────────── */
  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) void go(hit);
    }
  }

  /* ── auto-scroll selected row into view ─────────────────────── */
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>(
      `[data-row="${active}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const showEmpty = useMemo(
    () => !loading && debouncedQ.length > 0 && hits.length === 0,
    [loading, debouncedQ, hits.length],
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/65 backdrop-blur-[6px] z-50" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            // 让我们手动聚焦输入框，避免 Radix 默认聚焦到第一个可聚焦元素
            e.preventDefault();
            inputRef.current?.focus();
            inputRef.current?.select();
          }}
          className={cn(
            "fixed left-1/2 top-[18%] -translate-x-1/2 z-50",
            "w-[640px] max-w-[92vw] focus:outline-none",
            "rounded-[10px] overflow-hidden",
            "border border-[color:var(--border-default)]",
            "bg-[color:var(--bg-elevated)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
            "backdrop-blur-[20px]",
          )}
        >
          <Dialog.Title className="sr-only">搜索番剧</Dialog.Title>
          <Dialog.Description className="sr-only">
            输入关键字搜索本地追番库和 Bangumi
          </Dialog.Description>

          {/* 输入框 */}
          <div className="flex items-center gap-3 px-4 h-12 border-b border-[color:var(--border-subtle)]">
            <Search
              size={16}
              className="text-[color:var(--text-muted)] shrink-0"
            />
            <input
              ref={inputRef}
              data-no-focus-ring
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="搜索番剧、日文原名、Bangumi…"
              className={cn(
                "flex-1 bg-transparent border-0 h-full",
                "outline-none focus:outline-none focus-visible:outline-none",
                "text-[14px] text-[color:var(--text-primary)]",
                "placeholder:text-[color:var(--text-muted)]",
              )}
              autoComplete="off"
              spellCheck={false}
            />
            {loading && (
              <Loader2
                size={14}
                className="text-[color:var(--text-muted)] shrink-0 animate-spin"
              />
            )}
          </div>

          {/* 结果列表 */}
          <div
            ref={listRef}
            className="max-h-[58vh] overflow-y-auto"
            role="listbox"
            aria-label="搜索结果"
          >
            {hits.length > 0 && (
              <ul className="p-1.5">
                {hits.map((hit, i) => (
                  <Row
                    key={`${hit.source}-${hit.id ?? hit.bangumiId}-${i}`}
                    hit={hit}
                    index={i}
                    active={i === active}
                    busy={adding && i === active}
                    onHover={() => setActive(i)}
                    onSelect={() => void go(hit)}
                  />
                ))}
              </ul>
            )}

            {showEmpty && (
              <div className="px-6 py-10 text-center">
                <p className="text-[13px] text-[color:var(--text-muted)]">
                  没有找到匹配「<span className="text-[color:var(--text-secondary)]">{debouncedQ}</span>」的番剧
                </p>
                <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                  试试用日文原名或更短的关键字
                </p>
              </div>
            )}

            {!debouncedQ && (
              <div className="px-6 py-8 text-center">
                <p className="text-[13px] text-[color:var(--text-muted)]">
                  输入关键字开始搜索
                </p>
                <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                  本地未命中时自动联网查 Bangumi
                </p>
              </div>
            )}
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ─────────── Row ─────────── */

function Row({
  hit,
  index,
  active,
  busy,
  onHover,
  onSelect,
}: {
  hit: SearchHit;
  index: number;
  active: boolean;
  busy: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-row={index}
        onMouseEnter={onHover}
        onClick={onSelect}
        disabled={busy}
        role="option"
        aria-selected={active}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-[8px] text-left",
          "transition-colors",
          active
            ? "bg-[color:var(--bg-surface-hover)]"
            : "bg-transparent hover:bg-[color:var(--bg-surface)]",
          "disabled:opacity-60 disabled:cursor-progress",
        )}
      >
        {/* cover */}
        <div className="relative w-9 h-[52px] rounded-[4px] overflow-hidden bg-[color:var(--bg-surface)] shrink-0 border border-[color:var(--border-subtle)]">
          {hit.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hit.coverUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : null}
        </div>

        {/* title block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-medium text-[color:var(--text-primary)] truncate">
              {hit.title}
            </p>
            {hit.inLibrary && (
              <span className="text-[10px] px-1.5 py-px rounded-[3px] bg-[color:var(--accent-muted)] text-[color:var(--accent)] shrink-0">
                已收藏
              </span>
            )}
            {hit.source === "bangumi" && (
              <span className="text-[10px] px-1.5 py-px rounded-[3px] bg-[color:var(--bg-surface)] text-[color:var(--text-muted)] border border-[color:var(--border-subtle)] shrink-0">
                Bangumi
              </span>
            )}
          </div>
          {hit.titleJa && (
            <p className="text-[11px] text-[color:var(--text-muted)] truncate mt-0.5">
              {hit.titleJa}
            </p>
          )}
        </div>

        {/* year */}
        {hit.year != null && (
          <span
            data-tabular
            className="text-[11px] text-[color:var(--text-muted)] shrink-0"
          >
            {hit.year}
          </span>
        )}

        {busy && (
          <Loader2
            size={13}
            className="text-[color:var(--text-muted)] shrink-0 animate-spin"
          />
        )}
      </button>
    </li>
  );
}

