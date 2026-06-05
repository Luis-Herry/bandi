"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "motion/react";
import { User, Lock } from "lucide-react";
import { Button, TextField } from "@/components/ui";
import { BrandLogo } from "@/components/features/BrandLogo";
import { DuskBackdrop } from "@/components/features/DuskBackdrop";

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
    <main className="relative min-h-screen w-full overflow-hidden">
      <DuskBackdrop />

      {/* top-left brand */}
      <header className="absolute top-8 left-10 z-10">
        <BrandLogo markSize="md" />
      </header>

      {/* center card */}
      <div className="relative z-10 min-h-screen w-full flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          className="glass-panel-elevated accent-halo w-[380px] p-8"
          style={{
            background: "rgba(20, 14, 10, 0.55)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {/* mini badge */}
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
              placeholder="用户名"
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <TextField
              prefixIcon={<Lock />}
              type="password"
              placeholder="密码"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="appearance-none w-3.5 h-3.5 rounded-[3px] border border-[color:var(--border-default)] bg-[color:var(--bg-surface)] checked:bg-[color:var(--accent)] checked:border-[color:var(--accent)] cursor-pointer transition-colors"
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
              <p className="text-xs text-[color:var(--status-error)] text-center pt-1">
                {error}
              </p>
            )}
            {desktopLoginHint && !error && (
              <p className="text-xs text-[color:var(--text-muted)] text-center pt-1">
                {desktopLoginHint}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-1"
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

      {/* footer */}
      <footer className="absolute bottom-5 left-0 right-0 z-10 flex items-center justify-between px-10 text-[11px] text-[color:var(--text-muted)]">
        <span>© 2026 Bandi</span>
        <div className="flex items-center gap-5">
          <a href="#" className="hover:text-[color:var(--text-secondary)] transition-colors">帮助</a>
          <a href="#" className="hover:text-[color:var(--text-secondary)] transition-colors">联系</a>
          <a href="#" className="hover:text-[color:var(--text-secondary)] transition-colors">隐私</a>
        </div>
      </footer>
    </main>
  );
}
