import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DesktopSessionGate } from "@/components/features/DesktopSessionGate";
import { LocalServerSessionGate } from "@/components/features/LocalServerSessionGate";

export const metadata = { title: "正在打开" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  const { from } = await searchParams;
  const isLocalServer = process.env.ANIME_LOCAL_SERVER_APP === "1";
  const hasActiveSession = Boolean(
    session?.user?.id && session.user.localSessionValid !== false,
  );
  if (
    hasActiveSession &&
    !isLocalServer
  ) {
    redirect(from && from.startsWith("/") ? from : "/");
  }

  if (process.env.ANIME_DESKTOP_APP === "1") {
    return <DesktopSessionGate from={from ?? "/"} />;
  }

  if (isLocalServer) {
    return (
      <LocalServerSessionGate
        from={from ?? "/"}
        hasActiveSession={hasActiveSession}
      />
    );
  }

  return (
    <DesktopSessionGate
      from={from ?? "/"}
      provider="loopback-session"
    />
  );
}
