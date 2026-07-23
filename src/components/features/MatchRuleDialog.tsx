"use client";

import { useState, useEffect, type KeyboardEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  Button,
  MotionSwitch,
  ShimmerText,
  TextField,
  Tag,
} from "@/components/ui";
import { cn } from "@/lib/cn";

export interface MatchRuleDraft {
  id?: number;
  name: string;
  keywords: string[];
  qualities: string[]; // 480p / 720p / 1080p / 4K
  group?: string;
  animeId?: number | null;
  isActive: boolean;
}

const ALL_QUALITIES = ["480p", "720p", "1080p", "4K"];

const EMPTY: MatchRuleDraft = {
  name: "",
  keywords: [],
  qualities: ["1080p"],
  group: "",
  animeId: null,
  isActive: true,
};

interface Props {
  trigger: ReactNode;
  initial?: MatchRuleDraft;
  /** Optional: anime list to pick from. */
  animeOptions?: Array<{ id: number; title: string }>;
  onSave: (draft: MatchRuleDraft) => Promise<void>;
}

export function MatchRuleDialog({
  trigger,
  initial,
  animeOptions,
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MatchRuleDraft>(initial ?? EMPTY);
  const [keywordInput, setKeywordInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initial ?? EMPTY);
      setKeywordInput("");
    }
  }, [open, initial]);

  function addKeyword() {
    const k = keywordInput.trim();
    if (!k) return;
    if (draft.keywords.includes(k)) {
      setKeywordInput("");
      return;
    }
    setDraft((d) => ({ ...d, keywords: [...d.keywords, k] }));
    setKeywordInput("");
  }

  function removeKeyword(k: string) {
    setDraft((d) => ({ ...d, keywords: d.keywords.filter((x) => x !== k) }));
  }

  function toggleQuality(q: string) {
    setDraft((d) => ({
      ...d,
      qualities: d.qualities.includes(q)
        ? d.qualities.filter((x) => x !== q)
        : [...d.qualities, q],
    }));
  }

  function onKeywordKeydown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword();
    } else if (e.key === "Backspace" && !keywordInput && draft.keywords.length) {
      removeKeyword(draft.keywords[draft.keywords.length - 1]);
    }
  }

  async function handleSave() {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      await onSave(draft);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="t-modal-overlay fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
        <Dialog.Content
          className={cn(
            "t-modal t-modal-center fixed left-1/2 top-1/2 z-50",
            "w-[560px] max-w-[92vw] glass-panel-elevated p-6 focus:outline-none",
          )}
        >
          <Dialog.Title className="text-lg font-semibold tracking-[-0.01em]">
            {initial ? "编辑匹配规则" : "新增匹配规则"}
          </Dialog.Title>

          <div className="mt-5 space-y-4">
            <Labelled label="规则名称">
              <TextField
                placeholder="如：余烬之地 1080p"
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
              />
            </Labelled>

            <Labelled label="番剧">
              <select
                data-no-focus-ring
                value={String(draft.animeId ?? "")}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    animeId: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                className={cn(
                  "w-full h-10 px-3 rounded-[8px] text-sm",
                  "bg-[color:var(--bg-surface)] border border-[color:var(--border-subtle)]",
                  "hover:border-[color:var(--border-default)] focus:border-[color:var(--accent-muted)] outline-none",
                )}
              >
                <option value="">— 不绑定 —</option>
                {animeOptions?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </Labelled>

            <Labelled label="关键词（回车 / 逗号添加）">
              <div className="flex flex-wrap items-center gap-1.5 p-2 min-h-10 rounded-[8px] bg-[color:var(--bg-surface)] border border-[color:var(--border-subtle)] transition-colors focus-within:border-[color:var(--accent-muted)]">
                {draft.keywords.map((k) => (
                  <Tag key={k} variant="accent" className="gap-1">
                    {k}
                    <button
                      type="button"
                      aria-label={`移除 ${k}`}
                      onClick={() => removeKeyword(k)}
                      className="opacity-60 hover:opacity-100"
                    >
                      <X size={10} />
                    </button>
                  </Tag>
                ))}
                <input
                  data-no-focus-ring
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={onKeywordKeydown}
                  placeholder={draft.keywords.length === 0 ? "如：余烬, ANi" : ""}
                  className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-[color:var(--text-muted)]"
                />
              </div>
            </Labelled>

            <Labelled label="画质">
              <div className="flex items-center gap-2">
                {ALL_QUALITIES.map((q) => {
                  const on = draft.qualities.includes(q);
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => toggleQuality(q)}
                      data-tabular
                      className={cn(
                        "h-8 px-3 rounded-[6px] text-xs font-medium border transition-colors",
                        on
                          ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border-[color:var(--accent-muted)]"
                          : "bg-[color:var(--bg-surface)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)] hover:border-[color:var(--border-default)]",
                      )}
                    >
                      {q}
                    </button>
                  );
                })}
              </div>
            </Labelled>

            <Labelled label="发布组（可选）">
              <TextField
                placeholder="如：ANi / Lilith-Raws / 喵萌奶茶屋"
                value={draft.group ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, group: e.target.value }))
                }
              />
            </Labelled>

            <div className="flex items-center justify-between rounded-[8px] px-3 py-2 bg-[color:var(--bg-surface)] border border-[color:var(--border-subtle)]">
              <p className="text-sm">启用</p>
              <MotionSwitch
                checked={draft.isActive}
                onCheckedChange={(v) =>
                  setDraft((d) => ({ ...d, isActive: v }))
                }
                className={cn(
                  "relative h-6 w-10 rounded-full p-1 [--toggle-travel:16px]",
                  "data-[state=checked]:bg-[color:var(--accent)]",
                  "data-[state=unchecked]:bg-[color:var(--bg-surface-hover)]",
                  "border border-[color:var(--border-default)]",
                )}
                thumbClassName="block h-4 w-4 rounded-full bg-[color:var(--text-primary)]"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" disabled={busy}>
                取消
              </Button>
            </Dialog.Close>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSave}
              disabled={busy || !draft.name.trim()}
            >
              {busy ? <ShimmerText text="保存中..." /> : "保存"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-xs uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
