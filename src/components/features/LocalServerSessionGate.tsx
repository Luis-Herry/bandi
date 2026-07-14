"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Link2, LoaderCircle, RefreshCw } from "lucide-react";
import { BrandLogo } from "@/components/features/BrandLogo";
import { Button, GlassPanel } from "@/components/ui";

function readBootstrapToken() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hash.get("token")?.trim() || "";
}

function clearBootstrapToken() {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function defaultDeviceName() {
  if (/iPad/i.test(navigator.userAgent)) return "iPad";
  if (/iPhone/i.test(navigator.userAgent)) return "iPhone";
  return "局域网浏览器";
}

export function LocalServerSessionGate({
  from,
  hasActiveSession,
}: {
  from: string;
  hasActiveSession: boolean;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [hostOpening, setHostOpening] = useState(true);
  const [pairingCode, setPairingCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = useCallback(async (provider: "local-session" | "local-pair", values: Record<string, string>) => {
    setError(null);
    const result = await signIn(provider, { ...values, redirect: false });
    if (!result?.ok || result.error) throw new Error(result?.error || "session_rejected");
    router.replace(from.startsWith("/") ? from : "/");
    router.refresh();
  }, [from, router]);

  const enterHost = useCallback(async () => {
    const token = readBootstrapToken();
    if (!token) {
      if (hasActiveSession) {
        router.replace(from.startsWith("/") ? from : "/");
        return;
      }
      setHostOpening(false);
      return;
    }
    clearBootstrapToken();
    try {
      await enter("local-session", { bootstrapToken: token });
    } catch {
      setError("本机会话已失效，请从 Mac 菜单栏重新打开 Bandi。");
      setHostOpening(false);
      started.current = false;
    }
  }, [enter, from, hasActiveSession, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void enterHost();
  }, [enterHost]);

  async function submitPairing(event: FormEvent) {
    event.preventDefault();
    if (submitting || !/^\d{6}$/.test(pairingCode)) return;
    setSubmitting(true);
    try {
      await enter("local-pair", {
        pairingCode,
        deviceName: defaultDeviceName(),
      });
    } catch {
      setError("配对码无效或已过期，请在 Mac 上重新生成。");
    } finally {
      setSubmitting(false);
    }
  }

  if (hostOpening) {
    return (
      <main className="desktop-viewport desktop-boot-screen">
        <section className="desktop-boot-card" aria-labelledby="local-boot-title">
          <div className="desktop-boot-heading">
            <span className="desktop-boot-indicator" aria-hidden />
            <h1 id="local-boot-title">正在打开 Bandi</h1>
          </div>
          <p role="status">正在载入本地资料。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--bg-base)] px-5 py-12">
      <GlassPanel variant="elevated" className="w-full max-w-[420px] p-7">
        <div className="flex justify-center"><BrandLogo /></div>
        <div className="mt-6 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-[10px] bg-[rgb(var(--accent-rgb)/0.1)] text-[color:var(--accent)]">
            <Link2 size={18} />
          </span>
          <h1 className="mt-4 text-[20px] font-semibold text-[color:var(--text-primary)]">连接这台 Mac</h1>
          <p className="mt-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">
            在 Mac 的 Bandi 设置中生成六位配对码。配对设备可查看全部媒体库并控制下载，文件仍保存在 Mac 上。
          </p>
        </div>
        <form className="mt-6" onSubmit={submitPairing}>
          <label className="text-[11px] font-medium text-[color:var(--text-secondary)]" htmlFor="pairing-code">配对码</label>
          <input
            id="pairing-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            pattern="[0-9]{6}"
            value={pairingCode}
            onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-2 h-12 w-full rounded-[8px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] px-4 text-center font-mono text-[20px] tracking-[0.35em] text-[color:var(--text-primary)] outline-none transition-[border-color,box-shadow] focus-visible:border-[color:var(--accent)] focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-rgb)/0.28)]"
            aria-invalid={Boolean(error)}
          />
          {error && <p className="mt-3 text-[11px] text-[color:var(--status-error)]" role="alert">{error}</p>}
          <Button
            type="submit"
            variant="primary"
            className="mt-5 w-full"
            disabled={submitting || pairingCode.length !== 6}
            leftIcon={submitting ? <LoaderCircle size={13} className="animate-spin" /> : error ? <RefreshCw size={13} /> : undefined}
          >
            {submitting ? "正在连接…" : "连接 Bandi"}
          </Button>
        </form>
      </GlassPanel>
    </main>
  );
}
