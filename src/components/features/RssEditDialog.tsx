"use client";

import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Button,
  MotionSwitch,
  ShimmerText,
  TextField,
} from "@/components/ui";
import type { RssFilters } from "@/db/schema";
import { cn } from "@/lib/cn";

export interface RssSourceDraft {
  id?: number;
  name: string;
  url: string;
  filters: RssFilters & { cron?: string };
  isActive: boolean;
}

interface RssEditDialogProps {
  trigger: ReactNode;
  initial?: RssSourceDraft;
  onSave: (draft: RssSourceDraft) => Promise<void>;
}

const EMPTY: RssSourceDraft = {
  name: "",
  url: "",
  filters: { cron: "*/30 * * * *" },
  isActive: true,
};

export function RssEditDialog({ trigger, initial, onSave }: RssEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RssSourceDraft>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);

  function reset() {
    setDraft(initial ?? EMPTY);
  }

  async function handleSave() {
    if (!draft.name.trim() || !draft.url.trim()) return;
    setBusy(true);
    try {
      await onSave(draft);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) reset();
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="t-modal-overlay fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
        <Dialog.Content
          className={cn(
            "t-modal t-modal-center fixed left-1/2 top-1/2 z-50",
            "w-[520px] max-w-[92vw] glass-panel-elevated p-6 focus:outline-none",
          )}
        >
          <Dialog.Title className="text-lg font-semibold tracking-[-0.01em]">
            {initial ? "编辑 RSS 源" : "新增 RSS 源"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-[color:var(--text-muted)]">
            支持 Mikan / Nyaa / 动漫花园等 RSS 2.0 feed。
          </Dialog.Description>

          <div className="mt-5 space-y-4">
            <Field label="名称">
              <TextField
                placeholder="如：Mikan - 余烬之地"
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
              />
            </Field>
            <Field label="RSS 地址">
              <TextField
                placeholder="https://mikanani.me/RSS/..."
                value={draft.url}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, url: e.target.value }))
                }
              />
            </Field>
            <Field label="检查频率 (cron)">
              <TextField
                placeholder="*/30 * * * *"
                value={draft.filters.cron ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    filters: { ...d.filters, cron: e.target.value },
                  }))
                }
                suffix="分 时 日 月 周"
              />
            </Field>

            <div className="flex items-center justify-between rounded-[8px] px-3 py-2 bg-[color:var(--bg-surface)] border border-[color:var(--border-subtle)]">
              <div>
                <p className="text-sm">启用</p>
                <p className="text-xs text-[color:var(--text-muted)]">
                  关闭后不会被定时任务自动检查
                </p>
              </div>
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
              disabled={busy || !draft.name.trim() || !draft.url.trim()}
            >
              {busy ? <ShimmerText text="保存中..." /> : "保存"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-xs uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
