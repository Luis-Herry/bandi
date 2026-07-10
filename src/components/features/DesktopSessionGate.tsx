"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { RefreshCw } from "lucide-react";
import { BrandLogo } from "@/components/features/BrandLogo";
import { Button, ShimmerText } from "@/components/ui";

export function DesktopSessionGate({ from }: { from: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const enterDesktop = useCallback(async () => {
    setError(null);
    const result = await signIn("desktop-session", { redirect: false });
    if (!result?.ok || result.error) {
      setError("本机会话建立失败，请重新尝试");
      started.current = false;
      return;
    }
    router.replace(from.startsWith("/") ? from : "/");
    router.refresh();
  }, [from, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void enterDesktop();
  }, [enterDesktop]);

  return (
    <main className="desktop-viewport relative grid min-h-screen place-items-center overflow-hidden bg-[color:var(--bg-base)] px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgb(var(--accent-rgb) / 0.12), transparent 34%), radial-gradient(circle at 16% 18%, rgb(var(--accent-rgb) / 0.05), transparent 28%)",
        }}
      />
      <section className="t-stagger is-shown relative w-full max-w-[420px] rounded-[12px] border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)] px-8 py-9 text-center shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
        <div className="t-stagger-line t-stagger-line--1 flex justify-center">
          <BrandLogo showText={false} markSize="lg" />
        </div>
        <h1 className="t-stagger-line t-stagger-line--2 mt-5 text-[22px] font-bold tracking-[-0.02em] text-[color:var(--text-primary)]">
          正在打开你的私人放映厅
        </h1>
        <div className="t-stagger-line t-stagger-line--3 mt-2 min-h-5 text-[12px] text-[color:var(--text-muted)]">
          {error ? (
            <span className="text-[color:var(--status-error)]">{error}</span>
          ) : (
            <ShimmerText text="正在准备本地资料与下载服务…" />
          )}
        </div>
        {error && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw size={12} />}
            className="mt-5"
            onClick={() => {
              if (started.current) return;
              started.current = true;
              void enterDesktop();
            }}
          >
            重新尝试
          </Button>
        )}
      </section>
    </main>
  );
}
