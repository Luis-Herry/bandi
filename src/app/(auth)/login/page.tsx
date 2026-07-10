import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DesktopSessionGate } from "@/components/features/DesktopSessionGate";
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

  if (process.env.ANIME_DESKTOP_APP === "1") {
    return <DesktopSessionGate from={from ?? "/"} />;
  }

  return (
    <LoginShell
      from={from ?? "/"}
      initialError={error ?? null}
    />
  );
}
