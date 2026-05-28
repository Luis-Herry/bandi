import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginShell } from "./LoginShell";

export const metadata = { title: "登录" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const session = await auth();
  const { from, error } = await searchParams;
  if (session) {
    redirect(from && from.startsWith("/") ? from : "/");
  }

  const desktopLoginHint =
    process.env.ANIME_DESKTOP_APP === "1"
      ? `桌面版默认账号：${process.env.DESKTOP_BOOTSTRAP_USER ?? "admin"} / ${
          process.env.DESKTOP_BOOTSTRAP_PASSWORD ?? "PUBLIC_HISTORY_REDACTED"
        }`
      : null;

  return (
    <LoginShell
      from={from ?? "/"}
      initialError={error ?? null}
      desktopLoginHint={desktopLoginHint}
    />
  );
}
