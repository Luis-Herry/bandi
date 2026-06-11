"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion, useReducedMotion } from "motion/react";
import { User, Lock } from "lucide-react";
import { Button, TextField } from "@/components/ui";
import { BrandLogo } from "@/components/features/BrandLogo";
import { DuskBackdrop } from "@/components/features/DuskBackdrop";
import { RevealBurst } from "@/components/features/RevealBurst";

interface LoginShellProps {
  from: string;
  initialError: string | null;
  desktopLoginHint?: string | null;
}

export function LoginShell({
  from,
  initialError,
  desktopLoginHint,
}: LoginShellProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const showCard = revealed || !!shouldReduceMotion;
  const [error, setError] = useState<string | null>(
    initialError ? "登录失败，请检查账号或密码" : null,
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    setSubmitting(false);
    if (res?.error) {
      setError("登录失败，请检查账号或密码");
      return;
    }
    router.replace(from || "/");
    router.refresh();
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[color:var(--bg-base)]">
      <DuskBackdrop onReveal={() => setRevealed(true)} />

      {revealed && !shouldReduceMotion && <RevealBurst />}

      <div
        className={`relative z-10 flex min-h-screen w-full items-center justify-center px-5 py-24 sm:px-6 ${
          showCard ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <motion.div
          initial={
            shouldReduceMotion
              ? false
              : { opacity: 0, y: 16, scale: 0.98, filter: "blur(10px)" }
          }
          animate={
            shouldReduceMotion
              ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
              : showCard
                ? {
                    // flicker-in: a brief stutter reads as a HUD power-on glitch
                    opacity: [0, 0.7, 0.25, 1],
                    y: [16, 2, 1, 0],
                    scale: [0.98, 1.004, 1, 1],
                    filter: ["blur(10px)", "blur(1px)", "blur(3px)", "blur(0px)"],
                  }
                : { opacity: 0, y: 16, scale: 0.98, filter: "blur(10px)" }
          }
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : {
                  duration: 0.62,
                  ease: [0.16, 1, 0.3, 1],
                  times: [0, 0.42, 0.6, 1],
                }
          }
          className={`glass-panel-elevated accent-halo w-full max-w-[380px] p-6 sm:p-8 ${
            showCard ? "pointer-events-auto" : "pointer-events-none"
          }`}
          style={{
            background:
              "linear-gradient(180deg, rgba(34, 27, 18, 0.28), rgba(10, 10, 11, 0.18))",
            backdropFilter: "blur(18px) saturate(1.08)",
            WebkitBackdropFilter: "blur(18px) saturate(1.08)",
          }}
        >
          <div className="flex items-center justify-center mb-5">
            <BrandLogo showText={false} markSize="lg" />
          </div>

          <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-center text-[color:var(--text-primary)]">
            欢迎回来
          </h1>
          <p className="mt-2 text-center text-[13px] text-[color:var(--text-secondary)]">
            登录后进入你的私人放映厅
          </p>

          <form className="mt-6 space-y-3" onSubmit={onSubmit}>
            <TextField
              prefixIcon={<User />}
              name="username"
              placeholder="用户名"
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
              className="transition-[background-color,border-color,box-shadow] focus-within:shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.16)]"
              required
            />
            <TextField
              prefixIcon={<Lock />}
              name="password"
              type="password"
              placeholder="密码"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              className="transition-[background-color,border-color,box-shadow] focus-within:shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.16)]"
              required
            />

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="appearance-none w-3.5 h-3.5 rounded-[3px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] checked:bg-[color:var(--accent)] checked:border-[color:var(--accent)] cursor-pointer transition-[background-color,border-color,box-shadow] duration-150 focus-visible:shadow-[0_0_0_2px_rgb(var(--accent-rgb)/0.24)]"
                  style={{
                    backgroundImage: remember
                      ? "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M2.5 6.2 5 8.7l4.5-5.4'/></svg>\")"
                      : undefined,
                    backgroundSize: "100% 100%",
                    color: "var(--accent-contrast)",
                  }}
                />
                <span className="text-xs text-[color:var(--text-secondary)]">
                  记住我
                </span>
              </label>
              <button
                type="button"
                className="text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--accent)] transition-colors"
              >
                忘记密码？
              </button>
            </div>

            {error && (
              <motion.p
                role="alert"
                initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                className="text-xs text-[color:var(--status-error)] text-center pt-1"
              >
                {error}
              </motion.p>
            )}
            {desktopLoginHint && !error && (
              <motion.p
                initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                className="text-xs text-[color:var(--text-muted)] text-center pt-1"
              >
                {desktopLoginHint}
              </motion.p>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-1 active:[transform:scale(0.99)] motion-reduce:active:[transform:none]"
              disabled={submitting}
            >
              {submitting ? "登录中…" : "登录"}
            </Button>
          </form>

          {!desktopLoginHint && (
            <>
              <div className="flex items-center gap-3 my-5">
                <span className="flex-1 h-px bg-[color:var(--border-subtle)]" />
                <span className="text-[11px] text-[color:var(--text-muted)] tracking-[0.05em]">
                  或者
                </span>
                <span className="flex-1 h-px bg-[color:var(--border-subtle)]" />
              </div>

              <Button variant="ghost" className="w-full">
                通过邀请码注册
              </Button>

              <p className="mt-5 text-center text-[11px] text-[color:var(--text-muted)]">
                首次访问？联系 Bandi 管理员
              </p>
            </>
          )}
        </motion.div>
      </div>

    </main>
  );
}
