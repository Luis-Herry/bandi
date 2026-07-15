import { auth } from "@/auth";
import { AccentProvider } from "@/components/features/AccentProvider";
import { DesktopDownloadServiceNotice } from "@/components/features/DesktopDownloadServiceNotice";
import { DesktopUpdateNotice } from "@/components/features/DesktopUpdateNotice";
import { Nav } from "@/components/features/Nav";
import { ToastHost } from "@/components/features/ToastHost";
import {
  EMPTY_NAV_NOTIFICATIONS,
  getNavNotifications,
} from "@/lib/nav-notifications";
import { getProfileDisplayName } from "@/lib/profile";
import { getUserTheme } from "@/lib/theme";
import { redirect } from "next/navigation";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id || session.user.localSessionValid === false) {
    redirect("/login");
  }
  const username = session.user.username ?? session.user.name ?? "用户";
  const displayName = getProfileDisplayName(session.user.id, username);
  const currentTheme = await getUserTheme();
  const isDesktop = process.env.ANIME_DESKTOP_APP === "1";
  const isLocalServer = process.env.ANIME_LOCAL_SERVER_APP === "1";
  const isManagedLocal = isDesktop || isLocalServer;
  const canManageLocalServerUpdates =
    isLocalServer && session.user.isLocalHost === true;
  const notifications = session?.user?.id
    ? getNavNotifications(session.user.id)
    : EMPTY_NAV_NOTIFICATIONS;

  return (
    <AccentProvider>
      <div className="desktop-main-shell min-h-screen flex flex-col">
        <Nav
          username={displayName}
          currentTheme={currentTheme}
          notifications={notifications}
          isDesktop={isDesktop}
          isManagedLocal={isManagedLocal}
        />
        <ToastHost />
        {isManagedLocal && <DesktopDownloadServiceNotice />}
        {canManageLocalServerUpdates && <DesktopUpdateNotice />}
        {isDesktop && <div className="desktop-nav-spacer" aria-hidden />}
        {/* Web 继续由页面内容延伸到透明导航后方；桌面端把滚动区限定在导航下方。 */}
        <main
          className={
            isDesktop
              ? "desktop-page-scroll min-h-0 flex-1"
              : "flex-1 pt-16"
          }
        >
          {children}
        </main>
      </div>
    </AccentProvider>
  );
}
