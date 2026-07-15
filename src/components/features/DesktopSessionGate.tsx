"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

export function DesktopSessionGate({
  from,
  provider = "desktop-session",
}: {
  from: string;
  provider?: "desktop-session" | "loopback-session";
}) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const enterDesktop = useCallback(async () => {
    setError(null);
    try {
      const result =
        provider === "desktop-session"
          ? await signIn("desktop-session", { redirect: false })
          : await signIn("loopback-session", { redirect: false });
      if (!result?.ok || result.error) {
        throw new Error(result?.error ?? "desktop_session_rejected");
      }
      router.replace(from.startsWith("/") ? from : "/");
      router.refresh();
    } catch {
      setError("Bandi 无法建立本机会话。请重试；下载记录和设置不会受影响。");
      started.current = false;
    }
  }, [from, provider, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void enterDesktop();
  }, [enterDesktop]);

  return (
    <main className="desktop-viewport desktop-boot-screen">
      <section className="desktop-boot-card" aria-labelledby="desktop-boot-title">
        <div className="desktop-boot-heading">
          <span className="desktop-boot-indicator" aria-hidden />
          <h1 id="desktop-boot-title">
            {error ? "本机会话连接失败" : "正在打开 Bandi"}
          </h1>
        </div>
        <p role={error ? "alert" : "status"}>
          {error ?? "正在载入本地资料。"}
        </p>
        {error && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw size={12} />}
            className="mt-4"
            onClick={() => {
              if (started.current) return;
              started.current = true;
              void enterDesktop();
            }}
          >
            重试进入 Bandi
          </Button>
        )}
      </section>
    </main>
  );
}
