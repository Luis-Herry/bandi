import { auth } from "@/auth";
import { AccentProvider } from "@/components/features/AccentProvider";
import { Nav } from "@/components/features/Nav";
import { ToastHost } from "@/components/features/ToastHost";
import {
  EMPTY_NAV_NOTIFICATIONS,
  getNavNotifications,
} from "@/lib/nav-notifications";
import { getUserTheme } from "@/lib/theme";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const username = session?.user?.username ?? session?.user?.name ?? null;
  const currentTheme = await getUserTheme();
  const isDesktop = process.env.ANIME_DESKTOP_APP === "1";
  const notifications = session?.user?.id
    ? getNavNotifications(session.user.id)
    : EMPTY_NAV_NOTIFICATIONS;

  return (
    <AccentProvider>
      <div className="desktop-main-shell min-h-screen flex flex-col">
        <Nav
          username={username}
          currentTheme={currentTheme}
          notifications={notifications}
          isDesktop={isDesktop}
        />
        <ToastHost />
        {/* Nav 全断点 h=64；首页 Hero 用匹配的负 margin 自抵消，让背景透到顶栏后面。 */}
        <main className="flex-1 pt-16">{children}</main>
      </div>
    </AccentProvider>
  );
}
