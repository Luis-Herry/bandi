"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BarChart3, Pencil, Save, X } from "lucide-react";
import { Button, TextField } from "@/components/ui";
import { PageHeader } from "@/components/features/PageHeader";
import { showToast } from "@/components/features/ToastHost";
import { PROFILE_DISPLAY_NAME_MAX_LENGTH } from "@/lib/profile-display-name";

export function ProfileHeader({
  initialDisplayName,
}: {
  initialDisplayName: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [draft, setDraft] = useState(initialDisplayName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: draft }),
      });
      const result = (await response.json().catch(() => null)) as {
        displayName?: string;
        error?: string;
      } | null;
      if (!response.ok || !result?.displayName) {
        setError(result?.error ?? "名称保存失败");
        return;
      }

      setDisplayName(result.displayName);
      setDraft(result.displayName);
      setEditing(false);
      window.dispatchEvent(
        new CustomEvent("bandi:profile-display-name-change", {
          detail: { displayName: result.displayName },
        }),
      );
      showToast({ title: "名称已更新", tone: "success" });
      router.refresh();
    } catch {
      setError("名称保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setDraft(displayName);
    setError(null);
    setEditing(false);
  }

  return (
    <section>
      <PageHeader
        title={`${displayName} 的追番概览`}
        eyebrow="个人中心"
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<Pencil size={14} />}
              onClick={() => {
                setError(null);
                setEditing(true);
              }}
              disabled={editing}
            >
              修改名称
            </Button>
            <Button
              asChild
              variant="secondary"
              size="sm"
              leftIcon={<BarChart3 size={14} />}
            >
              <Link href="/stats">查看完整统计</Link>
            </Button>
          </div>
        }
      />

      {editing && (
        <form
          onSubmit={saveName}
          className="mt-4 flex max-w-[620px] flex-col gap-2 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] p-3 sm:flex-row sm:items-start"
        >
          <div className="min-w-0 flex-1">
            <TextField
              autoFocus
              value={draft}
              maxLength={PROFILE_DISPLAY_NAME_MAX_LENGTH}
              aria-label="自定义名称"
              placeholder="输入你想显示的名称"
              suffix={`${Array.from(draft.trim()).length}/${PROFILE_DISPLAY_NAME_MAX_LENGTH}`}
              onChange={(event) => setDraft(event.target.value)}
              className="h-9"
            />
            <p
              className={`mt-1.5 text-[11px] ${
                error
                  ? "text-[color:var(--status-error)]"
                  : "text-[color:var(--text-muted)]"
              }`}
            >
              {error ?? "只修改界面显示名称，不影响本地账户。"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="submit"
              size="sm"
              leftIcon={<Save size={14} />}
              disabled={saving}
            >
              {saving ? "保存中" : "保存名称"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon={<X size={14} />}
              onClick={cancelEditing}
              disabled={saving}
            >
              取消
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
