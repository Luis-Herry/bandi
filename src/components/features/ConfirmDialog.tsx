"use client";

import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

interface ConfirmDialogProps {
  trigger: ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
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
            "w-[420px] max-w-[90vw]",
            "glass-panel-elevated p-6",
            "focus:outline-none",
          )}
        >
          <Dialog.Title className="text-lg font-semibold tracking-[-0.01em]">
            {title}
          </Dialog.Title>
          {description && (
            <Dialog.Description className="mt-2 text-sm text-[color:var(--text-secondary)] leading-relaxed">
              {description}
            </Dialog.Description>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" disabled={busy}>
                {cancelLabel}
              </Button>
            </Dialog.Close>
            <Button
              size="sm"
              variant={destructive ? "secondary" : "primary"}
              onClick={handleConfirm}
              disabled={busy}
              className={
                destructive
                  ? "!bg-[rgba(239,68,68,0.12)] !text-[color:var(--status-error)] !border-[rgba(239,68,68,0.30)]"
                  : ""
              }
            >
              {busy ? "..." : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
